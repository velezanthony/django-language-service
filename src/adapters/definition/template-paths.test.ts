/**
 * Ctrl+Click on a template path — the one of the three that went its own way.
 *
 * The same reference is read by three providers with the same file name:
 *
 *   hover/template-paths.ts        → firstStringArgAt  (tag-aware, live-only)
 *   document-link/template-paths.ts → liveTokens       (tag-aware, live-only)
 *   definition/template-paths.ts    → a hand-rolled scan of ONE line
 *
 * The third never asks what tag it is in. It walks backwards from the cursor to
 * the first quote, forwards to its partner, and calls whatever is between them
 * a template as long as it holds a `/` or a `.`. So it answers for an `href`,
 * for an `<img src>`, for a `{% static %}` path, for a `with` keyword value —
 * and inside `{# … #}`, which Django never runs.
 *
 * `tag-string-arg.ts` already states the rule the other two follow: FIRST
 * string argument of the tag, "`"b"` is a keyword value, and resolving it as a
 * path would be an invented reference". This provider invents them.
 *
 * Most invented references resolve to nothing, so the symptom is usually a
 * click that does nothing rather than a wrong jump. That is what kept it quiet;
 * it is not what makes it right.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  Uri,
  setFindFiles,
  lastRegistered,
  resetRegistered,
  Position,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { clearTemplateResolveCache } from '$adapters/_shared/template-resolve';
import { register } from './template-paths';

interface LocationLike {
  readonly uri: { fsPath: string };
}
interface DefinitionProvider {
  provideDefinition(doc: unknown, pos: Position): Promise<LocationLike | undefined>;
}

/**
 * `findFiles` answers for anything, so every candidate this provider decides to
 * look up appears to resolve. That is deliberate: the question here is WHICH
 * strings it decides are template references, not whether the resolver works.
 */
const RESOLVES_ANYTHING = () => Promise.resolve([Uri.file('/w/templates/whatever.html')]);

const at = (src: string, marker: string) => src.indexOf(marker) + marker.length;

async function jump(
  source: string,
  offset: number,
  languageId = 'django-html',
): Promise<LocationLike | undefined> {
  resetRegistered();
  register({ subscriptions: [] } as never, {} as never);
  const doc = new Doc(source, languageId);
  return lastRegistered<DefinitionProvider>().provideDefinition(doc, doc.positionAt(offset));
}

beforeEach(() => {
  resetRegistered();
  clearTemplateResolveCache();
  setFindFiles(RESOLVES_ANYTHING);
});

describe('what it must answer for', () => {
  it('jumps from an include path', async () => {
    const src = `{% include "shop/card.html" %}`;
    expect(await jump(src, at(src, 'shop/ca'))).toBeDefined();
  });

  it('jumps from an extends path', async () => {
    const src = `{% extends "base/layout.html" %}`;
    expect(await jump(src, at(src, 'base/la'))).toBeDefined();
  });
});

describe('what it must not answer for', () => {
  it('does not jump from a commented-out include', async () => {
    const src = `{# {% include "shop/card.html" %} #}`;
    expect(await jump(src, at(src, 'shop/ca'))).toBeUndefined();
  });

  it('does not jump from a static path', async () => {
    // `{% static %}` names a file under STATICFILES, not a template. The
    // document-link provider is the one that links these, and to the right place.
    const src = `{% static "css/app.css" %}`;
    expect(await jump(src, at(src, 'css/a'))).toBeUndefined();
  });

  it('does not jump from an ordinary href', async () => {
    const src = `<a href="/about/us.html">x</a>`;
    expect(await jump(src, at(src, '/about'))).toBeUndefined();
  });

  it('does not jump from an img src', async () => {
    const src = `<img src="img/logo.png">`;
    expect(await jump(src, at(src, 'img/lo'))).toBeUndefined();
  });

  it('does not jump from a with-argument value', async () => {
    // The rule `tag-string-arg.ts` states and the other two providers keep:
    // first string argument only. A keyword value is not the reference.
    const src = `{% include "card.html" with icon="img/star.svg" %}`;
    expect(await jump(src, at(src, 'img/st'))).toBeUndefined();
  });

  it('does not jump from outside any tag', async () => {
    const src = `<p>shop/card.html</p>{% include "shop/card.html" %}`;
    expect(await jump(src, at(src, '<p>shop/c'))).toBeUndefined();
  });
});

/**
 * The provider is registered for Python too — `render(request, "path")` and
 * `template_name = "path"`, per its own header. The loose quote scan is what
 * made that half work, and also what made it answer for any quoted string with
 * a slash in it: a data file, a URL, a log format.
 */
describe('the Python half', () => {
  const py = (src: string, marker: string) => jump(src, at(src, marker), 'python');

  it('jumps from the template argument of render()', async () => {
    expect(await py(`return render(request, "shop/detail.html", ctx)`, 'shop/de')).toBeDefined();
  });

  it('jumps from a template_name attribute', async () => {
    expect(await py(`    template_name = "shop/list.html"`, 'shop/li')).toBeDefined();
  });

  it('does not jump from an unrelated path in the same file', async () => {
    expect(await py(`data = open("fixtures/seed.csv")`, 'fixtures/s')).toBeUndefined();
  });

  it('does not jump from the request argument of render()', async () => {
    expect(await py(`return render(request, "shop/detail.html")`, 'render(re')).toBeUndefined();
  });
});
