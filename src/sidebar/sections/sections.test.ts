// @vitest-environment jsdom
/**
 * Mount tests for the four sidebar section components.
 *
 * These exist because the sidebar webviews shipped with ZERO mount coverage
 * and two real bugs (#app / view-id mismatches) slipped through: nothing
 * failed when the mount target or the payload contract drifted. Each test
 * mounts the REAL component with jsdom and drives it through the same
 * channel production uses — a `window.postMessage`-style MessageEvent with
 * `{ type: 'data', payload }` (see src/sidebar/lib/messages.ts).
 *
 * If a section's payload shape changes (renamed keys, different modes) or
 * the data-message contract changes, these tests fall over — that is their
 * entire job.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

import ViewsSection from './ViewsSection.svelte';
import LayoutsSection from './LayoutsSection.svelte';
import OrphansSection from './OrphansSection.svelte';
import ModelsSection from './ModelsSection.svelte';

// ── vscode api stub ───────────────────────────────────────────────────────────
// lib/vscode.ts lazily caches acquireVsCodeApi() on first postMessage — install
// the stub before any component fires a message and capture everything posted.
const posted: unknown[] = [];
window.acquireVsCodeApi = () => ({
  postMessage: (msg: unknown) => {
    posted.push(msg);
  },
  getState: () => undefined,
  setState: () => {
    /* noop */
  },
});

beforeEach(() => {
  posted.length = 0;
});
afterEach(() => cleanup());

/** Replays what the extension's WebviewViewProvider posts after a scan. */
async function sendData(payload: unknown): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'data', payload } }));
  await tick();
}

// ── ViewsSection ──────────────────────────────────────────────────────────────

const viewsChainPayload = {
  mode: 'chain' as const,
  currentFileName: 'product_list.html',
  currentTemplatePath: 'shop/pages/products/product_list.html',
  chainViews: [
    {
      view: {
        key: 'shop.product_list',
        name: 'product_list',
        type: 'fbv' as const,
        file: '/proj/apps/shop/views.py',
        line: 10,
        templateName: 'shop/pages/products/product_list.html',
      },
      templateChain: ['shop/pages/products/product_list.html'],
    },
    {
      view: {
        key: 'shop.ProductListView',
        name: 'ProductListView',
        type: 'cbv' as const,
        file: '/proj/apps/shop/views.py',
        line: 42,
        templateName: 'shop/pages/products/product_list.html',
      },
      templateChain: ['shop/pages/products/product_list.html'],
    },
  ],
  templateFiles: {
    'shop/pages/products/product_list.html':
      '/proj/templates/shop/pages/products/product_list.html',
  },
  liveViewKey: 'shop.product_list',
};

describe('ViewsSection', () => {
  it('shows the loading skeleton until a data message arrives', () => {
    const { container } = render(ViewsSection);
    // LoadingSkeleton rows are aria-hidden shimmer bars
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[role="tree"]')).toBeNull();
  });

  it('renders one tree item per chain view from the data payload', async () => {
    render(ViewsSection);
    await sendData(viewsChainPayload);
    expect(await screen.findByText('product_list')).toBeTruthy();
    expect(screen.getByText('ProductListView')).toBeTruthy();
    // count chip reflects chainViews.length
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('marks the live indicator ONLY on the view matching liveViewKey', async () => {
    render(ViewsSection);
    await sendData(viewsChainPayload);
    await screen.findByText('product_list');
    const liveOn = screen.getByTitle('Live Mode is ON for product_list — click to disable');
    expect(liveOn.getAttribute('aria-pressed')).toBe('true');
    const liveOff = screen.getByTitle(
      'Enable Live Mode (real-time intellisense + diagnostics) for ProductListView',
    );
    expect(liveOff.getAttribute('aria-pressed')).toBe('false');
  });

  it('posts toggleLiveForView with the QUALIFIED view key when ⚡ is clicked', async () => {
    render(ViewsSection);
    await sendData(viewsChainPayload);
    await screen.findByText('product_list');
    const liveBtn = screen.getByTitle(
      'Enable Live Mode (real-time intellisense + diagnostics) for ProductListView',
    );
    await fireEvent.click(liveBtn);
    expect(posted).toContainEqual({ type: 'toggleLiveForView', viewKey: 'shop.ProductListView' });
  });

  it('shows the "Open a template" empty state for no-template payloads', async () => {
    render(ViewsSection);
    await sendData({ mode: 'no-template', liveViewKey: null });
    expect(await screen.findByText('Open a template')).toBeTruthy();
  });

  it('shows the orphan hint when no view renders the active template', async () => {
    render(ViewsSection);
    await sendData({ ...viewsChainPayload, chainViews: [], liveViewKey: null });
    expect(await screen.findByText('No view renders this template')).toBeTruthy();
  });

  // `mode: 'chain'` with an EMPTY chainViews is how the extension side says
  // "a template is open and nothing renders it" — a different state from
  // 'no-template', and one that arrives with no view data at all. The three
  // tests below pin what the component may assume about such a payload,
  // because the wire TYPE cannot: both states share one interface, so a
  // producer dropping a field the empty branch reads is a change no compiler
  // sees. They are about the shape of the state, not about this example file.

  it('names the open template in the orphan hint rather than showing a blank', async () => {
    render(ViewsSection);
    await sendData({ ...viewsChainPayload, chainViews: [], liveViewKey: null });
    await screen.findByText('No view renders this template');
    expect(screen.getByText(/product_list\.html isn't reachable/)).toBeTruthy();
  });

  it('never renders the literal "undefined" when the empty payload omits fields', async () => {
    render(ViewsSection);
    // Only what the discriminant guarantees: the mode and an empty list.
    await sendData({ mode: 'chain', chainViews: [] });
    await screen.findByText('No view renders this template');
    // A missing currentFileName interpolated into the hint reads as
    // "undefined isn't reachable from any view", which looks like a crash.
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('shows no count chip when the chain is empty, rather than a zero', async () => {
    render(ViewsSection);
    await sendData({ ...viewsChainPayload, chainViews: [], liveViewKey: null });
    await screen.findByText('No view renders this template');
    expect(screen.queryByText('0')).toBeNull();
  });
});

// ── LayoutsSection ────────────────────────────────────────────────────────────

const layoutsPayload = {
  layouts: [
    { templatePath: 'base/base.html', file: '/proj/templates/base/base.html', childCount: 7 },
    // childCount 0 → a page template, must be filtered OUT of the Layouts group
    {
      templatePath: 'shop/pages/one_off.html',
      file: '/proj/templates/shop/pages/one_off.html',
      childCount: 0,
    },
  ],
  partials: [
    {
      templatePath: 'shop/partials/_filters.html',
      file: '/proj/templates/shop/partials/_filters.html',
      includerCount: 1,
    },
  ],
};

describe('LayoutsSection', () => {
  it('renders layouts and partials groups from the payload', async () => {
    render(LayoutsSection);
    await sendData(layoutsPayload);
    expect(await screen.findByText('Layouts')).toBeTruthy();
    // Layouts group starts expanded, so its children are visible right away.
    expect(screen.getByText('base.html')).toBeTruthy();
    // Partials group starts collapsed while layouts exist — expand to see children.
    await fireEvent.click(screen.getByText('Partials'));
    expect(await screen.findByText('_filters.html')).toBeTruthy();
  });

  it('drops layouts nothing extends (childCount 0)', async () => {
    render(LayoutsSection);
    await sendData(layoutsPayload);
    await screen.findByText('base.html');
    expect(screen.queryByText('one_off.html')).toBeNull();
  });

  it('filters the tree by the text input', async () => {
    render(LayoutsSection);
    await sendData(layoutsPayload);
    await screen.findByText('base.html');
    const input = screen.getByLabelText('Filter layouts and partials');
    await fireEvent.input(input, { target: { value: 'filters' } });
    expect(screen.queryByText('base.html')).toBeNull();
    // Only the Partials group survives the filter, and `initiallyExpanded` is
    // `filtered.layouts.length === 0`, so it opens on its own. This used to
    // need a click: TreeView seeded its expanded set once at mount and ignored
    // every later `initiallyExpanded`, so filtering could not open anything.
    expect(await screen.findByText('_filters.html')).toBeTruthy();
  });

  it('posts openFile with the fs path when a template is clicked', async () => {
    render(LayoutsSection);
    await sendData(layoutsPayload);
    await fireEvent.click(await screen.findByText('base.html'));
    expect(posted).toContainEqual({ type: 'openFile', file: '/proj/templates/base/base.html' });
  });

  it('shows the empty state when the scan found nothing', async () => {
    render(LayoutsSection);
    await sendData({ layouts: [], partials: [] });
    expect(await screen.findByText('No layouts or partials found')).toBeTruthy();
  });
});

// ── OrphansSection ────────────────────────────────────────────────────────────

describe('OrphansSection', () => {
  it('lists orphan templates from the payload', async () => {
    render(OrphansSection);
    await sendData({
      orphans: [
        {
          templatePath: 'shop/pages/orphan_page.html',
          file: '/proj/templates/shop/pages/orphan_page.html',
        },
      ],
      totalTemplates: 12,
    });
    expect(await screen.findByText('orphan_page.html')).toBeTruthy();
    expect(screen.getByText('shop/pages')).toBeTruthy(); // dir subtitle split
  });

  it('celebrates zero orphans when templates exist', async () => {
    render(OrphansSection);
    await sendData({ orphans: [], totalTemplates: 12 });
    expect(await screen.findByText('No orphan templates')).toBeTruthy();
    expect(screen.getByText(/All 12 templates are reachable/)).toBeTruthy();
  });

  it('shows the fresh-workspace empty state when there are no templates at all', async () => {
    render(OrphansSection);
    await sendData({ orphans: [], totalTemplates: 0 });
    expect(await screen.findByText('No templates yet')).toBeTruthy();
  });
});

// ── ModelsSection ─────────────────────────────────────────────────────────────

const modelsPayload = {
  totalModels: 3,
  totalApps: 2,
  topApps: [
    { app: 'shop', count: 2 },
    { app: 'blog', count: 1 },
  ],
  apps: [
    {
      app: 'shop',
      count: 2,
      models: [
        { name: 'Product', file: '/proj/apps/shop/models.py', line: 5, fieldCount: 8 },
        { name: 'Category', file: '/proj/apps/shop/models.py', line: 40, fieldCount: 3 },
      ],
    },
    {
      app: 'blog',
      count: 1,
      models: [{ name: 'Post', file: '/proj/apps/blog/models.py', line: 3, fieldCount: 6 }],
    },
  ],
};

describe('ModelsSection', () => {
  it('renders totals and the app tree from the payload', async () => {
    render(ModelsSection);
    await sendData(modelsPayload);
    expect(await screen.findByText('shop')).toBeTruthy();
    expect(screen.getByText('blog')).toBeTruthy();
    expect(screen.getByText('models')).toBeTruthy();
    expect(screen.getByText('apps')).toBeTruthy();
  });

  it('posts openModelDiagram when the CTA button is clicked', async () => {
    render(ModelsSection);
    await sendData(modelsPayload);
    await fireEvent.click(await screen.findByText('Open Model Diagram'));
    expect(posted).toContainEqual({ type: 'openModelDiagram' });
  });

  it('expands an app group and opens models.py at the model line on click', async () => {
    render(ModelsSection);
    await sendData(modelsPayload);
    await fireEvent.click(await screen.findByText('shop')); // expand branch
    await fireEvent.click(await screen.findByText('Product'));
    expect(posted).toContainEqual({ type: 'openFile', file: '/proj/apps/shop/models.py', line: 5 });
  });

  it('shows the empty state when the workspace has no models', async () => {
    render(ModelsSection);
    await sendData({ totalModels: 0, totalApps: 0, topApps: [], apps: [] });
    expect(await screen.findByText('No Django models found')).toBeTruthy();
  });
});
