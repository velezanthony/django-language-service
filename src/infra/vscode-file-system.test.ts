import { describe, it, expect, vi } from 'vitest';
import { VsCodeFileSystem } from './vscode-file-system';

// The adapter takes its vscode slice by injection, so the whole translation
// (RelativePattern per include, brace-joined excludes, de-duplication) is
// verifiable without an extension host.

function makeApi(filesByPattern: Record<string, string[]> = {}) {
  const calls: { base: string; pattern: string; exclude: string | null }[] = [];

  class RelativePattern {
    constructor(
      readonly base: string,
      readonly pattern: string,
    ) {}
  }

  const api = {
    workspace: {
      findFiles: vi.fn(async (include: unknown, exclude?: string | null) => {
        const rp = include as RelativePattern;
        calls.push({ base: rp.base, pattern: rp.pattern, exclude: exclude ?? null });
        return (filesByPattern[rp.pattern] ?? []).map(fsPath => ({ fsPath }));
      }),
      fs: {
        readFile: vi.fn(async () => new TextEncoder().encode('# hello ñ')),
        stat: vi.fn(async () => ({ mtime: 1234, size: 42 })),
      },
    },
    RelativePattern,
    Uri: { file: (path: string) => ({ path }) },
  };

  return { api, calls };
}

describe('VsCodeFileSystem.glob', () => {
  it('issues one findFiles per include pattern, with the right base', async () => {
    const { api, calls } = makeApi();
    const fs = new VsCodeFileSystem(api as never);

    await fs.glob(['/w/proj/**/models.py', '/w/proj/**/templates/**/*.html'], []);

    expect(calls).toEqual([
      { base: '/w/proj', pattern: '**/models.py', exclude: null },
      { base: '/w/proj', pattern: '**/templates/**/*.html', exclude: null },
    ]);
  });

  it('collapses the exclude list into one brace alternation', async () => {
    const { api, calls } = makeApi();
    const fs = new VsCodeFileSystem(api as never);

    await fs.glob(['/w/**/models.py'], ['**/.venv/**', '**/node_modules/**']);

    expect(calls[0]?.exclude).toBe('{**/.venv/**,**/node_modules/**}');
  });

  it('de-duplicates files matched by more than one pattern', async () => {
    // A package named `views/` holding a `views.py` matches both globs.
    const { api } = makeApi({
      '**/views.py': ['/w/shop/views/views.py'],
      '**/views/**/*.py': ['/w/shop/views/views.py', '/w/shop/views/detail.py'],
    });
    const fs = new VsCodeFileSystem(api as never);

    const found = await fs.glob(['/w/**/views.py', '/w/**/views/**/*.py'], []);

    expect([...found].sort()).toEqual(['/w/shop/views/detail.py', '/w/shop/views/views.py']);
  });

  it('normalises windows separators in results', async () => {
    const { api } = makeApi({ '**/models.py': ['C:\\w\\shop\\models.py'] });
    const fs = new VsCodeFileSystem(api as never);

    expect(await fs.glob(['C:/w/**/models.py'], [])).toEqual(['C:/w/shop/models.py']);
  });
});

describe('VsCodeFileSystem.readFile', () => {
  it('decodes bytes as utf-8', async () => {
    const { api } = makeApi();
    const fs = new VsCodeFileSystem(api as never);
    expect(await fs.readFile('/w/a.py')).toBe('# hello ñ');
  });
});

describe('VsCodeFileSystem.stat', () => {
  it('maps mtime and size straight through', async () => {
    const { api } = makeApi();
    const fs = new VsCodeFileSystem(api as never);
    expect(await fs.stat('/w/a.py')).toEqual({ mtime: 1234, size: 42 });
  });

  it('returns null for a missing file rather than throwing', async () => {
    const { api } = makeApi();
    api.workspace.fs.stat = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const fs = new VsCodeFileSystem(api as never);
    expect(await fs.stat('/w/gone.py')).toBeNull();
  });
});
