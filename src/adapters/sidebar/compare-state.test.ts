import { describe, it, expect, beforeEach } from 'vitest';
import {
  LIVE_VIEW_KEY,
  disableLiveViewKey,
  getLiveViewKey,
  setLiveViewKey,
  toggleLiveViewKey,
  liveSwitchAction,
} from './compare-state';

// ── Minimal Memento mock ───────────────────────────────────────────────────────

interface MockState {
  get<T>(key: string): T | undefined;
  update(key: string, value: string | undefined): Thenable<void>;
}

function makeMock(initial: Record<string, unknown> = {}): MockState & {
  _getCalls: string[];
  _updateCalls: Array<[string, unknown]>;
} {
  const store = { ...initial };
  const _getCalls: string[] = [];
  const _updateCalls: Array<[string, unknown]> = [];

  const state: MockState & { _getCalls: string[]; _updateCalls: Array<[string, unknown]> } = {
    _getCalls,
    _updateCalls,
    get<T>(key: string): T | undefined {
      _getCalls.push(key);
      return store[key] as T | undefined;
    },
    update(key: string, value: string | undefined): Thenable<void> {
      _updateCalls.push([key, value]);
      if (value === undefined) {
        delete store[key];
      } else {
        store[key] = value;
      }
      return Promise.resolve();
    },
  };

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
//
// Live-mode identity is the QUALIFIED view key ('app.view_name') — the exact
// primary key the scanner's view index uses — so readers can do
// `project.views.byKey(storedValue)` directly.

describe('LIVE_VIEW_KEY', () => {
  it('is the canonical key string', () => {
    expect(LIVE_VIEW_KEY).toBe('django-language-service.liveView');
  });
});

describe('getLiveViewKey', () => {
  it('returns undefined when nothing stored', () => {
    const state = makeMock();
    expect(getLiveViewKey(state)).toBeUndefined();
    expect(state._getCalls).toContain(LIVE_VIEW_KEY);
  });

  it('returns the stored qualified view key', () => {
    const state = makeMock({ [LIVE_VIEW_KEY]: 'blog.my_view' });
    expect(getLiveViewKey(state)).toBe('blog.my_view');
  });
});

describe('setLiveViewKey', () => {
  let state: ReturnType<typeof makeMock>;
  beforeEach(() => {
    state = makeMock();
  });

  it('writes the qualified view key', async () => {
    await setLiveViewKey(state, 'blog.blog_list');
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, 'blog.blog_list']);
  });

  it('writes undefined when given undefined (deselect)', async () => {
    await setLiveViewKey(state, undefined);
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, undefined]);
  });

  it('writes undefined when given empty string (deselect)', async () => {
    await setLiveViewKey(state, '');
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, undefined]);
  });
});

describe('toggleLiveViewKey', () => {
  it('selects a view when none is active', async () => {
    const state = makeMock();
    const result = await toggleLiveViewKey(state, 'blog.post_detail');
    expect(result).toBe('blog.post_detail');
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, 'blog.post_detail']);
  });

  it('deselects the view when the same key is toggled again', async () => {
    const state = makeMock({ [LIVE_VIEW_KEY]: 'blog.post_detail' });
    const result = await toggleLiveViewKey(state, 'blog.post_detail');
    expect(result).toBeUndefined();
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, undefined]);
  });

  it('switches to a different view (replaces)', async () => {
    const state = makeMock({ [LIVE_VIEW_KEY]: 'blog.post_detail' });
    const result = await toggleLiveViewKey(state, 'blog.blog_list');
    expect(result).toBe('blog.blog_list');
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, 'blog.blog_list']);
  });

  it('treats same-named views in different apps as distinct', async () => {
    const state = makeMock({ [LIVE_VIEW_KEY]: 'blog.index' });
    const result = await toggleLiveViewKey(state, 'shop.index');
    expect(result).toBe('shop.index');
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, 'shop.index']);
  });
});

// `disableLiveViewKey` is what the "Disable Live Validation" command needs:
// an explicit OFF that never turns anything on, unlike the radio toggle.
describe('disableLiveViewKey', () => {
  it('clears the active selection', async () => {
    const state = makeMock({ [LIVE_VIEW_KEY]: 'blog.post_detail' });
    const result = await disableLiveViewKey(state);
    expect(result).toBeUndefined();
    expect(getLiveViewKey(state)).toBeUndefined();
    expect(state._updateCalls).toContainEqual([LIVE_VIEW_KEY, undefined]);
  });

  it('is a no-op when nothing is selected — never turns Live Mode on', async () => {
    const state = makeMock();
    const result = await disableLiveViewKey(state);
    expect(result).toBeUndefined();
    expect(getLiveViewKey(state)).toBeUndefined();
  });

  it('clears a different view than the one the user was looking at', async () => {
    // The off command carries no view identity: whatever is live goes off.
    const state = makeMock({ [LIVE_VIEW_KEY]: 'shop.index' });
    await disableLiveViewKey(state);
    expect(getLiveViewKey(state)).toBeUndefined();
  });
});

// Live Mode validates against ONE view's context. Carrying it into the next
// template means validating a document that view never renders, so every
// variable in it reads as undefined.
describe('liveSwitchAction', () => {
  const base = {
    liveViewKey: 'shop.detail',
    owner: 'file:///a.html',
    docUri: 'file:///a.html',
    isTemplate: true,
  };

  it('keeps Live Mode on the template it was enabled in', () => {
    expect(liveSwitchAction(base)).toBe('keep');
  });

  it('ends it on a different template', () => {
    expect(liveSwitchAction({ ...base, docUri: 'file:///b.html' })).toBe('end');
  });

  // Switching to views.py to read the context and back must not lose it.
  it('ignores a non-template editor', () => {
    expect(liveSwitchAction({ ...base, docUri: 'file:///v.py', isTemplate: false })).toBe('keep');
  });

  it('does nothing when Live Mode is already off', () => {
    expect(liveSwitchAction({ ...base, liveViewKey: undefined, docUri: 'file:///b.html' })).toBe(
      'keep',
    );
  });

  // State written before per-document scoping existed has no owner. Turning
  // Live Mode off under the user would be a worse surprise than adopting.
  it('adopts the current template when no owner was recorded', () => {
    expect(liveSwitchAction({ ...base, owner: undefined })).toBe('adopt');
  });

  it('ignores an editor with no document', () => {
    expect(liveSwitchAction({ ...base, docUri: undefined })).toBe('keep');
  });
});
