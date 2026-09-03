/**
 * A file the scanner will not read.
 *
 * There was no size limit anywhere in the project. The scanner globs every
 * `models.py`, `views.py`, `urls.py` and template under the workspace and reads
 * each one whole, so a single enormous file — a generated migration, a vendored
 * bundle a template glob happens to reach, a repo that is not ours at all —
 * bought an unbounded string and a parse over it, on the extension host.
 *
 * The size was already in hand: `stat()` returns `{ mtime, size }` on all three
 * FileSystem implementations, and the scanner was throwing `size` away one line
 * before the `readFile`.
 */
import { describe, it, expect, vi } from 'vitest';
import { InMemoryFileSystem } from './file-system';
import { Scanner, MAX_PARSED_FILE_BYTES } from './scanner';
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

const SMALL_MODELS = 'class Post(models.Model):\n    pass\n';

describe('the scanner refuses to read a file past the size limit', () => {
  const build = (fs: InMemoryFileSystem) => {
    const warnings: string[] = [];
    const models = vi.fn((): ParseResult<Model[]> => ({ ok: true, value: [] }));
    const scanner = new Scanner({
      fs,
      parsers: { models: models as never },
      logger: { warn: (m: string) => warnings.push(m) },
      emitterFactory: stubEmitterFactory(),
    });
    return { scanner, models, warnings };
  };

  it('exposes a limit that is generous for source and far below a runaway file', () => {
    expect(MAX_PARSED_FILE_BYTES).toBeGreaterThan(1_000_000);
    expect(MAX_PARSED_FILE_BYTES).toBeLessThan(50_000_000);
  });

  it('does not parse a file over the limit', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', 'x'.repeat(MAX_PARSED_FILE_BYTES + 1), 1000);

    const { scanner, models, warnings } = build(fs);
    await scanner.scan(['/ws']);

    expect(models).not.toHaveBeenCalled();
    expect(warnings.join('\n')).toContain('/ws/blog/models.py');
  });

  it('still parses a file under the limit', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', SMALL_MODELS, 1000);

    const { scanner, models } = build(fs);
    await scanner.scan(['/ws']);

    expect(models).toHaveBeenCalledTimes(1);
  });

  it('skipping one oversized file does not stop the scan', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/huge/models.py', 'x'.repeat(MAX_PARSED_FILE_BYTES + 1), 1000);
    fs.addFile('/ws/blog/models.py', SMALL_MODELS, 1001);

    const { scanner, models } = build(fs);
    await scanner.scan(['/ws']);

    expect(models).toHaveBeenCalledTimes(1);
  });
});
