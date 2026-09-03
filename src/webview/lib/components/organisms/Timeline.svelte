<script lang="ts">
  import { Button, IconButton, Pill } from '$atoms';
  import {
    IconClose,
    IconRefresh,
    IconChevronLeft,
    IconChevronRight,
    IconExpandMore,
  } from '$icons';
  import { timeline, timelineActions } from '$lib/state/timeline.svelte';
  import { toolbar, actions } from '$lib/state/toolbar.svelte';
  import { loadDiagramData } from '$lib/composables/diagram-data';

  // Collapsed keeps the panel ACTIVE — label, stepping and Exit stay put — and
  // gives the canvas its height back. Exit is a different intent: it leaves
  // history mode entirely.
  let collapsed = $state(false);

  // Chronological order (serializer topo-sorts by the dependency DAG):
  // steps[0] = oldest … steps[N-1] = newest. Graph reads newest→oldest, git-log
  // style, with a synthetic "Current state" node on top.
  const steps = loadDiagramData().timelineSteps;
  const ordered = $derived(steps.map((s, i) => ({ step: s, idx: i })).reverse());

  // Unified history panel: open while EITHER mode is active. The two underlying
  // modes are mutually exclusive in the boot wiring — the selector flips between
  // them, so the panel stays put while the canvas reclassifies.
  //   step    → diff vs the previous step   (timeline / step.diff)
  //   current → diff vs the live models      (compare / migrationComparisons)
  const open = $derived(timeline.active || toolbar.compareIdx >= 0);
  const mode = $derived<'step' | 'current'>(toolbar.compareIdx >= 0 ? 'current' : 'step');

  // Selected node index (into steps[]), per mode.
  const selectedIdx = $derived(mode === 'current' ? toolbar.compareIdx : timeline.currentStep);
  const isSelected = (idx: number): boolean => selectedIdx === idx;

  function selectNode(idx: number): void {
    if (mode === 'current') actions().selectCompareMigration(idx);
    // setStep wants a slider value; sliderValueToStep = N-1-v.
    else timelineActions().setStep(steps.length - 1 - idx);
  }

  function setMode(next: 'step' | 'current'): void {
    if (next === mode) return;
    const keep = selectedIdx; // preserve the selected node across the switch
    if (next === 'current') {
      // Enter compare (exits timeline); default to newest if nothing selected.
      actions().selectCompareMigration(keep >= 0 ? keep : steps.length - 1);
    } else {
      if (!timeline.active) actions().toggleTimeline(); // activate timeline (exits compare)
      if (keep >= 0) timelineActions().setStep(steps.length - 1 - keep);
    }
  }

  // Step the selection one node older/newer. The graph is newest→oldest with a
  // synthetic "current state" on top; selectedIdx -1 = current, 0 = oldest,
  // N-1 = newest. setStep wants a slider value (= N-1-index).
  function navigate(dir: 'older' | 'newer'): void {
    const N = steps.length;
    if (mode === 'current') {
      const cur = selectedIdx < 0 ? N - 1 : selectedIdx;
      const t = dir === 'older' ? cur - 1 : cur + 1;
      if (t >= 0 && t < N) actions().selectCompareMigration(t);
      return;
    }
    if (dir === 'older') {
      const t = selectedIdx < 0 ? N - 1 : selectedIdx - 1; // current → newest, else one older
      if (t >= 0) timelineActions().setStep(N - 1 - t);
    } else {
      if (selectedIdx < 0) return; // already at current (newest)
      if (selectedIdx >= N - 1)
        timelineActions().reset(); // newest → current state
      else timelineActions().setStep(N - 1 - (selectedIdx + 1));
    }
  }
  function reset(): void {
    if (mode === 'current') actions().exitCompare();
    else timelineActions().reset();
  }
  function close(): void {
    if (toolbar.compareIdx >= 0) actions().exitCompare();
    if (timeline.active) timelineActions().close();
  }

  type OpKind = 'fk' | 'danger' | 'o2o' | 'm2m' | 'neutral';
  const opKind = (op: string): OpKind => {
    if (op.startsWith('+')) return 'fk';
    if (op.startsWith('-')) return 'danger';
    if (op.startsWith('~')) return 'o2o';
    if (op.includes('→')) return 'm2m';
    return 'neutral';
  };
  const num = (name: string): string => name.split('_')[0] ?? name;

  const SEG = 'px-2 py-0.5 text-meta rounded-sm transition-colors';
  const SEG_ON = 'bg-vsc-link/20 text-vsc-link font-semibold';
  const SEG_OFF = 'text-vsc-desc/70 hover:text-vsc-editor-fg';

  // Label: which node + against what.
  const label = $derived.by(() => {
    if (selectedIdx < 0) return mode === 'current' ? 'No migration selected' : 'Current state';
    const s = steps[selectedIdx];
    if (!s) return '';
    return s.name + (s.appLabel ? ' (' + s.appLabel + ')' : '');
  });
</script>

{#if open}
  <div
    id="timeline-panel"
    class="block bg-black/20 border-b border-vsc-card-border shrink-0 flex flex-col {collapsed
      ? ''
      : 'max-h-[42vh]'}"
  >
    <!-- Header: title + "compare vs" selector + actions -->
    <div
      class="flex items-center gap-2 px-4 py-2 border-b border-vsc-card-border/60 shrink-0 flex-wrap"
    >
      <span class="text-meta uppercase tracking-[0.6px] font-bold text-vsc-link/80"
        >Migration history</span
      >
      <span class="inline-flex items-center gap-1 ml-1" role="group" aria-label="View mode">
        <span class="text-meta text-vsc-desc/60">show</span>
        <button
          type="button"
          title="What this migration added, changed or removed"
          class="{SEG} {mode === 'step' ? SEG_ON : SEG_OFF}"
          onclick={() => setMode('step')}>this migration</button
        >
        <button
          type="button"
          title="What changed from this migration up to the live models"
          class="{SEG} {mode === 'current' ? SEG_ON : SEG_OFF}"
          onclick={() => setMode('current')}>vs current state</button
        >
      </span>
      <span class="text-xs font-semibold text-vsc-editor-fg ml-1 truncate">{label}</span>
      <div class="ml-auto flex items-center gap-1.5">
        <IconButton
          id="tl-older"
          size="sm"
          variant="secondary"
          title="Older migration"
          onclick={() => navigate('older')}
        >
          <IconChevronLeft size={14} />
        </IconButton>
        <IconButton
          id="tl-newer"
          size="sm"
          variant="secondary"
          title="Newer migration"
          onclick={() => navigate('newer')}
        >
          <IconChevronRight size={14} />
        </IconButton>
        <IconButton id="tl-reset" size="sm" variant="ghost" title="Clear selection" onclick={reset}>
          <IconRefresh size={14} />
        </IconButton>
        <IconButton
          id="tl-collapse"
          size="sm"
          variant="ghost"
          title={collapsed
            ? 'Expand history'
            : 'Collapse history — keeps it active, gives the canvas its height back'}
          onclick={() => (collapsed = !collapsed)}
        >
          <span
            class="inline-flex transition-transform duration-fast {collapsed ? '' : 'rotate-180'}"
          >
            <IconExpandMore size={14} />
          </span>
        </IconButton>
        <Button id="tl-close" variant="secondary" size="sm" onclick={close}
          ><IconClose size={14} /> Exit</Button
        >
      </div>
    </div>

    <!-- DAG graph (newest on top); only the step mode shows the live "Current state" node -->
    {#if !collapsed}
      <div id="tl-graph" class="flex-1 min-h-0 overflow-y-auto py-1.5">
        {#if mode === 'step'}
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-1 text-left text-xs hover:bg-vsc-link/5 {timeline.currentStep <
            0
              ? 'bg-vsc-link/10'
              : ''}"
            onclick={() => timelineActions().reset()}
          >
            <span
              class="w-3 text-center {timeline.currentStep < 0
                ? 'text-vsc-link'
                : 'text-vsc-desc/60'}">{timeline.currentStep < 0 ? '◉' : '○'}</span
            >
            <span
              class="font-semibold {timeline.currentStep < 0
                ? 'text-vsc-link'
                : 'text-vsc-editor-fg'}">Current state</span
            >
            <span class="text-meta text-vsc-desc/60 italic">live models</span>
          </button>
        {/if}

        {#each ordered as { step, idx } (step.key || idx)}
          <button
            type="button"
            class="w-full flex items-baseline gap-2 px-4 py-1 text-left text-xs hover:bg-vsc-link/5 {isSelected(
              idx,
            )
              ? 'bg-vsc-link/10'
              : ''}"
            onclick={() => selectNode(idx)}
          >
            <span
              class="w-3 text-center shrink-0 {isSelected(idx)
                ? 'text-vsc-link'
                : 'text-vsc-desc/70'}">{isSelected(idx) ? '◉' : '●'}</span
            >
            {#if step.appLabel}
              <span
                class="shrink-0 px-1.5 rounded-sm bg-vsc-card-border/40 text-vsc-desc text-meta font-medium tabular-nums"
                >{step.appLabel}</span
              >
            {/if}
            <span class="shrink-0 text-vsc-desc/70 tabular-nums">{num(step.name)}</span>
            <span
              class="font-medium {isSelected(idx)
                ? 'text-vsc-link'
                : 'text-vsc-editor-fg'} truncate">{step.name}</span
            >
            {#if step.dependencies && step.dependencies.length > 0}
              <span class="ml-auto shrink-0 text-meta text-vsc-desc/55 truncate max-w-[40%]"
                >← {step.dependencies.join(' · ')}</span
              >
            {/if}
          </button>
        {/each}
      </div>

      <!-- Detail: ops of the step (step mode) or compare stats vs current (current mode) -->
      {#if mode === 'current' && toolbar.compareStats}
        <div class="flex flex-wrap gap-1.5 px-4 py-2 border-t border-vsc-card-border/60 shrink-0">
          <Pill kind="fk" size="sm" tabular>+{toolbar.compareStats.added} added</Pill>
          <Pill kind="o2o" size="sm" tabular>~{toolbar.compareStats.changed} changed</Pill>
          <Pill kind="danger" size="sm" tabular>−{toolbar.compareStats.removed} removed</Pill>
          <Pill kind="neutral" size="sm" tabular>{toolbar.compareStats.unchanged} unchanged</Pill>
          <span class="text-vsc-desc/70 text-meta italic self-center ml-1"
            >vs current models · dashed = removed</span
          >
        </div>
      {:else if mode === 'step' && timeline.ops.length > 0}
        <div
          id="tl-ops"
          class="flex flex-wrap gap-1.5 px-4 py-2 border-t border-vsc-card-border/60 shrink-0 max-h-[90px] overflow-y-auto"
        >
          {#each timeline.ops as op, i (i)}
            <Pill kind={opKind(op)} size="sm">{op}</Pill>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}
