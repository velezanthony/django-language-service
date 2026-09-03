export interface Size {
  width: number;
  height: number;
}
export interface Pos {
  left: number;
  top: number;
}

const DEFAULT_MARGIN = 8;

/**
 * Keep a floating panel on screen.
 *
 * The lower bound wins over the upper one: a panel resized taller than the
 * viewport clamps to the top edge, so its header — the drag handle — never ends
 * up off-screen with no way to bring it back.
 */
export function clampToViewport(
  pos: Pos,
  panel: Size,
  view: Size,
  margin: number = DEFAULT_MARGIN,
): Pos {
  const maxLeft = view.width - panel.width - margin;
  const maxTop = view.height - panel.height - margin;
  return {
    left: Math.max(margin, Math.min(pos.left, maxLeft)),
    top: Math.max(margin, Math.min(pos.top, maxTop)),
  };
}
