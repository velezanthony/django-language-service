/**
 * What the scanner is allowed to touch, per pass.
 *
 * Every `stat`, `readFile` and `glob` the scanner issues is a syscall on a
 * laptop and a network round trip on Remote-SSH or in a devcontainer, where the
 * workspace is a bind mount. A save in a 2400-file project fired one `stat` per
 * INDEXED FILE before anything consulted the cache, because the cache key is
 * `(path, mtime)` and the mtime was the thing being fetched. The parse was
 * spared; the walk never was.
 *
 * These tests state budgets as a RULE — "no file the batch was not told about"
 * — rather than pinning the count of one fixture, so they keep holding when the
 * fixture grows and they fail for the reason they exist.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from './file-system';
import { Scanner } from './scanner';
import type { Project } from '$infra/types/project';

// ── Counting file system ──────────────────────────────────────────────────────

/** InMemoryFileSystem that records how many times each port method was used. */
class CountingFileSystem extends InMemoryFileSystem {
  stats = 0;
  reads = 0;
  globs = 0;
  readonly statted: string[] = [];
  readonly read: string[] = [];

  override async stat(path: string) {
    this.stats++;
    this.statted.push(path);
    return super.stat(path);
  }

  override async readFile(path: string): Promise<string> {
    this.reads++;
    this.read.push(path);
    return super.readFile(path);
  }

  override async glob(patterns: readonly string[], excludes: readonly string[]) {
    this.globs++;
    return super.glob(patterns, excludes);
  }

  resetCounters(): void {
    this.stats = 0;
    this.reads = 0;
    this.globs = 0;
    this.statted.length = 0;
    this.read.length = 0;
  }
}

function stubEmitterFactory() {
  return (() => {
    const listeners: Array<(v: unknown) => void> = [];
    return {
      event: (cb: (v: unknown) => void) => {
        listeners.push(cb);
        return { dispose: () => undefined };
      },
      fire: (v: unknown) => {
        for (const l of listeners) l(v);
      },
      dispose: () => {
        listeners.length = 0;
      },
    } as unknown as import('vscode').EventEmitter<unknown>;
  }) as unknown as () => import('vscode').EventEmitter<Project>;
}

// ── A project of the size the finding was measured on ─────────────────────────

const ROOT = '/ws';
/** 400 apps x 6 indexed files. The finding was measured at 3401 stats/batch. */
const APPS = 400;
const FILES_PER_APP = 6;
const FILE_COUNT = APPS * FILES_PER_APP;

function modelsSrc(app: string): string {
  return `
from django.db import models


class ${app}Thing(models.Model):
    title = models.CharField(max_length=200)
`;
}

function buildProject(fs: CountingFileSystem): string[] {
  const paths: string[] = [];
  for (let i = 0; i < APPS; i++) {
    const app = `app${i}`;
    const add = (rel: string, src: string) => {
      const p = `${ROOT}/${app}/${rel}`;
      fs.addFile(p, src, 1000);
      paths.push(p);
    };
    add('models.py', modelsSrc(app));
    add(
      'views.py',
      `
from django.shortcuts import render


def index(request):
    return render(request, '${app}/index.html', {})
`,
    );
    add(
      'urls.py',
      `
from django.urls import path
from . import views

app_name = '${app}'

urlpatterns = [path('', views.index, name='index')]
`,
    );
    add(
      'forms.py',
      `
from django import forms


class ${app}Form(forms.Form):
    name = forms.CharField()
`,
    );
    add(
      'helpers.py',
      `
def ${app}_helper(request):
    return {'a': 1}
`,
    );
    add('templates/index.html', `<h1>${app}</h1>`);
  }
  return paths;
}

/** Every key the project indexes by, sorted — order-independent identity. */
function fingerprintOf(project: Project): string {
  const part = (label: string, keys: readonly string[]) => `${label}:${[...keys].sort().join(',')}`;
  return [
    part(
      'models',
      project.models.all().map(m => `${m.appLabel}.${m.name}@${m.filePath}`),
    ),
    part(
      'views',
      project.views.all().map(v => `${v.appLabel}.${v.name}@${v.filePath}`),
    ),
    part(
      'forms',
      project.forms.all().map(f => `${f.name}@${f.filePath}`),
    ),
    part(
      'templates',
      project.templates.all().map(t => `${t.relativePath || t.filePath}`),
    ),
    part(
      'urls',
      project.urls.all().map(u => u.name),
    ),
    part(
      'helpers',
      project.helpers.all().map(h => `${h.library}.${h.name}`),
    ),
  ].join('\n');
}

function makeScanner(fs: CountingFileSystem): Scanner {
  return new Scanner({ fs, emitterFactory: stubEmitterFactory() });
}

describe('the I/O a pass is allowed to issue', () => {
  it('stats every file it indexes on the first scan, because nothing is known yet', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);

    fs.resetCounters();
    await scanner.scan([ROOT]);

    expect(fs.stats).toBe(FILE_COUNT);
  });

  it('stats no file a content-only batch did not name', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    const saved = `${ROOT}/app7/models.py`;
    fs.addFile(saved, modelsSrc('app7Renamed'), 2000);

    fs.resetCounters();
    await scanner.invalidateBatch([saved], { structural: false });

    expect(fs.statted).toEqual([saved]);
  });

  it('re-globs on no content-only batch, because the file set cannot have moved', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    fs.resetCounters();
    await scanner.invalidateBatch([`${ROOT}/app7/models.py`], { structural: false });

    expect(fs.globs).toBe(0);
  });

  it('reads no file a content-only batch did not name', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    const saved = `${ROOT}/app7/views.py`;
    fs.addFile(saved, `def index(request):\n    return None\n`, 2000);

    fs.resetCounters();
    await scanner.invalidateBatch([saved], { structural: false });

    expect(fs.read).toEqual([saved]);
  });

  it('produces the same index after a save as a scan from cold would', async () => {
    const saved = `${ROOT}/app7/models.py`;
    const newSrc = modelsSrc('app7Renamed');

    const warm = new CountingFileSystem();
    buildProject(warm);
    const warmScanner = makeScanner(warm);
    await warmScanner.scan([ROOT]);
    warm.addFile(saved, newSrc, 2000);
    let incremental: Project | undefined;
    warmScanner.onDidChange(p => {
      incremental = p;
    });
    await warmScanner.invalidateBatch([saved], { structural: false });

    const cold = new CountingFileSystem();
    buildProject(cold);
    cold.addFile(saved, newSrc, 2000);
    const fromScratch = await makeScanner(cold).scan([ROOT]);

    expect(incremental).toBeDefined();
    expect(fingerprintOf(incremental!)).toBe(fingerprintOf(fromScratch));
  });

  it('reflects the new content of the file the batch named', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    const saved = `${ROOT}/app7/models.py`;
    fs.addFile(saved, modelsSrc('Renamed'), 2000);
    let next: Project | undefined;
    scanner.onDidChange(p => {
      next = p;
    });
    await scanner.invalidateBatch([saved], { structural: false });

    const names = next!.models.all().map(m => m.name);
    expect(names).toContain('RenamedThing');
    expect(names).not.toContain('app7Thing');
  });
});

describe('what pass 2 opens when it resolves inheritance', () => {
  it('does not open a models.py whose only unresolved base is Django’s own', async () => {
    const fs = new CountingFileSystem();
    buildProject(fs);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    // A structural pass over a warm cache: pass 1 parses nothing, so every
    // readFile that happens is pass 2 going back to disk.
    fs.resetCounters();
    await scanner.scan([ROOT]);

    expect(fs.read).toEqual([]);
  });

  it('still opens a models.py that names a base the workspace could supply', async () => {
    const fs = new CountingFileSystem();
    fs.addFile(
      `${ROOT}/core/mixins.py`,
      `
from django.db import models


class TimeStamped(models.Model):
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
`,
      1000,
    );
    fs.addFile(
      `${ROOT}/shop/models.py`,
      `
from core.mixins import TimeStamped


class Product(TimeStamped):
    title = models.CharField(max_length=10)
`,
      1000,
    );

    const scanner = makeScanner(fs);
    const project = await scanner.scan([ROOT]);

    const product = project.models.all().find(m => m.name === 'Product');
    expect(product?.fields.map(f => f.name)).toContain('created');
  });
});

describe('Scanner.invalidate, the single-path entry point', () => {
  it('lets a file that did not exist at the first scan enter the index', async () => {
    const fs = new CountingFileSystem();
    fs.addFile(`${ROOT}/shop/models.py`, modelsSrc('Shop'), 1000);
    const scanner = makeScanner(fs);
    await scanner.scan([ROOT]);

    const created = `${ROOT}/blog/models.py`;
    fs.addFile(created, modelsSrc('Blog'), 1001);

    let next: Project | undefined;
    scanner.onDidChange(p => {
      next = p;
    });
    await scanner.invalidate(created);

    expect(next!.models.all().map(m => m.name)).toContain('BlogThing');
  });
});
