/**
 * With Live Mode off, the three Live Mode providers do no work.
 *
 * All three opened with `isInsideTemplateExpr(document.getText(), …)` — a full
 * document read, then a blanking pass over everything before the cursor —
 * BEFORE consulting `liveViewKey`, the gate that rejects every call when no
 * live view is selected. That is the default state, so on a normal keystroke
 * the whole cost was paid to reach a `return undefined`. Hover and definition
 * fire on pointer rest and on Ctrl-hover; completion fires on `{`, `.` and
 * space.
 *
 * The rule is stated as an OBSERVATION, not as source order: with no live view
 * selected, `document.getText()` is never called. That holds however the
 * provider is written, and it is exactly the cost being removed — every
 * document-wide step in these three providers takes the text as its argument.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted above every import below, so all three load against the double.
vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  lastRegistered,
  resetRegistered,
  type Position,
} from '$adapters/_shared/__fixtures__/vscode-double';
import {
  projectWith,
  viewEntry,
  contextWithState,
} from '$adapters/_shared/__fixtures__/project-double';
import { LIVE_VIEW_KEY } from '$adapters/sidebar/compare-state';

import { register as registerContextVarsCompletion } from '$adapters/completion/context-vars';
import { register as registerContextVarDefinition } from '$adapters/definition/context-var';
import { register as registerModelFieldHover } from '$adapters/hover/model-field';

type Register = (ctx: never, services: { getProject: () => never }) => { dispose(): void };

interface AnyProvider {
  provideCompletionItems?(doc: unknown, pos: Position): unknown;
  provideDefinition?(doc: unknown, pos: Position): unknown;
  provideHover?(doc: unknown, pos: Position): unknown;
}

/** `{{ product.name }}` — a cursor position all three providers would serve. */
const SOURCE = '<p>{{ product.name }}</p>\n';

/** A project in which the live key below really does resolve to a view. */
const LIVE_VIEW = 'shop.ProductView';
const LIVE_PROJECT = projectWith({
  views: [viewEntry({ name: LIVE_VIEW, contextVars: [{ name: 'product' }] as never })],
});

const PROVIDERS: readonly [string, Register][] = [
  ['completion/context-vars', registerContextVarsCompletion as unknown as Register],
  ['definition/context-var', registerContextVarDefinition as unknown as Register],
  ['hover/model-field', registerModelFieldHover as unknown as Register],
];

beforeEach(() => resetRegistered());

describe('the Live Mode gate is checked before the document is read', () => {
  it.each(PROVIDERS)('%s reads no document text when no view is live', (_name, register) => {
    const ctx = contextWithState({});
    register(ctx as never, { getProject: () => LIVE_PROJECT as never });
    const provider = lastRegistered<AnyProvider>();

    const doc = new Doc(SOURCE);
    const getText = vi.spyOn(doc, 'getText');
    const position = doc.positionAt(SOURCE.indexOf('name'));

    const answer =
      provider.provideCompletionItems?.(doc, position) ??
      provider.provideDefinition?.(doc, position) ??
      provider.provideHover?.(doc, position);

    expect(answer).toBeUndefined();
    expect(getText).not.toHaveBeenCalled();
  });

  // The guard: the assertion above would also pass on a provider that had been
  // broken into always returning undefined. With a view selected the gate
  // opens, and the document IS read.
  it.each(PROVIDERS)('%s does read the document once a view is live', (_name, register) => {
    const ctx = contextWithState({ [LIVE_VIEW_KEY]: LIVE_VIEW });
    register(ctx as never, { getProject: () => LIVE_PROJECT as never });
    const provider = lastRegistered<AnyProvider>();

    const doc = new Doc(SOURCE);
    const getText = vi.spyOn(doc, 'getText');
    const position = doc.positionAt(SOURCE.indexOf('name'));

    provider.provideCompletionItems?.(doc, position);
    provider.provideDefinition?.(doc, position);
    provider.provideHover?.(doc, position);

    expect(getText).toHaveBeenCalled();
  });
});
