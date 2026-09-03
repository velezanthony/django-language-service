/**
 * A hover answers about the reference under the cursor.
 *
 * Both providers located their subject by searching the LINE — `indexOf(path)`
 * from column zero — after a regex had already picked which reference to talk
 * about. Two consequences, and the second is the one users notice:
 *
 *  - with the same path or url name written twice on a line, the range landed
 *    on the FIRST one wherever the pointer was, so the highlight pointed at the
 *    wrong reference;
 *  - `template-paths` used a NON-GLOBAL regex, so only the first
 *    `{% include %}` on a line was ever a candidate at all — the second got no
 *    hover.
 *
 * The rule below is stated over occurrence INDEX, not over a particular line:
 * for every occurrence on a line, the hover must be about that occurrence and
 * its range must cover exactly that occurrence. A test pinned to "the second
 * one" would pass an implementation that hard-coded two.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted above every import below, so the providers load against the double.
vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  Uri,
  fileContents,
  setFindFiles,
  lastRegistered,
  resetRegistered,
  type Position,
  type Range,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { projectWithUrls, urlEntry } from '$adapters/_shared/__fixtures__/project-double';
import { clearTemplateResolveCache } from '$adapters/_shared/template-resolve';

import { register as registerTemplateHover } from './template-paths';
import { register as registerUrlHover } from './url-names';

interface HoverLike {
  readonly contents: { value: string };
  readonly range?: Range;
}

interface HoverProvider {
  provideHover(doc: unknown, pos: Position): HoverLike | undefined | Promise<HoverLike | undefined>;
}

const ctx = {} as never;

function templateHoverProvider(): HoverProvider {
  resetRegistered();
  registerTemplateHover(ctx, { getProject: () => projectWithUrls([]) });
  return lastRegistered<HoverProvider>();
}

function urlHoverProvider(names: readonly string[]): HoverProvider {
  resetRegistered();
  const project = projectWithUrls(
    names.map(name => urlEntry({ name, pattern: `${name}/`, viewName: `views.${name}` })),
  );
  registerUrlHover(ctx, { getProject: () => project });
  return lastRegistered<HoverProvider>();
}

/** Absolute [start, end) of the nth occurrence of `needle` in `source`. */
function occurrence(source: string, needle: string, nth: number): [number, number] {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = source.indexOf(needle, at + 1);
  if (at === -1) throw new Error(`no occurrence ${nth} of ${needle}`);
  return [at, at + needle.length];
}

/** The range a hover reported, as absolute offsets, so it can be compared. */
function rangeOffsets(doc: Doc, range: Range): [number, number] {
  return [doc.offsetAt(range.start), doc.offsetAt(range.end)];
}

beforeEach(() => {
  clearTemplateResolveCache();
  fileContents.clear();
  // Every glob resolves to /w/<bare path>, so a hover's CONTENT says which
  // reference it resolved and its RANGE says which one it was asked about.
  setFindFiles((pattern: unknown) => {
    const bare = String(pattern)
      .replace(/^\*\*\//, '')
      .replace(/^templates\//, '');
    return Promise.resolve([Uri.file(`/w/${bare}`)]);
  });
});

describe('template path hover anchors on the include under the cursor', () => {
  // Distinct paths, so the CONTENT identifies which include answered. The
  // second and third exist to prove the provider sees past the first at all.
  it('resolves the nth include on a line, for every n', async () => {
    const paths = ['a.html', 'b.html', 'c.html'];
    const source = `${paths.map(p => `{% include "${p}" %}`).join('')}\n`;
    for (const p of paths) fileContents.set(`/w/${p}`, `body-of-${p}`);
    const doc = new Doc(source);
    const provider = templateHoverProvider();

    for (const [nth, path] of paths.entries()) {
      const [start, end] = occurrence(source, path, 0);
      const hover = await provider.provideHover(doc, doc.positionAt(start + 1));
      expect(hover, `include #${nth} has no hover`).toBeDefined();
      expect(hover!.contents.value).toContain(`body-of-${path}`);
      expect(rangeOffsets(doc, hover!.range!), `include #${nth} is mis-ranged`).toEqual([
        start,
        end,
      ]);
    }
  });

  // The case the finding names: identical paths, so only the RANGE can say
  // which one the hover is about.
  it('ranges the occurrence under the cursor when a line repeats one path', async () => {
    const source = `{% include "dup.html" %} and {% include "dup.html" %}\n`;
    fileContents.set('/w/dup.html', 'DUP');
    const doc = new Doc(source);
    const provider = templateHoverProvider();

    for (const nth of [0, 1]) {
      const [start, end] = occurrence(source, 'dup.html', nth);
      const hover = await provider.provideHover(doc, doc.positionAt(start + 1));
      expect(hover, `occurrence ${nth} has no hover`).toBeDefined();
      expect(rangeOffsets(doc, hover!.range!), `occurrence ${nth} is mis-ranged`).toEqual([
        start,
        end,
      ]);
    }
  });

  it('says nothing for a cursor outside every path on the line', async () => {
    const source = `{% include "a.html" %} plain text {% include "b.html" %}\n`;
    fileContents.set('/w/a.html', 'AAA');
    fileContents.set('/w/b.html', 'BBB');
    const doc = new Doc(source);
    const provider = templateHoverProvider();
    const hover = await provider.provideHover(doc, doc.positionAt(source.indexOf('plain')));
    expect(hover).toBeUndefined();
  });
});

describe('url name hover anchors on the tag under the cursor', () => {
  it('resolves the nth {% url %} on a line, for every n', async () => {
    const source = `<a href="{% url 'alpha' %}">A</a><a href="{% url 'beta' %}">B</a>\n`;
    const doc = new Doc(source);
    const provider = urlHoverProvider(['alpha', 'beta']);

    for (const [nth, name] of [
      [0, 'alpha'],
      [1, 'beta'],
    ] as const) {
      const [start, end] = occurrence(source, name, 0);
      const hover = await provider.provideHover(doc, doc.positionAt(start + 1));
      expect(hover, `url #${nth} has no hover`).toBeDefined();
      expect(rangeOffsets(doc, hover!.range!)).toEqual([start, end]);
    }
  });

  it('ranges the occurrence under the cursor when a line repeats one url name', async () => {
    const source = `{% url 'same' %} / {% url 'same' %}\n`;
    const doc = new Doc(source);
    const provider = urlHoverProvider(['same']);

    for (const nth of [0, 1]) {
      const [start, end] = occurrence(source, 'same', nth);
      const hover = await provider.provideHover(doc, doc.positionAt(start + 1));
      expect(hover, `occurrence ${nth} has no hover`).toBeDefined();
      expect(rangeOffsets(doc, hover!.range!), `occurrence ${nth} is mis-ranged`).toEqual([
        start,
        end,
      ]);
    }
  });
});
