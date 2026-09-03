import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from './debounce';

describe('createScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after the delay', () => {
    const scheduler = createScheduler(300);
    const fn = vi.fn();
    scheduler.schedule('uri:a', fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('cancels the previous call when scheduled again before delay', () => {
    const scheduler = createScheduler(300);
    const fn = vi.fn();
    scheduler.schedule('uri:a', fn);
    vi.advanceTimersByTime(200);
    scheduler.schedule('uri:a', fn); // resets timer
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('fires independent timers for different URIs', () => {
    const scheduler = createScheduler(300);
    const fnA = vi.fn();
    const fnB = vi.fn();
    scheduler.schedule('uri:a', fnA);
    scheduler.schedule('uri:b', fnB);
    vi.advanceTimersByTime(300);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('dispose() cancels all pending timers', () => {
    const scheduler = createScheduler(300);
    const fn = vi.fn();
    scheduler.schedule('uri:a', fn);
    scheduler.dispose();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('accepts a custom per-call delay override', () => {
    const scheduler = createScheduler(300);
    const fn = vi.fn();
    scheduler.schedule('uri:a', fn, 100);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
