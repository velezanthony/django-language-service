/** Generic parser error with optional location info. */
export interface ParseError {
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly col?: number;
}

/** Discriminated result returned by every parser. */
export type ParseResult<O> =
  | { readonly ok: true; readonly value: O }
  | { readonly ok: false; readonly errors: readonly ParseError[] };

/** Options that every domain parser accepts as a second argument.
 *  All fields are optional — callers may omit the entire opts object.
 */
export interface ParserOpts {
  /** Called when a parser encounters a recoverable warning (e.g. unresolved choices ref). */
  readonly onWarn?: (msg: string, line?: number) => void;
  /** Called to resolve a cross-file import path to an absolute filesystem path.
   *  Declared for forward-compat (Fase 3 scanner); parsers in Fase 2 NEVER call it. */
  readonly resolveImport?: (fromFile: string, importPath: string) => string | undefined;
  /** Absolute path of the file being parsed — used to derive appLabel, filePath fields, etc. */
  readonly filePath?: string;
}

/** A pure function that maps raw input to a typed ParseResult.
 *  The optional second argument allows callers to pass ParserOpts for warnings,
 *  import resolution, and file path context. */
export type Parser<I, O> = (input: I, opts?: ParserOpts) => ParseResult<O>;
