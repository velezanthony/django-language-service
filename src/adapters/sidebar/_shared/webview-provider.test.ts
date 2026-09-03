/**
 * Unit tests for the shared sidebar provider.
 *
 * `vscode` is not resolvable outside the extension host, so it is faked at the
 * module level. The fake records what the provider would have DONE — which line
 * it handed to `Position`, which webview it posted to — because those are the
 * two things the defects below got wrong.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SidebarWebviewProvider } from './webview-provider';

/** Every `new vscode.Position(line, character)` the provider constructs.
 *  `vi.hoisted` because `vi.mock`'s factory is lifted above the imports. */
const { positions } = vi.hoisted(() => ({
  positions: [] as Array<{ line: number; character: number }>,
}));

vi.mock('vscode', () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {
      positions.push({ line, character });
    }
  }
  class Selection {
    constructor(
      public readonly anchor: unknown,
      public readonly active: unknown,
    ) {}
  }
  class Range {
    constructor(
      public readonly start: unknown,
      public readonly end: unknown,
    ) {}
  }
  return {
    Position,
    Selection,
    Range,
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
      joinPath: (_base: unknown, ...parts: string[]) => ({ toString: () => parts.join('/') }),
    },
    window: {
      showTextDocument: vi.fn(async () => ({
        selection: undefined as unknown,
        revealRange: (): void => {
          /* noop */
        },
      })),
      showWarningMessage: vi.fn(),
      createOutputChannel: () => ({
        appendLine: (): void => {
          /* noop */
        },
        dispose: (): void => {
          /* noop */
        },
        show: (): void => {
          /* noop */
        },
      }),
    },
    workspace: {
      openTextDocument: vi.fn(async (uri: unknown) => ({ uri })),
      getConfiguration: () => ({ get: () => undefined }),
    },
    commands: { executeCommand: vi.fn(async () => undefined), registerCommand: vi.fn() },
    TextEditorRevealType: { InCenter: 2 },
    ViewColumn: { One: 1 },
    Disposable: { from: (...d: unknown[]) => ({ dispose: () => d }) },
  };
});

/** A stand-in for `vscode.WebviewView` that lets a test drive both directions. */
function fakeWebviewView() {
  const posted: unknown[] = [];
  let onMessage: (msg: unknown) => void = () => {
    /* noop */
  };
  let onDispose: () => void = () => {
    /* noop */
  };
  const view = {
    posted,
    /** Simulate the webview posting a message to the extension. */
    send: (msg: unknown): void => onMessage(msg),
    /** Simulate VS Code disposing THIS view. */
    dispose: (): void => onDispose(),
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: (u: unknown) => u,
      postMessage: (msg: unknown): Promise<boolean> => {
        posted.push(msg);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (cb: (msg: unknown) => void) => {
        onMessage = cb;
        return { dispose: (): void => undefined };
      },
    },
    onDidDispose: (cb: () => void) => {
      onDispose = cb;
      return { dispose: (): void => undefined };
    },
  };
  return view;
}

const anyPayload = { orphans: [], totalTemplates: 0 } as const;

/** Let the provider's async `onMessage` handler settle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  positions.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// `openFile` carries a line only for rows that HAVE one. A template row in the
// Views chain carries `{ file }` and nothing else, so `line` arrives undefined
// — and `line - 1` on undefined is NaN. `new vscode.Position(NaN, 0)` is not a
// position; clicking such a row moved the cursor nowhere and reported nothing.
//
// The rule: whatever the webview puts in `line`, the position the provider
// builds is a non-negative integer.
// ─────────────────────────────────────────────────────────────────────────────
describe('openFile turns any line the webview sends into a usable position', () => {
  const cases: Array<[label: string, line: unknown]> = [
    ['no line at all', undefined],
    ['a null line', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a negative line', -12],
    ['line zero', 0],
    ['a fractional line', 3.7],
    ['a normal line', 42],
  ];

  it.each(cases)('survives %s', async (_label, line) => {
    const provider = new SidebarWebviewProvider('views', {} as never);
    const view = fakeWebviewView();
    provider.resolveWebviewView(view as never);

    view.send({ type: 'openFile', file: '/ws/apps/shop/templates/shop/base.html', line });
    await settle();

    expect(positions).toHaveLength(1);
    const at = positions[0]!;
    expect(Number.isInteger(at.line)).toBe(true);
    expect(at.line).toBeGreaterThanOrEqual(0);
    expect(at.character).toBe(0);
  });

  it('still maps a real 1-based line to its 0-based position', async () => {
    const provider = new SidebarWebviewProvider('views', {} as never);
    const view = fakeWebviewView();
    provider.resolveWebviewView(view as never);

    view.send({ type: 'openFile', file: '/ws/apps/shop/views.py', line: 42 });
    await settle();

    expect(positions[0]?.line).toBe(41);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VS Code disposes and re-resolves a sidebar view every time the user collapses
// and re-opens the section, and the dispose notification for the OLD view can
// arrive after the new one has already been resolved. The handler cleared
// `this.view` unconditionally, so the late notification detached the LIVE view:
// the section rendered once and then never updated again, with no error anywhere.
//
// The rule: a dispose notification only detaches the view it came from.
// ─────────────────────────────────────────────────────────────────────────────
describe('a dispose notification only detaches the view it came from', () => {
  it('keeps pushing to the current view when a previous one is disposed late', () => {
    const provider = new SidebarWebviewProvider('orphans', {} as never);

    const first = fakeWebviewView();
    provider.resolveWebviewView(first as never);

    // The user collapsed and re-opened the section: VS Code hands over a NEW view.
    const second = fakeWebviewView();
    provider.resolveWebviewView(second as never);

    // ...and only now tells us the first one is gone.
    first.dispose();

    provider.setData(anyPayload as never);

    expect(second.posted).toHaveLength(1);
    expect(provider.getView()).toBe(second as never);
  });

  it('replays the cached payload to the current view on a late ready handshake', () => {
    const provider = new SidebarWebviewProvider('orphans', {} as never);

    const first = fakeWebviewView();
    provider.resolveWebviewView(first as never);
    const second = fakeWebviewView();
    provider.resolveWebviewView(second as never);
    first.dispose();

    provider.setData(anyPayload as never);
    second.send({ type: 'ready' });

    expect(second.posted).toHaveLength(2);
  });

  it('detaches when the CURRENT view is the one disposed', () => {
    const provider = new SidebarWebviewProvider('orphans', {} as never);
    const only = fakeWebviewView();
    provider.resolveWebviewView(only as never);

    only.dispose();

    expect(provider.getView()).toBeUndefined();
    provider.setData(anyPayload as never);
    expect(only.posted).toHaveLength(0);
  });
});
