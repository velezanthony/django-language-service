/** A single {% include %} reference inside a template.
 *  @inventory INS-001, INS-002, INS-003, INS-004, INS-005
 */
export interface IncludeRef {
  readonly target: string;
  readonly line: number;
  readonly kwargs: readonly { readonly name: string; readonly expr: string }[];
}

/** Django HTML template file.
 *  @inventory INS-001, INS-002, INS-003, INS-004, INS-005, CTX-012, CTX-013
 */
export interface Template {
  readonly kind: 'template';
  readonly filePath: string;
  readonly relativePath: string; // same value as filePath — absolute for scanned templates
  readonly extends?: string;
  readonly includes: readonly IncludeRef[];
  readonly blocks: readonly string[];
}
