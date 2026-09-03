// @vitest-environment jsdom
/**
 * Model and field names come from the user's source, so they can hold anything:
 * markup, a `</script>`, an emoji, five hundred characters. The panel renders
 * them inside a webview, which is a browser — text that arrives as ELEMENTS
 * would be running the user's models.py as HTML.
 *
 * Svelte escapes text interpolation, so this is a contract to keep rather than
 * a bug that was found. It is asserted here because the day a component reaches
 * for {@html} the escape is gone and nothing else would notice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { DiagramDataPayload } from '$lib/composables/diagram-data';
import type { BoxRecord } from '$lib/types/box-data';
import App from './App.svelte';

vi.mock('$lib/composables/diagram-boot', () => ({ installDiagram: (): void => undefined }));

const box = (
  key: string,
  name: string,
  appLabel: string,
  extra: Partial<BoxRecord> = {},
): BoxRecord => ({
  key,
  name,
  appLabel,
  dbTable: `${appLabel}_${name.toLowerCase()}`,
  fieldCount: 1,
  fields: [{ name: 'id', type: 'AutoField', attrs: ['primary_key'], doc: '' }],
  relations: [],
  referencedBy: [],
  properties: [],
  hubTier: 0,
  isOrphan: false,
  isAbstract: false,
  isProxy: false,
  isInCycle: false,
  genericFkCount: 0,
  searchModel: `${key.toLowerCase()} ${name.toLowerCase()}`,
  searchFields: 'id',
  searchRelations: '',
  ...extra,
});

const payload = (
  boxes: BoxRecord[],
  relations: DiagramDataPayload['relations'] = [],
): DiagramDataPayload => ({
  tooltipData: boxes,
  relations,
  modelKeys: boxes.map(b => b.key),
  appLabels: [...new Set(boxes.map(b => b.appLabel))].filter((a): a is string => a !== undefined),
  mermaidSrc: '',
  dbmlSrc: '',
  plantUmlSrc: '',
  timelineSteps: [],
  snapshots: [],
  migrationComparisons: [],
});

const mount = (data: DiagramDataPayload): void => {
  window.__DIAGRAM_DATA__ = data;
  render(App);
};

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
  delete window.__DIAGRAM_DATA__;
});

describe('a name that is really markup', () => {
  it('arrives as text, not as an element', () => {
    mount(payload([box('shop.X', '<img src=x onerror=alert(1)>', 'shop')]));
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('does not let a </script> out of its box', () => {
    mount(payload([box('shop.Y', '</script><b>hi</b>', 'shop')]));
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('[data-model] b')).toBeNull();
  });

  it('escapes markup in a field name, type and doc too', () => {
    mount(
      payload([
        box('shop.F', 'F', 'shop', {
          fields: [
            { name: '<b>id</b>', type: '<i>Auto</i>', attrs: ['<u>pk</u>'], doc: '</script>' },
          ],
        }),
      ]),
    );
    expect(document.querySelector('b, i, u')).toBeNull();
  });
});

describe('data the scanner can legitimately produce', () => {
  it.each([
    ['no models at all', payload([])],
    ['one model', payload([box('shop.A', 'A', 'shop')])],
    ['an emoji in the name', payload([box('shop.Z', '🎉 Pedido', 'shop')])],
    ['a five-hundred-character name', payload([box('shop.L', 'M'.repeat(500), 'shop')])],
    [
      'a relation whose target is gone',
      payload(
        [box('shop.A', 'A', 'shop')],
        [{ from: 'shop.A', to: 'shop.GONE', fieldName: 'f', type: 'FK' }],
      ),
    ],
    [
      'a self relation',
      payload(
        [box('shop.A', 'A', 'shop')],
        [{ from: 'shop.A', to: 'shop.A', fieldName: 'parent', type: 'FK' }],
      ),
    ],
  ])('renders with %s', (_label, data) => {
    expect(() => mount(data)).not.toThrow();
  });

  it('renders a project-sized model set', () => {
    mount(
      payload(
        Array.from({ length: 200 }, (_, i) => box(`app${i % 8}.M${i}`, `M${i}`, `app${i % 8}`)),
      ),
    );
    expect(document.querySelectorAll('[data-model]')).toHaveLength(200);
  });
});
