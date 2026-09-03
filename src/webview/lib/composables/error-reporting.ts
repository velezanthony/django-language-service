// Error boundary: forward uncaught exceptions + unhandled promise rejections
// to the extension host so they land in the output channel instead of dying
// silently in the webview DevTools.
//
// Install FIRST in boot so even setup-time errors are captured. Returns a
// disposer for symmetry with other composables — webviews never tear down in
// practice (the panel reload re-creates the whole script context).

export interface WebviewHost {
  postMessage: (msg: unknown) => void;
}

export interface ErrorReportingApi {
  destroy: () => void;
}

export const installErrorReporting = (host: WebviewHost): ErrorReportingApi => {
  const onError = (event: ErrorEvent): void => {
    host.postMessage({
      type: 'webviewError',
      message: event.message || 'Unknown error',
      stack: event.error && event.error.stack ? event.error.stack : undefined,
      filename: event.filename,
      line: event.lineno,
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason as { message?: string; stack?: string } | undefined;
    host.postMessage({
      type: 'webviewError',
      message:
        'Unhandled promise rejection: ' +
        (reason && reason.message ? reason.message : String(reason)),
      stack: reason && reason.stack ? reason.stack : undefined,
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return {
    destroy: (): void => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    },
  };
};
