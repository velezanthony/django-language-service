import type { OnDeleteAction } from './field';

/** Django model relation (ForeignKey, ManyToMany, OneToOne).
 *  @inventory DGM-001, DGM-002, DGM-003, DGM-004, DGM-005, DGM-006, DGM-007, DGM-008, DGM-009
 */
export type RelationKind = 'fk' | 'm2m' | 'o2o';

export interface Relation {
  readonly kind: RelationKind;
  readonly fromModel: string; // "app.Model"
  readonly toModel: string; // "app.Model"
  readonly fieldName: string;
  readonly relatedName?: string;
  readonly onDelete?: OnDeleteAction;
  readonly through?: string;
  /** `null=True` on the field. The FK column's nullability — exports that
   *  describe columns cannot guess it. */
  readonly isNull?: boolean;
  /** `db_column=` override. Django's default is `<fieldName>_id`. */
  readonly dbColumn?: string;
}
