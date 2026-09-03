<script lang="ts">
  import type { Snippet } from 'svelte';
  type Props = { children: Snippet };
  let { children }: Props = $props();
</script>

<div class="text-[10px] uppercase tracking-[0.8px] text-vsc-desc pt-2 px-3 font-bold">
  {@render children()}
</div>
