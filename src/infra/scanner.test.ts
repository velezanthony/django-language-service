/**
 * scanner.test.ts — vitest tests for Scanner (pass 1 + pass 2).
 * Uses InMemoryFileSystem + parser spies. No disk I/O. No vscode runtime.
 *
 * Covers:
 *   Scenario 11 — happy path: counts match fixture
 *   Scenario 12 — cache hit skips parser
 *   Scenario 13 — invalidateBatch triggers partial re-scan
 *   Scenario 14 — cross-file URL ref: found ref → warn not emitted
 *   Scenario 15 — unresolvable URL ref → warn emitted
 *   Scenario 16 — empty roots → empty Project
 *   Scenario 17 — onDidChange fires on scan
 *   Scenario 18 — onDidChange fires after invalidateBatch
 */

import { describe, it, expect, vi } from 'vitest';
import { InMemoryFileSystem } from './file-system';
import { Scanner } from './scanner';
import type { ScannerOpts } from './scanner';
import type { ParserRegistry } from './scanner';
import type { Model } from '$domain/types/model';
import type { ParseResult } from '$domain/contracts/parser';

// ── Minimal fixture source strings ────────────────────────────────────────────

const MODELS_SRC = `
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=200)
    status = models.CharField(max_length=10)
`;

const VIEWS_SRC = `
from django.shortcuts import render

def index(request):
    return render(request, 'blog/index.html', {})

def detail(request, pk):
    return render(request, 'blog/detail.html', {})
`;

const TEMPLATE_SRC = `
{% extends "base.html" %}
{% block content %}
<a href="{% url 'blog:index' %}">Home</a>
{% endblock %}
`;

const URLS_SRC = `
from django.urls import path
from . import views

app_name = 'blog'

urlpatterns = [
    path('', views.index, name='index'),
    path('detail/<int:pk>/', views.detail, name='detail'),
]
`;

// ── Helper: build a Scanner with stub emitter ─────────────────────────────────

function makeScanner(
  fs: InMemoryFileSystem,
  overrides: Partial<ScannerOpts & { parsers?: Partial<ParserRegistry> }> = {},
) {
  const events: unknown[] = [];
  const emitterFactory = () => {
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
        events.push(v);
        for (const l of listeners) l(v);
      },
      dispose: () => {
        listeners.length = 0;
      },
    } as unknown as import('vscode').EventEmitter<unknown>;
  };

  const scanner = new Scanner({
    fs,
    emitterFactory: emitterFactory as unknown as () => import('vscode').EventEmitter<
      import('$infra/types/project').Project
    >,
    ...overrides,
  });

  return { scanner, events };
}

// ── Scenario 11: Happy path counts ────────────────────────────────────────────

describe('Scanner — Scenario 11: happy path counts', () => {
  it('returns Project with correct entity counts from fixture', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/blog/views.py', VIEWS_SRC, 1001);
    fs.addFile('/ws/blog/templates/blog/index.html', TEMPLATE_SRC, 1002);
    fs.addFile('/ws/blog/templates/blog/detail.html', '{% block content %}{% endblock %}', 1003);
    fs.addFile('/ws/blog/templates/blog/base.html', '{% block content %}{% endblock %}', 1004);

    const { scanner } = makeScanner(fs);
    const project = await scanner.scan(['/ws']);

    expect(project.models.all().length).toBeGreaterThanOrEqual(1); // Post
    expect(project.views.all().length).toBeGreaterThanOrEqual(1); // index + detail
    expect(project.templates.all().length).toBe(3); // 3 html files
  });
});

// ── Scenario 12: Cache hit skips parser ───────────────────────────────────────

describe('Scanner — Scenario 12: cache hit skips parser', () => {
  it('does not call the parser a second time when file is unchanged', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const modelsSpy = vi.fn((_src: string, _opts?: unknown): ParseResult<Model[]> => ({
      ok: true,
      value: [
        {
          kind: 'model',
          name: 'Post',
          appLabel: 'blog',
          filePath: '/ws/blog/models.py',
          line: 4,
          fields: [],
          relations: [],
          properties: [],
        },
      ],
    }));

    const { scanner } = makeScanner(fs, {
      parsers: { models: modelsSpy as unknown as typeof import('$domain/parsers').parseModels },
    });

    // First scan — parser called once
    await scanner.scan(['/ws']);
    expect(modelsSpy).toHaveBeenCalledTimes(1);

    // Second scan — same mtime → cache hit → parser NOT called again
    await scanner.scan(['/ws']);
    expect(modelsSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Scenario 13: invalidateBatch triggers re-parse ────────────────────────────

describe('Scanner — Scenario 13: invalidateBatch triggers partial re-scan', () => {
  it('re-parses only invalidated file and emits new Project', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/blog/views.py', VIEWS_SRC, 1001);

    const modelsSpy = vi.fn((_src: string, _opts?: unknown): ParseResult<Model[]> => ({
      ok: true,
      value: [
        {
          kind: 'model',
          name: 'Post',
          appLabel: 'blog',
          filePath: '/ws/blog/models.py',
          line: 4,
          fields: [],
          relations: [],
          properties: [],
        },
      ],
    }));

    const { scanner, events } = makeScanner(fs, {
      parsers: { models: modelsSpy as unknown as typeof import('$domain/parsers').parseModels },
    });

    await scanner.scan(['/ws']);
    expect(modelsSpy).toHaveBeenCalledTimes(1);

    // Simulate file change: update mtime
    fs.addFile('/ws/blog/models.py', MODELS_SRC + '\n# updated', 2000);

    await scanner.invalidateBatch(['/ws/blog/models.py']);

    // After invalidate: models.py should be re-parsed (cache invalidated + new mtime)
    expect(modelsSpy).toHaveBeenCalledTimes(2);
    // A new Project event should have been emitted (2 total: initial scan + after invalidate)
    expect(events.length).toBe(2);
  });
});

// ── Scenario 14: Cross-file URL ref found ─────────────────────────────────────

describe('Scanner — Scenario 14: URL ref resolved against urlIndex', () => {
  it('does not warn when URL ref exists in urlIndex', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/urls.py', URLS_SRC, 1000);
    fs.addFile('/ws/blog/templates/blog/index.html', TEMPLATE_SRC, 1001);

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    const project = await scanner.scan(['/ws']);

    // The template uses {% url 'blog:index' %} — urls.py defines name='index' with app_name='blog'
    // so urlIndex should have key 'blog:index'
    const urlEntry = project.urls.byKey('blog:index');
    // URL resolution warning should NOT fire for a resolvable URL
    const urlWarnings = warnings.filter(
      w => w.includes('unresolved URL ref') && w.includes('blog:index'),
    );
    expect(urlWarnings.length).toBe(0);
    expect(urlEntry).toBeDefined();
  });
});

// ── Scenario 15: Unresolvable URL ref → warn ──────────────────────────────────

describe('Scanner — Scenario 15: unresolvable URL ref emits warning', () => {
  it('emits a warning when template uses unknown URL ref', async () => {
    const fs = new InMemoryFileSystem();

    const templateWithBadUrl = `
{% extends "base.html" %}
{% block content %}
<a href="{% url 'nonexistent:route' %}">Click</a>
{% endblock %}
`;

    fs.addFile('/ws/blog/templates/blog/broken.html', templateWithBadUrl, 1000);
    // No urls.py — so no URL entries

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    await scanner.scan(['/ws']);

    const urlWarnings = warnings.filter(w => w.includes('nonexistent:route'));
    expect(urlWarnings.length).toBeGreaterThan(0);
  });
});

// ── Scenario 16: Empty roots ───────────────────────────────────────────────────

describe('Scanner — Scenario 16: empty roots', () => {
  it('returns Project with all empty indexes', async () => {
    const fs = new InMemoryFileSystem();
    const { scanner } = makeScanner(fs);

    const project = await scanner.scan([]);

    expect(project.models.all()).toHaveLength(0);
    expect(project.views.all()).toHaveLength(0);
    expect(project.templates.all()).toHaveLength(0);
    expect(project.urls.all()).toHaveLength(0);
  });
});

// ── Scenario 17: onDidChange fires on scan ───────────────────────────────────

describe('Scanner — Scenario 17: onDidChange fires on scan', () => {
  it('emits one Project event after scan completes', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner, events } = makeScanner(fs);

    const received: unknown[] = [];
    scanner.onDidChange(p => received.push(p));

    await scanner.scan(['/ws']);

    expect(received).toHaveLength(1);
    expect(events).toHaveLength(1);
  });
});

// ── Scenario 18: onDidChange fires after invalidateBatch ─────────────────────

describe('Scanner — Scenario 18: onDidChange fires after invalidateBatch', () => {
  it('emits another Project event after invalidateBatch', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner, events } = makeScanner(fs);

    await scanner.scan(['/ws']);
    expect(events).toHaveLength(1);

    fs.addFile('/ws/blog/models.py', MODELS_SRC, 2000); // update mtime
    await scanner.invalidateBatch(['/ws/blog/models.py']);

    expect(events).toHaveLength(2);
  });
});

// ── P7: Cross-file resolution (extends + includes + URL ref) ─────────────────

describe('Scanner — P7: template extends not found emits warning', () => {
  it('warns when extends target is not in the workspace', async () => {
    const fs = new InMemoryFileSystem();
    // Template extends "base.html" but base.html is NOT in the filesystem
    const tmplSrc = `{% extends "base.html" %}{% block content %}{% endblock %}`;
    fs.addFile('/ws/blog/templates/blog/child.html', tmplSrc, 1000);

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    await scanner.scan(['/ws']);

    const extendsWarnings = warnings.filter(w => w.includes('base.html'));
    expect(extendsWarnings.length).toBeGreaterThan(0);
  });
});

describe('Scanner — P7: template extends found does NOT warn', () => {
  it('does not warn when extends target IS in the workspace', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/templates/base.html', '{% block content %}{% endblock %}', 1000);
    const childSrc = `{% extends "base.html" %}{% block content %}hello{% endblock %}`;
    fs.addFile('/ws/blog/templates/blog/child.html', childSrc, 1001);

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    await scanner.scan(['/ws']);

    const extendsWarnings = warnings.filter(w => w.includes('extends'));
    expect(extendsWarnings).toHaveLength(0);
  });
});

describe('Scanner — P7: include not found emits warning', () => {
  it('warns when include target is not in the workspace', async () => {
    const fs = new InMemoryFileSystem();
    const tmplSrc = `{% include "partials/missing.html" %}`;
    fs.addFile('/ws/blog/templates/blog/page.html', tmplSrc, 1000);

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    await scanner.scan(['/ws']);

    const includeWarnings = warnings.filter(w => w.includes('missing.html'));
    expect(includeWarnings.length).toBeGreaterThan(0);
  });
});

describe('Scanner — P7: static sentinel ref passes through without warning', () => {
  it('does not warn for __static__: sentinels (Fase 4 validates)', async () => {
    const fs = new InMemoryFileSystem();
    // Template uses {% static %} — emits __static__: sentinel
    const tmplSrc = `{% load static %}{% static "blog/style.css" %}`;
    fs.addFile('/ws/blog/templates/blog/page.html', tmplSrc, 1000);

    const warnings: string[] = [];
    const { scanner } = makeScanner(fs, {
      logger: { warn: msg => warnings.push(msg) },
    });

    await scanner.scan(['/ws']);

    const staticWarnings = warnings.filter(w => w.includes('__static__'));
    expect(staticWarnings).toHaveLength(0);
  });
});

// ── P9: Project emitter wiring ────────────────────────────────────────────────

describe('Scanner — P9: onDidChange subscription before scan', () => {
  it('subscriber receives the Project snapshot produced by scan', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/blog/views.py', VIEWS_SRC, 1001);
    fs.addFile('/ws/blog/templates/blog/index.html', TEMPLATE_SRC, 1002);

    const { scanner } = makeScanner(fs);

    const received: import('$infra/types/project').Project[] = [];
    scanner.onDidChange(p => received.push(p));

    await scanner.scan(['/ws']);

    expect(received).toHaveLength(1);
    // The received Project must have the same data as the returned one
    expect(received[0]!.models.all().length).toBeGreaterThanOrEqual(1);
  });
});

describe('Scanner — P9: onDidChange fires again after invalidateBatch with content change', () => {
  it('subscriber receives updated Project after file content changes', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner } = makeScanner(fs);

    const received: import('$infra/types/project').Project[] = [];
    scanner.onDidChange(p => received.push(p));

    await scanner.scan(['/ws']);
    expect(received).toHaveLength(1);

    // Simulate file content change with new mtime
    const updatedSrc =
      MODELS_SRC + '\nclass Tag(models.Model):\n    name = models.CharField(max_length=50)\n';
    fs.addFile('/ws/blog/models.py', updatedSrc, 2000);

    await scanner.invalidateBatch(['/ws/blog/models.py']);
    expect(received).toHaveLength(2);
  });
});

// ── Resilience: one bad file must not take the index with it ──────────────────

/** An InMemoryFileSystem where named paths fail to read, as a real one can. */
class HostileFileSystem extends InMemoryFileSystem {
  private readonly unreadable = new Set<string>();

  makeUnreadable(path: string): void {
    this.unreadable.add(path);
  }

  override async readFile(path: string): Promise<string> {
    if (this.unreadable.has(path)) {
      throw Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
        code: 'EACCES',
      });
    }
    return super.readFile(path);
  }
}

describe('Scanner — one unreadable file', () => {
  // A file can be unreadable for reasons that have nothing to do with us: no
  // read permission, deleted between the glob and the read, a broken mount.
  // Losing it is fine. Losing the project is not: pass1 rejected, onDidChange
  // never fired, and every feature stayed empty for the rest of the session.
  it('does not reject the scan', async () => {
    const fs = new HostileFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/shop/models.py', MODELS_SRC, 1001);
    fs.makeUnreadable('/ws/shop/models.py');

    const { scanner } = makeScanner(fs);
    await expect(scanner.scan(['/ws'])).resolves.toBeDefined();
  });

  it('still indexes every file that could be read', async () => {
    const fs = new HostileFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/blog/views.py', VIEWS_SRC, 1001);
    fs.addFile('/ws/blog/templates/blog/index.html', TEMPLATE_SRC, 1002);
    fs.makeUnreadable('/ws/blog/views.py');

    const { scanner } = makeScanner(fs);
    const project = await scanner.scan(['/ws']);

    expect(project.models.all().length).toBeGreaterThanOrEqual(1);
    expect(project.templates.all().length).toBe(1);
  });

  it('still fires onDidChange, so adapters are not stuck on EMPTY_PROJECT', async () => {
    const fs = new HostileFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.makeUnreadable('/ws/blog/models.py');

    const { scanner, events } = makeScanner(fs);
    await scanner.scan(['/ws']);

    expect(events).toHaveLength(1);
  });

  it('says which file it dropped, so the failure is diagnosable', async () => {
    const fs = new HostileFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.makeUnreadable('/ws/blog/models.py');

    const warn = vi.fn();
    const { scanner } = makeScanner(fs, { logger: { warn } });
    await scanner.scan(['/ws']);

    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toContain('/ws/blog/models.py');
  });
});

// ── Overlapping rescans ───────────────────────────────────────────────────────

/** Records how many passes were ever in flight at the same moment. */
class ConcurrencyProbeFileSystem extends InMemoryFileSystem {
  inFlight = 0;
  maxInFlight = 0;

  override async glob(
    patterns: readonly string[],
    excludes: readonly string[],
  ): Promise<readonly string[]> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise(r => setTimeout(r, 5));
    try {
      return await super.glob(patterns, excludes);
    } finally {
      this.inFlight--;
    }
  }
}

describe('Scanner — overlapping rescans', () => {
  // The watcher fires invalidateBatch without awaiting it, on the stated
  // grounds that "the scanner handles sequencing internally". It did not:
  // there was no queue, and pass2 clears caches that a concurrent pass2 is
  // still filling. Two passes in flight could publish an older snapshot last.
  it('never runs two passes at the same time', async () => {
    const fs = new ConcurrencyProbeFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner } = makeScanner(fs);
    await scanner.scan(['/ws']);

    await Promise.all([
      scanner.invalidateBatch(['/ws/blog/models.py']),
      scanner.invalidateBatch(['/ws/blog/models.py']),
      scanner.invalidateBatch(['/ws/blog/models.py']),
    ]);

    expect(fs.maxInFlight).toBe(1);
  });

  it('the snapshot published last is the newest one', async () => {
    const fs = new ConcurrencyProbeFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner, events } = makeScanner(fs);
    await scanner.scan(['/ws']);

    const withTag =
      MODELS_SRC + '\nclass Tag(models.Model):\n    name = models.CharField(max_length=50)\n';
    const first = scanner.invalidateBatch(['/ws/blog/models.py']);
    fs.addFile('/ws/blog/models.py', withTag, 2000);
    const second = scanner.invalidateBatch(['/ws/blog/models.py']);
    await Promise.all([first, second]);

    const last = events[events.length - 1] as import('$infra/types/project').Project;
    expect(last.models.all().map(m => m.name)).toContain('Tag');
  });
});

// ── Template reference resolution ─────────────────────────────────────────────

describe('Scanner — resolving template references', () => {
  // The lookup was `allTemplateKeys.some(k => k.endsWith('/' + ref))`, run per
  // reference: O(templates x refs), on every scan and every save. The exact
  // `byKey` in front of it could never take the load off, because the key is
  // an absolute path and an `{% include %}` target never is. These pin the
  // answers so the faster form has to give the same ones.
  const scanWith = async (files: Record<string, string>) => {
    const fs = new InMemoryFileSystem();
    for (const [path, src] of Object.entries(files)) fs.addFile(path, src, 1000);
    const warn = vi.fn();
    const { scanner } = makeScanner(fs, { logger: { warn } });
    await scanner.scan(['/ws']);
    return warn.mock.calls.flat().join('\n');
  };

  it('resolves an include written as a load path', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% include "blog/card.html" %}',
      '/ws/blog/templates/blog/card.html': '<p>card</p>',
    });
    expect(warnings).not.toContain('card.html');
  });

  it('resolves one written as a bare filename', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% include "card.html" %}',
      '/ws/blog/templates/blog/card.html': '<p>card</p>',
    });
    expect(warnings).not.toContain("include 'card.html'");
  });

  // Any suffix that starts at a segment boundary resolves, not only the
  // `templates/`-rooted load path — which is what the old `endsWith` did, and
  // narrowing it here would turn working projects into a wall of warnings.
  it('resolves a reference written from an intermediate directory', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% include "templates/blog/card.html" %}',
      '/ws/blog/templates/blog/card.html': '<p>card</p>',
    });
    expect(warnings).not.toContain("include 'templates/blog/card.html'");
  });

  it('resolves through a nested templates root', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% include "blog/templates/email.html" %}',
      '/ws/blog/templates/blog/templates/email.html': '<p>mail</p>',
    });
    expect(warnings).not.toContain('email.html');
  });

  it('still reports one that genuinely is not there', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% include "nope/missing.html" %}',
    });
    expect(warnings).toContain('missing.html');
  });

  it('reports a missing extends target too', async () => {
    const warnings = await scanWith({
      '/ws/blog/templates/blog/index.html': '{% extends "nowhere/base.html" %}',
    });
    expect(warnings).toContain('nowhere/base.html');
  });
});

// ── What a content-only change costs ──────────────────────────────────────────

/** Counts glob calls, which is the part of a pass that touches every file. */
class GlobCountingFileSystem extends InMemoryFileSystem {
  globCalls = 0;
  statCalls = 0;

  override async glob(
    patterns: readonly string[],
    excludes: readonly string[],
  ): Promise<readonly string[]> {
    this.globCalls++;
    return super.glob(patterns, excludes);
  }

  override async stat(
    path: string,
  ): Promise<{ readonly mtime: number; readonly size: number } | null> {
    this.statCalls++;
    return super.stat(path);
  }
}

describe('Scanner — a saved file does not re-glob the workspace', () => {
  // `invalidateBatch` ran the same pass1 as a cold start: re-glob nine
  // patterns and `stat` every indexed file, on every save. The parse cache
  // spared the PARSING, never the walking — and on Remote-SSH or a
  // devcontainer each of those is a round trip.
  it('reuses the known file list when only contents changed', async () => {
    const fs = new GlobCountingFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/blog/views.py', VIEWS_SRC, 1000);
    fs.addFile('/ws/blog/templates/blog/index.html', TEMPLATE_SRC, 1000);

    const { scanner } = makeScanner(fs);
    await scanner.scan(['/ws']);
    const afterCold = fs.globCalls;

    fs.addFile('/ws/blog/models.py', MODELS_SRC + '\nclass Tag(models.Model):\n    pass\n', 2000);
    await scanner.invalidateBatch(['/ws/blog/models.py']);

    expect(fs.globCalls).toBe(afterCold);
  });

  it('still picks up the new content', async () => {
    const fs = new GlobCountingFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner, events } = makeScanner(fs);
    await scanner.scan(['/ws']);

    const withTag =
      MODELS_SRC + '\nclass Tag(models.Model):\n    name = models.CharField(max_length=50)\n';
    fs.addFile('/ws/blog/models.py', withTag, 2000);
    await scanner.invalidateBatch(['/ws/blog/models.py']);

    const last = events[events.length - 1] as import('$infra/types/project').Project;
    expect(last.models.all().map(m => m.name)).toContain('Tag');
  });

  it('re-globs when a file was created', async () => {
    const fs = new GlobCountingFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);

    const { scanner } = makeScanner(fs);
    await scanner.scan(['/ws']);
    const afterCold = fs.globCalls;

    fs.addFile('/ws/shop/models.py', MODELS_SRC, 1000);
    await scanner.invalidateBatch(['/ws/shop/models.py'], { structural: true });

    expect(fs.globCalls).toBeGreaterThan(afterCold);
  });

  it('re-globs when a file was deleted, and drops it', async () => {
    const fs = new GlobCountingFileSystem();
    fs.addFile('/ws/blog/models.py', MODELS_SRC, 1000);
    fs.addFile('/ws/shop/models.py', MODELS_SRC, 1000);

    const { scanner, events } = makeScanner(fs);
    await scanner.scan(['/ws']);

    fs.removeFile('/ws/shop/models.py');
    await scanner.invalidateBatch(['/ws/shop/models.py'], { structural: true });

    const last = events[events.length - 1] as import('$infra/types/project').Project;
    expect(last.models.all().map(m => m.filePath)).not.toContain('/ws/shop/models.py');
  });
});
