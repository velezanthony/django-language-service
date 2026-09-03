import { classifyTimelineBoxes } from '$lib/helpers/timeline';
import { clearFlags, setManyBoxFlags, BoxFlag } from '$lib/state/box-flags.svelte';

const TIMELINE_FLAGS = [
  BoxFlag.TL_ADDED,
  BoxFlag.TL_REMOVED,
  BoxFlag.TL_CHANGED,
  BoxFlag.TL_CONTEXT,
  BoxFlag.HIDDEN,
] as const;
import { timeline, setTimelineActions } from '$lib/state/timeline.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';
import type { DiagramTimelineStep, DiagramSnapshot } from '$lib/composables/diagram-data';

export interface TimelineModeContext {
  modelKeys: string[];
  /** Drives the one-hop context ring around the models a step touched. */
  relations: readonly { from: string; to: string }[];
  timelineSteps: DiagramTimelineStep[];
  snapshots: DiagramSnapshot[];
  /** Called when toggling on while compare-mode is active — force-exits compare. */
  onCompareConflict: () => void;
  /** Called when the active step changes — drives the relation-layer cull. */
  onRedrawFiltered: (visibleModels: Set<string> | null) => void;
  /** Called when the active step changes — recomputes app zones. */
  onRedrawAppZones: () => void;
  /** Frame the models this step CHANGED — not the context ring around them.
   *  Without it you keep looking wherever you were, with the survivors outside
   *  the viewport and only their relation lines crossing the screen. */
  onFrameVisible: (keys: Set<string>) => void;
}

export interface TimelineModeApi {
  /** True when the panel is open. */
  isActive: () => boolean;
  /** Toggle the timeline panel on/off. */
  toggle: () => void;
  /** Drop classification, return to "Current state" (keeps panel open). */
  reset: () => void;
  /** Close the panel and reset — used when compare-mode takes over. */
  deactivate: () => void;
  /** Selected step, or null when none is picked. The tooltip needs the index to
   *  read snapshots[idx] and snapshots[idx-1]. */
  getSelectedStep: () => { idx: number; label: string; previousLabel?: string } | null;
}

// Slider mapping (Timeline.svelte's convention):
//   sliderValue N     → currentStep -1     (Current state)
//   sliderValue N-1   → currentStep 0      (first entry)
//   sliderValue 0     → currentStep N-1    (oldest)
const sliderValueToStep = (v: number, total: number): number => total - 1 - v;

export const installTimelineMode = (ctx: TimelineModeContext): TimelineModeApi => {
  let active = false;
  let currentStep = -1;

  const labelOf = (): { label: string; ops: string[] } => {
    if (currentStep < 0) return { label: 'Current state', ops: [] };
    const step = ctx.timelineSteps[currentStep];
    if (!step) return { label: 'Current state', ops: [] };
    return {
      label: step.name + (step.appLabel ? ' (' + step.appLabel + ')' : ''),
      ops: step.opSummary,
    };
  };

  const publish = (): void => {
    const { label, ops } = labelOf();
    timeline.active = active;
    timeline.currentStep = currentStep;
    timeline.maxSteps = ctx.timelineSteps.length;
    timeline.label = label;
    timeline.ops = ops;
  };

  const reset = (): void => {
    currentStep = -1;
    clearFlags(...TIMELINE_FLAGS);
    ctx.onRedrawFiltered(null);
    ctx.onRedrawAppZones();
    publish();
  };

  const update = (): void => {
    if (currentStep < 0) {
      reset();
      return;
    }
    const step = ctx.timelineSteps[currentStep];
    if (!step) {
      console.warn('[diagram] timeline step missing for index', currentStep);
      return;
    }
    publish();
    const stepApp = step.appLabel || '';

    // Touched models get tinted; their direct neighbours come along as muted
    // context so the step reads as "here is the blast radius" rather than two
    // boxes in a void. Everything further out is hidden.
    const flags = classifyTimelineBoxes(ctx.modelKeys, step.diff, stepApp, ctx.relations);
    clearFlags(...TIMELINE_FLAGS);
    setManyBoxFlags(flags);
    const visible = new Set<string>(Object.keys(flags).filter(k => flags[k]?.hidden === false));
    ctx.onRedrawFiltered(visible);

    // Frame the CHANGED models, not everything on screen. The context ring can
    // sit anywhere in the schema, so framing the full visible set pushed the
    // models the migration actually touched off the viewport.
    const touched = new Set<string>(
      Object.keys(flags).filter(k => {
        const f = flags[k];
        return f?.tlAdded || f?.tlChanged || f?.tlRemoved;
      }),
    );
    if (touched.size > 0) ctx.onFrameVisible(touched);
  };

  const getSelectedStep = (): { idx: number; label: string; previousLabel?: string } | null => {
    if (!active || currentStep < 0) return null;
    const step = ctx.timelineSteps[currentStep];
    if (!step) return null;
    const nameOf = (s: { appLabel?: string; name: string }): string =>
      s.appLabel ? `${s.appLabel}.${s.name}` : s.name;
    const prev = currentStep > 0 ? ctx.timelineSteps[currentStep - 1] : undefined;
    return {
      idx: currentStep,
      label: nameOf(step),
      ...(prev ? { previousLabel: nameOf(prev) } : {}),
    };
  };

  const toggle = (): void => {
    if (ctx.timelineSteps.length === 0) return;
    active = !active;
    toolbar.timelineMode = active;
    if (active) {
      ctx.onCompareConflict();
      // Auto-select the newest migration (steps[N-1]) so the panel shows a real
      // diff the instant it opens, instead of "Current state" with nothing
      // highlighted (which read as broken).
      currentStep = ctx.timelineSteps.length - 1;
      update();
    } else {
      reset();
    }
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    toolbar.timelineMode = false;
    reset();
  };

  // Register slider/nav actions consumed by Timeline.svelte. `close` is the
  // public escape hatch the panel's X button calls — fully shuts the panel,
  // unlike `reset` which only snaps the playhead back to the rightmost slot.
  setTimelineActions({
    prev: () => {
      if (currentStep < ctx.timelineSteps.length - 1) {
        currentStep++;
        update();
      }
    },
    next: () => {
      if (currentStep > -1) {
        currentStep--;
        update();
      }
    },
    setStep: (sliderVal: number) => {
      currentStep = sliderValueToStep(sliderVal, ctx.timelineSteps.length);
      update();
    },
    reset: () => reset(),
    close: () => deactivate(),
  });

  return {
    isActive: () => active,
    toggle,
    reset,
    deactivate,
    getSelectedStep,
  };
};
