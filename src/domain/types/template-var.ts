/** A single `{{ var }}` or `{{ var.attr.chain }}` reference inside a template source.
 *  @inventory CTX-001, CTX-004
 */
export interface TemplateVar {
  readonly kind: 'template-var';
  /** Root identifier, e.g. 'product' from `{{ product.category.name }}`. */
  readonly name: string;
  /** Dotted segments after the root, e.g. ['category', 'name']. */
  readonly chain: readonly string[];
  /** 1-based line number of the reference in the source. */
  readonly line: number;
  /** 1-based column number of the reference in the source. */
  readonly col: number;
}
