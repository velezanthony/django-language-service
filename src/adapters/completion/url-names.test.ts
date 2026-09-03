/**
 * What `{% url %}` completion actually types into the buffer.
 *
 * Two defects, both invisible from the completion LABEL and both only
 * reachable through `insertText`:
 *
 *  - the closing quote was the literal `'`, so an author who opened with `"`
 *    got `{% url "detail' %}`;
 *  - the url name was interpolated into a `SnippetString` through the
 *    constructor, which does no escaping — so a name carrying `$` or `}`
 *    stopped being text and became snippet syntax.
 *
 * The rules are stated over the quote CHARACTER and over the snippet GRAMMAR,
 * not over one example of each. `snippetLiteral` below is a small independent
 * reader of that grammar: it does not consult the class that produced the
 * string, so an escape that the producer and the test agreed on but the editor
 * does not would still fail here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted above every import below, so the provider loads against the double.
vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import {
  TextDocumentDouble as Doc,
  SnippetString,
  lastRegistered,
  resetRegistered,
  type Position,
} from '$adapters/_shared/__fixtures__/vscode-double';
import { projectWithUrls, urlEntry } from '$adapters/_shared/__fixtures__/project-double';

import { register } from './url-names';

interface CompletionItemLike {
  readonly label: string;
  insertText: string | { value: string } | undefined;
}

interface CompletionProvider {
  provideCompletionItems(
    doc: unknown,
    pos: Position,
  ): Promise<CompletionItemLike[] | undefined> | CompletionItemLike[] | undefined;
}

/**
 * The characters a snippet puts in the buffer, per the TextMate snippet
 * grammar VS Code implements:
 *   `\X`          → X
 *   `${n:default}`→ default
 *   `$n` / `$NAME`→ nothing the author typed
 * Everything else is literal. Written here rather than imported so that the
 * producer and the assertion cannot share a mistake.
 */
function snippetLiteral(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '\\') {
      out += value[++i] ?? '';
      continue;
    }
    if (ch === '$') {
      const placeholder = /^\$\{\d+:([^}]*)\}/.exec(value.slice(i));
      if (placeholder) {
        out += placeholder[1]!;
        i += placeholder[0].length - 1;
        continue;
      }
      const tabstop = /^\$(?:\{\d+\}|\d+|\w+)/.exec(value.slice(i));
      if (tabstop) {
        i += tabstop[0].length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

const ctx = {} as never;

function providerFor(names: readonly (string | { name: string; pattern: string })[]) {
  resetRegistered();
  const project = projectWithUrls(
    names.map(n =>
      typeof n === 'string'
        ? urlEntry({ name: n })
        : urlEntry({ name: n.name, pattern: n.pattern }),
    ),
  );
  register(ctx, { getProject: () => project });
  return lastRegistered<CompletionProvider>();
}

/** The insert text offered for `name` with the cursor at the end of `line`. */
async function insertTextFor(
  provider: CompletionProvider,
  line: string,
  name: string,
  languageId = 'html',
): Promise<string> {
  const doc = new Doc(line, languageId);
  const items = await provider.provideCompletionItems(doc, doc.positionAt(line.length));
  const item = items?.find(i => i.label === name);
  if (!item) throw new Error(`no completion offered for ${name}`);
  const insert = item.insertText;
  if (insert === undefined) return item.label;
  if (typeof insert === 'string') return insert;
  return snippetLiteral(insert.value);
}

beforeEach(() => resetRegistered());

describe('the completion closes the quote the author opened', () => {
  // Parameterised over the quote character: the defect was a hard-coded `'`,
  // and pinning one example is how it survived.
  it.each(["'", '"'])('closes a %s-quoted url tag with the same character', async quote => {
    const provider = providerFor([{ name: 'detail', pattern: 'p/<int:pk>/' }]);
    const text = await insertTextFor(provider, `{% url ${quote}`, 'detail');
    expect(text.startsWith(`detail${quote}`)).toBe(true);
    // And nothing of the other quote leaked in.
    expect(text).not.toContain(quote === "'" ? '"' : "'");
  });

  it.each(["'", '"'])('leaves an argument-free url as bare text under %s', async quote => {
    const provider = providerFor(['home']);
    expect(await insertTextFor(provider, `{% url ${quote}`, 'home')).toBe('home');
  });
});

describe('a url name is inserted as text, never as snippet syntax', () => {
  // Django accepts any string as a url name; `$` and `}` are ordinary
  // characters to it and metacharacters to the snippet grammar.
  it.each(['price$total', 'weird}name', 'back\\slash', 'all$of}them\\here'])(
    'inserts %s literally when the pattern has arguments',
    async name => {
      const provider = providerFor([{ name, pattern: 'x/<int:pk>/' }]);
      const text = await insertTextFor(provider, "{% url '", name);
      expect(text.startsWith(`${name}'`)).toBe(true);
    },
  );

  it('still offers the argument as an editable placeholder', async () => {
    const provider = providerFor([{ name: 'detail', pattern: 'p/<int:pk>/<slug:slug>/' }]);
    const doc = new Doc("{% url '", 'html');
    const items = await providerRaw(provider, doc);
    const item = items.find(i => i.label === 'detail')!;
    const value = (item.insertText as { value: string }).value;
    expect(value).toContain('${1:pk}');
    expect(value).toContain('${2:slug}');
  });

  // The escape must be the one the editor performs, not one the test invented.
  it('escapes exactly what SnippetString.appendText escapes', async () => {
    const name = 'a$b}c\\d';
    const provider = providerFor([{ name, pattern: 'x/<int:pk>/' }]);
    const doc = new Doc("{% url '", 'html');
    const items = await providerRaw(provider, doc);
    const value = (items.find(i => i.label === name)!.insertText as { value: string }).value;
    expect(value.startsWith(new SnippetString().appendText(`${name}'`).value)).toBe(true);
  });
});

async function providerRaw(provider: CompletionProvider, doc: InstanceType<typeof Doc>) {
  const items = await provider.provideCompletionItems(doc, doc.positionAt(doc.getText().length));
  if (!items) throw new Error('no completions offered');
  return items;
}
