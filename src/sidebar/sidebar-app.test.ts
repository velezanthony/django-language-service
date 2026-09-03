// @vitest-environment jsdom
/**
 * Mount-contract tests for the sidebar bundle.
 *
 * The same bundle is loaded into all four WebviewView instances; the
 * extension host writes `data-section` on <body> and the entry mounts into
 * `#sidebar-root` (see sidebar-app.ts). Both halves of that contract have
 * bitten before (the diagram's #app / view-id class of bug), so:
 *
 *  1. SidebarApp routing: body[data-section] → the right section component.
 *  2. Entry side effects: mounts into #sidebar-root and posts the `ready`
 *     handshake the provider waits for before flushing pendingPayload.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SidebarApp from './SidebarApp.svelte';

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

afterEach(() => {
  cleanup();
  document.body.removeAttribute('data-section');
});

// Each section renders inside <section aria-label={title}> (SidebarSection).
// Match by reading the attribute — jsdom's selector engine chokes on '&'
// inside attribute selectors ("Layouts & Partials").
const sectionByLabel = (label: string): Element | null =>
  Array.from(document.querySelectorAll('section')).find(
    el => el.getAttribute('aria-label') === label,
  ) ?? null;

describe('SidebarApp section routing (body[data-section])', () => {
  it('renders ViewsSection for data-section="views"', () => {
    document.body.setAttribute('data-section', 'views');
    render(SidebarApp);
    expect(sectionByLabel('Views')).not.toBeNull();
  });

  it('renders LayoutsSection for data-section="layouts"', () => {
    document.body.setAttribute('data-section', 'layouts');
    render(SidebarApp);
    expect(sectionByLabel('Layouts & Partials')).not.toBeNull();
  });

  it('renders OrphansSection for data-section="orphans"', () => {
    document.body.setAttribute('data-section', 'orphans');
    render(SidebarApp);
    expect(sectionByLabel('Orphans')).not.toBeNull();
  });

  it('renders ModelsSection for data-section="models"', () => {
    document.body.setAttribute('data-section', 'models');
    render(SidebarApp);
    expect(sectionByLabel('Models')).not.toBeNull();
  });

  it('surfaces a visible error when the section attribute is missing', () => {
    render(SidebarApp);
    expect(screen.getByText(/Sidebar section attribute missing/)).toBeTruthy();
  });
});

describe('sidebar-app entry (mount contract)', () => {
  it('mounts into #sidebar-root and posts the ready handshake', async () => {
    document.body.setAttribute('data-section', 'views');
    const root = document.createElement('div');
    root.id = 'sidebar-root';
    document.body.appendChild(root);

    await import('./sidebar-app');

    // Svelte mounted something real inside the target...
    expect(root.childElementCount).toBeGreaterThan(0);
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBe('Views');
    // ...and signalled the provider to flush its cached payload.
    expect(posted).toContainEqual({ type: 'ready' });
  });
});
