import { describe, it, expect } from 'vitest';
import { escapeMarkdown, codeSpan } from './markdown-escape';

describe('escapeMarkdown', () => {
  it('leaves an ordinary name alone to read', () => {
    expect(escapeMarkdown('BlogPost')).toBe('BlogPost');
  });

  it('defuses an image, which is what fetches a URL on hover', () => {
    expect(escapeMarkdown('![](https://attacker/?leak)')).not.toContain('![](');
  });

  it.each([
    '![](https://x/?a)',
    '[click](https://x)',
    '<img src=x>',
    '`code`',
    '**bold**',
    'a_b_c',
  ])('escapes %s', hostile => {
    const escaped = escapeMarkdown(hostile);
    // Every significant character survives, but only ever behind a backslash —
    // so it renders as itself instead of as markup.
    for (let i = 0; i < escaped.length; i++) {
      if (!'\\`*_{}[]()#+-.!|<>~'.includes(escaped[i]!)) continue;
      if (escaped[i] === '\\') {
        i++;
        continue;
      }
      expect.unreachable(`unescaped ${escaped[i]} in ${escaped}`);
    }
    expect(escaped.replace(/\\/g, '')).toBe(hostile);
  });

  it('keeps the characters a reader needs', () => {
    expect(escapeMarkdown('shop:index').replace(/\\/g, '')).toBe('shop:index');
  });
});

describe('codeSpan', () => {
  it('wraps ordinary text', () => {
    expect(codeSpan('models.py')).toBe('`models.py`');
  });

  it('cannot be closed from inside', () => {
    expect(codeSpan('a`b')).toBe('``a`b``');
    expect(codeSpan('a``b')).toBe('```a``b```');
  });

  it('pads when the text itself starts or ends with a backtick', () => {
    expect(codeSpan('`x')).toBe('`` `x ``');
  });
});
