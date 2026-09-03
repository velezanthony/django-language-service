<script lang="ts">
  import { actions, toolbar } from '$lib/state/toolbar.svelte';
  import { Select } from '$molecules';

  // Offcanvas passes a handler to close the menu after a pick, so the freshly
  // app-filtered canvas is visible instead of the panel covering it.
  let { onPick }: { onPick?: () => void } = $props();

  let selected = $state('');

  function onChange(value: string) {
    selected = value;
    actions().setAppFilter(value);
    onPick?.();
  }

  const options = $derived([
    { value: '', label: 'All apps' },
    ...toolbar.appLabels.map(label => ({ value: label, label })),
  ]);
</script>

<Select value={selected} {options} {onChange} minWidth={140} title="Filter by Django app" />
