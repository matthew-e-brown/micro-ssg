import path from 'path';

export interface CompilerOptions {
    /**
     * The directory that the HTML files should be written to.
    * @default 'dist'
     */
    dist?: string,
    /**
     * Whether or not the compiler should output to the console.
     * @default true
     */
    log?: boolean,
    /**
     * Whether or not the `dist` directory should be replaced upon re-running.
     * @default false
     */
    overwrite?: boolean,
    /**
     * Whether or not the final HTML should be minified or not.
     * @default false
     */
    minify?: boolean,
    /**
     * A path pointing to a TypeScript config file, or to a directory containing a `tsconfig.json`.
     * Will be passed to `ts-node`.
     */
    tsConfigPath?: string,
    /**
     * Pages to exclude from the compilation.
     * @default []
     * */
    exclude?: string[],
    /**
     * Overrides for each of the directory names for the components. These are *not* sanitized, so
     * they may contain relative path segments.
     * @default {}
     */
    paths?: {
        data?: string,
        pages?: string,
        helpers?: string,
        partials?: string,
    }
}


type AllRequired<T> = Required<NonNullable<T>>;
type RequiredPaths = AllRequired<CompilerOptions['paths']>;

// Make all fields on the CompilerOptions type have no undefined or optional values. Requires
// cutting out the 'paths' and re-intersecting, since it's nested. `tsConfigPath` is always
// optional.
export type ParsedOptions = Omit<AllRequired<CompilerOptions>, 'paths' | 'tsConfigPath'>
    & { paths: RequiredPaths, tsConfigPath?: string };


/**
 * Checks the `options` object for missing values and fills in their default parameters.
 * @param rootPath The path of the folder containing the project. Will be prepended to all paths in
 * `options.path`.
 * @param options The options to parse to their default values.
 * @returns The newly populated-with-default-values `options` object.
 */
export function parseOptions(rootPath: string, options?: CompilerOptions): ParsedOptions {
    // All non-nested options
    const {
        dist = 'dist',
        overwrite = false,
        log = true,
        minify = false,
        exclude = [ ],
    } = options ?? { };

    // Generate defaults while joining to root directory
    const paths: RequiredPaths = [ 'data', 'pages', 'helpers', 'partials' ]
        .reduce((acc, cur) => {
            const value = options?.paths?.[cur as keyof RequiredPaths] ?? cur;
            const final = path.join(rootPath, value);
            return { ...acc, [cur]: final };
        }, { } as RequiredPaths);

    return { dist, overwrite, log, minify, exclude, paths };
}
