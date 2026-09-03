<script lang="ts">
  import { Pill } from '$atoms';
  import type { ModelFieldDiff } from '$lib/helpers/compare';

  type Glyph = { ch: string; cls: string } | null;

  type Props = {
    appLabel: string;
    name: string;
    fieldCount: number;
    isOrphan: boolean;
    isProxy: boolean;
    /** One relation hop from a model the selected migration changed. */
    isContext: boolean;
    glyph: Glyph;
    compareDiff?: ModelFieldDiff;
    /** Pre-computed tooltip body for the diff chip group. */
    chipTitle: string;
  };

  let {
    appLabel,
    name,
    fieldCount,
    isOrphan,
    isProxy,
    isContext,
    glyph,
    compareDiff,
    chipTitle,
  }: Props = $props();

  // Context boxes take over the field-count slot instead of adding a second
  // pill: the width budget already reserves that space, and on a box you are
  // told did not change, "how many fields" is not the fact worth the pixels.
  const CONTEXT_TITLE =
    'Not changed by this migration \u2014 shown because it links to a model that was.';

  // Single-line header: `app.` muted prefix + bold name. Keeps box height
  // identical to the legacy layout so the canvas collision-detection math
  // (which doesn't re-measure post-mount) stays accurate.
  const nameClass = $derived.by(() => {
    const parts = ['text-[13px] font-bold tracking-[-0.1px]'];
    if (isOrphan) parts.push('!text-vsc-desc');
    if (isProxy) parts.push('italic opacity-85');
    else parts.push('text-vsc-editor-fg');
    return parts.join(' ');
  });
</script>

<div class="flex items-center gap-2">
  <span class="text-label text-vsc-desc whitespace-nowrap min-w-0 truncate">
    {#if appLabel}<span
        class="opacity-65"
        title={`Django app: ${appLabel} — the left-edge colour stripe groups boxes by app.`}
        >{appLabel}.</span
      >{/if}
    {#if glyph}<span class={glyph.cls}>{glyph.ch}{' '}</span>{/if}
    {#if isProxy}<span class="opacity-60">⎙{' '}</span>{/if}
    <strong class={nameClass}>{name}</strong>
  </span>

  <span class="shrink-0 ml-auto">
    {#if isContext}
      <Pill kind="neutral" size="xs" title={CONTEXT_TITLE}>affected</Pill>
    {:else}
      <Pill kind="neutral" size="xs" tabular>{fieldCount}</Pill>
    {/if}
  </span>

  {#if compareDiff}
    <span
      class="inline-flex gap-1 shrink-0 whitespace-nowrap cursor-help font-mono"
      title={chipTitle}
    >
      {#if compareDiff.added.length}<Pill kind="fk" size="xs" tabular
          >+{compareDiff.added.length}</Pill
        >{/if}
      {#if compareDiff.altered.length}<Pill kind="o2o" size="xs" tabular
          >~{compareDiff.altered.length}</Pill
        >{/if}
      {#if compareDiff.removed.length}<Pill kind="danger" size="xs" tabular
          >−{compareDiff.removed.length}</Pill
        >{/if}
    </span>
  {/if}
</div>
