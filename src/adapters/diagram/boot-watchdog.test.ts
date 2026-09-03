import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { createBootWatchdog, type BootWatchdog } from './boot-watchdog';

/**
 * The watchdog exists to answer one question: did the document we just put in
 * the panel finish coming up? Everything below is a statement about THAT
 * relation — between a rendered document and the report — and never about one
 * particular screen. A panel showing the empty state is only the case that made
 * the missing rule visible; the rule is that a document which loads no bundle
 * has nothing to wait for.
 */

const TIMEOUT_MS = 10_000;

describe('createBootWatchdog', () => {
  let onTimeout: Mock<() => void>;
  let watchdog: BootWatchdog;

  beforeEach(() => {
    vi.useFakeTimers();
    onTimeout = vi.fn<() => void>();
    watchdog = createBootWatchdog({ timeoutMs: TIMEOUT_MS, onTimeout });
    watchdog.reset();
  });

  afterEach(() => {
    watchdog.dispose();
    vi.useRealTimers();
  });

  it('reports a document that loads the bundle and never says it is ready', () => {
    watchdog.documentRendered('app');

    vi.advanceTimersByTime(TIMEOUT_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('reports such a document once, not once per elapsed interval', () => {
    watchdog.documentRendered('app');

    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('never reports a document that loads no bundle, because it has nothing to load', () => {
    watchdog.documentRendered('static');

    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stops waiting when a bundle-bearing document is replaced by one without a bundle', () => {
    watchdog.documentRendered('app');
    vi.advanceTimersByTime(TIMEOUT_MS / 2);

    watchdog.documentRendered('static');
    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does not report a document that said it was ready inside the deadline', () => {
    watchdog.documentRendered('app');
    vi.advanceTimersByTime(TIMEOUT_MS - 1);

    watchdog.ready();
    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('judges each rendered document on its own, not on the panel history', () => {
    watchdog.documentRendered('app');
    watchdog.ready();

    // A re-render — a scan landed, so the panel gets fresh HTML and the app
    // remounts. This one never comes up.
    watchdog.documentRendered('app');
    vi.advanceTimersByTime(TIMEOUT_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('keeps answering "this panel has mounted" once any document reported ready', () => {
    watchdog.documentRendered('app');
    expect(watchdog.isBooted()).toBe(false);

    watchdog.ready();
    expect(watchdog.isBooted()).toBe(true);

    // The probe the integration suite reads must not flicker back to false
    // just because the panel re-rendered.
    watchdog.documentRendered('app');
    expect(watchdog.isBooted()).toBe(true);
  });

  it('forgets that record when the watchdog is reset for a different panel', () => {
    watchdog.documentRendered('app');
    watchdog.ready();

    watchdog.reset();

    expect(watchdog.isBooted()).toBe(false);
  });

  it('reset alone waits for nothing — only a rendered document starts the clock', () => {
    watchdog.reset();

    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('cancels a pending report when disposed', () => {
    watchdog.documentRendered('app');

    watchdog.dispose();
    vi.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
