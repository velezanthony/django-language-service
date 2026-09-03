import type { Action } from 'svelte/action';
import { startBoxDrag } from '$lib/helpers/drag';

/**
 * Svelte action for the per-box drag. Use on a `.model-box` element:
 *
 * ```svelte
 * <div use:draggable={boxKey}>
 * ```
 *
 * The action just forwards `mousedown` events into the shared drag helper
 * (which owns the window mousemove/mouseup listeners + position state).
 * Boot still calls setBoxDragContext({...}) once at startup; this action
 * doesn't carry any per-instance state.
 */
export const draggable: Action<HTMLElement, string> = (node, boxKey) => {
  let key = boxKey;

  const onDown = (e: MouseEvent): void => startBoxDrag(key, e);
  node.addEventListener('mousedown', onDown);

  return {
    update: next => {
      key = next;
    },
    destroy: () => node.removeEventListener('mousedown', onDown),
  };
};
