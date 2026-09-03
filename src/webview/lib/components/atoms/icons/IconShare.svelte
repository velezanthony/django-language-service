<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon
  path="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"
  {size}
  class={cls}
  {title}
/>
