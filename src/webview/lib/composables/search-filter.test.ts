// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { installSearchFilter, type SearchFilterContext } from '$lib/composables/search-filter';
import type { BoxRecord } from '$lib/types/box-data';

/**
 * `hideApp` is reached from the box context menu with a label that came out of
 * the workspace — an app label is a directory name, and a directory name may
 * contain anything the filesystem allows. These tests state the rule the
 * feature has to hold for EVERY such label, not for the well-behaved ones.
 */

const record = (key: string, appLabel: string): BoxRecord =>
  ({
    key,
    appLabel,
    name: key.slice(key.indexOf('.') + 1),
    dbTable: '',
    fieldCount: 0,
    fields: [],
    relations: [],
    referencedBy: [],
    properties: [],
    hubTier: 0,
    isOrphan: false,
    isAbstract: false,
    isProxy: false,
    isInCycle: false,
    genericFkCount: 0,
    searchModel: key.toLowerCase(),
    searchFields: '',
    searchRelations: '',
  }) satisfies BoxRecord;

/** Build the same world twice: as `dataMap` records AND as rendered boxes, so
 *  an implementation reading either source is judged on the same facts. */
const world = (
  entries: ReadonlyArray<readonly [key: string, appLabel: string]>,
): SearchFilterContext => {
  document.body.innerHTML = '';
  const dataMap: Record<string, BoxRecord> = {};
  for (const [key, appLabel] of entries) {
    dataMap[key] = record(key, appLabel);
    const el = document.createElement('div');
    el.className = 'model-box';
    el.setAttribute('data-model', key);
    el.setAttribute('data-app', appLabel);
    document.body.appendChild(el);
  }
  return {
    modelKeys: entries.map(([key]) => key),
    dataMap,
    onApply: () => undefined,
    onRedrawAppZones: () => undefined,
    onFrameVisible: () => undefined,
  };
};

/**
 * Labels a real workspace can produce. Every one of these is a legal POSIX
 * directory name; several are not legal inside an unescaped CSS attribute
 * selector, and that difference is the whole point.
 */
const HOSTILE_LABELS: ReadonlyArray<readonly [name: string, label: string]> = [
  ['a plain label', 'shop'],
  ['a double quote', 'say "hi"'],
  ['a single quote', "it's_a_shop"],
  ['a backslash', 'a\\b'],
  ['a closing bracket', 'a]b'],
  ['a space', 'my app'],
  ['a dot', 'a.b'],
  ['a leading digit', '7up'],
  ['a leading hyphen', '-dash'],
  ['a newline', 'two\nlines'],
];

describe('installSearchFilter().hideApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it.each(HOSTILE_LABELS)(
    'hides every model of an app whose label contains %s, and nothing else',
    (_name, label) => {
      const other = label === 'shop' ? 'blog' : 'shop';
      const api = installSearchFilter(
        world([
          [`${label}.Alpha`, label],
          [`${label}.Beta`, label],
          [`${other}.Gamma`, other],
        ]),
      );

      api.hideApp(label);

      expect([...api.getHiddenKeys()].sort()).toEqual([`${label}.Alpha`, `${label}.Beta`]);
    },
  );

  it('hides nothing when no model carries the label', () => {
    const api = installSearchFilter(world([['shop.Alpha', 'shop']]));

    api.hideApp('blog');

    expect([...api.getHiddenKeys()]).toEqual([]);
  });

  it('matches the label exactly rather than by prefix or substring', () => {
    const api = installSearchFilter(
      world([
        ['shop.Alpha', 'shop'],
        ['shopping.Beta', 'shopping'],
        ['my_shop.Gamma', 'my_shop'],
      ]),
    );

    api.hideApp('shop');

    expect([...api.getHiddenKeys()]).toEqual(['shop.Alpha']);
  });

  it('does not depend on the boxes being present in the DOM', () => {
    const ctx = world([
      ['shop.Alpha', 'shop'],
      ['blog.Beta', 'blog'],
    ]);
    document.body.innerHTML = '';
    const api = installSearchFilter(ctx);

    api.hideApp('shop');

    expect([...api.getHiddenKeys()]).toEqual(['shop.Alpha']);
  });
});
