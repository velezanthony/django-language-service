/**
 * A snippet is offered only in files whose category matches its PREFIX: the
 * provider reads the first letters of the label and compares them against the
 * rule that matched the open file. A snippet whose label does not start with
 * its file's prefix ships, loads, and is never offered anywhere — dead weight
 * nobody would notice.
 *
 * Reading the shipped JSON rather than a fixture, so adding a snippet to the
 * wrong file fails here instead of silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CATEGORY_OF_FILE: Record<string, string> = {
  'python-models.json': 'dm',
  'python-forms.json': 'dfo',
  'python-views.json': 'dv',
  'python-admin.json': 'da',
  'python-urls.json': 'du',
};

/** The provider's own rule, in the order it applies it. */
const categoryOf = (label: string): string =>
  ['dfo', 'dm', 'dv', 'da', 'du'].find(p => label.startsWith(p)) ?? '';

interface SnippetBody {
  prefix?: string | string[];
  body?: unknown;
}

const load = (file: string): Record<string, SnippetBody> =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../../resources/snippets', file), 'utf8'),
  ) as Record<string, SnippetBody>;

const labelsOf = (file: string): string[] =>
  Object.entries(load(file)).map(([name, body]) => {
    const p = body.prefix;
    return typeof p === 'string' ? p : Array.isArray(p) && p[0] ? p[0] : name;
  });

describe.each(Object.entries(CATEGORY_OF_FILE))('%s', (file, category) => {
  it('is not empty', () => {
    expect(labelsOf(file).length).toBeGreaterThan(0);
  });

  it(`has every label under the ${category} prefix`, () => {
    const wrong = labelsOf(file).filter(l => categoryOf(l) !== category);
    expect(wrong).toEqual([]);
  });

  it('gives every snippet a body', () => {
    const bodyless = Object.entries(load(file))
      .filter(([, b]) => b.body === undefined)
      .map(([n]) => n);
    expect(bodyless).toEqual([]);
  });
});

it('never ships the same label from two files', () => {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const file of Object.keys(CATEGORY_OF_FILE)) {
    for (const label of labelsOf(file)) {
      const first = seen.get(label);
      if (first) clashes.push(`${label}: ${first} and ${file}`);
      else seen.set(label, file);
    }
  }
  expect(clashes).toEqual([]);
});
