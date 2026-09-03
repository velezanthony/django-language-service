/**
 * watcher.test.ts — vitest tests for DebouncedWatcher.
 * Uses a fake WatchAdapter (in-test class) and vi.useFakeTimers.
 * No vscode runtime required.
 *
 * Covers:
 *   Scenario 17 — 5 rapid changes → 1 invalidateBatch call after debounce
 *   Scenario 18 — dispose cancels pending timeout (no invalidateBatch called)
 *   Scenario 19 — multiple files in window → batched into single invalidateBatch
 *   Scenario 20 — events after dispose are silently ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebouncedWatcher } from './watcher';
import type { WatchAdapter, WatchDisposable } from './watcher';

// ── Fake WatchAdapter ─────────────────────────────────────────────────────────

class FakeWatchAdapter implements WatchAdapter {
  private changeHandlers: Array<(path: string) => void> = [];
  private deleteHandlers: Array<(path: string) => void> = [];
  private createHandlers: Array<(path: string) => void> = [];

  onChange(handler: (path: string) => void): WatchDisposable {
    this.changeHandlers.push(handler);
    return {
      dispose: () => {
        this.changeHandlers = this.changeHandlers.filter(h => h !== handler);
      },
    };
  }

  onDelete(handler: (path: string) => void): WatchDisposable {
    this.deleteHandlers.push(handler);
    return {
      dispose: () => {
        this.deleteHandlers = this.deleteHandlers.filter(h => h !== handler);
      },
    };
  }

  onCreate(handler: (path: string) => void): WatchDisposable {
    this.createHandlers.push(handler);
    return {
      dispose: () => {
        this.createHandlers = this.createHandlers.filter(h => h !== handler);
      },
    };
  }

  // Test helpers
  fireChange(path: string): void {
    for (const h of this.changeHandlers) h(path);
  }
  fireDelete(path: string): void {
    for (const h of this.deleteHandlers) h(path);
  }
  fireCreate(path: string): void {
    for (const h of this.createHandlers) h(path);
  }
}

// ── Fake Scanner (only invalidateBatch is needed) ─────────────────────────────

function makeFakeScanner() {
  const calls: readonly string[][] = [];
  const scanner = {
    invalidateBatch: vi.fn(async (paths: readonly string[]) => {
      (calls as string[][]).push([...paths]);
    }),
  };
  return { scanner, calls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DebouncedWatcher — Scenario 17: 5 rapid changes → 1 invalidateBatch call', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires invalidateBatch exactly once after debounce window', async () => {
    const adapter = new FakeWatchAdapter();
    const { scanner } = makeFakeScanner();
    new DebouncedWatcher(adapter, scanner, 200);

    // Fire 5 change events within the 200ms window
    adapter.fireChange('/ws/blog/models.py');
    adapter.fireChange('/ws/blog/views.py');
    adapter.fireChange('/ws/blog/forms.py');
    adapter.fireChange('/ws/blog/urls.py');
    adapter.fireChange('/ws/blog/migrations/0001_initial.py');

    // invalidateBatch should NOT have been called yet
    expect(scanner.invalidateBatch).not.toHaveBeenCalled();

    // Advance past the debounce window
    vi.advanceTimersByTime(201);
    await Promise.resolve(); // flush the async invalidateBatch

    expect(scanner.invalidateBatch).toHaveBeenCalledTimes(1);
  });
});

describe('DebouncedWatcher — Scenario 18: dispose cancels pending timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call invalidateBatch when disposed before debounce fires', async () => {
    const adapter = new FakeWatchAdapter();
    const { scanner } = makeFakeScanner();
    const watcher = new DebouncedWatcher(adapter, scanner, 200);

    adapter.fireChange('/ws/blog/models.py');

    // Dispose before the debounce fires
    watcher.dispose();

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(scanner.invalidateBatch).not.toHaveBeenCalled();
  });
});

describe('DebouncedWatcher — Scenario 19: multiple files batched into single call', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches all changed paths into one invalidateBatch call', async () => {
    const adapter = new FakeWatchAdapter();
    const { scanner } = makeFakeScanner();
    const watcher = new DebouncedWatcher(adapter, scanner, 200);

    adapter.fireChange('/ws/a.py');
    adapter.fireCreate('/ws/b.py');
    adapter.fireDelete('/ws/c.py');

    vi.advanceTimersByTime(201);
    await Promise.resolve();

    expect(scanner.invalidateBatch).toHaveBeenCalledTimes(1);
    const batch = scanner.invalidateBatch.mock.calls[0]![0] as string[];
    expect(batch).toContain('/ws/a.py');
    expect(batch).toContain('/ws/b.py');
    expect(batch).toContain('/ws/c.py');

    watcher.dispose();
  });
});

describe('DebouncedWatcher — Scenario 20: events after dispose are silently ignored', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('silently ignores change events emitted after dispose', async () => {
    const adapter = new FakeWatchAdapter();
    const { scanner } = makeFakeScanner();
    const watcher = new DebouncedWatcher(adapter, scanner, 200);

    watcher.dispose();

    // Fire events after dispose — adapter still has handlers that were disposed
    // DebouncedWatcher checks this.disposed flag
    adapter.fireChange('/ws/blog/models.py');

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(scanner.invalidateBatch).not.toHaveBeenCalled();
  });
});
