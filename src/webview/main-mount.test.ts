// @vitest-environment jsdom
/**
 * Mount-contract test for the diagram webview ENTRY (main.ts).
 *
 * This is the regression test for the "#app" bug: diagram-html.ts emits
 * <div id="app"> and main.ts mounts into document.getElementById('app').
 * When either side renames its half of the contract, nothing type-checks
 * across the boundary — only a test that executes the real entry against a
 * DOM catches it.
 *
 * diagram-boot is mocked for the same reason as in app-mount.test.ts: it is
 * imperative wiring that needs the VS Code webview host.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DiagramDataPayload } from '$lib/composables/diagram-data';

vi.mock('$lib/composables/diagram-boot', () => ({
  installDiagram: vi.fn(),
}));

const diagramData: DiagramDataPayload = {
  tooltipData: [
    {
      key: 'shop.Product',
      name: 'Product',
      appLabel: 'shop',
      dbTable: 'shop_product',
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
      searchModel: 'shop.product product',
      searchFields: 'id',
      searchRelations: '',
    },
  ],
  relations: [],
  modelKeys: ['shop.Product'],
  appLabels: ['shop'],
  mermaidSrc: '',
  dbmlSrc: '',
  plantUmlSrc: '',
  timelineSteps: [],
  snapshots: [],
  migrationComparisons: [],
};

describe('diagram entry (main.ts mount contract)', () => {
  // Importing main.ts pulls the entire webview component graph through the
  // svelte compile pipeline — well over the 5s default when vitest workers
  // share the CPU with the rest of the suite.
  it('mounts App into #app — the element diagram-html.ts emits', { timeout: 30_000 }, async () => {
    window.__DIAGRAM_DATA__ = diagramData;
    const target = document.createElement('div');
    target.id = 'app';
    document.body.appendChild(target);

    await import('./main');

    expect(target.childElementCount).toBeGreaterThan(0);
    expect(target.querySelector('#canvas')).not.toBeNull();
    expect(target.querySelector('[data-model="shop.Product"]')).not.toBeNull();
  });
});
