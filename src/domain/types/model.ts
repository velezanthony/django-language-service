import type { Field } from './field';
import type { Relation } from './relation';

/**
 * A table-level index or unique constraint declared in Meta.
 *
 * One shape for four Django spellings — `unique_together`, `index_together`,
 * `Meta.indexes` and `UniqueConstraint` — because every export format cares
 * about the same three things: which columns, is it unique, what is it called.
 */
export interface ModelIndex {
  /** Column names in declaration order. A leading '-' means DESC (Django's
   *  convention in `Index(fields=[...])`); kept so the sort order is not lost. */
  readonly fields: readonly string[];
  readonly name?: string;
  readonly unique?: boolean;
  /** Declared with `condition=Q(...)` — only indexes a subset of rows. No
   *  export format can express that, so it must not be shown as a plain index. */
  readonly partial?: boolean;
}

/** Django model Meta inner class options.
 *  @inventory DGM-001, DGM-002, DGM-003
 */
export interface ModelMeta {
  /** unique_together + index_together + indexes + constraints, normalized. */
  readonly indexes?: readonly ModelIndex[];
  readonly dbTable?: string;
  readonly verboseName?: string;
  readonly verboseNamePlural?: string;
  readonly ordering?: string;
  readonly abstract?: boolean;
  readonly proxy?: boolean;
  readonly tableComment?: string;
}

/** Django database model.
 *  @inventory DGM-001, DGM-002, DGM-003, DGM-021, INS-011
 */
/** A `@property` on a model, with the source so the UI can show it. */
export interface PropertyDef {
  readonly name: string;
  /** Decorator + def + body, dedented. */
  readonly source: string;
}

export interface Model {
  readonly kind: 'model';
  readonly name: string;
  readonly appLabel: string;
  readonly filePath: string;
  readonly line: number;
  readonly fields: readonly Field[];
  readonly relations: readonly Relation[];
  readonly properties: readonly PropertyDef[];
  /** Names of plain `def name(self)` methods — no decorator, no extra
   *  arguments. Django templates can call any zero-argument attribute, so
   *  `{{ product.get_absolute_url }}` is a normal access, not a typo. Methods
   *  that take arguments are deliberately absent: a template cannot call them. */
  readonly methods?: readonly string[];
  /** Base classes exactly as written. Needed to merge inherited members. */
  readonly bases?: readonly string[];
  /** `name = None` in the body — Django's way of dropping an inherited field. */
  readonly removedFields?: readonly string[];
  /** Columns of a `models.CompositePrimaryKey(...)` (Django 5.2+). A table-level
   *  constraint, not a column, so it never appears in `fields`. */
  readonly compositePrimaryKey?: readonly string[];
  readonly meta?: ModelMeta;
}
