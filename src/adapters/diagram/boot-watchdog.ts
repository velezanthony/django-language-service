/**
 * Boot watchdog for the diagram panel.
 *
 * A webview panel that comes up blank with no error is a bug, so the adapter
 * waits for the app to post `ready` and complains if it never does. The waiting
 * belongs to the DOCUMENT that was rendered, not to the panel: the panel is a
 * frame, and over its life it holds several documents.
 *
 * Two of those documents load no bundle at all — the scanning hero and the
 * "no Django models found" state are static HTML with no script. There is
 * nothing in them that could ever post `ready`. Arming the watchdog when the
 * panel was adopted, before anything had been rendered into it, meant a
 * workspace with no models sat for ten seconds and was then told the diagram
 * "did not finish loading" — over a screen that had finished perfectly.
 *
 * Hence the rule this module encodes: the clock runs for a rendered document
 * that loads the app bundle, and for nothing else.
 *
 * `isBooted` answers a different question — "has this panel ever mounted the
 * app?" — which is what the integration suite reads through the internal
 * `diagramBooted` command. It stays true across re-renders so the probe does
 * not flicker while a fresh document is coming up.
 */

/**
 * What was just written into the panel.
 *
 * - `app`    — the diagram HTML, which loads `dist/diagram-app.js` and will
 *              post `ready` once `installDiagram()` runs to its last line.
 * - `static` — an empty state: no script, no bundle, nothing to wait for.
 */
export type RenderedDocument = 'app' | 'static';

export interface BootWatchdogOptions {
  /** How long a mount may take before we call it failed. */
  readonly timeoutMs: number;
  /** Called at most once per rendered document that never reports ready. */
  readonly onTimeout: () => void;
}

export interface BootWatchdog {
  /** Call right after `webview.html` is assigned, with what was assigned. */
  documentRendered(kind: RenderedDocument): void;
  /** The current document posted `ready`. */
  ready(): void;
  /** Whether the app has mounted in this panel at least once. */
  isBooted(): boolean;
  /** A new panel took over: forget the boot record and stop waiting. */
  reset(): void;
  /** The panel is gone. */
  dispose(): void;
}

export const createBootWatchdog = (options: BootWatchdogOptions): BootWatchdog => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The app mounted at some point in this panel's life. Drives the probe. */
  let bootedEver = false;
  /** The document currently in the panel has reported ready. Drives the timer. */
  let currentDocumentReady = false;

  const disarm = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  return {
    documentRendered: kind => {
      disarm();
      currentDocumentReady = false;
      // A document with no bundle cannot report ready and is not late for
      // doing so. Rendering one also cancels a wait left over from the
      // document it replaced.
      if (kind === 'static') return;
      timer = setTimeout(() => {
        timer = undefined;
        if (currentDocumentReady) return;
        options.onTimeout();
      }, options.timeoutMs);
    },
    ready: () => {
      currentDocumentReady = true;
      bootedEver = true;
      disarm();
    },
    isBooted: () => bootedEver,
    reset: () => {
      disarm();
      bootedEver = false;
      currentDocumentReady = false;
    },
    dispose: () => {
      disarm();
      bootedEver = false;
      currentDocumentReady = false;
    },
  };
};
