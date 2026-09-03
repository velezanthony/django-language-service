/**
 * Does the diagram's stylesheet actually apply?
 *
 * Not "did it load". A `<link>` whose fetch 404s still has a non-null `.sheet`,
 * and `cssRules` throws SecurityError cross-origin for the sheet that worked
 * and the one that did not alike. So the stylesheet declares a custom property
 * and this reads it back through `getComputedStyle`, which is origin-agnostic.
 *
 * Timing is safe: a classic script does not run while a stylesheet created
 * before it is pending, so a slow load cannot read as a failed one.
 */

import type { WebviewHost } from '$lib/composables/error-reporting';

/**
 * Declared by `src/webview/styles/tailwind.css`, and it survives minification —
 * verified against Tailwind's minified output, not assumed.
 * `$adapters/diagram/stylesheet-contract.test.ts` fails if it is dropped.
 */
export const STYLESHEET_SENTINEL_PROPERTY = '--dls-stylesheet';

export type StylesheetVerdict =
  /** The stylesheet's rules are in force. */
  | 'loaded'
  /** They are not — missing file, blocked request, or a stale build. */
  | 'missing'
  /** The document could not be interrogated, so nothing was observed. */
  | 'unknown';

export const STYLESHEET_FAILURE_MESSAGE =
  'The diagram stylesheet is not in force — dist/tailwind.css is missing, unreadable or stale, ' +
  'so the panel is rendering unstyled. Rebuild it with `npm run build:css`.';

/** Read the sentinel back out of the cascade. */
export const checkStylesheet = (doc: Document): StylesheetVerdict => {
  const view = doc.defaultView;
  if (!view) return 'unknown';
  const value = view
    .getComputedStyle(doc.documentElement)
    .getPropertyValue(STYLESHEET_SENTINEL_PROPERTY);
  return value.trim() ? 'loaded' : 'missing';
};

/** Check, and report a bad answer through the existing `webviewError`. */
export const verifyStylesheet = (host: WebviewHost, doc: Document): StylesheetVerdict => {
  const verdict = checkStylesheet(doc);
  if (verdict === 'missing') {
    host.postMessage({ type: 'webviewError', message: STYLESHEET_FAILURE_MESSAGE });
  }
  return verdict;
};
