/**
 * view-context engine types — shared by the model graph, the chain
 * resolver, the context-type inference, and the template scope builders.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { AnnotationRef, DeferredChain, PrefetchAttr } from '$domain/types/context-var';
import type { RelationKind } from '$domain/types/relation';

/** What a dotted-chain hop can land on. */
export type ResolvedKind = 'instance' | 'manager' | 'queryset' | 'primitive' | 'dict';

/** Type of a template expression at some point in a dot chain.
 *  Also the shape produced by `inferContextTypes` for view context values
 *  (restricted there to 'queryset' | 'instance' | 'dict'). */
export interface ResolvedType {
  readonly kind: ResolvedKind;
  /** Model class name as written in source — bare ('Product') or
   *  qualified ('shop.Product'). Resolve via ModelGraph.resolveModel. */
  readonly model?: string;
  /** Synthetic fields added via `.annotate(name=Func(...))` on the
   *  originating queryset. Carried so `{% for x in qs %}` iterators can
   *  validate `x.annotation_name`. Looked up as primitive. */
  readonly annotations?: readonly AnnotationRef[];
  /** `.values('a','b')` / `.values_list(...)` projection. When set, the
   *  ONLY valid field accesses on an instance of this type are these
   *  names (plus annotations). */
  readonly valuesFields?: readonly string[];
  /** For kind='dict' (today produced by `.aggregate()`): the keys this
   *  dict exposes. Every other key access errors. */
  readonly dictKeys?: readonly string[];
  /** Only on kind='primitive': the value is a graph walk the inference could
   *  record but not finish. See {@link DeferredChain}. */
  readonly deferred?: DeferredChain;
  /** Attributes a `Prefetch(to_attr=…)` adds to each row. */
  readonly prefetchAttrs?: readonly PrefetchAttr[];
}

/** A reverse accessor on a target model (e.g. `author.posts` from
 *  `Post.author = FK(Author, related_name='posts')`). */
export interface ReverseRelation {
  /** The accessor name: `related_name` when declared, otherwise Django's
   *  default — `<model>_set`, or the bare model name for a OneToOne. */
  readonly name: string;
  /** Qualified 'app.Model' of the model DECLARING the forward relation. */
  readonly sourceModel: string;
  /** fk | o2o | m2m — determines what the reverse access resolves to. */
  readonly relationKind: RelationKind;
}

export interface ChainError {
  /** Which part index failed (1-based from root). */
  readonly level: number;
  /** The field/attr that failed. */
  readonly field: string;
  readonly message: string;
  readonly suggestion?: string;
}

export interface ChainResult {
  readonly finalType: ResolvedType | null;
  readonly error?: ChainError;
}

/** True when `annotations` contains an entry named `name`. */
export function hasAnnotation(
  annotations: readonly AnnotationRef[] | undefined,
  name: string,
): boolean {
  return annotations !== undefined && annotations.some(a => a.name === name);
}
