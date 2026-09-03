/**
 * Custom tag libraries live in `<app>/templatetags/<name>.py` — that is the only
 * location Django itself loads them from, and `{% load %}` names the module.
 *
 * The indexer used to glob `**​/helpers.py` and nothing else, so the canonical
 * location was invisible: a filter defined in `shop/templatetags/shop_tags.py`
 * was never indexed, `{% load shop_tags %}` resolved to nothing, and the
 * "Filter 'x' requires {% load y %}" diagnostic the README advertises could not
 * fire for any project that follows Django's own convention.
 */
import { describe, it, expect } from 'vitest';
import { Scanner, INCLUDE_PATTERNS } from './scanner';
import { InMemoryFileSystem } from './file-system';
import { isWatchablePath, buildWatchGlobs } from './watch-globs';
import type { Project } from '$domain/contracts/project';

function makeScanner(fs: InMemoryFileSystem): Scanner {
  const emitterFactory = () => {
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
    } as unknown as import('vscode').EventEmitter<Project>;
  };
  return new Scanner({ fs, emitterFactory });
}

const LIB = `
from django import template

register = template.Library()

@register.filter
def money(value):
    return f"\${value:.2f}"

@register.simple_tag
def price_tag(product):
    return product.price
`;

describe('templatetags libraries are indexed', () => {
  it('globs the canonical templatetags location', () => {
    expect(INCLUDE_PATTERNS).toContain('**/templatetags/*.py');
  });

  it('indexes a filter defined in <app>/templatetags/<name>.py', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/w/apps/shop/templatetags/shop_tags.py', LIB, 1);
    const scanner = makeScanner(fs);

    const project = await scanner.scan(['/w']);
    const helpers = project.helpers.all();

    expect(helpers.map(h => h.name).sort()).toEqual(['money', 'price_tag']);
  });

  it('names the library after the module, so {% load shop_tags %} resolves', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/w/apps/shop/templatetags/shop_tags.py', LIB, 1);
    const scanner = makeScanner(fs);

    const project = await scanner.scan(['/w']);

    expect(project.helpers.all().map(h => h.library)).toEqual(['shop_tags', 'shop_tags']);
  });

  it('still indexes helpers.py, which is not a Django convention but was the only one supported', async () => {
    const fs = new InMemoryFileSystem();
    fs.addFile('/w/apps/shop/helpers.py', LIB, 1);
    const scanner = makeScanner(fs);

    const project = await scanner.scan(['/w']);

    expect(project.helpers.all().map(h => h.library)).toEqual(['helpers', 'helpers']);
  });

  it('watches templatetags files, so a new filter does not wait for a full scan', () => {
    expect(isWatchablePath('/w/apps/shop/templatetags/shop_tags.py')).toBe(true);
    expect(buildWatchGlobs()).toContain('**/templatetags/*.py');
  });

  it('does not watch unrelated .py that merely sits near templatetags', () => {
    expect(isWatchablePath('/w/apps/shop/tasks.py')).toBe(false);
  });
});
