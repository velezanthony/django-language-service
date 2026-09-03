<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = { children: Snippet };
  let { children }: Props = $props();
</script>

<kbd
  class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] py-px
         bg-vsc-bg border border-vsc-card-border rounded-sm
         text-[10px] text-vsc-editor-fg font-vsc-editor leading-none align-baseline"
>
  {@render children()}
</kbd>
