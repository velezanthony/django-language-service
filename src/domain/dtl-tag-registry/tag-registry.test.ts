import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TAGS,
  BUILTIN_FILTERS,
  getTagDoc,
  getFilterDoc,
  getAvailableTagsAndFilters,
  findLibraryForTag,
  extractLoadedLibraries,
} from './tag-registry';

describe('BUILTIN_TAGS', () => {
  it('contains standard Django tags', () => {
    expect(BUILTIN_TAGS.has('if')).toBe(true);
    expect(BUILTIN_TAGS.has('for')).toBe(true);
    expect(BUILTIN_TAGS.has('block')).toBe(true);
    expect(BUILTIN_TAGS.has('extends')).toBe(true);
    expect(BUILTIN_TAGS.has('include')).toBe(true);
  });

  it('contains Django 6.0 partial tags', () => {
    expect(BUILTIN_TAGS.has('partial')).toBe(true);
    expect(BUILTIN_TAGS.has('partialdef')).toBe(true);
  });
});

describe('BUILTIN_FILTERS', () => {
  it('contains common filters', () => {
    expect(BUILTIN_FILTERS.has('date')).toBe(true);
    expect(BUILTIN_FILTERS.has('lower')).toBe(true);
    expect(BUILTIN_FILTERS.has('safe')).toBe(true);
    expect(BUILTIN_FILTERS.has('slugify')).toBe(true);
  });
});

describe('getTagDoc', () => {
  it('returns doc for a known tag', () => {
    const doc = getTagDoc('if');
    expect(doc).not.toBeUndefined();
    expect(doc?.type).toBe('tag');
    expect(doc?.syntax).toContain('{% if');
  });

  it('returns undefined for unknown tag', () => {
    expect(getTagDoc('nonexistent_tag_xyz')).toBeUndefined();
  });
});

describe('getFilterDoc', () => {
  it('returns doc for a known filter', () => {
    const doc = getFilterDoc('date');
    expect(doc?.type).toBe('filter');
    expect(doc?.syntax).toContain('|date');
  });
});

describe('getAvailableTagsAndFilters', () => {
  it('returns builtins when no libs loaded', () => {
    const { tags, filters } = getAvailableTagsAndFilters([], new Map());
    expect(tags.has('if')).toBe(true);
    expect(filters.has('date')).toBe(true);
  });

  it('includes i18n tags when i18n is loaded', () => {
    const { tags } = getAvailableTagsAndFilters(['i18n'], new Map());
    expect(tags.has('trans')).toBe(true);
    expect(tags.has('blocktranslate')).toBe(true);
  });

  it('includes custom library tags', () => {
    const customLibs = new Map([['mylib', { tags: ['mytag'], filters: [] }]]);
    const { tags } = getAvailableTagsAndFilters(['mylib'], customLibs);
    expect(tags.has('mytag')).toBe(true);
  });
});

describe('findLibraryForTag', () => {
  it('returns null for built-in tags', () => {
    expect(findLibraryForTag('if', new Map())).toBeNull();
  });

  it('returns library name for a django library tag', () => {
    expect(findLibraryForTag('trans', new Map())).toBe('i18n');
  });
});

describe('extractLoadedLibraries', () => {
  it('extracts single library', () => {
    const libs = extractLoadedLibraries('{% load i18n %}');
    expect(libs).toContain('i18n');
  });

  it('extracts multiple libraries from one load tag', () => {
    const libs = extractLoadedLibraries('{% load i18n static humanize %}');
    expect(libs).toContain('i18n');
    expect(libs).toContain('static');
    expect(libs).toContain('humanize');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A library name from the workspace is not a key of Object.prototype.
//
// `DJANGO_LIBRARIES[lib]`, `TAG_DOCS[name]` and `FILTER_DOCS[name]` were plain
// index reads with a name the template supplies. `{% load __proto__ %}` handed
// back `Object.prototype`, whose `.tags` is undefined, and iterating that threw
// — the throw was swallowed by the diagnostics catch, so `{% load %}` checking
// went SILENT for the whole file. Not an injection: a denial of a feature,
// caused by trusting a name.
// ─────────────────────────────────────────────────────────────────────────────
describe('names that exist on Object.prototype', () => {
  const POISON = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];

  it.each(POISON)('{%% load %s %%} does not throw', name => {
    expect(() => getAvailableTagsAndFilters([name], new Map())).not.toThrow();
  });

  it.each(POISON)('{%% load %s %%} adds no tags or filters', name => {
    const bare = getAvailableTagsAndFilters([], new Map());
    const poisoned = getAvailableTagsAndFilters([name], new Map());
    expect(poisoned.tags.size).toBe(bare.tags.size);
    expect(poisoned.filters.size).toBe(bare.filters.size);
  });

  it.each(POISON)('getTagDoc(%s) is undefined', name => {
    expect(getTagDoc(name)).toBeUndefined();
  });

  it.each(POISON)('getFilterDoc(%s) is undefined', name => {
    expect(getFilterDoc(name)).toBeUndefined();
  });

  it('still resolves a real library, so the guard did not break the feature', () => {
    const withHumanize = getAvailableTagsAndFilters(['humanize'], new Map());
    const bare = getAvailableTagsAndFilters([], new Map());
    expect(withHumanize.filters.size).toBeGreaterThan(bare.filters.size);
  });

  it('still resolves a real tag and filter doc', () => {
    expect(getTagDoc('for')).toBeDefined();
    expect(getFilterDoc('date')).toBeDefined();
  });
});
