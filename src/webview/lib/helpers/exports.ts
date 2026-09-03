import type { Point } from '$lib/state/positions.svelte';
import { LAYOUT_VERSION } from '$lib/composables/persistence';
import { toastState, type ToastPayload } from '$lib/state/toast.svelte';

// Toast is now rendered by organisms/Toast.svelte from `toastState`. This
// helper preserves the legacy `showToast(message, isError?)` signature used
// across the boot, while accepting a richer object form for new callers.
export const showToast = (messageOrPayload: string | ToastPayload, isError = false): void => {
  if (typeof messageOrPayload === 'string') {
    toastState.show({
      title: messageOrPayload,
      kind: isError ? 'error' : 'success',
    });
  } else {
    toastState.show(messageOrPayload);
  }
};

export interface CopyOptions {
  buttonId: string;
  text: string;
  toastLabel: string;
}

// Note: previously this helper flipped the button text to "✅ Copied!" briefly,
// but the export buttons now contain Material icon SVGs as children. Mutating
// textContent would wipe those. The toast is the centralized feedback path and
// is enough on its own. The buttonId is kept for log breadcrumbs but no longer
// mutated.
export const copyToClipboard = ({ buttonId, text, toastLabel }: CopyOptions): void => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast({
        title: 'Copied to clipboard',
        description: `${toastLabel} ready to paste`,
        kind: 'success',
      });
    })
    .catch(err => {
      console.error('[copy]', buttonId, err);
      showToast({
        title: 'Clipboard write failed',
        description: 'See DevTools console for details',
        kind: 'error',
      });
    });
};

export interface LayoutPayload {
  version: number;
  positions: Record<string, Point>;
  exportedAt: string;
}

export const buildLayoutJson = (version: number, positions: Record<string, Point>): string => {
  const payload: LayoutPayload = {
    version,
    positions,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
};

/**
 * Read a layout file, validating every value before it reaches the store.
 *
 * This is the only structured input the diagram takes from outside itself, and
 * it used to check one thing: that `positions` was truthy. Everything past
 * that went straight into the position store and then into persisted state, so
 * a file with a string coordinate, a null, or an array of positions wrote
 * nonsense the diagram kept reloading — with no way back except clearing the
 * saved state by hand.
 */
export const parseLayoutPayload = (raw: string): LayoutPayload => {
  const payload = JSON.parse(raw) as unknown;
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('not a layout file');
  }

  const { version, positions } = payload as Partial<LayoutPayload>;

  if (version !== LAYOUT_VERSION) {
    throw new Error(`unsupported layout version ${String(version)} (expected ${LAYOUT_VERSION})`);
  }
  // An array is an object too, and `positions[key]` on one is not a Point.
  if (typeof positions !== 'object' || positions === null || Array.isArray(positions)) {
    throw new Error('no positions in file');
  }

  for (const [key, point] of Object.entries(positions)) {
    if (typeof point !== 'object' || point === null || Array.isArray(point)) {
      throw new Error(`position for '${key}' is not a point`);
    }
    const { x, y } = point as Partial<Point>;
    // Number.isFinite rejects NaN and both infinities, which is what a
    // hand-edited file and a JSON round trip of NaN (null) both produce.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`position for '${key}' has a coordinate that is not a finite number`);
    }
  }

  return payload as LayoutPayload;
};
