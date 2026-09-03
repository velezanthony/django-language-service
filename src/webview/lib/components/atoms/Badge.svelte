<script lang="ts">
  type Props = {
    label?: string;
    value: string | number;
  };

  let { label, value }: Props = $props();
</script>

<span
  >{#if label}<span class="opacity-70 font-medium">{label}</span>
    <span class="tabular-nums">{value}</span>{:else}<span class="tabular-nums">{value}</span
    >{/if}</span
>
