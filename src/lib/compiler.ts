import path from 'path';
import { readFile } from 'fs/promises';

import glob from 'glob-promise';
import Handlebars from 'handlebars';
import { parse as parseYaml } from 'yaml';

import { parseOptions, CompilerOptions } from '../lib/options';


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
    const helperPaths = await glob(path.join(paths.helpers, '*.{ts,js}'));
    for (const helperPath of helperPaths) {
        const basename = path.basename(helperPath);
        const { name } = path.parse(helperPath);

        try {
            const { default: func } = await import(helperPath);
            Handlebars.registerHelper(name, func);
        } catch (error) {
            if (options.log)
                console.error(error);

            // Reword error message
            throw new Error(`Unable to import helper '${basename}', likely due to compiler error:\n${error}`);
        }
    }

    // Render the pages
    const pagePaths = await glob(path.join(paths.pages, '*.{hbs,handlebars}'));
    for (const pagePath of pagePaths) {
        const { name: pageName } = path.parse(pagePath);

        // Read page to a string and scan it for partials
        const pageText = await readFileToString(pagePath);
        await registerPartials(paths.partials, pageText);

        // Attempt to compile the template
        const renderTemplate = Handlebars.compile(pageText);

        // Find the matching data file, ensuring that there is only one
        const dataPaths = await glob(path.join(paths.data, '*.{json,yml,yaml}'));

        let foundData = false;
        let data: object = { };
        if (dataPaths.length > 1) {
            throw new Error(`Found more than one data file for page '${pageName}'`);
        } else if (dataPaths.length < 1 && options.log) {
            console.log(`Found no data file for page '${pageName}'; will attempt to render page without data.`);
        } else {
            const dataPath = dataPaths[0];
            foundData = true;
            data = parseYaml(await readFileToString(dataPath), {  });
        }

        let outputText: string;
        try {
            outputText = renderTemplate(data);
        } catch (error) {
            if (!foundData)
                throw new Error(`Could not render page '${pageName}', likely due to missing data.`);
            else
                throw new Error(`An error occurred while rendering page '${pageName}':\n${error}`);
        }

        console.log(outputText);
    }

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
            const possible = await glob(path.join(partialsPath, `${name}.{hbs,handlebars}`));

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
