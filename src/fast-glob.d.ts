/**
 * Minimal ambient declaration for fast-glob.
 * fast-glob is a runtime dependency (package.json) but its @types are bundled
 * inside the package itself. Until `npm install` is run, this stub satisfies tsc.
 * Remove this file once fast-glob is installed.
 */
declare module 'fast-glob' {
  interface Options {
    ignore?: string[];
    absolute?: boolean;
    onlyFiles?: boolean;
    cwd?: string;
    dot?: boolean;
  }
  function glob(patterns: string | string[], options?: Options): Promise<string[]>;
  export = glob;
}
