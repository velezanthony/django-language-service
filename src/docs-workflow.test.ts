/**
 * The docs workflow rebuilds the site for every document the site publishes.
 *
 * Every page of `docs-site/` is an `external` entry in `docs.config.mjs`,
 * because README, CHANGELOG and CONTRIBUTING have to stay where GitHub and the
 * Marketplace expect them. The workflow's `paths` filter therefore has to name
 * each of them: `docs/**` covers the rest, and a root document missing from
 * that list means editing it merges cleanly and the published site keeps
 * serving the old copy.
 *
 * The failure is silent in the worst way — the workflow does not fail, it does
 * not run. The same goes for a new document under docs/ that nobody lists in
 * the config: it is never published.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

const ROOT = join(__dirname, '..');
const SITE = join(ROOT, 'docs-site');
const CONFIG = readFileSync(join(SITE, 'docs.config.mjs'), 'utf8');
const ASTRO = readFileSync(join(SITE, 'astro.config.mjs'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'docs.yml'), 'utf8');

/** Every `.md` the site publishes, relative to the repository root. */
function publishedDocuments(): string[] {
  return [...CONFIG.matchAll(/file:\s*'([^']+\.md)'/g)].map(m =>
    posix.normalize(posix.join('docs-site', m[1]!)),
  );
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
    expect(publishedDocuments().length).toBeGreaterThan(3);
    expect(watchedPaths().length).toBeGreaterThan(3);
  });

  it('watches every document the site publishes', () => {
    const watched = watchedPaths();
    const covered = (doc: string) =>
      watched.includes(doc) ||
      watched.some(p => p.endsWith('/**') && doc.startsWith(p.slice(0, -2)));

    const missing = publishedDocuments().filter(d => !covered(d));
    expect(missing, 'published, not in `paths` — edits to these would not rebuild').toEqual([]);
  });

  it('publishes every document under docs/', () => {
    const inDocs = readdirSync(join(ROOT, 'docs'))
      .filter(name => name.endsWith('.md') && !name.endsWith('.local.md'))
      .map(name => `docs/${name}`);
    const unlisted = inDocs.filter(d => !publishedDocuments().includes(d));
    expect(unlisted, 'in docs/, not in `content.external`').toEqual([]);
  });

  it('watches its own definition', () => {
    // Both the site project and the workflow: a change to either changes the site.
    expect(watchedPaths()).toContain('docs-site/**');
    expect(watchedPaths()).toContain('.github/workflows/docs.yml');
  });

  it('names the site origin and base, without which the sitemap is inert', () => {
    // Without `site` the sitemap and canonical urls cannot be absolute.
    expect(ASTRO).toMatch(/site:\s*'https:\/\/\S+'/);
    expect(ASTRO).toMatch(/base:\s*'\/django-language-service'/);
  });
});
