import { clearFlags, setManyBoxFlags, BoxFlag, type BoxFlags } from '$lib/state/box-flags.svelte';
import { toolbar } from '$lib/state/toolbar.svelte';

interface BlastRelation {
  from: string;
  to: string;
  /** CASCADE | PROTECT | SET_NULL | SET_DEFAULT | DO_NOTHING | RESTRICT (or undefined) */
  onDelete?: string;
}

export interface BlastRadiusContext {
  modelKeys: string[];
  relations: BlastRelation[];
  /** Called when highlight/blast state changes — relations layer dims siblings. */
  onRedraw: () => void;
}

export interface BlastRadiusApi {
  /** Currently selected model key (or null). drawRelations reads this to dim siblings. */
  getSelected: () => string | null;
  /** Toggle blast mode on/off. Clears any active highlight on turn-off. */
  toggle: () => void;
  /**
   * Click handler for a model box. Behaviour depends on mode:
   * - normal: toggle "highlight this model + its direct relations" on click.
   * - blast:  paint the CASCADE-delete tree downstream of the clicked model.
   */
  onBoxClick: (boxKey: string) => void;
  /** Clear any active focus / blast highlight — wired to ESC + click-outside. */
  clearFocus: () => void;
}

export const installBlastRadius = (ctx: BlastRadiusContext): BlastRadiusApi => {
  let selected: string | null = null;
  let blastMode = false;

  const clearHighlights = (): void => {
    clearFlags(BoxFlag.DIMMED, BoxFlag.HIGHLIGHTED, BoxFlag.FOCUS_SOURCE);
    ctx.onRedraw();
  };

  // Focus on a model: the source itself gets a STRONGER ring (focusSource);
  // its direct relations get the regular highlight; everything else dims.
  // Distinguishing source from neighbours is what makes the click feel like
  // "I'm exploring around THIS one" instead of "a cluster lit up".
  const highlightModel = (name: string): void => {
    const connected = new Set<string>();
    ctx.relations.forEach(r => {
      if (r.from === name) connected.add(r.to);
      if (r.to === name) connected.add(r.from);
    });
    const updates: Record<string, BoxFlags> = {};
    for (const key of ctx.modelKeys) {
      if (key === name) {
        updates[key] = { focusSource: true, highlighted: false, dimmed: false };
      } else if (connected.has(key)) {
        updates[key] = { focusSource: false, highlighted: true, dimmed: false };
      } else {
        updates[key] = { focusSource: false, highlighted: false, dimmed: true };
      }
    }
    setManyBoxFlags(updates);
    ctx.onRedraw();
  };

  const paintBlast = (source: string): void => {
    // Walk the CASCADE-delete graph downstream from `source`. Each model that
    // would be deleted by the cascade gets `blastAffected`; everything else
    // (except the source itself) gets dimmed.
    clearHighlights();
    selected = source;
    const affected = new Set<string>();
    const visited = new Set<string>();
    const walk = (model: string): void => {
      if (visited.has(model)) return;
      visited.add(model);
      ctx.relations.forEach(r => {
        if (r.onDelete === 'CASCADE' && r.to === model) {
          affected.add(r.from);
          walk(r.from);
        }
      });
    };
    walk(source);
    const updates: Record<string, BoxFlags> = {};
    updates[source] = { blastSource: true };
    for (const k of ctx.modelKeys) {
      if (k === source) continue;
      if (affected.has(k)) updates[k] = { blastAffected: true, dimmed: false };
      else updates[k] = { dimmed: true };
    }
    setManyBoxFlags(updates);
    ctx.onRedraw();
  };

  return {
    getSelected: () => selected,
    toggle: () => {
      blastMode = !blastMode;
      toolbar.blastMode = blastMode;
      if (!blastMode) {
        clearHighlights();
        selected = null;
      }
    },
    onBoxClick: boxKey => {
      if (blastMode) {
        paintBlast(boxKey);
        return;
      }
      if (selected === boxKey) {
        selected = null;
        clearHighlights();
      } else {
        selected = boxKey;
        highlightModel(boxKey);
      }
    },
    clearFocus: () => {
      if (selected === null) return;
      selected = null;
      clearHighlights();
    },
  };
};
