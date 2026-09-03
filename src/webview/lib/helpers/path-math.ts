import type { RelationKind } from '$lib/types/relations';

export interface Point {
  x: number;
  y: number;
}

export interface RelationPath {
  d: string;
  labelX: number;
  labelY: number;
  cardX: number;
  cardY: number;
}

// Ray from box centre to target intersected with the box rectangle (+4px halo
// so the curve doesn't kiss the border).
export const edgePoint = (
  cx: number,
  cy: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
): [number, number] => {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = w / 2 + 4;
  const hh = h / 2 + 4;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
};

// pairIndex (0..N) spreads parallel curves between the same two boxes.
export const computeRelationPath = (
  from: Point,
  to: Point,
  boxW: number,
  boxH: number,
  pairIndex: number,
): RelationPath => {
  const fx = from.x + boxW / 2;
  const fy = from.y + boxH / 2;
  const tx = to.x + boxW / 2;
  const ty = to.y + boxH / 2;

  const [x1, y1] = edgePoint(fx, fy, boxW, boxH, tx, ty);
  const [x2, y2] = edgePoint(tx, ty, boxW, boxH, fx, fy);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = Math.min(50, dist * 0.25) + pairIndex * 20;
  const nx = -dy / dist;
  const ny = dx / dist;
  const mx = (x1 + x2) / 2 + nx * offset;
  const my = (y1 + y2) / 2 + ny * offset;

  // Labels sit on the curve, not on the chord — weighted toward the control point.
  const lx = (x1 + 2 * mx + x2) / 4;
  const ly = (y1 + 2 * my + y2) / 4;

  return {
    d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
    labelX: lx,
    labelY: ly - 6,
    cardX: lx,
    cardY: ly + 8,
  };
};

const boxInView = (
  p: Point,
  boxW: number,
  boxH: number,
  viewMinX: number,
  viewMinY: number,
  viewMaxX: number,
  viewMaxY: number,
): boolean =>
  p.x + boxW >= viewMinX && p.x <= viewMaxX && p.y + boxH >= viewMinY && p.y <= viewMaxY;

// True if either endpoint touches the viewport — partial paths still render.
export const relationInView = (
  from: Point,
  to: Point,
  boxW: number,
  boxH: number,
  viewMinX: number,
  viewMinY: number,
  viewMaxX: number,
  viewMaxY: number,
): boolean =>
  boxInView(from, boxW, boxH, viewMinX, viewMinY, viewMaxX, viewMaxY) ||
  boxInView(to, boxW, boxH, viewMinX, viewMinY, viewMaxX, viewMaxY);

const CARDINALITY: Record<RelationKind, string> = {
  FK: 'N : 1',
  M2M: 'N : M',
  O2O: '1 : 1',
};

export const cardinalityFor = (type: RelationKind): string => CARDINALITY[type];
