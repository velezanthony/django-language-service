/**
 * describeChainSegment — classifies ONE segment of a dotted template chain
 * for hover and go-to-definition: what the identifier under the cursor IS
 * (field / relation / property / annotation / reverse / manager attr /
 * dict key) and which Model owns it.
 *
 * Resolution strategy: resolve the chain up to the segment's PARENT via
 * resolveChain, then look the segment up on the parent type — the same
 * order the chain resolver itself uses, so hover never disagrees with
 * diagnostics.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { Model } from '$domain/types/model';
import type { Field } from '$domain/types/field';
import type { Relation } from '$domain/types/relation';
import type { ModelGraph } from './model-graph';
import type { ResolvedType, ReverseRelation } from './types';
import {
  resolveChain,
  MANAGER_ATTRS,
  choiceDisplaySource,
  implicitInstanceAttr,
  fkIdSource,
  dateNavSource,
} from './chain-resolver';

export type ChainSegmentInfo =
  | { kind: 'root'; name: string; type: ResolvedType; model?: Model }
  | { kind: 'field'; name: string; owner: Model; field: Field }
  | { kind: 'relation'; name: string; owner: Model; relation: Relation; target?: Model }
  | { kind: 'property'; name: string; owner: Model }
  | { kind: 'annotation'; name: string; func: string }
  | { kind: 'reverse'; name: string; rel: ReverseRelation; source?: Model }
  | { kind: 'manager-attr'; name: string; modelRef?: string }
  | { kind: 'dict-key'; name: string }
  /** `get_<field>_display` — carries the field it reads, because the choices
   *  are the only reason to hover it. */
  | { kind: 'choice-display'; name: string; owner: Model; field: Field }
  | { kind: 'implicit-pk'; name: string; owner: Model }
  /** `<relation>_id` — the attname Django puts on the row. Carries the relation
   *  it belongs to, because that is the declaration and where go-to-definition
   *  should land. */
  | { kind: 'fk-id'; name: string; owner: Model; relation: Relation }
  /** `get_next_by_<field>` / `get_previous_by_<field>` — added for every
   *  non-null date field. Carries the field, because whether it can raise
   *  DoesNotExist is the only reason to hover it. */
  | { kind: 'date-nav'; name: string; owner: Model; field: Field }
  | { kind: 'method'; name: string; owner: Model };

/**
 * Describe `to_attr='alias'` as the relation it renames.
 *
 * `Prefetch('reviews', to_attr='top_reviews')` puts the rows of the `reviews`
 * relation on `top_reviews`. The attribute has no declaration of its own — the
 * relation at the end of the prefetched path IS its declaration, and it is
 * where go-to-definition should land — so the alias is described AS that
 * relation, carrying the alias as its name. No new `kind`: every reader of
 * ChainSegmentInfo already renders relations and reverse relations.
 *
 * The path is walked with the chain resolver, so a multi-hop `a__b` lands on
 * the owner of its LAST hop rather than on the row the prefetch was issued
 * from.
 */
function describePrefetched(
  alias: string,
  path: string,
  fromModel: string,
  graph: ModelGraph,
): ChainSegmentInfo | null {
  const hops = path.split('__').filter(Boolean);
  const last = hops.at(-1);
  if (last === undefined) return null;

  const upto = resolveChain(
    ['_', ...hops.slice(0, -1)],
    { kind: 'instance', model: fromModel },
    graph,
  );
  const hopParent = upto.finalType;
  if (!hopParent?.model) return null;
  const hopOwner = graph.resolveModel(hopParent.model);
  if (!hopOwner) return null;

  const relation = graph.relationOf(hopOwner, last);
  if (relation) {
    const targetRef =
      relation.toModel === 'self' ? `${hopOwner.appLabel}.${hopOwner.name}` : relation.toModel;
    const target = graph.resolveModel(targetRef);
    return {
      kind: 'relation',
      name: alias,
      owner: hopOwner,
      relation,
      ...(target !== undefined ? { target } : {}),
    };
  }

  const rev = graph.reverseRelationsOf(hopParent.model).find(r => r.name === last);
  if (rev) {
    const source = graph.resolveModel(rev.sourceModel);
    return {
      kind: 'reverse',
      name: alias,
      rel: rev,
      ...(source !== undefined ? { source } : {}),
    };
  }

  return null;
}

export function describeChainSegment(
  parts: readonly string[],
  segmentIdx: number,
  rootType: ResolvedType,
  graph: ModelGraph,
): ChainSegmentInfo | null {
  if (segmentIdx < 0 || segmentIdx >= parts.length) return null;
  const name = parts[segmentIdx]!;

  // Root — the context variable itself.
  if (segmentIdx === 0) {
    const model = rootType.model ? graph.resolveModel(rootType.model) : undefined;
    return {
      kind: 'root',
      name,
      type: rootType,
      ...(model !== undefined ? { model } : {}),
    };
  }

  // Resolve up to the segment's parent (parts[0..segmentIdx-1]).
  const parentResult = resolveChain(parts.slice(0, segmentIdx), rootType, graph);
  const parent = parentResult.finalType;
  if (!parent) return null;

  if (parent.kind === 'dict') {
    return (parent.dictKeys ?? []).includes(name) ? { kind: 'dict-key', name } : null;
  }

  if (parent.kind === 'manager' || parent.kind === 'queryset') {
    if (!MANAGER_ATTRS.has(name)) return null;
    return {
      kind: 'manager-attr',
      name,
      ...(parent.model !== undefined ? { modelRef: parent.model } : {}),
    };
  }

  if (parent.kind !== 'instance' || !parent.model) return null;
  const owner = graph.resolveModel(parent.model);
  if (!owner) return null;

  const field = graph.fieldOf(owner, name);
  if (field) return { kind: 'field', name, owner, field };

  const relation = graph.relationOf(owner, name);
  if (relation) {
    const targetRef =
      relation.toModel === 'self' ? `${owner.appLabel}.${owner.name}` : relation.toModel;
    const target = graph.resolveModel(targetRef);
    return {
      kind: 'relation',
      name,
      owner,
      relation,
      ...(target !== undefined ? { target } : {}),
    };
  }

  if (owner.properties.some(p => p.name === name)) return { kind: 'property', name, owner };

  // Everything resolveChain ACCEPTS must also be describable. These three
  // resolved fine — no squiggle — and then fell through to `return null`, so
  // hovering `{{ order.get_status_display }}`, `{{ order.pk }}` or a model
  // method produced nothing at all. Shared predicates, so they cannot drift
  // apart again.
  const choiceField = choiceDisplaySource(name, owner);
  if (choiceField) return { kind: 'choice-display', name, owner, field: choiceField };

  if (implicitInstanceAttr(name, owner)) return { kind: 'implicit-pk', name, owner };

  // Two more readers Django adds and `resolveChain` accepts. They were the last
  // pair this module could not name, so hovering one produced nothing while the
  // diagnostics considered it perfectly valid — the drift the header above
  // promises will not happen. Same shared predicates, for the same reason.
  const fkId = fkIdSource(name, owner);
  if (fkId) return { kind: 'fk-id', name, owner, relation: fkId };

  const dateField = dateNavSource(name, owner);
  if (dateField) return { kind: 'date-nav', name, owner, field: dateField };

  if (owner.methods?.includes(name)) return { kind: 'method', name, owner };

  const annotation = (parent.annotations ?? []).find(a => a.name === name);
  if (annotation) return { kind: 'annotation', name, func: annotation.func };

  // An attribute a `Prefetch(to_attr=…)` put on this row. resolveChain accepts
  // it (its step 4b, in this same position), so leaving it undescribed was the
  // exact drift this module's header forbids: no squiggle, and an empty hover.
  const prefetched = parent.prefetchAttrs?.find(a => a.name === name);
  if (prefetched) return describePrefetched(name, prefetched.path, parent.model, graph);

  const rev = graph.reverseRelationsOf(parent.model).find(r => r.name === name);
  if (rev) {
    const source = graph.resolveModel(rev.sourceModel);
    return {
      kind: 'reverse',
      name,
      rel: rev,
      ...(source !== undefined ? { source } : {}),
    };
  }

  return null;
}
