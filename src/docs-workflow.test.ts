/**
 * The docs workflow rebuilds the site for every document the site publishes.
 *
 * `mkdocs.yml` builds from the repository ROOT, because README, CHANGELOG and
 * CONTRIBUTING have to stay where GitHub and the Marketplace expect them. The
 * workflow's `paths` filter therefore has to name each of them: `docs/**`
 * covers the rest, and a root document missing from that list means editing it
 * merges cleanly and the published site keeps serving the old copy.
 *
 * The failure is silent in the worst way — the workflow does not fail, it does
 * not run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const MKDOCS = readFileSync(join(ROOT, 'mkdocs.yml'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'docs.yml'), 'utf8');

/** Every `.md` the nav publishes, as written. */
function navDocuments(): string[] {
  const nav = /^nav:\n((?:[ \t]+.*\n|\n)*)/m.exec(MKDOCS);
  expect(nav, 'no nav block in mkdocs.yml').not.toBeNull();
  return [...nav![1]!.matchAll(/([\w./-]+\.md)\s*$/gm)].map(m => m[1]!);
}

/** The `paths:` entries of the workflow's push trigger. */
function watchedPaths(): string[] {
  const block = /paths:\n((?:\s+-\s+.*\n)+)/.exec(WORKFLOW);
  expect(block, 'no paths block in docs.yml').not.toBeNull();
  return [...block![1]!.matchAll(/-\s+'([^']+)'/g)].map(m => m[1]!);
}

describe('the docs workflow watches what the docs site publishes', () => {
  it('finds both lists', () => {
    // The sentinel. Without it, a parse that silently matched nothing would
    // make every assertion below compare two empty lists and pass.
    expect(navDocuments().length).toBeGreaterThan(3);
    expect(watchedPaths().length).toBeGreaterThan(3);
  });

  it('watches every document the nav publishes', () => {
    const watched = watchedPaths();
    const covered = (doc: string) =>
      watched.includes(doc) ||
      watched.some(p => p.endsWith('/**') && doc.startsWith(p.slice(0, -2)));

    const missing = navDocuments().filter(d => !covered(d));
    expect(missing, 'in the nav, not in `paths` — edits to these would not rebuild').toEqual([]);
  });

  it('watches its own definition', () => {
    // Both the config and the workflow: a change to either changes the site.
    expect(watchedPaths()).toContain('mkdocs.yml');
    expect(watchedPaths()).toContain('.github/workflows/docs.yml');
  });

  it('names the site url, without which the sitemap is inert', () => {
    // MkDocs emits sitemap.xml either way; without `site_url` its entries are
    // relative and useless, which looks exactly like a working one.
    expect(MKDOCS).toMatch(/^site_url:\s*https:\/\/\S+/m);
  });
});
