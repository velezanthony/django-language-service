// acquireVsCodeApi() can only be called ONCE per webview lifetime — calling
// it a second time throws. Wrap it in a lazy singleton so any component can
// safely `getVsCode()` and we just hand back the cached instance.

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T>(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let cached: VsCodeApi | null = null;

export function getVsCode(): VsCodeApi | null {
  if (cached) return cached;
  if (typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
    cached = window.acquireVsCodeApi();
  }
  return cached;
}

export function postMessage(msg: unknown): void {
  getVsCode()?.postMessage(msg);
}
