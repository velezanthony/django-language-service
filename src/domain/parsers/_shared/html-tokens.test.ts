/**
 * The shared DTL constants, and the two properties they must all have.
 *
 * This module had no test file of its own, and two things drifted apart in it:
 *
 * 1. Django lets any tag carry a whitespace-control modifier — `{%- extends %}`,
 *    `{% block x -%}`. Five of the seven constants accept it. `EXTENDS_RE` and
 *    `BLOCK_NAME_RE` did not, so a template written that way lost its parent and
 *    registered no blocks: no inheritance, no block completion, and the file
 *    wearing a false orphan badge.
 *
 * 2. `INCLUDE_RE` read the text after the path with `[^%]*?`, so a value holding
 *    a percent sign — `with width="50%"` — matched nothing at all. Not a kwarg
 *    misread: the whole `{% include %}` disappeared, taking the edge out of the
 *    template graph with it. The same class also cannot contain a run of
 *    whitespace without ambiguity, which made the pattern quadratic.
 */
import { describe, it, expect } from 'vitest';
import { measureScaling } from '../../../test-support/scaling';
import {
  BLOCK_NAME_RE,
  BLOCK_TAG_RE,
  EXTENDS_RE,
  INCLUDE_RE,
  LOAD_TAG_RE,
  STATIC_TAG_RE,
  TAG_RE,
  URL_TAG_RE,
} from './html-tokens';

/** A fresh copy, so a global regex's lastIndex never leaks between cases. */
const fresh = (re: RegExp) => new RegExp(re.source, re.flags);

const first = (re: RegExp, text: string): RegExpExecArray | null => fresh(re).exec(text);

// ─────────────────────────────────────────────────────────────────────────────
// Every constant accepts Django's whitespace-control modifiers.
// ─────────────────────────────────────────────────────────────────────────────
describe('whitespace-control modifiers, on every tag pattern', () => {
  // The fourth column is the group holding the subject. It used to be 1 for
  // every pattern, and the table left it implicit — until the four that read a
  // QUOTED argument had to capture the delimiter to know which quote closes the
  // string. What this suite is actually about is the `[-+]?` modifiers, so the
  // index is stated per pattern rather than assumed across all of them.
  const cases: ReadonlyArray<readonly [string, RegExp, string, string, number]> = [
    ['EXTENDS_RE', EXTENDS_RE, '{% extends "base.html" %}', 'base.html', 2],
    ['BLOCK_NAME_RE', BLOCK_NAME_RE, '{% block content %}', 'content', 1],
    ['INCLUDE_RE', INCLUDE_RE, '{% include "card.html" %}', 'card.html', 2],
    ['URL_TAG_RE', URL_TAG_RE, '{% url "blog:index" %}', 'blog:index', 2],
    ['STATIC_TAG_RE', STATIC_TAG_RE, '{% static "css/app.css" %}', 'css/app.css', 2],
    ['LOAD_TAG_RE', LOAD_TAG_RE, '{% load shop_tags %}', 'shop_tags', 1],
    ['TAG_RE', TAG_RE, '{% if x %}', 'if', 1],
    ['BLOCK_TAG_RE', BLOCK_TAG_RE, '{% if x %}', 'if x', 1],
  ];

  it.each(cases)('%s reads the plain form', (_name, re, plain, expected, group) => {
    expect(first(re, plain)?.[group]).toBe(expected);
  });

  it.each(cases)('%s reads the trimmed form', (_name, re, plain, expected, group) => {
    const trimmed = plain.replace(/^\{%/, '{%-').replace(/%\}$/, '-%}');
    expect(first(re, trimmed)?.[group], trimmed).toBe(expected);
  });

  it.each(cases)('%s reads the left-trimmed form', (_name, re, plain, expected, group) => {
    expect(first(re, plain.replace(/^\{%/, '{%-'))?.[group]).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// An include is never lost.
// ─────────────────────────────────────────────────────────────────────────────
describe('INCLUDE_RE keeps the reference whatever the arguments hold', () => {
  it.each([
    ['plain', '{% include "card.html" %}'],
    ['percent in a value', '{% include "card.html" with width="50%" %}'],
    ['two percents', '{% include "card.html" with a="10%" b="90%" %}'],
    ['percent and only', '{% include "card.html" with w="50%" only %}'],
    ['bare only', '{% include "card.html" only %}'],
    ['single quotes', "{% include 'card.html' with w='50%' %}"],
    ['trimmed', '{%- include "card.html" with w="50%" -%}'],
    ['modulo in a filter', '{% include "card.html" with pct=value|stringformat:"d%" %}'],
  ])('%s', (_label, text) => {
    // Group 1 is the quote the author opened with; group 2 is the path.
    expect(first(INCLUDE_RE, text)?.[2]).toBe('card.html');
  });

  it('captures the arguments after the path', () => {
    expect(first(INCLUDE_RE, '{% include "card.html" with width="50%" %}')?.[3]?.trim()).toBe(
      'with width="50%"',
    );
  });

  it('does not run past the closing tag', () => {
    const match = first(INCLUDE_RE, '{% include "a.html" %}<p>after</p>{% include "b.html" %}');
    expect(match?.[0]).toBe('{% include "a.html" %}');
  });

  it('finds every include in a document', () => {
    const doc = '{% include "a.html" with p="1%" %}\n<p>x</p>\n{% include "b.html" %}';
    expect([...doc.matchAll(fresh(INCLUDE_RE))].map(m => m[2])).toEqual(['a.html', 'b.html']);
  });

  // `[^%]*?` next to `\s*` gave the matcher more than one way to split a run of
  // whitespace, so an unterminated tag cost 619 ms over 20k spaces, 8.6 s over
  // 80k — inside the scanner, synchronously, with no timeout.
  it('does not backtrack over a long unterminated tag', () => {
    const text = `{% include "card.html"${' '.repeat(40_000)}`;
    const started = performance.now();
    fresh(INCLUDE_RE).exec(text);
    expect(performance.now() - started).toBeLessThan(50);
  });

  // Through the shared harness, for the reason its own header gives: one
  // reading of each side, divided, mixes a clean measurement with a polluted
  // one, and vitest runs test files in parallel threads.
  it('stays linear as that run grows', () => {
    const { ratio } = measureScaling({
      prepare: spaces => `{% include "card.html"${' '.repeat(spaces)}`,
      run: text => {
        fresh(INCLUDE_RE).exec(text);
      },
      size: 10_000,
      factor: 4,
    });
    expect(ratio).toBeLessThan(4);
  });

  // Surface the delimiter-correct rewrite introduced: the string literal
  // itself can now be left OPEN, and the content class has to give every
  // character back one at a time before the match can fail. An author typing
  // the tag is in exactly this state on every keystroke.
  it('does not backtrack over an unterminated string literal', () => {
    const text = `{% include "${'a'.repeat(40_000)}`;
    const started = performance.now();
    fresh(INCLUDE_RE).exec(text);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('stays linear as an unterminated literal grows', () => {
    const { ratio } = measureScaling({
      prepare: chars => `{% include "${'a'.repeat(chars)}`,
      run: text => {
        fresh(INCLUDE_RE).exec(text);
      },
      size: 10_000,
      factor: 4,
    });
    expect(ratio).toBeLessThan(4);
  });
});
