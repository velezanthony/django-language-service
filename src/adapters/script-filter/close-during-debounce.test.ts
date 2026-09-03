/**
 * Closing a template while its validation is still pending.
 *
 * The script/style validator debounces by 500 ms, and clears a document's
 * diagnostics when it closes. Those two are correct on their own and wrong
 * together: closing does not cancel the pending timer, so the timer fires
 * afterwards and writes diagnostics for a document that is gone.
 *
 * VS Code keeps a closed file's diagnostics in the Problems panel, and the
 * close handler — the only thing that clears them — has already run. So the
 * squiggles for a file the user closed sit there for the rest of the session,
 * and reopening and closing it cleanly does not help: the same race is what
 * put them there.
 *
 * Edit, then close within half a second. That is a normal thing to do.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  Uri,
  documentEvents,
  diagnosticCollections,
  resetDiagnostics,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { register } from './index';

/** A template whose <script> really is broken, so there is something to report. */
const BROKEN = '<script>\nfunction (\n</script>';

function doc(path: string) {
  return new Doc(BROKEN, 'django-html', Uri.file(path));
}

function services() {
  return {
    getProject: () => ({
      models: { all: () => [{}] },
      views: { all: () => [] },
      urls: { all: () => [] },
    }),
  } as never;
}

beforeEach(() => {
  resetDiagnostics();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('a document closed while its validation is pending', () => {
  it('reports on a document that stays open', () => {
    // The control: without it, every assertion below could pass because
    // nothing is ever reported at all.
    const disposable = register({ subscriptions: [] } as never, services());
    const d = doc('/w/templates/open.html');

    documentEvents.change.fire({ document: d });
    vi.advanceTimersByTime(600);

    const js = diagnosticCollections.get('django-js');
    expect(js?.get(d.uri).length).toBeGreaterThan(0);
    disposable.dispose();
  });

  it('leaves nothing behind for a document closed first', () => {
    const disposable = register({ subscriptions: [] } as never, services());
    const d = doc('/w/templates/closed.html');

    documentEvents.change.fire({ document: d });
    documentEvents.close.fire(d); // within the 500 ms window
    vi.advanceTimersByTime(600);

    const js = diagnosticCollections.get('django-js');
    const css = diagnosticCollections.get('django-css');
    expect(js?.get(d.uri) ?? [], 'JS diagnostics for a closed document').toEqual([]);
    expect(css?.get(d.uri) ?? [], 'CSS diagnostics for a closed document').toEqual([]);
    disposable.dispose();
  });

  it('does not fire a pending timer after the provider is disposed', () => {
    const disposable = register({ subscriptions: [] } as never, services());
    const d = doc('/w/templates/disposed.html');

    documentEvents.change.fire({ document: d });
    disposable.dispose();

    // The collection throws on a write after dispose, so this asserts that the
    // timer never runs rather than that it ran harmlessly.
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
  });
});
