/**
 * The three relation flavours that Django supports — defined once, referenced
 * everywhere.
 *
 * Pattern: object-with-`as const` gives BOTH dot-access autocomplete
 * (`Relation.FK` → IDE suggests FK/M2M/O2O) AND iteration via the helper
 * `RELATION_KINDS` array. The matching `RelationKind` type is derived from
 * the object's values, so adding a new kind = touch one line here and TS
 * forces every Record<RelationKind, X> to update.
 *
 * Why not a TS `enum`? Enums generate runtime objects that don't tree-shake
 * well and `as const` narrows tighter. The TS team's own guidance has moved
 * away from enums for new code.
 */
export const Relation = {
  FK: 'FK',
  M2M: 'M2M',
  O2O: 'O2O',
} as const;
export type RelationKind = (typeof Relation)[keyof typeof Relation];

/** Iteration-friendly tuple of every kind. Use in {#each} and reducers. */
export const RELATION_KINDS = Object.values(Relation);

/** Long-form name used in tooltips and the toolbar filter button titles. */
export const RELATION_LABELS: Record<RelationKind, string> = {
  [Relation.FK]: 'ForeignKey',
  [Relation.M2M]: 'ManyToMany',
  [Relation.O2O]: 'OneToOne',
};

/** Cardinality shorthand shown in the legend + on relation lines in the diagram. */
export const RELATION_CARDINALITY: Record<RelationKind, string> = {
  [Relation.FK]: 'N:1',
  [Relation.M2M]: 'N:M',
  [Relation.O2O]: '1:1',
};

/**
 * Initial filter state — every relation kind visible. Returns a fresh object
 * each call so mutations don't leak across consumers.
 */
export const allRelationsActive = (): Record<RelationKind, boolean> =>
  RELATION_KINDS.reduce(
    (acc, k) => {
      acc[k] = true;
      return acc;
    },
    {} as Record<RelationKind, boolean>,
  );

export interface RenderedRelation {
  id: string;
  type: RelationKind;
  d: string;
  labelX: number;
  labelY: number;
  cardX: number;
  cardY: number;
  cardLabel: string;
  dimmed: boolean;
  /** True when this relation touches the currently-focused model — its line
   *  gets boosted opacity so connections to the focus stand out from the
   *  default muted baseline. */
  focused?: boolean;
  onDelete?: string;
  onDeleteX?: number;
  onDeleteY?: number;
}
