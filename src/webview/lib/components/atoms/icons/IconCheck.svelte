<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon path="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" {size} class={cls} {title} />
