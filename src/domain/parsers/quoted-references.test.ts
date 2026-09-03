/**
 * The same quote defect, on the readers that feed the DIAGNOSTICS.
 *
 * `{% include "user's-card.html" %}` is a legal template reference. The reader
 * is `['"]([^'"]+)['"]` — open with either quote, forbid both until the close —
 * so it stops at the apostrophe and takes it as the closing quote. The include
 * is not lost; it is recorded as a reference to `user`.
 *
 * That is the worst possible outcome for this particular reader, because a
 * recorded reference to a file that does not exist is what raises "template not
 * found". The user gets a RED SQUIGGLE on a line that is correct, under a
 * filename they never wrote.
 *
 * `EXTENDS_RE` fails the other way: its trailing `\s*[-+]?%\}` cannot follow
 * the truncation, so the match collapses and the template has no parent — the
 * false orphan badge the comment above `EXTENDS_RE` already describes for a
 * different cause.
 *
 * This file is the third time this repository has been bitten by the same
 * family, per the comments in `html-tokens.ts`.
 */
import { describe, it, expect } from 'vitest';
import { parseTemplate } from './template';

function templateOf(source: string) {
  const result = parseTemplate(source, { filePath: 'shop/templates/shop/page.html' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('parse failed');
  return result.value[0]!;
}

describe('a template reference holding an apostrophe', () => {
  it('keeps an include path whole', () => {
    const t = templateOf(`{% include "user's-card.html" %}`);
    expect(t.includes.map(i => i.target)).toEqual(["user's-card.html"]);
  });

  it('does not invent a reference to a truncated path', () => {
    // The failure this guards is not a missing include — it is a WRONG one,
    // which is what turns into "template not found" under the user's cursor.
    const t = templateOf(`{% include "user's-card.html" %}`);
    expect(t.includes.map(i => i.target)).not.toContain('user');
  });

  it('keeps the parent template of an extends', () => {
    const t = templateOf(`{% extends "user's-base.html" %}\n{% block c %}{% endblock %}`);
    expect(t.extends).toBe("user's-base.html");
  });

  it('keeps an include path holding a double quote inside single quotes', () => {
    const t = templateOf(`{% include 'say-"hi".html' %}`);
    expect(t.includes.map(i => i.target)).toEqual(['say-"hi".html']);
  });

  it('still reads the ordinary paths', () => {
    const t = templateOf(`{% extends "base.html" %}\n{% include "card.html" %}`);
    expect(t.extends).toBe('base.html');
    expect(t.includes.map(i => i.target)).toEqual(['card.html']);
  });

  it('keeps a with-argument holding an apostrophe', () => {
    // `{% include "card.html" with title="Bob's shop" %}` — the value is prose,
    // which is where apostrophes actually live. It reaches the hover for the
    // include and the context-variable diagnostics.
    const t = templateOf(`{% include "card.html" with title="Bob's shop" %}`);
    expect(t.includes[0]?.kwargs).toEqual([{ name: 'title', expr: "Bob's shop" }]);
  });

  it('still reads an include carrying a percent sign in its arguments', () => {
    // The regression this file must not reintroduce: group 2 holding a `%`.
    const t = templateOf(`{% include "card.html" with width="50%" %}`);
    expect(t.includes.map(i => i.target)).toEqual(['card.html']);
  });
});
