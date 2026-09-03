/**
 * A `Project` snapshot with only the indexes a provider under test reads.
 *
 * Built on the real `IndexImpl`, so `byKey` resolves exactly as it does in
 * production — a hand-written `{ byKey: k => map.get(k) }` would agree with the
 * test and with nothing else.
 *
 * Lives under `__fixtures__/` so vitest does not collect it. Nothing in the
 * extension imports it.
 */

import { IndexImpl } from '$infra/index-impl';
import type { Project } from '$infra/types/project';
import type { Url } from '$domain/types/url';
import type { View } from '$domain/types/view';

const emptyIndex = <T extends object>(keyFn: (item: T) => string) => new IndexImpl<T, string>(keyFn);

export function urlEntry(partial: Partial<Url> & { name: string }): Url {
  return {
    kind: 'url',
    pattern: '',
    viewName: 'shop.views.index',
    filePath: '/w/shop/urls.py',
    line: 0,
    ...partial,
  };
}

export function viewEntry(partial: Partial<View> & { name: string }): View {
  return {
    kind: 'view',
    filePath: '/w/shop/views.py',
    line: 1,
    isClass: false,
    templateName: null,
    contextKeys: [],
    contextVars: [],
    decorators: [],
    ...partial,
  };
}

/** A snapshot whose `urls` index holds `urls` and whose other indexes are empty. */
export function projectWithUrls(urls: readonly Url[]): Project {
  return projectWith({ urls });
}

/** A snapshot holding whichever entities a provider under test needs to find. */
export function projectWith({
  urls = [],
  views = [],
}: {
  urls?: readonly Url[];
  views?: readonly View[];
}): Project {
  const index = emptyIndex<Url>(u => u.name);
  for (const u of urls) index.add(u);
  const viewIndex = emptyIndex<View>(v => v.name);
  for (const v of views) viewIndex.add(v);
  return {
    views: viewIndex,
    models: emptyIndex(m => (m as { name: string }).name),
    forms: emptyIndex(f => (f as { name: string }).name),
    migrations: emptyIndex(m => (m as { name: string }).name),
    templates: emptyIndex(t => (t as { relativePath: string }).relativePath),
    urls: index,
    helpers: emptyIndex(h => (h as { name: string }).name),
    workspaceFingerprint: 'test',
    scannedAt: 0,
  } as unknown as Project;
}

/** An `ExtensionContext` whose `workspaceState` answers from a plain map. */
export function contextWithState(state: Record<string, unknown> = {}) {
  return {
    workspaceState: {
      get: (key: string) => state[key],
      update: (key: string, value: unknown) => {
        state[key] = value;
        return Promise.resolve();
      },
      keys: () => Object.keys(state),
    },
    subscriptions: [] as { dispose(): void }[],
  };
}
