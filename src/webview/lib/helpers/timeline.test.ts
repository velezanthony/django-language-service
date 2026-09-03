import { describe, it, expect } from 'vitest';
import { classifyTimelineBoxes, oneHopNeighbours, matchesStepModel } from './timeline';

const KEYS = ['billing.Coupon', 'billing.Payment', 'orders.Order', 'crm.Lead', 'shop.Product'];

// Order -> Coupon, Order -> Payment, Lead -> Order (two hops from Coupon).
const RELATIONS = [
  { from: 'orders.Order', to: 'billing.Coupon' },
  { from: 'orders.Order', to: 'billing.Payment' },
  { from: 'crm.Lead', to: 'orders.Order' },
];

const emptyDiff = {
  addedModels: [] as string[],
  removedModels: [] as string[],
  addedFields: [] as { model: string }[],
  alteredFields: [] as { model: string }[],
  renamedFields: [] as { model: string }[],
};

describe('oneHopNeighbours', () => {
  it('walks both directions of a relation', () => {
    expect(oneHopNeighbours(new Set(['billing.Coupon']), RELATIONS)).toEqual(
      new Set(['orders.Order']),
    );
  });

  it('never returns a member of the touched set', () => {
    const touched = new Set(['orders.Order', 'billing.Coupon']);
    expect(oneHopNeighbours(touched, RELATIONS).has('orders.Order')).toBe(false);
  });

  it('stops at one hop', () => {
    // Lead is two hops from Coupon (Lead -> Order -> Coupon).
    expect(oneHopNeighbours(new Set(['billing.Coupon']), RELATIONS).has('crm.Lead')).toBe(false);
  });

  it('returns nothing without relations', () => {
    expect(oneHopNeighbours(new Set(['billing.Coupon']), []).size).toBe(0);
  });
});

describe('classifyTimelineBoxes — one-hop context', () => {
  const diff = { ...emptyDiff, alteredFields: [{ model: 'Coupon' }] };

  it('marks the touched model as changed, not context', () => {
    const f = classifyTimelineBoxes(KEYS, diff, 'billing', RELATIONS);
    expect(f['billing.Coupon']).toMatchObject({ tlChanged: true, tlContext: false });
  });

  it('reveals the direct neighbour as context', () => {
    const f = classifyTimelineBoxes(KEYS, diff, 'billing', RELATIONS);
    expect(f['orders.Order']).toMatchObject({ hidden: false, tlContext: true });
  });

  it('leaves everything beyond one hop hidden', () => {
    const f = classifyTimelineBoxes(KEYS, diff, 'billing', RELATIONS);
    expect(f['crm.Lead']).toMatchObject({ hidden: true });
    expect(f['shop.Product']).toMatchObject({ hidden: true });
  });

  // A neighbour that the same step also changed must keep its own status —
  // promoting it to context would demote a real change to background.
  it('does not downgrade a touched neighbour to context', () => {
    const both = { ...emptyDiff, alteredFields: [{ model: 'Coupon' }, { model: 'Order' }] };
    const f = classifyTimelineBoxes(KEYS, both, '', RELATIONS);
    expect(f['orders.Order']).toMatchObject({ tlChanged: true, tlContext: false });
  });

  it('gives removed models a context ring too', () => {
    const removed = { ...emptyDiff, removedModels: ['Coupon'] };
    const f = classifyTimelineBoxes(KEYS, removed, 'billing', RELATIONS);
    expect(f['billing.Coupon']).toMatchObject({ tlRemoved: true });
    expect(f['orders.Order']).toMatchObject({ tlContext: true });
  });

  // Without relations the behaviour must be exactly what it was before.
  it('hides everything untouched when no relations are supplied', () => {
    const f = classifyTimelineBoxes(KEYS, diff, 'billing');
    expect(f['orders.Order']).toMatchObject({ hidden: true });
  });
});

describe('matchesStepModel', () => {
  it('matches the lowercased bare name migrations use', () => {
    expect(matchesStepModel('billing.Coupon', 'coupon', 'billing')).toBe(true);
  });

  it('refuses a same-named model in another app', () => {
    expect(matchesStepModel('shop.Coupon', 'coupon', 'billing')).toBe(false);
  });
});
