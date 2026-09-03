<script lang="ts">
  type Props = {
    path: string;
    size?: number;
    viewBox?: string;
    class?: string;
    title?: string;
  };

  let { path, size = 16, viewBox = '0 0 24 24', class: cls = '', title }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  {viewBox}
  class={`shrink-0 ${cls}`}
  fill="currentColor"
  aria-hidden={title ? undefined : true}
  role={title ? 'img' : undefined}
>
  {#if title}<title>{title}</title>{/if}
  <path d={path} />
</svg>
