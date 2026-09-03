/**
 * The two completion readers that look at a string the user is still typing.
 *
 * Both were written against `['"]` as an interchangeable pair. A path is a
 * filename and filenames hold apostrophes, so:
 *
 *   `{% include "user's` — the trigger saw the apostrophe as a fresh opening
 *   quote and decided the cursor was no longer inside a string, so the dropdown
 *   stopped appearing mid-word; and when it did appear, the partial it filtered
 *   on was `s`, not `user's`.
 *
 *   `{% extends "user's-base.html" %}` — the parent was read as `user`, found
 *   nowhere, and this provider's whole reason to exist (offering the parent's
 *   `{% block %}` names) produced nothing.
 *
 * Neither failed loudly. Both just went quiet, which is the failure mode a user
 * reports as "the extension doesn't work sometimes".
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import { extractPartialPath, HTML_TEMPLATE_TRIGGER } from './template-paths';
import { extendsTarget } from './dtl-block-name';

describe('the cursor is inside a path being typed', () => {
  it.each([
    ['{% include "', ''],
    ['{% include "card', 'card'],
    ["{% extends 'base/", 'base/'],
    ['{%- include "card', 'card'],
  ])('fires on %s', prefix => {
    expect(HTML_TEMPLATE_TRIGGER.test(prefix)).toBe(true);
  });

  it('keeps firing once the path holds an apostrophe', () => {
    expect(HTML_TEMPLATE_TRIGGER.test(`{% include "user's`)).toBe(true);
  });

  it('keeps firing once a single-quoted path holds a double quote', () => {
    expect(HTML_TEMPLATE_TRIGGER.test(`{% include 'say-"`)).toBe(true);
  });

  it('stops once the string is closed', () => {
    expect(HTML_TEMPLATE_TRIGGER.test('{% include "card.html"')).toBe(false);
  });

  it('does not fire on a different tag', () => {
    expect(HTML_TEMPLATE_TRIGGER.test('{% url "')).toBe(false);
  });
});

describe('the partial the dropdown filters on', () => {
  it('is what was typed after the opening quote', () => {
    expect(extractPartialPath('{% include "shop/car')).toBe('shop/car');
  });

  it('keeps an apostrophe instead of restarting at it', () => {
    expect(extractPartialPath(`{% include "user's-ca`)).toBe("user's-ca");
  });

  it('keeps a double quote inside a single-quoted path', () => {
    expect(extractPartialPath(`{% include 'say-"h`)).toBe('say-"h');
  });

  it('is empty right after the opening quote', () => {
    expect(extractPartialPath('{% include "')).toBe('');
  });

  it('is null when there is no open string at all', () => {
    expect(extractPartialPath('{% include ')).toBeNull();
  });
});

describe('the parent template the block names come from', () => {
  it('reads an ordinary parent', () => {
    expect(extendsTarget('{% extends "base.html" %}')).toBe('base.html');
  });

  it('reads a parent whose name holds an apostrophe', () => {
    expect(extendsTarget(`{% extends "user's-base.html" %}`)).toBe("user's-base.html");
  });

  it('reads a parent quoted with single quotes around a double quote', () => {
    expect(extendsTarget(`{% extends 'say-"hi".html' %}`)).toBe('say-"hi".html');
  });

  it('ignores an extends Django would never run', () => {
    expect(extendsTarget(`{# {% extends "base.html" %} #}`)).toBeUndefined();
  });

  it('is undefined when the template extends nothing', () => {
    expect(extendsTarget('{% block content %}{% endblock %}')).toBeUndefined();
  });
});
