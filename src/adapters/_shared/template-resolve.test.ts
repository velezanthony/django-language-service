/**
 * Clearing the cache has to beat the lookup that is already running.
 *
 * `clearTemplateResolveCache()` is called when a scan reports new project
 * contents — a file was created, so a path that missed must become resolvable
 * without waiting out the 30s TTL. But `resolveTemplatePath` awaits
 * `findFiles` and THEN writes the answer into the map, so a lookup that started
 * before the clear stored its pre-clear answer after it, re-pinning the stale
 * result for a fresh 30 seconds. The clear appeared to work and did nothing.
 *
 * The rule is about ORDERING, not about a particular file: a result computed
 * before a clear must never be stored after it. The last two are its guard —
 * results no clear crossed must still be cached, or "fixing" this would just be
 * deleting the cache.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted above every import below, so the resolver loads against the double.
vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import { Uri, setFindFiles } from '$adapters/_shared/__fixtures__/vscode-double';

import { resolveTemplatePath, clearTemplateResolveCache } from './template-resolve';

type Files = Uri[];

/** `findFiles` answering `path` for the first glob it is handed. */
const answering = (path: string) => () => Promise.resolve([Uri.file(path)]);

/**
 * `findFiles` that hangs on its FIRST call and answers `[]` for the rest.
 *
 * `resolveTemplatePath` tries five globs in series, so gating only the first
 * one is what lets a test settle a lookup as either a hit (a file) or a miss
 * (nothing) without deadlocking on the remaining four.
 */
function gatedFindFiles(): { impl: () => Promise<Files>; settle: (files: Files) => void } {
  let release: ((files: Files) => void) | undefined;
  let first = true;
  return {
    impl: () => {
      if (!first) return Promise.resolve([]);
      first = false;
      return new Promise<Files>(resolve => {
        release = resolve;
      });
    },
    settle: files => release?.(files),
  };
}

beforeEach(() => {
  clearTemplateResolveCache();
  setFindFiles(() => Promise.resolve([]));
});

describe('a clear invalidates lookups already in flight', () => {
  it('does not store a HIT computed before the clear', async () => {
    const gate = gatedFindFiles();
    setFindFiles(gate.impl);

    const inFlight = resolveTemplatePath('page.html');
    clearTemplateResolveCache();
    gate.settle([Uri.file('/w/templates/stale.html')]);
    await inFlight;

    setFindFiles(answering('/w/templates/fresh.html'));
    expect((await resolveTemplatePath('page.html'))?.fsPath).toBe('/w/templates/fresh.html');
  });

  // "Searched, found nothing" is a cached answer too, and it is the one a newly
  // created file has to be able to displace — the case the clear exists for.
  it('does not store a MISS computed before the clear', async () => {
    const gate = gatedFindFiles();
    setFindFiles(gate.impl);

    const inFlight = resolveTemplatePath('new.html');
    clearTemplateResolveCache();
    gate.settle([]);
    expect(await inFlight).toBeUndefined();

    setFindFiles(answering('/w/templates/new.html'));
    expect((await resolveTemplatePath('new.html'))?.fsPath).toBe('/w/templates/new.html');
  });

  it('still caches a result no clear crossed', async () => {
    setFindFiles(answering('/w/templates/first.html'));
    expect((await resolveTemplatePath('cached.html'))?.fsPath).toBe('/w/templates/first.html');

    setFindFiles(answering('/w/templates/second.html'));
    expect((await resolveTemplatePath('cached.html'))?.fsPath).toBe('/w/templates/first.html');
  });

  it('drops a settled result when the clear comes after it', async () => {
    setFindFiles(answering('/w/templates/first.html'));
    await resolveTemplatePath('dropped.html');

    clearTemplateResolveCache();
    setFindFiles(answering('/w/templates/second.html'));
    expect((await resolveTemplatePath('dropped.html'))?.fsPath).toBe('/w/templates/second.html');
  });
});
