/**
 * Two workspace roots, each with an app of the same name.
 *
 * Opening two Django services side by side is ordinary — an API and its admin,
 * a monolith and an extracted service — and both will have a `core`, an `api`
 * or a `common`. The view index is keyed `'<app>.<name>'` and the model index
 * `'<appLabel>.<name>'`; neither carried the root, so `core.index` from one
 * workspace overwrote `core.index` from the other and a view vanished with no
 * warning anywhere.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from './file-system';
import { Scanner } from './scanner';

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

const VIEWS = `
from django.shortcuts import render

def index(request):
    return render(request, 'core/index.html', {})
`;

const MODELS = `
from django.db import models


class Thing(models.Model):
    name = models.CharField(max_length=10)


class Box(models.Model):
    thing = models.ForeignKey('core.Thing', on_delete=models.CASCADE)
`;

describe('two roots with an app of the same name', () => {
  const scan = async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/api/core/views.py', VIEWS, 1000);
    fs.addFile('/admin/core/views.py', VIEWS, 1001);

    const scanner = new Scanner({ fs, emitterFactory: stubEmitterFactory() });
    return scanner.scan(['/api', '/admin']);
  };

  it('keeps both views', async () => {
    const project = await scan();
    const indexes = project.views.all().filter(v => v.name === 'index');
    expect(indexes).toHaveLength(2);
  });

  it('gives them different keys, so neither overwrites the other', async () => {
    const project = await scan();
    const keys = new Set(project.views.all().map(v => `${v.appLabel}.${v.name}`));
    expect(keys.size).toBe(project.views.all().length);
  });

  it('every view is reachable through the key it is indexed by', async () => {
    const project = await scan();
    for (const view of project.views.all()) {
      expect(project.views.byKey(`${view.appLabel}.${view.name}`)).toBeDefined();
    }
  });

  it('leaves the label alone when there is only one root', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/api/core/views.py', VIEWS, 1000);
    const scanner = new Scanner({ fs, emitterFactory: stubEmitterFactory() });
    const project = await scanner.scan(['/api']);

    expect(project.views.all().map(v => v.appLabel)).toEqual(['core']);
  });
});

/**
 * The same collision, on the half nobody fixed.
 *
 * `Model.appLabel` is derived by the PARSER, from the file path alone — and the
 * parser has never been told where the workspace starts, so it answers `core`
 * for both roots. The model index is keyed `'<appLabel>.<name>'`, so one of the
 * two `core.Thing` models is silently replaced; and because `Relation.fromModel`
 * is stamped by the same parser, whatever the scanner does to the label has to
 * reach the relations too or every edge falls out of the diagram, which filters
 * relations by `modelKeySet.has(r.fromModel)`.
 */
describe('two roots with an app of the same name — models', () => {
  const scan = async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/api/core/models.py', MODELS, 1000);
    fs.addFile('/admin/core/models.py', MODELS, 1001);

    const scanner = new Scanner({ fs, emitterFactory: stubEmitterFactory() });
    return scanner.scan(['/api', '/admin']);
  };

  it('keeps both copies of a model an app of each root declares', async () => {
    const project = await scan();
    expect(project.models.all().filter(m => m.name === 'Thing')).toHaveLength(2);
  });

  it('gives them different keys, so neither overwrites the other', async () => {
    const project = await scan();
    const keys = new Set(project.models.all().map(m => `${m.appLabel}.${m.name}`));
    expect(keys.size).toBe(project.models.all().length);
  });

  it('every model is reachable through the key it is indexed by', async () => {
    const project = await scan();
    for (const model of project.models.all()) {
      expect(project.models.byKey(`${model.appLabel}.${model.name}`)).toBeDefined();
    }
  });

  it('keeps every relation owned by the key its own model is indexed by', async () => {
    const project = await scan();
    const keys = new Set(project.models.all().map(m => `${m.appLabel}.${m.name}`));
    for (const model of project.models.all()) {
      for (const rel of model.relations) {
        expect(keys.has(rel.fromModel)).toBe(true);
      }
    }
  });

  it('points an app-qualified relation target at the copy in its own root', async () => {
    const project = await scan();
    const boxes = project.models.all().filter(m => m.name === 'Box');
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      const rel = box.relations.find(r => r.fieldName === 'thing');
      const ownRoot = box.filePath.startsWith('/api/') ? '/api/' : '/admin/';
      const target = project.models.byKey(rel!.toModel);
      expect(target?.filePath.startsWith(ownRoot)).toBe(true);
    }
  });

  it('leaves the model label alone when there is only one root', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/api/core/models.py', MODELS, 1000);
    const scanner = new Scanner({ fs, emitterFactory: stubEmitterFactory() });
    const project = await scanner.scan(['/api']);

    expect(new Set(project.models.all().map(m => m.appLabel))).toEqual(new Set(['core']));
    for (const model of project.models.all()) {
      for (const rel of model.relations) {
        expect(rel.fromModel).toBe(`core.${model.name}`);
      }
    }
  });
});
