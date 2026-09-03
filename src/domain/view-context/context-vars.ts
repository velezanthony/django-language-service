/**
 * ContextVar builders — bridge between the inference engine (ResolvedType)
 * and the View.contextVars domain type.
 *
 * buildContextVars merges the parser's contextKeys (names) with the
 * inference result (types): every declared key becomes a ContextVar, typed
 * when inference found a model shape, 'scalar' otherwise; keys ONLY known
 * to inference (CBV object / object_list / context_object_name) are
 * appended — the raw parser never sees those.
 *
 * conditionalKeys (optional) marks entries `conditional: true` — keys that
 * are only sometimes in the context (if/elif branches, nested helper hops).
 * Names present ONLY in that set are appended as conditional scalars.
 *
 * Pure domain: no vscode / fs / path imports.
 */

import type { ContextVar, ContextVarKind } from '$domain/types/context-var';
import type { ModelGraph } from './model-graph';
import type { ResolvedType } from './types';
import { resolveChain } from './chain-resolver';

export function buildContextVars(
  contextKeys: readonly string[],
  inferredTypes: ReadonlyMap<string, ResolvedType>,
  conditionalKeys?: ReadonlySet<string>,
): ContextVar[] {
  const names: string[] = [...contextKeys];
  for (const key of inferredTypes.keys()) {
    if (!names.includes(key)) names.push(key);
  }
  for (const key of conditionalKeys ?? []) {
    if (!names.includes(key)) names.push(key);
  }

  return names.map(name => {
    const conditional = conditionalKeys?.has(name) ? { conditional: true as const } : {};
    const t = inferredTypes.get(name);
    if (!t) return { name, kind: 'scalar' as ContextVarKind, ...conditional };
    // An unfinished walk has no kind of its own yet — it stays scalar (so every
    // consumer that has no graph keeps behaving as before) and carries the walk.
    if (t.kind === 'primitive') {
      return {
        name,
        kind: 'scalar' as ContextVarKind,
        ...(t.deferred !== undefined ? { deferredFrom: t.deferred } : {}),
        ...conditional,
      };
    }
    return {
      name,
      // Inference only produces queryset | instance | dict — all valid
      // ContextVarKind members ('manager' arises from chain hops, never
      // from a context value; 'primitive' never reaches here).
      kind: t.kind as ContextVarKind,
      ...(t.model !== undefined ? { typeRef: t.model } : {}),
      ...(t.annotations !== undefined ? { annotations: t.annotations } : {}),
      ...(t.valuesFields !== undefined ? { valuesFields: t.valuesFields } : {}),
      ...(t.dictKeys !== undefined ? { dictKeys: t.dictKeys } : {}),
      ...(t.prefetchAttrs !== undefined ? { prefetchAttrs: t.prefetchAttrs } : {}),
      ...conditional,
    };
  });
}

/** Convert a stored ContextVar back into a chain-engine root type.
 *  Returns null for scalar vars — there is nothing to resolve against, UNLESS
 *  the var carries a deferred walk and a graph is supplied to finish it. */
export function contextVarToResolvedType(v: ContextVar, graph?: ModelGraph): ResolvedType | null {
  if (v.kind === 'scalar') return resolveDeferred(v, graph);
  return {
    kind: v.kind,
    ...(v.typeRef !== undefined ? { model: v.typeRef } : {}),
    ...(v.annotations !== undefined ? { annotations: v.annotations } : {}),
    ...(v.valuesFields !== undefined ? { valuesFields: v.valuesFields } : {}),
    ...(v.dictKeys !== undefined ? { dictKeys: v.dictKeys } : {}),
    ...(v.prefetchAttrs !== undefined ? { prefetchAttrs: v.prefetchAttrs } : {}),
  };
}

/**
 * Finish a walk the scanner could only record: `context['tags'] =
 * product.tags.all()` needs the graph to learn that `Product.tags` is an M2M
 * to Tag, and only then does the trailing `.all()` mean `queryset<Tag>`.
 */
function resolveDeferred(v: ContextVar, graph?: ModelGraph): ResolvedType | null {
  const d = v.deferredFrom;
  if (!d || !graph) return null;

  // resolveChain consumes parts[0] as the already-typed root, so the name is a
  // placeholder — only the hops after it are walked.
  const walked = resolveChain(
    ['_', ...d.path],
    { kind: d.rootKind, model: d.rootModel },
    graph,
  ).finalType;
  if (!walked?.model) return null;

  const annotations = d.annotations ?? walked.annotations;
  return {
    kind: d.terminal ?? (walked.kind === 'manager' ? 'queryset' : walked.kind),
    model: walked.model,
    ...(annotations !== undefined ? { annotations } : {}),
  };
}
