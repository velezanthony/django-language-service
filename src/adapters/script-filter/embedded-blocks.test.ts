import { describe, it, expect } from 'vitest';
import { findEmbeddedBlocks } from './embedded-blocks';

describe('findEmbeddedBlocks', () => {
  it('finds the content of a block and where it starts', () => {
    const text = '<p>x</p>\n<script>let a = 1;</script>\n';
    const [block] = findEmbeddedBlocks(text, 'script');
    expect(block?.content).toBe('let a = 1;');
    expect(text.slice(block!.contentStart, block!.contentStart + block!.content.length)).toBe(
      'let a = 1;',
    );
  });

  it('finds several, keeps document order, and reads attributes', () => {
    const text = '<script>a</script><script type="text/javascript">b</script>';
    expect(findEmbeddedBlocks(text, 'script').map(b => b.content)).toEqual(['a', 'b']);
  });

  it('is case-insensitive, as HTML is', () => {
    expect(findEmbeddedBlocks('<SCRIPT>a</SCRIPT>', 'script').map(b => b.content)).toEqual(['a']);
    expect(findEmbeddedBlocks('<Style>a</Style>', 'style').map(b => b.content)).toEqual(['a']);
  });

  it('does not mistake a longer tag name for the tag', () => {
    expect(findEmbeddedBlocks('<scripting>a</scripting>', 'script')).toEqual([]);
  });

  it('reports nothing for a block that is never closed', () => {
    expect(findEmbeddedBlocks('<script>let a = 1;', 'script')).toEqual([]);
  });

  it('reports the closed block that precedes an unclosed one', () => {
    const text = '<script>ok</script><script>never closed';
    expect(findEmbeddedBlocks(text, 'script').map(b => b.content)).toEqual(['ok']);
  });

  // The offset is taken from the scan, not by searching for the content inside
  // the matched text. `match[0].indexOf(content)` lands on the attribute when
  // the content also appears there, and every diagnostic in the block is then
  // reported on the wrong line.
  it('locates content that also appears inside the opening tag', () => {
    const text = '<script data-x="let a">let a</script>';
    const [block] = findEmbeddedBlocks(text, 'script');
    expect(text.slice(block!.contentStart, block!.contentStart + block!.content.length)).toBe(
      'let a',
    );
    expect(block!.contentStart).toBe(text.indexOf('>') + 1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Cost is proportional to the length of the document, once.
  //
  // The pattern was `<script…>([\s\S]*?)</script>` with the global flag over the
  // whole document. Every `<script` that never gets closed makes the engine scan
  // to end of file before giving up and starting again one character along:
  // 90 KB took 334 ms, 360 KB took 5.2 s, 720 KB took 21.3 s. This runs on every
  // save and every 500 ms while typing.
  // ───────────────────────────────────────────────────────────────────────────
  it('stays linear on a document full of unclosed openings', () => {
    const text = '<script>'.repeat(2000) + 'x'.repeat(100_000);
    const started = performance.now();
    findEmbeddedBlocks(text, 'script');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('stays linear when the openings are closed too', () => {
    const text = '<script>a</script>'.repeat(2000) + 'y'.repeat(100_000);
    const started = performance.now();
    expect(findEmbeddedBlocks(text, 'script')).toHaveLength(2000);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
