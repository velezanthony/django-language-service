import type { BoxFlags } from '$lib/state/box-flags.svelte';

// Outer ModelBox class composition — pulled out of ModelBox.svelte to keep
// the template thin. Priority order (highest wins) matches the legacy CSS:
//   1. flags.hidden     → display:none
//   2. compare-* status — only in compare mode
//   3. blast-source / blast-affected (delete-impact mode)
//   4. cycles mode dim (non-cycle members)
//   5. timeline mode highlight (added/removed/changed)
//   6. orphan / abstract / proxy (structural classes)
//   7. hub-N (heatmap — FILL only, see below)
//   8. dimmed / highlighted base flags
//
// Channel split: the border is for TRANSIENT state (selection, focus, compare,
// blast, cycles, timeline). The fill is for STATIC properties (hub tier).
//
// Pure function — fully driven by the params dict so it stays trivially
// reactive when wrapped in $derived.

export type BoxVisualParams = {
  flags: BoxFlags;
  isCompareMode: boolean;
  isOrphan: boolean;
  isAbstract: boolean;
  isInCycle: boolean;
  hubTier: number;
  cyclesMode: boolean;
  detailMode: boolean;
  densityMode: 'compact' | 'comfortable';
};

// Two BASE strings — same outer shell, different padding/text size. Compact
// shaves ~25% vertical real estate per box, letting denser diagrams breathe
// without zooming out.
//
// Visual depth comes from three layered effects:
//   - bg-gradient-to-b: subtle 2-stop vertical gradient (top is card-bg, bottom
//     mixes 8% black) — gives every card a "lit from above" feel.
//   - inset 0 1px 0 highlight: a 1px-tall white-at-5% inner shadow on the top
//     edge — the classic "raised surface" cue used by Linear/Notion.
//   - hover:shadow-panel: the existing drop shadow on hover; overrides the
//     inset highlight (acceptable, hover already has plenty of accent).
const BOX_BASE_SHARED =
  'model-box absolute flex flex-col rounded-lg cursor-pointer ' +
  'bg-gradient-to-b from-vsc-card-bg to-[color-mix(in_srgb,var(--color-vsc-card-bg)_92%,#000)] ' +
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ' +
  'select-none transition-[border-color,box-shadow,opacity,transform] duration-fast z-canvas-box ' +
  'border border-vsc-card-border/80 ' +
  'hover:border-vsc-link hover:shadow-card-hover hover:-translate-y-px ' +
  'data-[dragging=true]:opacity-80 data-[dragging=true]:z-canvas-box-dragging';

export const BOX_BASE_COMFORTABLE = `${BOX_BASE_SHARED} px-3 py-2`;
export const BOX_BASE_COMPACT = `${BOX_BASE_SHARED} px-2 py-1`;

export const computeBoxClass = (params: BoxVisualParams): string => {
  if (params.flags.hidden) return 'hidden';

  const parts: string[] = [
    params.densityMode === 'compact' ? BOX_BASE_COMPACT : BOX_BASE_COMFORTABLE,
  ];

  // Detail mode bumps min-width so field rows don't squish.
  if (params.detailMode) parts.push('min-w-[180px]');

  // Every glow needs `!`: the base sets its own `shadow-[inset…]`, and at equal
  // specificity the stylesheet order wins, not the class-list order.
  if (params.isCompareMode) {
    if (params.flags.compareUnchanged) parts.push('opacity-25');
    if (params.flags.compareAdded)
      parts.push('!border-fk !shadow-[0_0_16px_rgba(125,219,115,0.35)]');
    if (params.flags.compareRemoved)
      parts.push('!border-danger !border-dashed opacity-60 line-through');
    if (params.flags.compareChanged)
      parts.push('!border-o2o !shadow-[0_0_16px_rgba(251,191,36,0.35)]');
  }

  // Blast radius (delete-impact mode) — danger glow.
  if (params.flags.blastSource)
    parts.push('!border-danger !shadow-[0_0_24px_rgba(248,113,113,0.4)]');
  if (params.flags.blastAffected)
    parts.push('!border-danger !shadow-[0_0_16px_rgba(248,113,113,0.25)]');

  // Cycles mode: non-cycle members dim, cycle members go danger-red.
  if (params.cyclesMode) {
    if (params.isInCycle) parts.push('!border-danger !shadow-[0_0_16px_rgba(248,113,113,0.35)]');
    else parts.push('opacity-20');
  }

  // Timeline mode — softer than compare: border stays unimportant.
  if (params.flags.tlAdded) parts.push('border-fk !shadow-[0_0_16px_rgba(125,219,115,0.2)]');
  if (params.flags.tlRemoved) parts.push('border-danger opacity-40 line-through');
  if (params.flags.tlChanged) parts.push('border-o2o !shadow-[0_0_16px_rgba(251,191,36,0.15)]');
  // Context ring: present so you can see what the change touches, never
  // competing with it. No glow, dashed muted border, and no raised-surface
  // inset — those three are what make a box read as "a thing that happened".
  if (params.flags.tlContext) {
    parts.push('opacity-45 border-dashed !border-vsc-desc/35 !shadow-none saturate-50');
  }

  // Hub tier (DGM-002) shades the border, but NEVER in the link blue.
  //
  // It used to use that blue at 0.35 / 0.60 / 0.95 against selection's 1.0 — a
  // 5% difference at the top tier. Since tier 1 starts at a quarter of the max
  // incoming count, most of a real schema looked selected and the actual
  // selection had nothing to stand out against.
  //
  // A neutral ramp keeps the heatmap and leaves blue to mean "selected".
  if (params.hubTier === 1) parts.push('border-vsc-desc/40');
  else if (params.hubTier === 2) parts.push('border-vsc-desc/60');
  else if (params.hubTier === 3) parts.push('border-vsc-desc/85');

  // Structural states (orphan / abstract).
  if (params.isOrphan) parts.push('border-dashed opacity-55');
  if (params.isAbstract) parts.push('border-dashed border-m2m');

  // Focus source — the box the user clicked. Stronger than `highlighted` so
  // it visibly stands out from its neighbours: thicker accent border, larger
  // glow, scale bump.
  if (params.flags.focusSource) {
    parts.push(
      '!border-vsc-link !border-2 !shadow-[0_0_32px_color-mix(in_srgb,var(--color-vsc-link)_45%,transparent)] scale-[1.02]',
    );
  }
  // Highlighted neighbours of the focus source (or generic highlight).
  if (params.flags.highlighted)
    parts.push('!border-vsc-link !shadow-[0_0_24px_rgba(79,193,255,0.2)]');
  // Dimmed boxes get blur on top of low opacity — "out of focus" reads way
  // more naturally than a flat opacity drop. Subtle (0.5px) so the silhouette
  // is still legible but text is unreadable, exactly what a background should
  // be.
  if (params.flags.dimmed) parts.push('opacity-15 blur-[0.5px]');

  return parts.join(' ');
};
