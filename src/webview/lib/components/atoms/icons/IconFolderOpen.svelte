<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon
  path="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V8h16v10z"
  {size}
  class={cls}
  {title}
/>
