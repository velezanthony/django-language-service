<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon
  path="M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6zM7.81 16.5l2.69-3.65c.13-.17.2-.39.2-.6V6h3v6.25c0 .22.07.43.2.6l2.69 3.65h-8.78z"
  {size}
  class={cls}
  {title}
/>
