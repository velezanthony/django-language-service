import type { BoxFlags } from '$lib/state/box-flags.svelte';

export interface FieldRef {
  model: string;
}

export interface TimelineStepDiff {
  addedModels: string[];
  removedModels: string[];
  addedFields: FieldRef[];
  alteredFields: FieldRef[];
  renamedFields: FieldRef[];
}

/** Only the endpoints matter for the one-hop expansion. */
export interface RelationEdge {
  from: string;
  to: string;
}

export const matchesStepModel = (boxKey: string, bareName: string, stepApp: string): boolean => {
  const idx = boxKey.indexOf('.');
  const app = idx >= 0 ? boxKey.slice(0, idx) : '';
  const name = idx >= 0 ? boxKey.slice(idx + 1) : boxKey;
  if (stepApp && app && app !== stepApp) return false;
  return name === bareName || name.toLowerCase() === bareName;
};

/** Models exactly one relation hop from `touched`, excluding `touched` itself. */
export const oneHopNeighbours = (
  touched: ReadonlySet<string>,
  relations: readonly RelationEdge[],
): Set<string> => {
  const out = new Set<string>();
  for (const r of relations) {
    if (touched.has(r.from) && !touched.has(r.to)) out.add(r.to);
    if (touched.has(r.to) && !touched.has(r.from)) out.add(r.from);
  }
  return out;
};

/**
 * Classify every box for a selected migration step.
 *
 * Touched models are the answer to "what changed". Their direct neighbours are
 * the answer to "who does this hurt" — the question you actually have open when
 * reading a migration. Without them a two-model migration renders two boxes
 * floating in an empty canvas, which reads as broken rather than as focused.
 */
export const classifyTimelineBoxes = (
  modelKeys: string[],
  diff: TimelineStepDiff,
  stepApp: string,
  relations: readonly RelationEdge[] = [],
): Record<string, BoxFlags> => {
  const updates: Record<string, BoxFlags> = {};
  const touched = new Set<string>();

  for (const key of modelKeys) {
    if (diff.addedModels.some(n => matchesStepModel(key, n, stepApp))) {
      updates[key] = { tlAdded: true, tlContext: false };
      touched.add(key);
    } else if (
      diff.addedFields.some(f => matchesStepModel(key, f.model, stepApp)) ||
      diff.alteredFields.some(f => matchesStepModel(key, f.model, stepApp)) ||
      diff.renamedFields.some(f => matchesStepModel(key, f.model, stepApp))
    ) {
      updates[key] = { tlChanged: true, tlContext: false };
      touched.add(key);
    } else {
      updates[key] = { hidden: true, tlContext: false };
    }
  }

  diff.removedModels.forEach(bareName => {
    const key = stepApp ? `${stepApp}.${bareName}` : bareName;
    updates[key] = { tlRemoved: true, tlContext: false, hidden: false };
    touched.add(key);
  });

  for (const key of oneHopNeighbours(touched, relations)) {
    // Only ever promotes a hidden box; never downgrades a touched one.
    if (!updates[key]?.hidden) continue;
    updates[key] = { hidden: false, tlContext: true };
  }

  return updates;
};
