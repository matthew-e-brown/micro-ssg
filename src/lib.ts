import path from 'path';
import { isNativeError } from 'util/types';
import { mkdir, readFile, writeFile } from 'fs/promises';

import glob from 'glob-promise';
import Handlebars from 'handlebars';
import { parse as parseYaml } from 'yaml';
import { marked as parseMarkdown } from 'marked';



// ===============================================================================================
// Types and options
// ===============================================================================================


type PostBuildHelper = (pageName: string, pageHtml: string) => Promise<string> | PromiseLike<string> | string;

interface CompilerOptions {
    /**
     * The directory that the HTML files should be written to.
    * @default 'dist'
     */
    dest: string,
    /**
     * Whether or not the compiler should output to the console.
     * @default false
     */
    log: boolean,
    /**
     * Whether or not the `dist` directory should be replaced upon re-running.
     * @default false
     */
    overwrite: boolean,
    /**
     * A path pointing to a TypeScript config file, or to a directory containing a `tsconfig.json`.
     * Will be passed to `ts-node`.
     */
    tsConfigPath?: string,
    /**
     * Pages to exclude from the compilation.
     * @default []
     * */
    exclude: string[],
}


const defaultOptions: CompilerOptions = {
    dest: 'dist',
    overwrite: false,
    log: false,
    exclude: [ ],
};



// ===============================================================================================
// Compiler
// ===============================================================================================


/**
 * A wrapper for `path.join` that ensures no Windows backslashes appear in the path, since `glob`
 * doesn't like them.
 */
function join(...paths: string[]): string {
    return path.join(...paths).replace(/\\/g, '/');
}


/**
 * Wraps `fs/promises.readFile` with an extra call to `toString`.
 */
async function readFileToString(path: string): Promise<string> {
    const buffer = await readFile(path);
    return buffer.toString();
}


/**
 * Compiles a `src` directory of the expected structure into static `.html` files in the destination
 * directory (`dist` by default; can be changed with `compilerOptions.dest`).
 * @param srcPath The path of the `src` directory containing the `pages`, `data`, `partials`, and
 * `helpers` directories to compile.
 * @param compilerOptions Options.
 */
async function compile(srcPath: string, compilerOptions?: Partial<CompilerOptions>): Promise<void> {

    // Merge their passed options with the defaults
    const options: CompilerOptions = {
        ...defaultOptions,
        ...compilerOptions,
    };

    // Prepend each of the directories with the `srcPath`
    type Paths = Record<'pages' | 'data' | 'partials' | 'helpers', string>;
    const paths: Paths = [ 'pages', 'data', 'partials', 'helpers' ]
        .reduce((acc, cur) => ({
            ...acc,
            [cur]: join(srcPath, cur)
        }), { } as Paths);

    if (options.log)
        console.log(`Building from src directory '${srcPath}'.`);

    // Attempt to register `ts-node` as the default module-loader, for helpers later on
    let tsEnabled = false;
    if (options.tsConfigPath) {
        try {
            const { register } = await import('ts-node');
            register({ project: options.tsConfigPath });
            tsEnabled = true;
        } catch {
            // Reword error message
            throw new Error("Received tsConfigPath option, but failed to import 'ts-node'. Is it installed?");
        }
    }

    if (options.log) {
        if (tsEnabled) console.log(`Successfully activate 'ts-node' for importing .ts helpers.`);
        else console.log(`TypeScript helpers are disabled; will use .js helpers.`);
    }

    // Start by finding all helpers and registering them (ignore the ones that start with '_')
    const [ tsHelpers, jsHelpers ] = await Promise.all([
        glob(join(paths.helpers, '*.ts'))
            .then(p => p.filter(file => !path.basename(file).startsWith('_'))),
        glob(join(paths.helpers, '*.js'))
            .then(p => p.filter(file => !path.basename(file).startsWith('_'))),
    ]);

    if (!tsEnabled && tsHelpers.length > 0) {
        const message =
            `Found TypeScript helpers in '${path.basename(srcPath)}/helpers', but TypeScript` +
            ` support was not enabled! Pass a path to a tsconfig to enable TypeScript support.`;

        // Just print, don't throw and stop running
        console.error(message);
    }

    const helperPaths = [ ...jsHelpers, ...(tsEnabled ? tsHelpers : [ ]) ];
    for (const helperPath of helperPaths) {
        const basename = path.basename(helperPath);
        const { name } = path.parse(helperPath);

        try {
            if (options.log)
                console.log('Importing and registering helper', helperPath);

            const { default: func } = await import(helperPath);
            Handlebars.registerHelper(name, func);
        } catch (err) {
            // Reword error message
            throw new Error(`Unable to import helper '${basename}', likely due to compiler error:\n${err}`);
        }
    }

    // Read shared data and render the pages
    const sharedData = await getData(paths.data, '_shared', options);
    const pagePaths = await glob(join(paths.pages, '*.{hbs,handlebars}'));

    if (pagePaths.length < 1)
        throw new Error("Found no pages to compile");


    const renders = new Map<string, string>();
    for (const pagePath of pagePaths) {
        const { name: pageName } = path.parse(pagePath);
        const basename = path.basename(pagePath);

        if (options.exclude.some(exclude => exclude == pageName || exclude == basename)) {
            if (options.log)
                console.log(`Skipping page ${pageName}...`);
            continue;
        }

        // Read page to a string and scan it for partials
        const pageText = await readFileToString(pagePath);
        await registerPartials(paths.partials, pageText);

        // Attempt to compile the template
        const renderTemplate = Handlebars.compile(pageText);
        const pageData = await getData(paths.data, pageName, options);

        try {
            const output = renderTemplate({ _shared: { ...sharedData }, ...pageData });
            renders.set(pageName, output);
        } catch (err) {
            const msg = err instanceof Error ? err.message : err;
            throw new Error(`An error occurred while rendering page '${pageName}':\n${msg}`);
        }
    }

    // Try and import a helper
    const [ jsPostBuild, tsPostBuild ] = await Promise.all([
        glob(join(srcPath, '_post-build.js')),
        glob(join(srcPath, '_post-build.ts')),
    ]);

    const helperCount = jsPostBuild.length + tsPostBuild.length;
    if (helperCount > 1) {
        throw new Error('Cannot use more than one _post-build helper: found JS and TS.');
    } else if (helperCount == 1) {
        const helperPath = [ ...jsPostBuild, ...tsPostBuild ][0];

        let postBuildHelper: PostBuildHelper;
        try {
            const module = await import(helperPath);
            postBuildHelper = module.default;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : err;
            throw new Error(`Could not import post-build helper:\n${msg}`);
        }

        for (const [ pageName, pageContent ] of renders) {
            try {
                // Re-set the render with the output from the postBuild helper
                renders.set(pageName, await postBuildHelper(pageName, pageContent));
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : err;
                throw new Error(`An error occurred running the post-build helper on page '${pageName}':\n${msg}`);
            }
        }
    }

    // -----------------
    // Done! Output!
    // -----------------

    // Make destination directory
    try {
        await mkdir(options.dest, { recursive: true });
    } catch (err: unknown) {
        if (isNativeError(err)) {
            const message = typeof (err as NodeJS.ErrnoException).code == 'string'
                ? `Could not create destination directory: ${(err as NodeJS.ErrnoException).code}`
                : `Could not create destination directory: ${err.message}`;
            throw new Error(message);
        } else {
            throw err;
        }
    }

    // Write files
    await Promise.all(Array.from(renders).map(async ([ pageName, pageText ]) => {
        const finalPath = join(options.dest, `${pageName}.html`);

        if (options.log)
            console.log('Writing file to', finalPath);

        try {
            const flag = options.overwrite ? 'w' : 'wx';
            await writeFile(finalPath, pageText, { flag, encoding: 'utf-8' });
        } catch (err: unknown) {
            // Reword error message
            if (isNativeError(err) && (err as NodeJS.ErrnoException).code == 'EEXIST') {
                const message = `Could not write ${pageName}.html: file exists. Try enabling the overwrite option.`;
                throw new Error(message);
            } else {
                throw err;
            }
        }
    }));
}


// ---------------------------------
// Handlebars helpers
// ---------------------------------


async function registerPartials(partialsPath: string, pageText: string): Promise<void> {
    // Regex matches the first word after the opening bracket of each partial, but not if preceded
    // by a quote. Just so we don't have false alarms on `{{> partial arg="value, {{>" }}`
    const matches = pageText.matchAll(/(?<!["'`]){{>\s*([^\s}]+)/gm);

    for (const [, capture ] of matches) {
        const name = capture.trim();

        // Only add this partial if it has not already been registered
        if (!(name in Handlebars.partials)) {
            // Glob the folder to find either `.hbs` or `.handlebars` files
            const possible = await glob(join(partialsPath, `${name}.{hbs,handlebars}`));

            // Ensure we have exactly one match
            if (possible.length < 1) {
                throw new Error(`Could not find Handlebars file for partial '${name}'.`);
            } else if (possible.length > 1) {
                throw new Error(`Found more than one file for partial '${name}'.`);
            }

            const partialPath = possible[0];
            const partialText = await readFileToString(partialPath);

            // Register all the partials that that partial uses, then register this one
            await registerPartials(partialsPath, partialText);
            Handlebars.registerPartial(name, partialText);
        }
    }
}


async function getData(dataPath: string, pageName: string, options: CompilerOptions): Promise<object | undefined> {
    // Find the matching data file, ensuring that there is only one
    const filePaths = await glob(join(dataPath, `${pageName}.{json,yml,yaml,md,markdown}`));

    if (filePaths.length == 0) {
        return;
    } else if (filePaths.length == 1) {
        const file = filePaths[0];
        const text = await readFileToString(file);
        const data = parseData(text, path.parse(file).ext);

        if (options.log) console.log(`Parsed data for ${pageName}:`, data);

        return data;
    } else {
        throw new Error(`Found more than one data file for '${pageName}'.`);
    }
}


function parseData(rawData: string, extension: string): object {
    switch (extension.toLowerCase()) {
        case '.json':
            return JSON.parse(rawData);
        case '.yml':
        case '.yaml':
            return parseYaml(rawData);
        case '.md':
        case '.markdown':
            return {
                _md: parseMarkdown(rawData, {
                    smartLists: true,
                    headerIds: true,
                    gfm: true,
                }).trim(),
            };
        default:
            return { };
    }
}


// =================================
// Exports
// =================================

export { HelperOptions } from 'handlebars'; // re-export for consumer
export { CompilerOptions, PostBuildHelper };
export { compile, defaultOptions };
