/**
 * Ctrl+Click on the name inside `{% url … %}`.
 *
 * The hover for this exact reference was corrected to locate its subject by
 * CURSOR OFFSET through `firstStringArgAt`. This provider kept the shape the
 * hover was moved off — a regex over one line, then `lineText.indexOf(name)` to
 * find where that name sits. It was left because it emits no Range, so the
 * classic symptom (the second reference on a line highlighting the first) is
 * invisible here.
 *
 * Invisible is not absent. The search starts at the tag's `{%`, so the text it
 * scans past is `{% url ` — and if the name IS a substring of that, the search
 * lands on the KEYWORD. Ctrl+Click then works on the word `url` and fails on
 * the name in quotes: exactly backwards. And reading one line at a time cannot
 * see a tag the author wrapped, which Django's own `tag_re` matches with
 * DOTALL, nor tell a live tag from one inside `{# … #}`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted above every import below, so the provider loads against the double.
vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  lastRegistered,
  resetRegistered,
  Position,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { projectWithUrls, urlEntry } from '$adapters/_shared/__fixtures__/project-double';

import { register } from './url-names';

interface LocationLike {
  readonly uri: { fsPath: string };
  readonly range: { start: { line: number } };
}
interface DefinitionProvider {
  provideDefinition(doc: unknown, pos: Position): LocationLike | undefined;
}

const URLS = [
  urlEntry({ name: 'home', filePath: '/w/urls.py', line: 3 }),
  urlEntry({ name: 'detail', filePath: '/w/blog/urls.py', line: 11 }),
  // A path really named `url`. Uncommon, entirely legal, and the shape that
  // makes the search-from-the-tag bug reachable.
  urlEntry({ name: 'url', filePath: '/w/api/urls.py', line: 7 }),
];

/** The definition the provider returns for the cursor at `offset` in `source`. */
function jump(source: string, offset: number): LocationLike | undefined {
  resetRegistered();
  register({ subscriptions: [] } as never, { getProject: () => projectWithUrls(URLS) } as never);
  const doc = new Doc(source);
  return lastRegistered<DefinitionProvider>().provideDefinition(doc, doc.positionAt(offset));
}

/** Offset of the character after `marker` — i.e. inside what follows it. */
const at = (source: string, marker: string) => source.indexOf(marker) + marker.length;

beforeEach(() => resetRegistered());

describe('go-to-definition on a URL name', () => {
  it('jumps from the ordinary case', () => {
    const src = `<a href="{% url 'detail' %}">x</a>`;
    expect(jump(src, at(src, "'det"))?.uri.fsPath).toBe('/w/blog/urls.py');
  });

  it('lands on the declaration line', () => {
    const src = `{% url 'detail' %}`;
    expect(jump(src, at(src, "'det"))?.range.start.line).toBe(11);
  });

  it('jumps for a path whose name is the tag keyword', () => {
    // `indexOf('url', m.index)` finds the keyword, three characters in, and
    // then decides the cursor — which is out in the quotes — is not on it.
    const src = `{% url 'url' %}`;
    expect(jump(src, at(src, "'ur"))?.uri.fsPath).toBe('/w/api/urls.py');
  });

  it('does not jump from the tag keyword itself', () => {
    // The other half of the same defect: the keyword became the click target.
    const src = `{% url 'url' %}`;
    expect(jump(src, at(src, '{% u'))).toBeUndefined();
  });

  it('jumps from a tag the author wrapped across lines', () => {
    // Django matches `{% … %}` with DOTALL. Reading `lineAt(position.line)`
    // cannot: the line under the cursor has no `{%` on it.
    const src = `{% url\n   'detail'\n%}`;
    expect(jump(src, at(src, "'det"))?.uri.fsPath).toBe('/w/blog/urls.py');
  });

  it('picks the second reference on a line, not the first', () => {
    const src = `{% url 'home' %} {% url 'detail' %}`;
    expect(jump(src, at(src, "'det"))?.uri.fsPath).toBe('/w/blog/urls.py');
  });

  it('does not jump from inside a comment', () => {
    // Django never evaluates it, so there is nothing to go to.
    const src = `{# {% url 'home' %} #}`;
    expect(jump(src, at(src, "'ho"))).toBeUndefined();
  });

  it('returns nothing for a name the project does not have', () => {
    const src = `{% url 'nope' %}`;
    expect(jump(src, at(src, "'no"))).toBeUndefined();
  });

  it('returns nothing when the cursor is outside any tag', () => {
    const src = `<p>home</p>{% url 'home' %}`;
    expect(jump(src, at(src, '<p>h'))).toBeUndefined();
  });
});
