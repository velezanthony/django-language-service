import { describe, it, expect } from 'vitest';
import { clampToViewport } from './clamp-to-viewport';

const VIEW = { width: 1000, height: 600 };
const PANEL = { width: 300, height: 200 };

describe('clampToViewport', () => {
  it('leaves a position that already fits', () => {
    expect(clampToViewport({ left: 100, top: 80 }, PANEL, VIEW)).toEqual({ left: 100, top: 80 });
  });

  it('stops the panel escaping left or top', () => {
    expect(clampToViewport({ left: -500, top: -500 }, PANEL, VIEW)).toEqual({ left: 8, top: 8 });
  });

  it('stops it escaping right or bottom', () => {
    expect(clampToViewport({ left: 5000, top: 5000 }, PANEL, VIEW)).toEqual({
      left: 1000 - 300 - 8,
      top: 600 - 200 - 8,
    });
  });

  // Resized taller than the screen: pin the top edge so the header — the only
  // way to drag it back — stays reachable.
  it('keeps the header reachable when the panel is bigger than the viewport', () => {
    const huge = { width: 1400, height: 900 };
    expect(clampToViewport({ left: -200, top: -300 }, huge, VIEW)).toEqual({ left: 8, top: 8 });
  });

  it('honours a custom margin', () => {
    expect(clampToViewport({ left: -50, top: -50 }, PANEL, VIEW, 20)).toEqual({
      left: 20,
      top: 20,
    });
  });
});
