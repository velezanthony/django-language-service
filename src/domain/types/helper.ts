/** Django template tag or filter registered via a tag library.
 *  @inventory DTL-008, DTL-009, DTL-012
 */
export interface Helper {
  readonly kind: 'helper';
  readonly name: string;
  readonly library: string;
  readonly helperKind: 'tag' | 'filter';
  readonly filePath: string;
  readonly line: number;
}
