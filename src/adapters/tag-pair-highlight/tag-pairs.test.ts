/**
 * The pairing behind the tag-pair highlight.
 *
 * The adapter that owns this folder had no test file anywhere in `src/`, and
 * its header said it highlights "the matching opener/closer pair and any
 * mid-level tags (`{% else %}`, `{% elif %}`)". From an opener it returned only
 * the closer, and from a closer only the opener; the mid tags came back only
 * when the cursor was already sitting on one.
 */
import { describe, it, expect } from 'vitest';
import { findMatchingTags } from './tag-pairs';
import { discoverBlockOpeners } from '$domain/formatting/dtl-parser';

/** The tags reported for the cursor placed inside the tag containing `needle`. */
const pairedWith = (source: string, needle: string): string[] => {
  const offset = source.indexOf(needle) + 1;
  return findMatchingTags(source, offset, discoverBlockOpeners(source))
    .map(t => t.name)
    .sort();
};

describe('opener and closer find each other', () => {
  const IF_ELSE = '{% if a %}A{% else %}B{% endif %}';

  it('from the opener', () => {
    expect(pairedWith(IF_ELSE, '{% if a')).toEqual(['else', 'endif']);
  });

  it('from the closer', () => {
    expect(pairedWith(IF_ELSE, '{% endif')).toEqual(['else', 'if']);
  });

  it('from the mid tag', () => {
    expect(pairedWith(IF_ELSE, '{% else')).toEqual(['endif', 'if']);
  });

  it('reports both mid tags of an if/elif/else', () => {
    const source = '{% if a %}A{% elif b %}B{% else %}C{% endif %}';
    expect(pairedWith(source, '{% if a')).toEqual(['elif', 'else', 'endif']);
    expect(pairedWith(source, '{% elif')).toEqual(['else', 'endif', 'if']);
  });

  it('reports the {% empty %} of a for loop', () => {
    const source = '{% for x in xs %}A{% empty %}none{% endfor %}';
    expect(pairedWith(source, '{% for')).toEqual(['empty', 'endfor']);
  });
});

describe('nesting', () => {
  // A wrong pair points at the wrong line with complete confidence, which is
  // worse than no pair at all.
  it('does not take the inner block for the outer one', () => {
    const source = '{% if a %}{% if b %}X{% endif %}Y{% endif %}';
    const offset = source.indexOf('{% if a') + 1;
    const matched = findMatchingTags(source, offset, discoverBlockOpeners(source));
    expect(matched).toHaveLength(1);
    expect(matched[0]!.start).toBe(source.lastIndexOf('{% endif %}'));
  });

  it('does not claim the {% else %} of a nested block', () => {
    const source = '{% if a %}{% if b %}X{% else %}Y{% endif %}{% endif %}';
    expect(pairedWith(source, '{% if a')).toEqual(['endif']);
  });

  it('gives the inner block its own {% else %}', () => {
    const source = '{% if a %}{% if b %}X{% else %}Y{% endif %}{% endif %}';
    expect(pairedWith(source, '{% if b')).toEqual(['else', 'endif']);
  });

  it('pairs across different block kinds', () => {
    const source = '{% for x in xs %}{% if x %}A{% endif %}{% endfor %}';
    expect(pairedWith(source, '{% for')).toEqual(['endfor']);
    expect(pairedWith(source, '{% if x')).toEqual(['endif']);
  });
});

describe('what it refuses to pair', () => {
  it('says nothing for a cursor outside any tag', () => {
    const source = '{% if a %}TEXT{% endif %}';
    expect(findMatchingTags(source, source.indexOf('TEXT'), discoverBlockOpeners(source))).toEqual(
      [],
    );
  });

  it('says nothing for a tag that opens no block', () => {
    const source = '{% load static %}{% if a %}A{% endif %}';
    expect(pairedWith(source, '{% load')).toEqual([]);
  });

  it('says nothing when the block is never closed', () => {
    expect(pairedWith('{% if a %}A', '{% if a')).toEqual([]);
  });

  // A `{% endif %}` written inside `{% comment %}` is not a tag Django runs, so
  // it cannot be anybody's partner.
  it('ignores a closer inside an inert region', () => {
    const source = '{% if a %}A{% comment %}{% endif %}{% endcomment %}B{% endif %}';
    const offset = source.indexOf('{% if a') + 1;
    const matched = findMatchingTags(source, offset, discoverBlockOpeners(source));
    expect(matched).toHaveLength(1);
    expect(matched[0]!.start).toBe(source.lastIndexOf('{% endif %}'));
  });
});
