/** Django migration operation kinds.
 *  @inventory DGM-010, DGM-011
 */
export type MigrationOpKind =
  | 'CreateModel'
  | 'DeleteModel'
  | 'AddField'
  | 'RemoveField'
  | 'AlterField'
  | 'RenameField'
  | 'RenameModel';

/** A field declared inside a CreateModel / AddField / AlterField operation.
 *  Carries enough to rebuild a historical schema with real types + relations.
 */
export interface MigrationField {
  readonly name: string;
  readonly fieldType: string; // "CharField", "ForeignKey", …
  readonly relatedModel?: string; // for FK/M2M/O2O — the target model name
  readonly onDelete?: string; // for FK/O2O — "CASCADE", "PROTECT", …
  /** Canonical kwarg tokens, e.g. ["max_digits=10", "decimal_places=2", "null"].
   *  Produced by parsers/_shared/field-attrs — the same reader the models
   *  parser uses, so snapshots stay comparable with the live schema. */
  readonly attrs: readonly string[];
}

export interface MigrationOperation {
  readonly kind: MigrationOpKind;
  readonly modelName: string;
  readonly fieldName?: string;
  readonly newName?: string;
  readonly fields?: readonly MigrationField[];
}

/** Django database migration file.
 *  @inventory DGM-010, DGM-011
 */
export interface Migration {
  readonly kind: 'migration';
  readonly appLabel: string;
  readonly name: string; // "0001_initial"
  readonly filePath: string;
  readonly dependencies: readonly string[]; // ["app.0001_initial"]
  readonly operations: readonly MigrationOperation[];
}
