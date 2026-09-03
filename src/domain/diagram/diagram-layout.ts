/**
 * Pure layout math for the ER diagram.
 * No vscode / fs / DOM dependency — purity is rg-verifiable.
 *
 * @inventory DGM-001 (force-directed layout), DGM-002 (hub heatmap),
 *            DGM-003 (orphan detection), DGM-009 (circular dependency / Tarjan SCC)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  x: number;
  y: number;
}

export interface LayoutRelation {
  from: string;
  to: string;
}

export interface LayoutInput {
  names: string[];
  relations: LayoutRelation[];
  /** Map from model key ("app.Model") to app label */
  appByModel: Map<string, string>;
  boxW: number;
  boxH: number;
}

// ── DGM-001: Force-directed layout ───────────────────────────────────────────

/**
 * Compute a force-directed layout for an ER diagram.
 * Groups models by app label, applies repulsion + attraction forces, then
 * resolves remaining overlaps with a spatial-grid pass.
 *
 * Returns a `Record<modelKey, Position>` where coordinates are in logical
 * canvas units (px, positive). Positions are stable given the same sorted
 * input (no RNG — deterministic).
 */
export function computeLayout(input: LayoutInput): Record<string, Position> {
  const { names, relations: rels, appByModel, boxW, boxH } = input;

  /** Clearance the resolver guarantees on each side of a box. */
  const RESOLVE_PAD_X = 20;
  const RESOLVE_PAD_Y = 20;
  const pos: Record<string, Position> = {};

  const appMap: Record<string, string[]> = {};
  for (const n of names) {
    const app = appByModel.get(n) ?? '_none';
    if (!appMap[app]) appMap[app] = [];
    appMap[app].push(n);
  }
  const apps = Object.keys(appMap).sort();

  // The starting grid is spaced by what the resolver below will demand, and
  // the app zones by how much room the biggest app actually needs.
  //
  // These were the constants 250, 140, 600 and 500. A box is 220 x 120 and
  // the resolver wants RESOLVE_PAD on each side, so 250 x 140 started EVERY
  // box already in violation and the relaxation had to push the whole world
  // apart from nothing — 216 models needed 600 passes and 750ms to converge,
  // and with the 60 it is given, 11 boxes were still overlapping when the
  // diagram was drawn.
  const CELL_W = boxW + RESOLVE_PAD_X * 2;
  const CELL_H = boxH + RESOLVE_PAD_Y * 2;
  const ZONE_GUTTER = 160;

  const innerColsOf = (count: number): number =>
    count <= 2 ? Math.max(count, 1) : Math.ceil(Math.sqrt(count));

  // One zone size for all of them, so the zone grid stays a grid.
  let zoneW = 0;
  let zoneH = 0;
  for (const app of apps) {
    const count = appMap[app]!.length;
    const cols = innerColsOf(count);
    zoneW = Math.max(zoneW, cols * CELL_W);
    zoneH = Math.max(zoneH, Math.ceil(count / cols) * CELL_H);
  }

  const appCols = apps.length <= 2 ? Math.max(apps.length, 1) : Math.ceil(Math.sqrt(apps.length));

  /**
   * The starting placement: apps in zones, models on a grid inside each.
   *
   * Overlap-free BY CONSTRUCTION — the cells are exactly the separation the
   * resolver demands — which is what makes it usable as the fallback below.
   */
  const gridPlacement = (): Record<string, Position> => {
    const out: Record<string, Position> = {};
    apps.forEach((app, appIdx) => {
      const members = appMap[app]!;
      const baseX = 80 + (appIdx % appCols) * (zoneW + ZONE_GUTTER);
      const baseY = 80 + Math.floor(appIdx / appCols) * (zoneH + ZONE_GUTTER);
      const innerCols = innerColsOf(members.length);

      members.forEach((n: string, i: number) => {
        out[n] = {
          x: baseX + (i % innerCols) * CELL_W,
          y: baseY + Math.floor(i / innerCols) * CELL_H,
        };
      });
    });
    return out;
  };

  Object.assign(pos, gridPlacement());

  const adj: Record<string, string[]> = {};
  names.forEach(n => {
    adj[n] = [];
  });
  rels.forEach(r => {
    if (adj[r.from] && adj[r.to]) {
      adj[r.from]!.push(r.to);
      adj[r.to]!.push(r.from);
    }
  });

  // Cell size: any two models that could overlap (box + pad) fit inside 2 adjacent cells, so a
  // 3×3 neighbourhood (current cell + 8 neighbours) is sufficient to find every collision candidate.
  const REPEL_PAD_X = 40;
  const REPEL_PAD_Y = 40;
  const CELL_SIZE = Math.max(boxW + REPEL_PAD_X * 2, boxH + REPEL_PAD_Y * 2);
  /** How many neighbours in one cell the repulsion will look at per round. */
  const REPEL_BUCKET_LIMIT = 24;

  /**
   * How far apart a relation wants to hold its two ends.
   *
   * A fixed 300 says nothing about how many ends there are. Every one of an
   * `auth.User`'s 320 spokes pulled to the same 300px ring, where a dozen
   * fit — so the boxes piled up, and because they all then landed in ONE cell
   * of the spatial grid, the repulsion the grid exists to keep linear went
   * quadratic: 3.4 seconds of frozen webview for a schema that draws in a
   * tenth of that.
   *
   * The ring has to be big enough to hold the neighbours standing on it.
   * `n` boxes of pitch `p` need a circumference of `n · p`, hence a radius of
   * `n · p / 2π`; the busier of the two ends decides.
   */
  const degree: Record<string, number> = {};
  names.forEach(n => {
    degree[n] = 0;
  });
  rels.forEach(r => {
    if (degree[r.from] !== undefined) degree[r.from]!++;
    if (degree[r.to] !== undefined) degree[r.to]!++;
  });
  const RING_PITCH = Math.max(boxW + REPEL_PAD_X * 2, boxH + REPEL_PAD_Y * 2);
  const idealLengthFor = (from: string, to: string): number => {
    const busiest = Math.max(degree[from] ?? 0, degree[to] ?? 0);
    return Math.max(300, (busiest * RING_PITCH) / (2 * Math.PI));
  };

  /**
   * How many rounds of relaxation to run.
   *
   * The relaxation is COSMETIC — it pulls related models together and looks
   * nicer for it. Correctness belongs to the resolver and, failing that, to
   * the grid. So its cost has to be bounded by something, and the thing it is
   * not bounded by is the spatial grid: when a hub drags its neighbourhood
   * into one cell, the "3×3 neighbourhood" scan becomes every pair, and 320
   * spokes cost 1.9 seconds of frozen webview across 80 rounds.
   *
   * Fewer rounds on a big graph is the honest trade: a schema that large is
   * read by panning around it, not by admiring its overall shape.
   */
  const relaxRounds = names.length > 150 ? 20 : 80;

  for (let iter = 0; iter < relaxRounds; iter++) {
    const forces: Record<string, { fx: number; fy: number }> = {};
    names.forEach(n => {
      forces[n] = { fx: 0, fy: 0 };
    });

    // Bucket models by grid cell for this iteration.
    const grid: Map<string, string[]> = new Map();
    for (const n of names) {
      const p = pos[n]!;
      const key = Math.floor(p.x / CELL_SIZE) + ',' + Math.floor(p.y / CELL_SIZE);
      const list = grid.get(key);
      if (list) list.push(n);
      else grid.set(key, [n]);
    }

    // Repulsion — O(n) expected via spatial grid; canonical (nameA < nameB) order = each pair once.
    for (let i = 0; i < names.length; i++) {
      const nameA = names[i]!;
      const a = pos[nameA]!;
      const cx = Math.floor(a.x / CELL_SIZE);
      const cy = Math.floor(a.y / CELL_SIZE);
      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          const bucket = grid.get(cx + ddx + ',' + (cy + ddy));
          if (!bucket) continue;
          // The grid exists to keep this loop linear, and it stops
          // doing that the moment a hub drags its whole neighbourhood
          // into one cell: every pair in that cell then gets compared,
          // every round. Looking at a bounded slice keeps the cost
          // bounded, and costs nothing that matters — a cell holding
          // more boxes than this is already a pile the relaxation
          // cannot tidy, which is what the resolver and the grid
          // fallback are for.
          const limit = Math.min(bucket.length, REPEL_BUCKET_LIMIT);
          for (let bi = 0; bi < limit; bi++) {
            const nameB = bucket[bi]!;
            if (nameB <= nameA) continue;
            const b = pos[nameB]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const overlapX = boxW + REPEL_PAD_X * 2 - Math.abs(dx);
            const overlapY = boxH + REPEL_PAD_Y * 2 - Math.abs(dy);
            if (overlapX > 0 && overlapY > 0) {
              if (overlapX < overlapY) {
                const push = overlapX * 0.5;
                const sign = dx >= 0 ? 1 : -1;
                forces[nameA]!.fx -= sign * push;
                forces[nameB]!.fx += sign * push;
              } else {
                const push = overlapY * 0.5;
                const sign = dy >= 0 ? 1 : -1;
                forces[nameA]!.fy -= sign * push;
                forces[nameB]!.fy += sign * push;
              }
            }
          }
        }
      }
    }

    // App cohesion: pull members toward their app centroid.
    for (const app of apps) {
      const members = appMap[app]!;
      if (members.length < 2) continue;
      let cx = 0,
        cy = 0;
      members.forEach(n => {
        cx += pos[n]!.x;
        cy += pos[n]!.y;
      });
      cx /= members.length;
      cy /= members.length;
      members.forEach(n => {
        const dx = cx - pos[n]!.x;
        const dy = cy - pos[n]!.y;
        // Weakened as the app grows. Cohesion is here to keep an
        // app's models near EACH OTHER; a large app is already its own
        // blob, and at full strength the inward pull simply crushed the
        // grid the placement above laid out — 216 models in one app
        // came out with 37 boxes on top of one another.
        const pull = 0.02 * Math.min(1, 12 / members.length);
        forces[n]!.fx += dx * pull;
        forces[n]!.fy += dy * pull;
      });
    }

    // Attraction along relation edges (spring force).
    rels.forEach(r => {
      if (!pos[r.from] || !pos[r.to]) return;
      const a = pos[r.from]!;
      const b = pos[r.to]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = idealLengthFor(r.from, r.to);
      const force = ((dist - ideal) / dist) * 0.08;
      forces[r.from]!.fx += dx * force;
      forces[r.from]!.fy += dy * force;
      forces[r.to]!.fx -= dx * force;
      forces[r.to]!.fy -= dy * force;
    });

    names.forEach(n => {
      pos[n]!.x += forces[n]!.fx;
      pos[n]!.y += forces[n]!.fy;
    });
  }

  // Overlap resolution pass with spatial grid.
  const RESOLVE_CELL = Math.max(boxW + RESOLVE_PAD_X * 2, boxH + RESOLVE_PAD_Y * 2);
  // Bounded for the same reason, and by the same argument: a graph the
  // resolver cannot untangle in this many passes falls back to the grid,
  // which is instant and correct.
  const MAX_RESOLVE_PASSES =
    names.length > 150 ? 30 : Math.max(60, Math.ceil(Math.sqrt(names.length) * 4));
  // Stop as soon as the passes stop helping. A pile the relaxation created —
  // a hub whose neighbours all want the same spot — cannot be untangled by
  // nudging pairs apart, so grinding through the whole budget is work thrown
  // away before the grid fallback below replaces the answer anyway.
  let previousUnresolved = Infinity;
  let stalled = 0;

  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    let unresolvedPairs = 0;
    let resolved = true;
    const grid: Map<string, string[]> = new Map();
    for (const n of names) {
      const p = pos[n]!;
      const key = Math.floor(p.x / RESOLVE_CELL) + ',' + Math.floor(p.y / RESOLVE_CELL);
      const list = grid.get(key);
      if (list) list.push(n);
      else grid.set(key, [n]);
    }
    for (let i = 0; i < names.length; i++) {
      const nameA = names[i]!;
      const a = pos[nameA]!;
      const cx = Math.floor(a.x / RESOLVE_CELL);
      const cy = Math.floor(a.y / RESOLVE_CELL);
      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          const bucket = grid.get(cx + ddx + ',' + (cy + ddy));
          if (!bucket) continue;
          for (const nameB of bucket) {
            if (nameB <= nameA) continue;
            const b = pos[nameB]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const overlapX = boxW + RESOLVE_PAD_X * 2 - Math.abs(dx);
            const overlapY = boxH + RESOLVE_PAD_Y * 2 - Math.abs(dy);
            if (overlapX > 0 && overlapY > 0) {
              resolved = false;
              unresolvedPairs++;
              if (overlapX < overlapY) {
                const half = overlapX / 2 + 0.5;
                const sign = dx >= 0 ? 1 : -1;
                a.x -= sign * half;
                b.x += sign * half;
              } else {
                const half = overlapY / 2 + 0.5;
                const sign = dy >= 0 ? 1 : -1;
                a.y -= sign * half;
                b.y += sign * half;
              }
            }
          }
        }
      }
    }
    if (resolved) break;

    stalled = unresolvedPairs >= previousUnresolved ? stalled + 1 : 0;
    previousUnresolved = unresolvedPairs;
    if (stalled >= 3) break;
  }

  // The contract is not negotiable, and the relaxation is a heuristic.
  //
  // A spring pulls its two ends to `ideal`, which says nothing about how many
  // ends there are: a hub with 120 spokes — an `auth.User`, a tenant, the
  // model every project has — asks for 120 boxes on a ring where a dozen fit,
  // and the resolver cannot untangle that inside its pass budget. The scale
  // suite never saw it because it passes `relations: []`, and the small-graph
  // case is named for its size.
  //
  // So when the resolver has not converged, the relaxation's answer is thrown
  // away for the grid it started from, which cannot overlap. A plainer
  // diagram is worth more than one drawn on top of itself.
  if (findOverlaps(pos, boxW, boxH).length > 0) {
    const grid = gridPlacement();
    for (const n of names) {
      const p = pos[n]!;
      const g = grid[n]!;
      p.x = g.x;
      p.y = g.y;
    }
  }

  // Normalize: shift so minimum is (60, 60).
  let minX = Infinity,
    minY = Infinity;
  names.forEach(n => {
    minX = Math.min(minX, pos[n]!.x);
    minY = Math.min(minY, pos[n]!.y);
  });
  names.forEach(n => {
    pos[n]!.x = Math.round(pos[n]!.x - minX + 60);
    pos[n]!.y = Math.round(pos[n]!.y - minY + 60);
  });

  return pos;
}

// ── DGM-002: Hub heatmap ─────────────────────────────────────────────────────

/**
 * Compute the hub tier (0–3) for each model based on incoming relation count.
 * Tier 0 = no connections, tier 3 = top 25% by incoming count.
 * Used by the webview to apply heatmap shading.
 */
export function computeHubTiers(
  modelKeys: string[],
  incomingCounts: Map<string, number>,
): Record<string, number> {
  const counts = modelKeys.map(k => incomingCounts.get(k) ?? 0);
  const maxIncoming = counts.length ? Math.max(...counts) : 0;

  const hubTier = (count: number): number => {
    if (maxIncoming < 2 || count === 0) return 0;
    const ratio = count / maxIncoming;
    if (ratio >= 0.75) return 3;
    if (ratio >= 0.5) return 2;
    if (ratio >= 0.25) return 1;
    return 0;
  };

  const result: Record<string, number> = {};
  for (const key of modelKeys) {
    result[key] = hubTier(incomingCounts.get(key) ?? 0);
  }
  return result;
}

// ── DGM-003: Orphan detection ────────────────────────────────────────────────

/**
 * Return the set of model keys that are "orphans": no incoming OR outgoing
 * relations to any model in the diagram.
 */
export function detectOrphans(
  modelKeys: string[],
  incomingCounts: Map<string, number>,
  outgoingCounts: Map<string, number>,
): Set<string> {
  const orphans = new Set<string>();
  for (const key of modelKeys) {
    const inc = incomingCounts.get(key) ?? 0;
    const out = outgoingCounts.get(key) ?? 0;
    if (inc === 0 && out === 0) orphans.add(key);
  }
  return orphans;
}

// ── DGM-009: Circular dependency / Tarjan SCC ────────────────────────────────

/**
 * Tarjan's algorithm — finds strongly-connected components (SCCs) in the
 * relation graph. Returns only non-trivial SCCs (size > 1, or a self-loop).
 * Used to highlight circular dependencies in the diagram.
 */
export function findCycles(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
): string[][] {
  const adj: Map<string, string[]> = new Map();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
  }

  const index: Map<string, number> = new Map();
  const lowLink: Map<string, number> = new Map();
  const onStack: Set<string> = new Set();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowLink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        strongConnect(w);
        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
      } else if (onStack.has(w)) {
        lowLink.set(v, Math.min(lowLink.get(v)!, index.get(w)!));
      }
    }

    if (lowLink.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      // Only count real cycles: size > 1, OR size === 1 AND the node has a self-loop.
      if (component.length > 1 || (adj.get(v) ?? []).includes(v)) {
        sccs.push(component);
      }
    }
  }

  for (const n of nodes) if (!index.has(n)) strongConnect(n);
  return sccs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check whether two boxes overlap (AABB test with optional padding).
 */
export function boxesOverlap(
  a: Position,
  b: Position,
  boxW: number,
  boxH: number,
  pad = 0,
): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return dx < boxW + pad && dy < boxH + pad;
}

/**
 * Return all overlapping pairs in a layout — useful for testing.
 */
export function findOverlaps(
  positions: Record<string, Position>,
  boxW: number,
  boxH: number,
  pad = 0,
): Array<[string, string]> {
  const names = Object.keys(positions);
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (boxesOverlap(positions[names[i]!]!, positions[names[j]!]!, boxW, boxH, pad)) {
        overlaps.push([names[i]!, names[j]!]);
      }
    }
  }
  return overlaps;
}
