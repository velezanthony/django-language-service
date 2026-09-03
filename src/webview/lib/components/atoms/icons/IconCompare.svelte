<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon
  path="M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-1v-3H22V8h-7.01V5L11 9l3.99 4z"
  {size}
  class={cls}
  {title}
/>
