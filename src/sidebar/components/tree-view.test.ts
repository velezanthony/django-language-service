// @vitest-environment jsdom
/**
 * Mount tests for TreeView's expansion state.
 *
 * `expanded` was seeded once with `$state(seed(nodes))`, which only ever read
 * the INITIAL `nodes`. svelte-check flagged it as `state_referenced_locally`
 * and it was a real bug: sections recompute `initiallyExpanded` from live data
 * — ModelsSection sets it from whether a search query is present, LayoutsSection
 * from whether the filtered list is empty — so a search that should have opened
 * its matching groups left them shut.
 *
 * The fix has to honour fresh `initiallyExpanded` markers WITHOUT throwing away
 * what the user has expanded or collapsed by hand, since the sidebar receives a
 * new payload on every project rescan. Both halves are pinned here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

import TreeView from './TreeView.svelte';
import type { TreeNodeData } from '../lib/tree';

afterEach(cleanup);

function group(id: string, label: string, expandedByData: boolean): TreeNodeData {
  return {
    id,
    label,
    initiallyExpanded: expandedByData,
    children: [{ id: `${id}-child`, label: `${label} child` }],
  };
}

const childVisible = (label: string): boolean => screen.queryByText(label) !== null;

describe('TreeView expansion', () => {
  it('honours initiallyExpanded on first render', () => {
    render(TreeView, { props: { nodes: [group('a', 'Alpha', true)] } });
    expect(childVisible('Alpha child')).toBe(true);
  });

  it('starts collapsed when the data says so', () => {
    render(TreeView, { props: { nodes: [group('a', 'Alpha', false)] } });
    expect(childVisible('Alpha child')).toBe(false);
  });

  // The regression: a re-render with a freshly-marked node must open it.
  it('opens a node that a NEW payload marks initiallyExpanded', async () => {
    const { rerender } = render(TreeView, {
      props: { nodes: [group('a', 'Alpha', false)] },
    });
    expect(childVisible('Alpha child')).toBe(false);

    await rerender({ nodes: [group('a', 'Alpha', true)] });
    await tick();

    expect(childVisible('Alpha child')).toBe(true);
  });

  it('keeps a node the user collapsed by hand when new data arrives', async () => {
    const { rerender } = render(TreeView, {
      props: { nodes: [group('a', 'Alpha', true)] },
    });
    expect(childVisible('Alpha child')).toBe(true);

    await fireEvent.click(screen.getByText('Alpha'));
    await tick();
    expect(childVisible('Alpha child')).toBe(false);

    // A rescan re-sends the same tree, still marked initiallyExpanded.
    await rerender({ nodes: [group('a', 'Alpha', true)] });
    await tick();

    expect(childVisible('Alpha child')).toBe(false);
  });

  it('keeps a node the user expanded by hand when new data arrives', async () => {
    const { rerender } = render(TreeView, {
      props: { nodes: [group('a', 'Alpha', false)] },
    });

    await fireEvent.click(screen.getByText('Alpha'));
    await tick();
    expect(childVisible('Alpha child')).toBe(true);

    await rerender({ nodes: [group('a', 'Alpha', false)] });
    await tick();

    expect(childVisible('Alpha child')).toBe(true);
  });
});
