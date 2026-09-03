/**
 * Finding `<script>` and `<style>` blocks in an HTML document.
 *
 * This used to be two `/<script(?:\s[^>]*)?>(?<content>[\s\S]*?)<\/script>/gi`
 * matched over the whole text. A lazy `[\s\S]*?` between an opener and a closer
 * is fine while every opener has a closer; the moment one does not, the engine
 * scans to end of file, fails, restarts one character along, and does it again
 * for every remaining opener. Measured: 90 KB took 334 ms, 360 KB 5.2 s, 720 KB
 * 21.3 s — and this runs on every save and every 500 ms while the author types.
 *
 * A forward scan cannot do that: it looks at every character a bounded number of
 * times whatever the document contains.
 *
 * The block's `contentStart` comes from the scan itself rather than from
 * searching for the content inside the matched text, which is also what makes
 * the diagnostic land on the right line when the content happens to appear in
 * an attribute of the opening tag.
 *
 * Pure module: no vscode import, so it is testable on its own.
 */

/** One embedded block's body and where that body begins in the document. */
export interface EmbeddedBlock {
  /** The text between the opening and closing tags. */
  readonly content: string;
  /** Offset of the first character of `content` within the document. */
  readonly contentStart: number;
}

/** True when `<name` at `at` is the whole tag name, not the head of a longer one. */
function isTagBoundary(text: string, at: number): boolean {
  const next = text[at];
  return next === undefined || next === '>' || next === '/' || /\s/.test(next);
}

/**
 * Every closed `<tag>…</tag>` block in `text`, in document order.
 *
 * An opening tag with no matching closer ends the scan: everything after it is
 * inside an unterminated element, so there is no further block to report.
 */
export function findEmbeddedBlocks(text: string, tag: 'script' | 'style'): EmbeddedBlock[] {
  const hay = text.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  const blocks: EmbeddedBlock[] = [];

  let cursor = 0;
  while (cursor < hay.length) {
    const openAt = hay.indexOf(open, cursor);
    if (openAt === -1) break;

    if (!isTagBoundary(hay, openAt + open.length)) {
      cursor = openAt + open.length;
      continue;
    }

    const openEnd = hay.indexOf('>', openAt + open.length);
    if (openEnd === -1) break;

    const closeAt = hay.indexOf(close, openEnd + 1);
    if (closeAt === -1) break;

    blocks.push({ content: text.slice(openEnd + 1, closeAt), contentStart: openEnd + 1 });
    cursor = closeAt + close.length;
  }

  return blocks;
}
