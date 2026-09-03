import { describe, it, expect } from 'vitest';
import {
  computeLayout,
  computeHubTiers,
  detectOrphans,
  findCycles,
  findOverlaps,
} from './diagram-layout';
import type { LayoutInput } from './diagram-layout';

// ── DGM-001: computeLayout ─────────────────────────────────────────────────────

describe('computeLayout — determinism (DGM-001)', () => {
  const input: LayoutInput = {
    names: ['blog.Post', 'blog.Tag', 'blog.Author'],
    relations: [
      { from: 'blog.Post', to: 'blog.Author' },
      { from: 'blog.Post', to: 'blog.Tag' },
    ],
    appByModel: new Map([
      ['blog.Post', 'blog'],
      ['blog.Tag', 'blog'],
      ['blog.Author', 'blog'],
    ]),
    boxW: 200,
    boxH: 120,
  };

  it('returns a position for every model', () => {
    const pos = computeLayout(input);
    expect(Object.keys(pos)).toHaveLength(3);
    expect(pos['blog.Post']).toBeDefined();
    expect(pos['blog.Tag']).toBeDefined();
    expect(pos['blog.Author']).toBeDefined();
  });

  it('is deterministic — same input yields same output', () => {
    const pos1 = computeLayout(input);
    const pos2 = computeLayout(input);
    for (const key of input.names) {
      expect(pos1[key]!.x).toBe(pos2[key]!.x);
      expect(pos1[key]!.y).toBe(pos2[key]!.y);
    }
  });

  it('all positions are positive (≥ 0)', () => {
    const pos = computeLayout(input);
    for (const key of input.names) {
      expect(pos[key]!.x).toBeGreaterThanOrEqual(0);
      expect(pos[key]!.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns integer coordinates', () => {
    const pos = computeLayout(input);
    for (const key of input.names) {
      expect(pos[key]!.x).toBe(Math.round(pos[key]!.x));
      expect(pos[key]!.y).toBe(Math.round(pos[key]!.y));
    }
  });

  it('no overlaps after layout for small graph', () => {
    const pos = computeLayout(input);
    const overlaps = findOverlaps(pos, input.boxW, input.boxH);
    expect(overlaps).toHaveLength(0);
  });
});

describe('computeLayout — empty input (DGM-001)', () => {
  it('returns empty record for zero models', () => {
    const pos = computeLayout({
      names: [],
      relations: [],
      appByModel: new Map(),
      boxW: 200,
      boxH: 120,
    });
    expect(Object.keys(pos)).toHaveLength(0);
  });
});

describe('computeLayout — multi-app grouping (DGM-001)', () => {
  it('models from same app are placed closer than cross-app models', () => {
    const input: LayoutInput = {
      names: ['blog.Post', 'blog.Tag', 'shop.Product'],
      relations: [],
      appByModel: new Map([
        ['blog.Post', 'blog'],
        ['blog.Tag', 'blog'],
        ['shop.Product', 'shop'],
      ]),
      boxW: 200,
      boxH: 120,
    };
    const pos = computeLayout(input);
    // blog models should be closer to each other than to shop.Product
    const distBlogBlog = Math.hypot(
      pos['blog.Post']!.x - pos['blog.Tag']!.x,
      pos['blog.Post']!.y - pos['blog.Tag']!.y,
    );
    const distBlogShop = Math.hypot(
      pos['blog.Post']!.x - pos['shop.Product']!.x,
      pos['blog.Post']!.y - pos['shop.Product']!.y,
    );
    expect(distBlogBlog).toBeLessThan(distBlogShop);
  });
});

// ── DGM-002: Hub heatmap ──────────────────────────────────────────────────────

describe('computeHubTiers — (DGM-002)', () => {
  it('returns tier 0 for all when max incoming < 2', () => {
    const keys = ['A', 'B', 'C'];
    const incoming = new Map([
      ['A', 1],
      ['B', 0],
      ['C', 0],
    ]);
    const tiers = computeHubTiers(keys, incoming);
    expect(tiers['A']).toBe(0);
    expect(tiers['B']).toBe(0);
    expect(tiers['C']).toBe(0);
  });

  it('assigns tier 3 to the most-referenced model', () => {
    const keys = ['A', 'B', 'C'];
    const incoming = new Map([
      ['A', 10],
      ['B', 3],
      ['C', 1],
    ]);
    const tiers = computeHubTiers(keys, incoming);
    expect(tiers['A']).toBe(3); // 100% → tier 3
  });

  it('returns tier 0 for models with zero incoming', () => {
    const keys = ['A', 'B'];
    const incoming = new Map([
      ['A', 8],
      ['B', 0],
    ]);
    const tiers = computeHubTiers(keys, incoming);
    expect(tiers['B']).toBe(0);
  });

  it('result has an entry for every key', () => {
    const keys = ['X', 'Y', 'Z'];
    const incoming = new Map([
      ['X', 5],
      ['Y', 2],
      ['Z', 0],
    ]);
    const tiers = computeHubTiers(keys, incoming);
    expect(Object.keys(tiers)).toHaveLength(3);
  });
});

// ── DGM-003: Orphan detection ─────────────────────────────────────────────────

describe('detectOrphans — (DGM-003)', () => {
  it('detects isolated models with zero incoming and outgoing', () => {
    const keys = ['A', 'B', 'C'];
    const incoming = new Map([
      ['A', 1],
      ['B', 0],
      ['C', 0],
    ]);
    const outgoing = new Map([
      ['A', 0],
      ['B', 1],
      ['C', 0],
    ]);
    const orphans = detectOrphans(keys, incoming, outgoing);
    expect(orphans.has('C')).toBe(true);
    expect(orphans.has('A')).toBe(false);
    expect(orphans.has('B')).toBe(false);
  });

  it('returns empty set when all models have at least one relation', () => {
    const keys = ['A', 'B'];
    const incoming = new Map([
      ['A', 0],
      ['B', 1],
    ]);
    const outgoing = new Map([
      ['A', 1],
      ['B', 0],
    ]);
    const orphans = detectOrphans(keys, incoming, outgoing);
    expect(orphans.size).toBe(0);
  });

  it('marks all models as orphan when no relations exist', () => {
    const keys = ['A', 'B', 'C'];
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    const orphans = detectOrphans(keys, incoming, outgoing);
    expect(orphans.size).toBe(3);
  });
});

// ── DGM-009: Tarjan SCC (findCycles) ─────────────────────────────────────────

describe('findCycles — Tarjan SCC (DGM-009)', () => {
  it('returns empty array when no cycles', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];
    expect(findCycles(nodes, edges)).toHaveLength(0);
  });

  it('detects a simple two-node cycle', () => {
    const nodes = ['A', 'B'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    const sccs = findCycles(nodes, edges);
    expect(sccs).toHaveLength(1);
    expect(sccs[0]).toContain('A');
    expect(sccs[0]).toContain('B');
  });

  it('detects a three-node cycle', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
    ];
    const sccs = findCycles(nodes, edges);
    expect(sccs).toHaveLength(1);
    expect(sccs[0]).toHaveLength(3);
  });

  it('detects a self-loop', () => {
    const nodes = ['A'];
    const edges = [{ from: 'A', to: 'A' }];
    const sccs = findCycles(nodes, edges);
    expect(sccs).toHaveLength(1);
    expect(sccs[0]).toContain('A');
  });

  it('does not count a single node without self-loop as a cycle', () => {
    const nodes = ['A', 'B'];
    const edges = [{ from: 'A', to: 'B' }];
    const sccs = findCycles(nodes, edges);
    expect(sccs).toHaveLength(0);
  });

  it('ignores edges to unknown nodes', () => {
    const nodes = ['A', 'B'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'UNKNOWN' },
      { from: 'UNKNOWN', to: 'A' },
    ];
    // No cycle because UNKNOWN is not in nodes.
    const sccs = findCycles(nodes, edges);
    expect(sccs).toHaveLength(0);
  });
});

// The existing contract was only checked on a "small graph". At real project
// size it did not hold: 216 models across 10 apps came out with 11 boxes drawn
// on top of one another, and 400 with 105.
//
// Two causes, both constants that had stopped matching the box they space:
// the starting grid was 250x140 for a 220x120 box the resolver wants 40px of
// clearance around, so EVERY box began in violation; and app zones were a flat
// 600x500 apart when one app of 22 models needs 1300 across.
describe('no overlaps at project scale', () => {
  const BOX_W = 220;
  const BOX_H = 120;

  const spread = (total: number, apps: number) => {
    const names = Array.from({ length: total }, (_, i) => `app${i % apps}.M${i}`);
    return {
      names,
      relations: [],
      appByModel: new Map(names.map(n => [n, n.split('.')[0]!])),
      boxW: BOX_W,
      boxH: BOX_H,
    };
  };

  it.each([
    [216, 10],
    [216, 5],
    [216, 1],
    [300, 10],
    [400, 12],
    [150, 1],
    [100, 1],
  ])('%i models across %i apps', (total, apps) => {
    const pos = computeLayout(spread(total, apps));
    expect(findOverlaps(pos, BOX_W, BOX_H)).toHaveLength(0);
  });

  it('places every model exactly once', () => {
    const spec = spread(216, 10);
    const pos = computeLayout(spec);
    expect(Object.keys(pos)).toHaveLength(216);
    expect(spec.names.every(n => Number.isFinite(pos[n]?.x))).toBe(true);
  });

  // The relaxation is still doing its job — a relation pulls its two ends
  // closer than the spacing they started at.
  it('still draws related models toward each other', () => {
    const names = ['shop.A', 'shop.B', 'shop.C', 'shop.D'];
    const pos = computeLayout({
      names,
      relations: [{ from: 'shop.A', to: 'shop.D' }],
      appByModel: new Map(names.map(n => [n, 'shop'])),
      boxW: BOX_W,
      boxH: BOX_H,
    });
    const gap = (a: string, b: string) => Math.hypot(pos[a]!.x - pos[b]!.x, pos[a]!.y - pos[b]!.y);
    expect(gap('shop.A', 'shop.D')).toBeLessThan(gap('shop.B', 'shop.C') * 3);
    expect(findOverlaps(pos, BOX_W, BOX_H)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The no-overlap contract, with the relations a real schema has.
//
// The scale suite above passes `relations: []`, and the small-graph case is
// named "for small graph". So the contract was only ever checked where the
// relaxation has nothing to do: a hub with forty spokes — an `auth.User` or a
// tenant model, which every project has — pulled its whole neighbourhood into
// the same coordinates and the diagram drew boxes on top of each other.
//
// The property is stated over SHAPES, not over one corpus: whatever the graph,
// no two boxes may overlap and every model must be placed.
// ─────────────────────────────────────────────────────────────────────────────
describe('no overlaps with relations', () => {
  const BOX_W = 220;
  const BOX_H = 120;

  const layout = (names: string[], relations: Array<{ from: string; to: string }>) =>
    computeLayout({
      names,
      relations,
      appByModel: new Map(names.map(n => [n, n.split('.')[0]!])),
      boxW: BOX_W,
      boxH: BOX_H,
    });

  const model = (app: string, i: number) => `${app}.M${i}`;

  const hub = (spokes: number) => {
    const names = ['core.User', ...Array.from({ length: spokes }, (_, i) => model('shop', i))];
    return { names, relations: names.slice(1).map(n => ({ from: n, to: 'core.User' })) };
  };

  const chain = (n: number) => {
    const names = Array.from({ length: n }, (_, i) => model('shop', i));
    return { names, relations: names.slice(1).map((n2, i) => ({ from: names[i]!, to: n2 })) };
  };

  const dense = (n: number) => {
    const names = Array.from({ length: n }, (_, i) => model('shop', i));
    const relations: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < n; i++) {
      for (let k = 1; k <= 3; k++) relations.push({ from: names[i]!, to: names[(i + k) % n]! });
    }
    return { names, relations };
  };

  const SHAPES: Array<
    [string, { names: string[]; relations: Array<{ from: string; to: string }> }]
  > = [
    ['hub with 40 spokes', hub(40)],
    ['hub with 120 spokes', hub(120)],
    ['chain of 100', chain(100)],
    ['dense graph of 60', dense(60)],
    ['self relation', { names: ['shop.A'], relations: [{ from: 'shop.A', to: 'shop.A' }] }],
    [
      'two-cycle',
      {
        names: ['shop.A', 'shop.B'],
        relations: [
          { from: 'shop.A', to: 'shop.B' },
          { from: 'shop.B', to: 'shop.A' },
        ],
      },
    ],
    [
      'relation to a model that does not exist',
      { names: ['shop.A', 'shop.B'], relations: [{ from: 'shop.A', to: 'shop.Ghost' }] },
    ],
    [
      'duplicate relations',
      {
        names: ['shop.A', 'shop.B'],
        relations: Array.from({ length: 20 }, () => ({ from: 'shop.A', to: 'shop.B' })),
      },
    ],
  ];

  it.each(SHAPES)('%s: no two boxes overlap', (_label, spec) => {
    expect(findOverlaps(layout(spec.names, spec.relations), BOX_W, BOX_H)).toHaveLength(0);
  });

  it.each(SHAPES)('%s: every model is placed exactly once', (_label, spec) => {
    const pos = layout(spec.names, spec.relations);
    expect(Object.keys(pos)).toHaveLength(spec.names.length);
    expect(spec.names.every(n => Number.isFinite(pos[n]?.x) && Number.isFinite(pos[n]?.y))).toBe(
      true,
    );
  });

  // The collapse was not only wrong, it was slow: every spoke landed in the
  // same spatial-grid cell, so the repulsion that the grid exists to keep
  // linear went quadratic and 320 spokes froze the webview for 3.4 seconds.
  // Stated as a RATIO against the same models with NO relations, because that
  // is the actual claim: adding relations must not change the order of the
  // cost. An absolute bound measures the machine and the rest of the suite —
  // this ran at 700 ms alone and 1050 ms beside everything else — while the
  // defect it guards against was a factor, not a hundred milliseconds.
  // There is NO timing test here, on purpose.
  //
  // There was one, and it was removed after failing three runs out of three in
  // the full suite while passing every time alone. Measured in isolation the
  // ratio is 2.68 at 20 spokes, 1.07 at 40 and 0.66 at 80 — comfortably linear,
  // and falling, because fixed costs dominate the small side. Under `npm test`,
  // where vitest runs 123 files across worker threads, the same measurement
  // drifts by more than 8x. It could not tell a defect from a busy machine, and
  // it cost 2.4 s to say so.
  //
  // What replaced it is not another measurement: the cost is bounded by
  // CONSTRUCTION. `relaxRounds` caps the relaxation at 20 rounds for a large
  // graph, `MAX_RESOLVE_PASSES` caps the resolver at 30 and it bails after
  // three passes that make no progress, and `REPEL_BUCKET_LIMIT` caps the work
  // per spatial cell at 24 neighbours — which is the cap that matters, since a
  // degenerate cell is exactly how this went quadratic before.
  //
  // Removing any one of those three brings the quadratic back and nothing here
  // will notice. That gap is recorded in docs/OPEN-FINDINGS.md rather than
  // papered over with a test that flakes.

  it('lays a 320-spoke hub out without overlaps', () => {
    const spec = hub(320);
    expect(findOverlaps(layout(spec.names, spec.relations), BOX_W, BOX_H)).toHaveLength(0);
  });

  // A hub across several apps is the shape a real project actually has.
  it('a hub whose spokes live in many apps still does not overlap', () => {
    const names = ['core.User', ...Array.from({ length: 60 }, (_, i) => model(`app${i % 8}`, i))];
    const relations = names.slice(1).map(n => ({ from: n, to: 'core.User' }));
    expect(findOverlaps(layout(names, relations), BOX_W, BOX_H)).toHaveLength(0);
  });
});
