/**
 * scanner.integration.test.ts — end-to-end integration tests.
 *
 * Uses InMemoryFileSystem pre-loaded with fixture files read from disk
 * at test load time (Node fs, test scope only). The scanner itself uses
 * the in-memory FS so fast-glob is NOT required to be installed.
 *
 * Fixture: src/infra/__fixtures__/project/apps/blog/
 *
 * Covers (design §8 integration + scenario 10 timing):
 *   Test 1 — full scan returns Project with all entity types
 *   Test 2 — template URL refs resolved (list.html → blog:detail → urls.py)
 *   Test 3 — template extends resolved (list.html extends base.html → no warn)
 *   Test 4 — template includes resolved (list.html includes _header.html → no warn)
 *   Test 5 — scan completes in < 500ms (spec scenario 10)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { InMemoryFileSystem } from './file-system';
import { Scanner } from './scanner';
import type { ScannerOpts } from './scanner';
import type { Project } from '$infra/types/project';

// ── Resolve fixture root at module load time ──────────────────────────────────

// __dirname is available in Node16 CJS (tsconfig module: Node16 with CJS output)
const FIXTURE_ROOT = resolve(__dirname, '__fixtures__/project');

/**
 * Map of virtual paths → file contents.
 * The virtual root is "/fixture" so paths are POSIX absolute
 * and pattern matching works correctly with the scanner.
 */
const VIRTUAL_ROOT = '/fixture';

interface FixtureFile {
  virtual: string;
  real: string;
}

const FIXTURE_FILES: FixtureFile[] = [
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/models.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/models.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/views.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/views.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/urls.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/urls.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/forms.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/forms.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/helpers.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/helpers.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/migrations/0001_initial.py`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/migrations/0001_initial.py'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/templates/blog/base.html`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/templates/blog/base.html'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/templates/blog/_header.html`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/templates/blog/_header.html'),
  },
  {
    virtual: `${VIRTUAL_ROOT}/apps/blog/templates/blog/list.html`,
    real: resolve(FIXTURE_ROOT, 'apps/blog/templates/blog/list.html'),
  },
];

// ── Shared InMemoryFileSystem (built once) ────────────────────────────────────

let sharedFs: InMemoryFileSystem;
let sharedProject: Project;

/**
 * Minimal EventEmitter stub — avoids vscode runtime dependency.
 */
function makeStubEmitter<T>() {
  const listeners: Array<(v: T) => void> = [];
  return {
    event: (cb: (v: T) => void) => {
      listeners.push(cb);
      return {
        dispose: () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
    },
    fire: (v: T) => {
      for (const l of listeners) l(v);
    },
    dispose: () => {
      listeners.length = 0;
    },
  };
}

function makeScanner(fs: InMemoryFileSystem, opts: Partial<ScannerOpts> = {}): Scanner {
  return new Scanner({
    fs,
    emitterFactory: makeStubEmitter as unknown as () => import('vscode').EventEmitter<Project>,
    ...opts,
  });
}

beforeAll(async () => {
  // Build the in-memory FS from fixture files on disk (Node fs, test scope only)
  sharedFs = new InMemoryFileSystem();
  const FAKE_MTIME = 1_700_000_000_000; // stable mtime for all fixture files

  for (const { virtual, real } of FIXTURE_FILES) {
    const content = readFileSync(real, 'utf8');
    sharedFs.addFile(virtual, content, FAKE_MTIME);
  }

  const scanner = makeScanner(sharedFs);
  sharedProject = await scanner.scan([VIRTUAL_ROOT]);
});

// ── Test 1: Full scan — all entity types present ──────────────────────────────

describe('Integration — Test 1: full scan entity counts', () => {
  it('returns Project with at least 1 model, 2 views, 1 url-pattern, 1 form, 1 migration, 1 helper, 3 templates', () => {
    expect(sharedProject.models.all().length).toBeGreaterThanOrEqual(1);
    expect(sharedProject.views.all().length).toBeGreaterThanOrEqual(2);
    expect(sharedProject.urls.all().length).toBeGreaterThanOrEqual(1);
    expect(sharedProject.forms.all().length).toBeGreaterThanOrEqual(1);
    expect(sharedProject.migrations.all().length).toBeGreaterThanOrEqual(1);
    expect(sharedProject.helpers.all().length).toBeGreaterThanOrEqual(1);
    expect(sharedProject.templates.all().length).toBeGreaterThanOrEqual(3);
  });
});

// ── Test 2: Template URL ref resolved ─────────────────────────────────────────

describe('Integration — Test 2: template URL refs resolved', () => {
  it('list.html uses {% url blog:detail %} and blog:detail exists in urlIndex', () => {
    // blog:detail is defined in urls.py (name='detail', app_name='blog')
    const detailUrl = sharedProject.urls.byKey('blog:detail');
    expect(detailUrl).toBeDefined();
    expect(detailUrl?.name).toBe('blog:detail');
  });

  it('does not emit URL-resolution warnings for blog:detail', () => {
    const warnings: string[] = [];
    const fs = new InMemoryFileSystem();
    for (const { virtual, real } of FIXTURE_FILES) {
      fs.addFile(virtual, readFileSync(real, 'utf8'), 1_700_000_000_000);
    }

    const scanner = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    return scanner.scan([VIRTUAL_ROOT]).then(() => {
      const urlWarnings = warnings.filter(
        w => w.includes('unresolved URL ref') && w.includes('blog:detail'),
      );
      expect(urlWarnings).toHaveLength(0);
    });
  });
});

// ── Test 3: Template extends resolved ─────────────────────────────────────────

describe('Integration — Test 3: template extends resolved', () => {
  it('list.html extends blog/base.html — no extends warning emitted', () => {
    // Verify base.html is in the template index
    const allTemplates = sharedProject.templates.all();
    const baseTemplate = allTemplates.find(
      t => t.filePath.endsWith('base.html') && t.filePath.includes('blog'),
    );
    expect(baseTemplate).toBeDefined();
  });

  it('does not warn about extends for list.html → base.html', () => {
    const warnings: string[] = [];
    const fs = new InMemoryFileSystem();
    for (const { virtual, real } of FIXTURE_FILES) {
      fs.addFile(virtual, readFileSync(real, 'utf8'), 1_700_000_000_000);
    }

    const scanner = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    return scanner.scan([VIRTUAL_ROOT]).then(() => {
      const extendsWarnings = warnings.filter(
        w => w.includes('extends') && w.includes('base.html'),
      );
      expect(extendsWarnings).toHaveLength(0);
    });
  });
});

// ── Test 4: Template includes resolved ────────────────────────────────────────

describe('Integration — Test 4: template includes resolved', () => {
  it('list.html includes blog/_header.html — no include warning emitted', () => {
    const allTemplates = sharedProject.templates.all();
    const headerTemplate = allTemplates.find(t => t.filePath.endsWith('_header.html'));
    expect(headerTemplate).toBeDefined();
  });

  it('does not warn about include for list.html → _header.html', () => {
    const warnings: string[] = [];
    const fs = new InMemoryFileSystem();
    for (const { virtual, real } of FIXTURE_FILES) {
      fs.addFile(virtual, readFileSync(real, 'utf8'), 1_700_000_000_000);
    }

    const scanner = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    return scanner.scan([VIRTUAL_ROOT]).then(() => {
      const includeWarnings = warnings.filter(
        w => w.includes('include') && w.includes('_header.html'),
      );
      expect(includeWarnings).toHaveLength(0);
    });
  });
});

// ── Test 5: Performance — scan completes in < 500ms (scenario 10) ─────────────

describe('Integration — Test 5: scan performance < 500ms (scenario 10)', () => {
  it('scans the fixture project in under 500ms', async () => {
    const fs = new InMemoryFileSystem();
    for (const { virtual, real } of FIXTURE_FILES) {
      fs.addFile(virtual, readFileSync(real, 'utf8'), 1_700_000_000_000);
    }

    const scanner = makeScanner(fs);
    const start = performance.now();
    await scanner.scan([VIRTUAL_ROOT]);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
