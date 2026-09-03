import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { InMemoryFileSystem, NodeFileSystem } from './file-system';

// ── InMemoryFileSystem — readFile ──────────────────────────────────────────────

describe('InMemoryFileSystem — readFile', () => {
  it('returns content on hit', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('app/models.py', 'class Post: pass');
    await expect(fs.readFile('app/models.py')).resolves.toBe('class Post: pass');
  });

  it('throws on miss', async () => {
    const fs = new InMemoryFileSystem();
    await expect(fs.readFile('missing.py')).rejects.toThrow(/not found/);
  });
});

// ── InMemoryFileSystem — glob ──────────────────────────────────────────────────

describe('InMemoryFileSystem — glob', () => {
  it('returns only matching paths for a single pattern', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/blog/models.py', '');
    fs.addFile('/workspace/blog/views.py', '');
    fs.addFile('/workspace/blog/templates/index.html', '');
    fs.addFile('/workspace/auth/models.py', '');
    fs.addFile('/workspace/auth/views.py', '');

    const result = await fs.glob(['**/models.py'], []);
    expect(result).toHaveLength(2);
    expect(result).toContain('/workspace/blog/models.py');
    expect(result).toContain('/workspace/auth/models.py');
  });

  it('returns multiple pattern matches without duplicates', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/blog/models.py', '');
    fs.addFile('/workspace/blog/views.py', '');
    fs.addFile('/workspace/blog/templates/index.html', '');

    const result = await fs.glob(['**/models.py', '**/views.py'], []);
    expect(result).toHaveLength(2);
  });

  it('honours excludes', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/blog/models.py', '');
    fs.addFile('/workspace/venv/blog/models.py', '');

    const result = await fs.glob(['**/models.py'], ['**/venv/**']);
    expect(result).toHaveLength(1);
    expect(result).toContain('/workspace/blog/models.py');
  });

  it('returns html files matching html pattern', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/templates/blog/index.html', '');
    fs.addFile('/workspace/templates/blog/detail.html', '');
    fs.addFile('/workspace/blog/models.py', '');

    const result = await fs.glob(['**/templates/**/*.html'], []);
    expect(result).toHaveLength(2);
  });

  it('returns empty when no files match', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/blog/models.py', '');

    const result = await fs.glob(['**/*.html'], []);
    expect(result).toHaveLength(0);
  });
});

// ── InMemoryFileSystem — stat ──────────────────────────────────────────────────

describe('InMemoryFileSystem — stat', () => {
  it('returns mtime for existing file', async () => {
    const fs = new InMemoryFileSystem();
    const mtime = 1_700_000_000_000;
    fs.addFile('/workspace/blog/models.py', 'content', mtime);

    const result = await fs.stat('/workspace/blog/models.py');
    expect(result).not.toBeNull();
    expect(result!.mtime).toBe(mtime);
    expect(result!.size).toBeGreaterThan(0);
  });

  it('returns null for missing file', async () => {
    const fs = new InMemoryFileSystem();
    await expect(fs.stat('/workspace/missing.py')).resolves.toBeNull();
  });
});

// ── InMemoryFileSystem — helpers ───────────────────────────────────────────────

describe('InMemoryFileSystem — helpers', () => {
  it('removeFile makes file inaccessible', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/blog/views.py', 'content');
    fs.removeFile('/workspace/blog/views.py');
    await expect(fs.readFile('/workspace/blog/views.py')).rejects.toThrow();
  });

  it('clear() empties everything', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/workspace/a.py', '');
    fs.addFile('/workspace/b.py', '');
    fs.clear();
    const result = await fs.glob(['**/*.py'], []);
    expect(result).toHaveLength(0);
  });
});

// ── NodeFileSystem — stat on real file ────────────────────────────────────────

describe('NodeFileSystem — stat', () => {
  it('returns mtime+size for package.json (real file)', async () => {
    const pkgPath = resolve(__dirname, '../../package.json');
    const nfs = new NodeFileSystem();
    const result = await nfs.stat(pkgPath);
    expect(result).not.toBeNull();
    expect(result!.mtime).toBeGreaterThan(0);
    expect(result!.size).toBeGreaterThan(0);

    // Cross-check with node fs
    const nodeStat = statSync(pkgPath);
    expect(result!.mtime).toBeCloseTo(nodeStat.mtimeMs, 0);
  });

  it('returns null for non-existent path', async () => {
    const nfs = new NodeFileSystem();
    const result = await nfs.stat('/this/path/does/not/exist.py');
    expect(result).toBeNull();
  });
});
