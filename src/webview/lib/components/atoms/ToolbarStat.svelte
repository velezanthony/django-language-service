<script lang="ts">
  type Props = {
    label?: string;
    value: string | number;
  };

  let { label, value }: Props = $props();
</script>

<!--
  Compact "stat card" — label stacked above the value, like the Tailwind UI
  reference but sized down so a full row of stats still fits in the toolbar.
  Each stat reads as its own atomic unit rather than running into the next.
-->
<span class="inline-flex flex-col items-start gap-0.5 leading-none">
  {#if label}
    <span class="text-vsc-desc/70 text-meta uppercase tracking-[0.5px] font-medium">{label}</span>
  {/if}
  <span class="text-vsc-editor-fg font-bold text-body tabular-nums">{value}</span>
</span>
