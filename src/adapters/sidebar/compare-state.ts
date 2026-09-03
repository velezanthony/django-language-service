/**
 * CTX-017 — Live-mode per-view state persistence.
 *
 * Owns the workspace-state key used by the live validation feature.
 * This is the SINGLE SOURCE OF TRUTH for the storage key — all adapters
 * that read/write live-mode state MUST import `LIVE_VIEW_KEY` from here.
 *
 * IDENTITY FORMAT: the stored value is the QUALIFIED view key
 * `'<app>.<view_name>'` (e.g. 'blog.post_list') — the exact primary key the
 * scanner's view index uses (see $infra/view-key). Readers can therefore do
 * `project.views.byKey(storedValue)` directly. Never store the bare view
 * name: it doesn't match the index and is ambiguous across apps.
 *
 * Live Mode: when a view is "live", the extension runs context-var
 * diagnostics + completions + hover/definition for the currently open
 * template, gated to that specific view's context dictionary.
 *
 * Reads/writes via `vscode.Memento` (workspace state) so the selection
 * survives reload and is scoped to the workspace (not the user globally).
 */

export const LIVE_VIEW_KEY = 'django-language-service.liveView';

/**
 * URI of the template Live Mode was switched on for.
 *
 * Live Mode validates against ONE view's context. Carrying that over to the
 * next template you open means validating a document the view never renders,
 * so every variable in it reads as undefined. The selection is therefore tied
 * to the document it was made in, and dropped on the way to another one.
 */
export const LIVE_DOC_KEY = 'django-language-service.liveDocument';

export function getLiveDocument(state: { get<T>(key: string): T | undefined }): string | undefined {
  return state.get<string>(LIVE_DOC_KEY);
}

export function setLiveDocument(
  state: { update(key: string, value: string | undefined): Thenable<void> },
  uri: string | undefined,
): Thenable<void> {
  return state.update(LIVE_DOC_KEY, uri || undefined);
}

/** What moving the cursor into `docUri` should do to Live Mode. */
export type LiveSwitchAction = 'keep' | 'adopt' | 'end';

/**
 * Decide, without touching vscode, what an editor change means for Live Mode.
 *
 *   keep   nothing to do — off already, not a template, or the same one
 *   adopt  on, but no owner recorded (state from before this existed); claim
 *          this document instead of switching off under the user
 *   end    a DIFFERENT template — the selection does not travel
 */
export function liveSwitchAction(input: {
  readonly liveViewKey: string | undefined;
  readonly owner: string | undefined;
  readonly docUri: string | undefined;
  readonly isTemplate: boolean;
}): LiveSwitchAction {
  if (!input.isTemplate || !input.docUri) return 'keep';
  if (!input.liveViewKey) return 'keep';
  if (!input.owner) return 'adopt';
  return input.owner === input.docUri ? 'keep' : 'end';
}

/** Read the currently selected live view's qualified key from workspace state.
 *  Returns undefined when no view is selected. */
export function getLiveViewKey(state: { get<T>(key: string): T | undefined }): string | undefined {
  return state.get<string>(LIVE_VIEW_KEY);
}

/** Set (or clear) the live view selection (qualified key).
 *  Pass undefined/empty string to deselect. */
export function setLiveViewKey(
  state: { update(key: string, value: string | undefined): Thenable<void> },
  viewKey: string | undefined,
): Thenable<void> {
  return state.update(LIVE_VIEW_KEY, viewKey || undefined);
}

/** Turn Live Mode OFF unconditionally, whatever is currently selected.
 *  Distinct from `toggleLiveViewKey`: this can never turn Live Mode ON, which
 *  is what an explicit "Disable Live Validation" action must guarantee.
 *  Always resolves to undefined (the new, empty selection). */
export function disableLiveViewKey(state: {
  update(key: string, value: string | undefined): Thenable<void>;
}): Thenable<undefined> {
  return setLiveViewKey(state, undefined).then(() => undefined);
}

/** Toggle the live view selection: if `viewKey` is already selected, deselect it.
 *  Returns the new active qualified key (or undefined if deselected). */
export function toggleLiveViewKey(
  state: {
    get<T>(key: string): T | undefined;
    update(key: string, value: string | undefined): Thenable<void>;
  },
  viewKey: string,
): Thenable<string | undefined> {
  const current = getLiveViewKey(state);
  const next = current === viewKey ? undefined : viewKey;
  return setLiveViewKey(state, next).then(() => next);
}
