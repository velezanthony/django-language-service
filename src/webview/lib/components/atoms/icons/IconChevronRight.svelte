<script lang="ts">
  import Icon from '../Icon.svelte';

  type Props = { size?: number; class?: string; title?: string };
  let { size, class: cls, title }: Props = $props();
</script>

<Icon path="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" {size} class={cls} {title} />
