<script lang="ts">
  import type { Snippet } from 'svelte';
  type Props = { children: Snippet };
  let { children }: Props = $props();
</script>

<div class="text-[11px] text-vsc-desc pt-0.5 px-3 pb-1.5 leading-[1.35] opacity-75 max-w-[280px]">
  {@render children()}
</div>
