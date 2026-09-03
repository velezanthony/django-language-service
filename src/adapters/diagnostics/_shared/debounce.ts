/**
 * Per-URI debounce utility for diagnostics adapters.
 *
 * Maintains a map of pending timers keyed by URI string so that rapid
 * document changes only trigger one diagnostic run per editor after the
 * user pauses typing.
 *
 * Usage:
 *   const scheduler = createScheduler(300);
 *   scheduler.schedule(document.uri, () => runDiagnostics(document));
 *   // On dispose:
 *   scheduler.dispose();
 */

export interface DiagnosticScheduler {
  /** Schedule `fn` to run after `ms` ms for the given URI.
   *  Any previous pending call for the same URI is cancelled. */
  schedule(uri: string, fn: () => void, ms?: number): void;

  /** Cancel all pending timers and clear the map. */
  dispose(): void;
}

/**
 * Create a per-URI diagnostic scheduler with the given default delay.
 *
 * @param defaultMs - Default debounce delay in milliseconds (default 300).
 */
export function createScheduler(defaultMs = 300): DiagnosticScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(uri: string, fn: () => void, ms = defaultMs): void {
      const existing = timers.get(uri);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        uri,
        setTimeout(() => {
          timers.delete(uri);
          fn();
        }, ms),
      );
    },

    dispose(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
