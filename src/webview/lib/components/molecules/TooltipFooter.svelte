<script lang="ts">
  import { Button } from '$atoms';
  import { IconClose, IconEditNote } from '$icons';

  type Props = {
    pinned: boolean;
    hint?: string;
  };

  let { pinned, hint = 'Click to pin · hover to preview' }: Props = $props();
</script>

<!--
  data-action attributes are read by the tooltip controller's click delegate
  via closest('[data-action]'), so they can sit on a span inside the Button
  slot — the click target may be the icon or the button itself.
-->
{#if pinned}
  <div class="flex gap-1.5 px-3 py-2 border-t border-vsc-card-border bg-black/[0.15] shrink-0">
    <Button variant="primary" size="sm" extraClass="flex-1">
      <span data-action="goto" class="inline-flex items-center gap-1.5 w-full justify-center">
        <IconEditNote size={14} /> Go to source
      </span>
    </Button>
    <Button variant="secondary" size="sm" extraClass="flex-1">
      <span data-action="close" class="inline-flex items-center gap-1.5 w-full justify-center">
        <IconClose size={14} /> Close
      </span>
    </Button>
  </div>
{:else}
  <div
    class="pt-1.5 px-3.5 pb-2 text-[11px] text-vsc-desc border-t border-vsc-card-border mt-1.5 shrink-0"
  >
    {hint}
  </div>
{/if}
