/**
 * The helper, and the rule that makes it worth having.
 *
 * Copying a `/g` pattern is legitimate — `lastIndex` is shared state and two
 * readers of one module-level regex skip each other's matches. What is not
 * legitimate is `new RegExp(RE.source, 'g')`, which reads as "keep g" and in
 * fact means "drop everything except g". Twelve call sites did that, and the
 * day a pattern needed `u`, the copy quietly became a different pattern with
 * the same source text: `{% block título %}` matched as `t`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { freshRegex } from './fresh-regex';

const SRC = join(__dirname, '..', '..');

describe('freshRegex', () => {
  it('keeps every flag, not just the global one', () => {
    const original = /\p{ID_Start}\p{ID_Continue}*/gu;
    expect(freshRegex(original).flags).toBe(original.flags);
  });

  it('matches what the original matches', () => {
    const original = new RegExp(String.raw`^(\p{ID_Start}[\p{ID_Continue}]*)`, 'u');
    expect(freshRegex(original).exec('título_corto')?.[1]).toBe('título_corto');
  });

  it('starts at the beginning even when the original is mid-scan', () => {
    const original = /a/g;
    original.exec('aaa');
    expect(original.lastIndex).toBe(1);
    expect(freshRegex(original).lastIndex).toBe(0);
  });

  it('does not share lastIndex with the original', () => {
    const original = /a/g;
    const copy = freshRegex(original);
    copy.exec('aaa');
    expect(original.lastIndex).toBe(0);
  });
});

describe('nobody rebuilds a pattern from .source with hand-written flags', () => {
  it('has no call site left', () => {
    // Over the source text, because the defect is that the copy still WORKS —
    // no throw, no type error, just a different pattern. Nothing at runtime can
    // see it, so the only place to catch it is where it is written.
    //
    // TypeScript only. This first ran over every file under src/ and went red
    // on `domain/README.md`, which QUOTES the anti-pattern in order to warn
    // about it — and the obvious way to satisfy a guard like that is to delete
    // the warning, which is exactly backwards.
    const hits = execSync(
      `rg -n --no-heading "new RegExp\\([A-Za-z_]+\\.source" ${SRC} -g '*.ts' -g '!*.test.ts' -g '!fresh-regex.ts' || true`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
    expect(hits, 'use freshRegex(re) — a hand-written flag string drops the rest').toEqual([]);
  });

  it('finds the sources it is meant to be reading', () => {
    // Guards the guard: a bad path would make the assertion above vacuous.
    expect(readFileSync(join(SRC, 'domain', 'parsers', 'template.ts'), 'utf8')).toContain(
      'freshRegex',
    );
  });
});
