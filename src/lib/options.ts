export interface CompilerOptions {
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
     * Whether or not the final HTML should be minified or not.
     * @default false
     */
    minify: boolean,
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


export const defaultOptions: CompilerOptions = {
    dest: 'dist',
    overwrite: false,
    minify: false,
    log: false,
    exclude: [ ],
};
