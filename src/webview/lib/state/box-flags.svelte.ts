/**
 * Per-box reactive flag set. Single source of truth: add a flag here and
 * `BoxFlag` (union) + `BoxFlags` (record) update automatically.
 *
 * Dot-access for autocomplete (`BoxFlag.HIDDEN`), value for runtime ('hidden').
 * The interface shape used in updates is `BoxFlags` (Partial of the record).
 */
export const BoxFlag = {
  HIDDEN: 'hidden',
  HIGHLIGHTED: 'highlighted',
  DIMMED: 'dimmed',
  /** The clicked model in focus mode — gets a stronger ring than its related neighbours. */
  FOCUS_SOURCE: 'focusSource',
  COMPARE_ADDED: 'compareAdded',
  COMPARE_CHANGED: 'compareChanged',
  COMPARE_REMOVED: 'compareRemoved',
  COMPARE_UNCHANGED: 'compareUnchanged',
  TL_ADDED: 'tlAdded',
  TL_REMOVED: 'tlRemoved',
  TL_CHANGED: 'tlChanged',
  /** Untouched by the step, but one relation hop from something that changed. */
  TL_CONTEXT: 'tlContext',
  BLAST_SOURCE: 'blastSource',
  BLAST_AFFECTED: 'blastAffected',
} as const;

export type BoxFlag = (typeof BoxFlag)[keyof typeof BoxFlag];
export type BoxFlags = Partial<Record<BoxFlag, boolean>>;

export const boxFlagsState = $state<{ byKey: Record<string, BoxFlags> }>({
  byKey: {},
});

export const setBoxFlag = (key: string, flag: BoxFlag, on: boolean): void => {
  const cur = boxFlagsState.byKey[key] ?? {};
  if (cur[flag] === on) return;
  boxFlagsState.byKey[key] = { ...cur, [flag]: on };
};

export const setManyBoxFlags = (updates: Record<string, BoxFlags>): void => {
  for (const [key, patch] of Object.entries(updates)) {
    boxFlagsState.byKey[key] = { ...(boxFlagsState.byKey[key] ?? {}), ...patch };
  }
};

// Rest-param signature handles both clearFlags(BoxFlag.X) and
// clearFlags(BoxFlag.A, BoxFlag.B). Spread an array with clearFlags(...arr).
export const clearFlags = (...flags: BoxFlag[]): void => {
  for (const [key, cur] of Object.entries(boxFlagsState.byKey)) {
    const next = { ...cur };
    for (const f of flags) delete next[f];
    boxFlagsState.byKey[key] = next;
  }
};

export const resetBoxFlags = (): void => {
  boxFlagsState.byKey = {};
};
