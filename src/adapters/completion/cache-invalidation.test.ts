/**
 * Three completion providers cache for 30 seconds. One of them listens.
 *
 * `dtl-block-name.ts` keeps a TTL and ALSO clears on the next scan, and says
 * why in its own comment: "`clear()` on the next scan is the sharper signal".
 * `template-resolve.ts` has the same pairing, and a test of its own about the
 * ordering. The two file-listing completions have the TTL and nothing else.
 *
 * So: create `shop/templates/shop/card.html`, go back to the template you were
 * editing, type `{% include "` — and it is not offered. Not because anything
 * failed, but because a list built before the file existed is still inside its
 * window. Up to thirty seconds of a provider quietly disagreeing with the disk,
 * right after the one action that makes a user look for the new name.
 *
 * The scanner already fires for exactly this: a file appeared.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  Uri,
  setFindFiles,
  lastRegistered,
  resetRegistered,
  type Position,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { register as registerTemplatePaths } from './template-paths';
import { register as registerStaticFiles } from './static-files';

interface Item {
  readonly label: string;
}
/** A provider may answer with a bare array or with a `CompletionList`. */
type Answer = Item[] | { items: Item[] } | undefined;
interface CompletionProvider {
  provideCompletionItems(doc: unknown, pos: Position): Promise<Answer> | Answer;
}
const itemsOf = (a: Answer): Item[] => (Array.isArray(a) ? a : (a?.items ?? []));

/** Captures the scan callback so a test can fire it, as the scanner would. */
function servicesSpy() {
  const listeners: Array<() => void> = [];
  return {
    services: {
      getProject: () => ({ templates: { all: () => [] } }),
      onProjectChange: (cb: () => void) => {
        listeners.push(cb);
        return { dispose: () => undefined };
      },
    } as never,
    scan: () => {
      for (const l of [...listeners]) l();
    },
  };
}

const filesAnswering = (paths: readonly string[]) => () =>
  Promise.resolve(paths.map(p => Uri.file(p)));

async function labelsFrom(source: string, column: number): Promise<string[]> {
  const doc = new Doc(source, 'django-html');
  const provider = lastRegistered<CompletionProvider>();
  return itemsOf(await provider.provideCompletionItems(doc, doc.positionAt(column))).map(
    i => i.label,
  );
}

beforeEach(() => resetRegistered());

describe('the include/extends path completion', () => {
  const LINE = '{% include "';

  it('offers what is on disk', async () => {
    const { services } = servicesSpy();
    setFindFiles(filesAnswering(['/w/shop/templates/shop/old.html']));
    registerTemplatePaths({ subscriptions: [] } as never, services);

    expect(await labelsFrom(LINE, LINE.length)).toContain('shop/old.html');
  });

  it('offers a template created since the last completion', async () => {
    const { services, scan } = servicesSpy();
    setFindFiles(filesAnswering(['/w/shop/templates/shop/old.html']));
    registerTemplatePaths({ subscriptions: [] } as never, services);

    await labelsFrom(LINE, LINE.length); // fills the cache

    setFindFiles(
      filesAnswering(['/w/shop/templates/shop/old.html', '/w/shop/templates/shop/card.html']),
    );
    scan(); // the scanner saw the new file

    expect(await labelsFrom(LINE, LINE.length)).toContain('shop/card.html');
  });
});

describe('the {% static %} path completion', () => {
  const LINE = "{% static '";

  it('offers what is on disk', async () => {
    const { services } = servicesSpy();
    setFindFiles(filesAnswering(['/w/shop/static/css/old.css']));
    registerStaticFiles({ subscriptions: [] } as never, services);

    expect((await labelsFrom(LINE, LINE.length)).join(' ')).toContain('old.css');
  });

  it('offers a static file created since the last completion', async () => {
    const { services, scan } = servicesSpy();
    setFindFiles(filesAnswering(['/w/shop/static/css/old.css']));
    registerStaticFiles({ subscriptions: [] } as never, services);

    await labelsFrom(LINE, LINE.length);

    setFindFiles(filesAnswering(['/w/shop/static/css/old.css', '/w/shop/static/css/new.css']));
    scan();

    expect((await labelsFrom(LINE, LINE.length)).join(' ')).toContain('new.css');
  });
});
