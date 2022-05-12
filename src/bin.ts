import path from 'path';
import { homedir } from 'os';

import { program } from 'commander';

import { compile } from './lib';
import { defaultOptions } from './lib';

// --------------------------------------------------------

program
    .name('micro-ssg')
    .description('A tiny little Handlebars compiler for building the simplest of static-sites')
    // @ts-expect-error non-existent variable replaced at compile-time by post-build script
    .version(___VERSION_NUMBER___)
    .option(
        '-d, --src <path>',
        'The directory to compile',
        'src'
    )
    .option(
        '-o, --dest <path>',
        'The directory to output to; will be created if it does not exist',
        defaultOptions.dest
    )
    .option(
        '-v, --log',
        'Enable logging',
        defaultOptions.log
    )
    .option(
        '-m, --minify',
        'Minify the output HTML',
        defaultOptions.minify
    )
    .option(
        '-f, --overwrite',
        'Truncate existing files when outputting',
        defaultOptions.overwrite
    )
    .option(
        '-t, --tsconfig <path>',
        'Path to a tsconfig file to enable TypeScript helpers'
    )
    .option(
        '-e, --exclude <names...>',
        "Page-names not to compile from Handlebars to HTML (either 'name' or 'name.ext')",
    );

program.parse();

// --------------------------------------------------------


// Resolve path-like options
const opts = program.opts();
for (const o of [ 'src', 'dest', 'tsconfig' ]) {
    // "Make" paths
    const passed = opts[o];
    if (typeof passed == 'string') {
        if (passed[0] == '~')
            opts[o] = path.join(homedir(), passed.slice(1));
        else
            opts[o] = path.resolve(process.cwd(), passed);
    }
}

// Remove potentially malformed or differently-named options
if (!Array.isArray(opts['expected'])) {
    delete opts['expected'];
}

if (typeof opts['tsconfig'] == 'string') {
    opts['tsConfigPath'] = opts['tsconfig'];
    delete opts['tsconfig'];
}

// Other than that, Commander is expected to supply correctly typed values due to defaults
const { src, ...options } = opts;
compile(src, options)
    .catch((err: unknown) => {
        console.error("\n!! --- Something went wrong --- !!\n");
        if (err instanceof Error) {
            console.error(err.message);
        } else {
            console.error(err);
        }
    });
