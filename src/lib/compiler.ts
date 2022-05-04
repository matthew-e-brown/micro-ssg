import path from 'path';
import { isNativeError } from 'util/types';
import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises';

import glob from 'glob-promise';
import Handlebars from 'handlebars';
import { parse as parseYaml } from 'yaml';

import { parseOptions, CompilerOptions, ParsedOptions } from '../lib/options';


type Options = Omit<ParsedOptions, 'paths'>;


function join(...paths: string[]): string {
    return path.join(...paths).replaceAll(/\\/g, '/');
}


async function readFileToString(path: string): Promise<string> {
    const buffer = await readFile(path);
    return buffer.toString();
}


export async function compile(rootPath: string, compilerOptions?: CompilerOptions): Promise<void> {
    const { paths, ...options } = parseOptions(rootPath, compilerOptions);

    // Attempt to register `ts-node` as the default module-loader, for helpers later on
    if (options.tsConfigPath) {
        try {
            const { register } = await import('ts-node');
            register({ project: options.tsConfigPath });
        } catch {
            // Reword error message
            throw new Error("Found tsConfigPath option, but failed to import 'ts-node'. Is it installed?");
        }
    }

    // Start by finding all helpers and registering them
    const helperPaths = await glob(join(paths.helpers, '*.{ts,js}'));

    for (const helperPath of helperPaths) {
        const basename = path.basename(helperPath);
        const { name } = path.parse(helperPath);

        try {
            if (options.log)
                console.log('Importing and registering helper', helperPath);

            const { default: func } = await import(helperPath);
            Handlebars.registerHelper(name, func);
        } catch (err) {
            if (options.log)
                console.error(err);

            // Reword error message
            throw new Error(`Unable to import helper '${basename}', likely due to compiler error:\n${err}`);
        }
    }

    // Render the pages
    const renders = new Map<string, string>();
    const pagePaths = await glob(join(paths.pages, '*.{hbs,handlebars}'));

    for (const pagePath of pagePaths) {
        const { name: pageName } = path.parse(pagePath);

        // Read page to a string and scan it for partials
        const pageText = await readFileToString(pagePath);
        await registerPartials(paths.partials, pageText);

        // Attempt to compile the template
        const renderTemplate = Handlebars.compile(pageText);
        const data = await getData(paths.data, pageName, options);

        try {
            const output = renderTemplate(data ?? { });
            renders.set(pageName, output);
        } catch (err) {
            if (data === undefined)
                throw new Error(`Could not render page '${pageName}', likely due to missing data.`);
            else
                throw new Error(`An error occurred while rendering page '${pageName}':\n${err}`);
        }
    }

    // Now that they're *all* rendered, wipe `dist` and output files
    await ensureCleanDist(options.dist, options);
    await Promise.all(Array.from(renders).map(([ pageName, pageText ]) => {
        const finalPath = join(options.dist, `${pageName}.html`);

        if (options.log)
            console.log('Writing file to', finalPath);

        return writeFile(finalPath, pageText, { encoding: 'utf-8' });
    }));
}


async function registerPartials(partialsPath: string, pageText: string): Promise<void> {
    // Regex matches the first word after the opening bracket of each partial, but not if preceded
    // by a quote. Just so we don't have false alarms on `{{> partial arg="value, {{>" }}`
    const matches = pageText.matchAll(/(?<!["'`]){{>\s*(\w+)/gm);

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


async function getData(dataPath: string, pageName: string, options: Options): Promise<object | undefined> {
    // Find the matching data file, ensuring that there is only one
    const dataPaths = await glob(join(dataPath, `${pageName}.{json,yml,yaml}`));

    let data: object | undefined = undefined;
    if (dataPaths.length > 1) {
        throw new Error(`Found more than one data file for page '${pageName}'`);
    } else if (dataPaths.length < 1 && options.log) {
        console.log(`Found no data file for page '${pageName}'; will attempt to render page without data.`);
    } else {
        const dataPath = dataPaths[0];
        const dataText = await readFileToString(dataPath);

        const { ext } = path.parse(dataPath);

        switch (ext.toLowerCase()) {
            case '.json':
                data = JSON.parse(dataText);
                break;
            case '.yml':
            case '.yaml':
                data = parseYaml(dataText);
                break;
        }

        if (options.log)
            console.log(`Parsed data for ${pageName}:`, data);
    }

    return data;
}


async function ensureCleanDist(distPath: string, options: Options): Promise<void> {
    try {
        const fileNames = await readdir(distPath);

        if (options.log)
            console.log('Clearing the following files:', fileNames);

        if (fileNames.length > 0) {
            if (!options.overwrite) {
                const distName = path.basename(distPath);
                throw new Error(`Output directory ${distName} not empty: try setting overwrite to true.`);
            } else {
                await Promise.all(fileNames.map(fileName => {
                    const filePath = join(distPath, fileName);
                    return rm(filePath, { recursive: true });
                }));
            }
        }
    } catch (err: unknown) {
        if (isNativeError(err) && (err as NodeJS.ErrnoException).code == 'ENOENT') {
            if (options.log)
                console.log('Could not clear directory; does not exist. Making directory.');

            await mkdir(distPath, { recursive: true });
        }
    }
}
