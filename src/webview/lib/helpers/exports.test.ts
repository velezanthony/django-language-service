/**
 * Loading a layout file is the one place the diagram takes structured input
 * from outside itself. The parser accepted anything with a truthy `positions`
 * and handed it straight to the position store, so a hand-edited or
 * hand-crafted file could write `undefined`, a string, or NaN into coordinates
 * that are then persisted — wedging the saved state of the diagram until the
 * user found and cleared it.
 */
import { describe, it, expect } from 'vitest';
import { buildLayoutJson, parseLayoutPayload } from './exports';

import { LAYOUT_VERSION } from '$lib/composables/persistence';

describe('parseLayoutPayload', () => {
  it('round-trips what buildLayoutJson wrote', () => {
    const json = buildLayoutJson(LAYOUT_VERSION, { 'blog.Post': { x: 10, y: 20 } });
    expect(parseLayoutPayload(json).positions).toEqual({ 'blog.Post': { x: 10, y: 20 } });
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseLayoutPayload('not json')).toThrow();
  });

  it('rejects a payload with no positions', () => {
    expect(() => parseLayoutPayload(JSON.stringify({ version: LAYOUT_VERSION }))).toThrow();
  });

  it('rejects a version it does not understand', () => {
    const json = JSON.stringify({ version: 99, positions: {}, exportedAt: '' });
    expect(() => parseLayoutPayload(json)).toThrow(/version/i);
  });

  it('rejects positions that are not objects', () => {
    const json = JSON.stringify({
      version: LAYOUT_VERSION,
      positions: { 'blog.Post': 'nope' },
      exportedAt: '',
    });
    expect(() => parseLayoutPayload(json)).toThrow();
  });

  it('rejects a coordinate that is not a number', () => {
    const json = JSON.stringify({
      version: LAYOUT_VERSION,
      positions: { 'blog.Post': { x: '10', y: 20 } },
      exportedAt: '',
    });
    expect(() => parseLayoutPayload(json)).toThrow();
  });

  it('rejects NaN and Infinity, which JSON smuggles in as null or strings', () => {
    const nan = JSON.stringify({
      version: LAYOUT_VERSION,
      positions: { a: { x: null, y: 0 } },
      exportedAt: '',
    });
    expect(() => parseLayoutPayload(nan)).toThrow();
  });

  it('rejects a positions map that is an array', () => {
    const json = JSON.stringify({ version: LAYOUT_VERSION, positions: [], exportedAt: '' });
    expect(() => parseLayoutPayload(json)).toThrow();
  });

  it('keeps a valid payload with several boxes', () => {
    const json = buildLayoutJson(LAYOUT_VERSION, {
      'blog.Post': { x: 0, y: 0 },
      'shop.Order': { x: -5.5, y: 12.25 },
    });
    expect(Object.keys(parseLayoutPayload(json).positions)).toHaveLength(2);
  });
});
