/** Typed context variable passed to a Django template.
 *  @inventory CTX-001, CTX-004, CTX-006
 */
export type ContextVarKind = 'instance' | 'queryset' | 'manager' | 'dict' | 'scalar';

/** A field synthesized on a queryset via `.annotate(name=Func(...))`.
 *  `func` is the aggregate function name ('Count', 'Sum', ...) or 'expr'
 *  when the RHS is a non-call expression. */
export interface AnnotationRef {
  readonly name: string;
  readonly func: string;
}

/**
 * A walk off a locally-typed variable — `context['tags'] = product.tags.all()`.
 * Finishing it needs the model graph, which the scanner does not have, so the
 * walk is recorded here and completed at consumption time.
 */
export interface DeferredChain {
  readonly rootKind: 'instance' | 'queryset' | 'manager';
  readonly rootModel: string;
  /** Attribute hops off the root — `['tags']` for `product.tags.all()`. */
  readonly path: readonly string[];
  /** What the trailing Python call chain makes of the result. Absent when
   *  the value is a bare attribute access with no call. */
  readonly terminal?: 'queryset' | 'instance';
  readonly annotations?: readonly AnnotationRef[];
}

/**
 * A `Prefetch('rel', …, to_attr='name')`. Django hands the rows back on `name`
 * as a plain LIST — a real attribute the model does not declare.
 */
export interface PrefetchAttr {
  readonly name: string;
  readonly path: string;
}

export interface ContextVar {
  readonly name: string;
  readonly kind: ContextVarKind;
  /** Bare ('Product') or qualified ('shop.Product'). Resolve through the
   *  view-context ModelGraph, never a direct index lookup. */
  readonly typeRef?: string;
  readonly conditional?: boolean;
  readonly annotations?: readonly AnnotationRef[];
  /** Projection from `.values('a','b')` / `.values_list(...)` — when set,
   *  ONLY these names (plus annotations) are valid field accesses. */
  readonly valuesFields?: readonly string[];
  /** For kind='dict' (e.g. `.aggregate(...)` results): the known keys. */
  readonly dictKeys?: readonly string[];
  /** Set on an otherwise-scalar var whose value is a graph walk the scanner
   *  could not finish. See {@link DeferredChain}. */
  readonly deferredFrom?: DeferredChain;
  /** Attributes added by `Prefetch(to_attr=…)`. */
  readonly prefetchAttrs?: readonly PrefetchAttr[];
}
