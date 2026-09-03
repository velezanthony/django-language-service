import { mount, unmount } from 'svelte';
import { Tooltip } from '$organisms';
import type { BoxRecord } from '$lib/types/box-data';

type MountHandle = ReturnType<typeof mount>;

let currentHandle: MountHandle | null = null;

export const mountTooltip = (target: HTMLElement, data: BoxRecord, pinned: boolean): void => {
  unmountTooltip();
  target.textContent = '';
  currentHandle = mount(Tooltip, { target, props: { data, pinned } });
};

export const unmountTooltip = (): void => {
  if (!currentHandle) return;
  try {
    unmount(currentHandle);
  } catch (err) {
    console.error('[mount-tooltip] unmount failed', err);
  }
  currentHandle = null;
};
