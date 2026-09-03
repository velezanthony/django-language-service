// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STYLESHEET_SENTINEL_PROPERTY,
  checkStylesheet,
  verifyStylesheet,
} from '$lib/composables/stylesheet-guard';

/**
 * The rule: the diagram reports it when its stylesheet is not in force.
 *
 * "Not in force" is deliberately the thing being tested, rather than "the file
 * is missing" or "the link errored". A stylesheet that 404s, one blocked by the
 * CSP, one whose build output is stale, and one that never got a `<link>` at
 * all are four different causes with one consequence, and the consequence is
 * what the user sees — an unstyled panel. Probing the effect covers all four;
 * probing any single cause covers one.
 *
 * The mechanism is a sentinel custom property declared by the stylesheet and
 * read back through `getComputedStyle`. The two alternatives do not work in a
 * VS Code webview, and this is not a guess — measured in Chromium 141:
 *
 *   - a `<link>` whose href 404s still has a non-null `.sheet` and still
 *     appears in `document.styleSheets`, so presence proves nothing;
 *   - webview resources are cross-origin to the webview document, so reading
 *     `sheet.cssRules` throws SecurityError for the loaded sheet and the failed
 *     one alike.
 *
 * Computed style is origin-agnostic, which is why it is the one that works.
 */

const applySheet = (css: string): void => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};

describe('checkStylesheet', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('style');
  });

  it('reports the stylesheet in force when its sentinel resolves', () => {
    applySheet(`:root { ${STYLESHEET_SENTINEL_PROPERTY}: 1; }`);

    expect(checkStylesheet(document)).toBe('loaded');
  });

  it('reports it missing when no stylesheet was applied at all', () => {
    expect(checkStylesheet(document)).toBe('missing');
  });

  it('reports it missing when a stylesheet applied but carries no sentinel', () => {
    // A stale dist/tailwind.css built before the sentinel existed, or some
    // other stylesheet winning the link. Rules loaded, but not OUR rules.
    applySheet(':root { color: red; }');

    expect(checkStylesheet(document)).toBe('missing');
  });

  it('does not accept an empty sentinel value as proof', () => {
    applySheet(`:root { ${STYLESHEET_SENTINEL_PROPERTY}: ; }`);

    expect(checkStylesheet(document)).toBe('missing');
  });
});

describe('verifyStylesheet', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('says nothing to the host while the stylesheet is in force', () => {
    applySheet(`:root { ${STYLESHEET_SENTINEL_PROPERTY}: 1; }`);
    const host = { postMessage: vi.fn() };

    expect(verifyStylesheet(host, document)).toBe('loaded');
    expect(host.postMessage).not.toHaveBeenCalled();
  });

  it('tells the host through the error channel when it is not', () => {
    const host = { postMessage: vi.fn() };

    expect(verifyStylesheet(host, document)).toBe('missing');
    expect(host.postMessage).toHaveBeenCalledTimes(1);
    const [sent] = host.postMessage.mock.calls[0] as [{ type: string; message: string }];
    expect(sent.type).toBe('webviewError');
    // The message has to name the artefact, or the log line sends the reader
    // hunting through a bundle for an exception that never happened.
    expect(sent.message).toContain('tailwind.css');
  });

  it('reports once per call rather than once per stylesheet in the document', () => {
    applySheet(':root { color: red; }');
    applySheet(':root { color: blue; }');
    const host = { postMessage: vi.fn() };

    verifyStylesheet(host, document);

    expect(host.postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the document has no view to compute style against', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    const host = { postMessage: vi.fn() };

    // A document with no defaultView cannot be interrogated. The guard must
    // stay quiet rather than either throwing or crying wolf: it has not
    // observed a failure, it has failed to observe.
    expect(() => verifyStylesheet(host, detached)).not.toThrow();
    expect(verifyStylesheet(host, detached)).toBe('unknown');
    expect(host.postMessage).not.toHaveBeenCalled();
  });
});
