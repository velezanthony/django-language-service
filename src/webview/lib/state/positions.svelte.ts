export interface Point {
  x: number;
  y: number;
}

// `byKey` is mutated in-place by drag.ts (fast 60fps drag) and boot.ts
// (layout compute, layout save/load). Svelte's deep reactivity propagates
// per-key changes to BoxesLayer / ModelBox without a re-broadcast of the
// whole map.
export const positionsState = $state<{ byKey: Record<string, Point> }>({
  byKey: {},
});

// `w` is the workspace-wide MAX width — still used by the layout engine for
// collision detection (each box reserves a slot of this width). `widths` is
// the per-box content-driven width: each box visually renders at its own
// width inside the reserved slot, so short-named boxes look snug while the
// layout math stays simple. The two are kept in sync by App.svelte at mount.
export const boxDimensions = $state<{
  w: number;
  h: number;
  widths: Record<string, number>;
}>({
  w: 180,
  h: 48,
  widths: {},
});
