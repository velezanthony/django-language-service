// @vitest-environment jsdom
/**
 * Mount test for the ER-diagram webview app (App.svelte).
 *
 * The diagram shipped with zero mount coverage and a real "#app target"
 * regression got through. This test renders the REAL component tree from a
 * `window.__DIAGRAM_DATA__` fixture — the exact contract panel.ts injects —
 * and asserts the DOM contract that diagram-boot.ts later wires against
 * (#canvas / #canvas-content / #tooltip / .model-box[data-model]).
 *
 * `$lib/composables/diagram-boot` is mocked: it is the imperative
 * drag/viewport/persistence glue (needs acquireVsCodeApi + real layout
 * geometry) and is NOT what a mount test should exercise. We still assert
 * App's onMount actually invoked it — that wiring broke once already.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import type { DiagramDataPayload } from '$lib/composables/diagram-data';
import type { BoxRecord } from '$lib/types/box-data';
import App from './App.svelte';

const installDiagram = vi.fn();
vi.mock('$lib/composables/diagram-boot', () => ({
  installDiagram: (): void => installDiagram(),
}));

function makeBox(key: string, name: string, appLabel: string, fieldCount: number): BoxRecord {
  return {
    key,
    name,
    appLabel,
    dbTable: `${appLabel}_${name.toLowerCase()}`,
    fieldCount,
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
  };
}

const boxes = [
  makeBox('shop.Product', 'Product', 'shop', 8),
  makeBox('blog.Post', 'Post', 'blog', 5),
];

const diagramData: DiagramDataPayload = {
  tooltipData: boxes,
  relations: [{ from: 'blog.Post', to: 'shop.Product', fieldName: 'product', type: 'FK' }],
  modelKeys: boxes.map(b => b.key),
  appLabels: ['shop', 'blog'],
  mermaidSrc: '',
  dbmlSrc: '',
  plantUmlSrc: '',
  timelineSteps: [],
  snapshots: [],
  migrationComparisons: [],
};

beforeEach(() => {
  installDiagram.mockClear();
  window.__DIAGRAM_DATA__ = diagramData;
});

afterEach(() => {
  cleanup();
  delete window.__DIAGRAM_DATA__;
});

describe('diagram App.svelte', () => {
  // First render pays the full component-graph compile — generous timeout
  // so a busy CI worker doesn't flake it.
  it('renders one model box per entry in __DIAGRAM_DATA__', { timeout: 30_000 }, async () => {
    render(App);
    expect(await screen.findByText('Product')).toBeTruthy();
    expect(screen.getByText('Post')).toBeTruthy();

    const modelBoxes = document.querySelectorAll('[data-model]');
    expect(modelBoxes.length).toBe(2);
    // diagram-boot + draw-relations address boxes by these exact ids/attrs.
    expect(document.getElementById('box-shop.Product')).not.toBeNull();
    expect(document.getElementById('box-blog.Post')).not.toBeNull();
    expect(document.querySelector('[data-model="shop.Product"]')?.getAttribute('data-app')).toBe(
      'shop',
    );
  });

  it('renders the DOM anchors diagram-boot wires against', () => {
    render(App);
    for (const id of ['canvas', 'canvas-content', 'tooltip', 'layout-file-input', 'pan-hint']) {
      expect(document.getElementById(id), `#${id} must exist for diagram-boot`).not.toBeNull();
    }
  });

  it('invokes installDiagram from onMount', async () => {
    render(App);
    await vi.waitFor(() => expect(installDiagram).toHaveBeenCalledTimes(1));
  });

  it('renders the relation legend', () => {
    render(App);
    expect(screen.getByText(/ForeignKey/)).toBeTruthy();
    expect(screen.getByText(/ManyToMany/)).toBeTruthy();
    expect(screen.getByText(/OneToOne/)).toBeTruthy();
  });
});
