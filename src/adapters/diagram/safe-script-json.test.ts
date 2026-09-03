import { describe, expect, it } from 'vitest';

import { safeScriptJson } from './safe-script-json';

/** Parse the escaped payload exactly like the browser would: as a JS expression. */
function roundTrip(escaped: string): unknown {
  return new Function(`return ${escaped};`)();
}

describe('safeScriptJson', () => {
  it('neutralises </script> so the HTML parser cannot close the script element', () => {
    const out = safeScriptJson({ comment: 'evil </script><script>alert(1)</script>' });
    expect(out).not.toContain('</script');
    expect(out).toContain('<\\/script');
  });

  it('neutralises <!-- comment openers', () => {
    const out = safeScriptJson({ note: 'sneaky <!-- comment' });
    expect(out).not.toContain('<!--');
  });

  it('escapes U+2028 and U+2029 line separators to \\u sequences', () => {
    const out = safeScriptJson({ text: 'a\u2028b\u2029c' });
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('round-trips the original data through a JS parse', () => {
    const payload = {
      name: 'Model</script>',
      docs: '<!-- hi -->',
      sep: 'x\u2028y\u2029z',
      nested: { list: [1, 'two', null] },
    };
    expect(roundTrip(safeScriptJson(payload))).toEqual(payload);
  });

  it('leaves benign payloads as plain JSON', () => {
    expect(safeScriptJson({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
  });
});
