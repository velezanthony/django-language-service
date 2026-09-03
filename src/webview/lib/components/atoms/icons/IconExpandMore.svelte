<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon path="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" {size} class={cls} {title} />
