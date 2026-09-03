<script lang="ts" module>
  // Kept in step with the !max-* classes below.
  const POPUP_W = 720;
  const POPUP_H = 460;

  const HEAD =
    'text-meta font-bold text-vsc-link uppercase tracking-[0.5px] px-1 pb-1.5 border-b border-vsc-card-border mb-2';
  // whitespace-pre keeps Python indentation, which is the whole point.
  // text-code follows the editor's own font size; 11px was unreadable.
  const CODE =
    'block whitespace-pre overflow-x-auto text-code leading-[1.5] font-vsc-editor text-vsc-editor-fg px-1';
  const HINT = 'text-meta text-vsc-desc italic px-1 pt-1 mt-1 border-t border-vsc-card-border';

  // VS Code keeps editor syntax colours out of webviews, so these ride on the
  // debug-view token colours, which the theme DOES provide. Close, not exact.
  const TOKEN: Record<TokenKind, string> = {
    plain: '',
    comment: 'text-code-comment italic',
    string: 'text-code-string',
    number: 'text-code-number',
    literal: 'text-code-literal',
    keyword: 'text-code-keyword',
    function: 'text-code-function',
    decorator: 'text-code-decorator',
  };
</script>

<script lang="ts">
  import { Chip, Popup } from '$atoms';
  import type { PropertyDef } from '$lib/types/tooltip-data';
  import { highlightPython, type TokenKind } from '$lib/helpers/python-highlight';

  type Props = {
    property: PropertyDef;
  };

  let { property }: Props = $props();

  let anchor: HTMLElement | null = $state(null);

  const hasSource = $derived(property.source.trim().length > 0);
</script>

<Chip
  kind="inline"
  ariaLabel={hasSource ? `source of ${property.name}` : 'property'}
  onAnchor={el => (anchor = el)}
>
  <span class="text-m2m italic text-xs">@property</span>

  <!-- maxWidth/maxHeight are passed as props too: Popup uses them for its
       flip-and-clamp maths, so leaving them at the defaults while widening the
       CSS would place a 700px panel as if it were 360px. -->
  <Popup
    {anchor}
    maxWidth={POPUP_W}
    maxHeight={POPUP_H}
    class="!max-w-[min(720px,calc(100vw-24px))] !max-h-[min(60vh,460px)]"
  >
    <div class={HEAD}>{property.name}</div>
    {#if hasSource}
      <code class={CODE}
        >{#each highlightPython(property.source) as t, i (i)}<span class={TOKEN[t.kind]}
            >{t.text}</span
          >{/each}</code
      >
    {:else}
      <div class={HINT}>Source not captured for this property.</div>
    {/if}
  </Popup>
</Chip>
