/**
 * The cache stops working at 2001 files.
 *
 * `ParseCache` is created with a fixed cap of 2000 and pass1 walks every file
 * in the same order each time. A sequential sweep longer than the cache evicts
 * each entry just before the next pass asks for it, so above the cap the hit
 * rate does not degrade — it goes to ZERO. Measured on an unchanged project:
 * 1999 files re-parsed 0, 2000 re-parsed 0, 2001 re-parsed 42, 2050 re-parsed
 * all 2050. Saving one file in a project of 2400 re-parsed 2400.
 *
 * This is not the eviction policy. LRU and FIFO both lose a sequential sweep
 * bigger than the cache; the fixed cap is the defect. The cache has to be at
 * least as large as the working set it was built for, and the scanner knows
 * that number the moment it finishes globbing.
 */
import { describe, it, expect, vi } from 'vitest';
import { InMemoryFileSystem } from './file-system';
import { Scanner } from './scanner';
import { ParseCache } from './cache';
import type { Model } from '$domain/types/model';
import type { ParseResult } from '$domain/contracts/parser';

function stubEmitterFactory() {
  return (() => {
    const listeners: Array<(v: unknown) => void> = [];
    return {
      event: (cb: (v: unknown) => void) => {
        listeners.push(cb);
        return {
          dispose: () => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
          },
        };
      },
      fire: (v: unknown) => {
        for (const l of listeners) l(v);
      },
      dispose: () => {
        listeners.length = 0;
      },
    } as unknown as import('vscode').EventEmitter<unknown>;
  }) as unknown as () => import('vscode').EventEmitter<import('$infra/types/project').Project>;
}

const MODELS = 'class Post(models.Model):\n    pass\n';

/** Parser calls on a SECOND scan of an unchanged project of `fileCount` files. */
async function reparsesOnSecondScan(fileCount: number): Promise<number> {
  const fs = new InMemoryFileSystem();
  for (let i = 0; i < fileCount; i++) fs.addFile(`/ws/app${i}/models.py`, MODELS, 1000 + i);

  const models = vi.fn((): ParseResult<Model[]> => ({ ok: true, value: [] }));
  const scanner = new Scanner({
    fs,
    parsers: { models: models as never },
    emitterFactory: stubEmitterFactory(),
  });

  await scanner.scan(['/ws']);
  models.mockClear();
  await scanner.scan(['/ws']);
  return models.mock.calls.length;
}

describe('the cache keeps working past its default size', () => {
  it('re-parses nothing below the old cap', async () => {
    expect(await reparsesOnSecondScan(50)).toBe(0);
  });

  it('re-parses nothing ABOVE the old cap', async () => {
    expect(await reparsesOnSecondScan(2400)).toBe(0);
  }, 60_000);

  it('has no cliff anywhere around the old cap', async () => {
    for (const count of [1990, 2000, 2010, 2100]) {
      expect(await reparsesOnSecondScan(count), `${count} files`).toBe(0);
    }
  }, 120_000);
});

describe('ParseCache capacity', () => {
  it('can be grown to fit a working set', () => {
    const cache = new ParseCache<string>(2);
    cache.ensureCapacity(4);
    for (let i = 0; i < 4; i++) cache.set(`f${i}`, 1, `v${i}`);
    for (let i = 0; i < 4; i++) expect(cache.get(`f${i}`, 1)).toBe(`v${i}`);
  });

  it('never shrinks below what it already holds', () => {
    const cache = new ParseCache<string>(10);
    cache.ensureCapacity(2);
    for (let i = 0; i < 10; i++) cache.set(`f${i}`, 1, `v${i}`);
    expect(cache.get('f0', 1)).toBe('v0');
  });
});
