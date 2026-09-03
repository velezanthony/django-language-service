/**
 * A `vscode` module good enough to run a provider against.
 *
 * The adapters in this folder were tested only where a pure helper had been
 * split out of them, which left the providers themselves — the part with the
 * cursor arithmetic, the quote handling and the Live Mode gate — covered by
 * nothing. Three of the defects this double exists to hold are invisible from
 * a pure helper: they are about which argument the provider passes, in what
 * order, and where it puts the range.
 *
 * Faithful where fidelity is the point:
 *
 *  - `SnippetString` reproduces the escaping of the real class
 *    (`extHostTypes.ts`): `appendText` and `appendPlaceholder` both escape
 *    `$`, `}` and `\`. A test that hand-rolled that escape would only prove the
 *    test agrees with itself.
 *  - `TextDocument.offsetAt` / `positionAt` are real UTF-16 offset arithmetic
 *    over the source, so a range built from offsets is checked against the same
 *    text the editor would see.
 *
 * Lives under `__fixtures__/` so vitest does not collect it and the
 * architecture sweep does not read it. Nothing in the extension imports it.
 */

// ── Geometry ──

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(
    startOrStartLine: Position | number,
    endOrStartChar: Position | number,
    endLine?: number,
    endChar?: number,
  ) {
    if (typeof startOrStartLine === 'number') {
      this.start = new Position(startOrStartLine, endOrStartChar as number);
      this.end = new Position(endLine ?? 0, endChar ?? 0);
    } else {
      this.start = startOrStartLine;
      this.end = endOrStartChar as Position;
    }
  }
}

export class Location {
  readonly range: Range;
  /**
   * A Position is normalised to an empty Range, which is what the real
   * constructor documents ("Position will be converted to an empty range").
   * Storing it raw left `location.range.start` undefined, so an assertion
   * written against a Location built the ordinary way read as a provider bug.
   */
  constructor(
    readonly uri: Uri,
    rangeOrPosition: Range | Position,
  ) {
    this.range =
      rangeOrPosition instanceof Range ? rangeOrPosition : new Range(rangeOrPosition, rangeOrPosition);
  }
}

// ── Uri ──

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
  ) {}
  static file(path: string): Uri {
    return new Uri('file', path);
  }
  static parse(value: string): Uri {
    return new Uri('file', value);
  }
  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

// ── Markdown / snippets ──

export class MarkdownString {
  value = '';
  supportThemeIcons = false;
  isTrusted: boolean | undefined;
  constructor(value?: string) {
    this.value = value ?? '';
  }
  appendMarkdown(text: string): MarkdownString {
    this.value += text;
    return this;
  }
  appendText(text: string): MarkdownString {
    this.value += text;
    return this;
  }
  appendCodeblock(code: string, language?: string): MarkdownString {
    this.value += `\n\`\`\`${language ?? ''}\n${code}\n\`\`\`\n`;
    return this;
  }
}

/** Mirrors `vscode.SnippetString`, escaping included — see the header. */
export class SnippetString {
  value: string;
  private tabstop = 1;
  constructor(value?: string) {
    this.value = value ?? '';
  }
  private static escape(value: string): string {
    return value.replace(/\$|}|\\/g, '\\$&');
  }
  appendText(text: string): SnippetString {
    this.value += SnippetString.escape(text);
    return this;
  }
  appendTabstop(number: number = this.tabstop++): SnippetString {
    this.value += `$${number}`;
    return this;
  }
  appendPlaceholder(value: string, number: number = this.tabstop++): SnippetString {
    this.value += `\${${number}:${SnippetString.escape(value)}}`;
    return this;
  }
}

// ── Provider result types ──

/**
 * `CodeActionKind` is a hierarchy of dotted strings, and `contains` is how VS
 * Code decides whether a provider's kinds satisfy a request's `only` filter.
 * Modelled rather than stubbed, because a provider that reads
 * `CodeActionKind.QuickFix` at MODULE level cannot even be imported without it.
 */
export class CodeActionKind {
  static readonly QuickFix = new CodeActionKind('quickfix');
  static readonly Refactor = new CodeActionKind('refactor');
  static readonly Source = new CodeActionKind('source');
  static readonly SourceFixAll = new CodeActionKind('source.fixAll');

  constructor(readonly value: string) {}

  append(parts: string): CodeActionKind {
    return new CodeActionKind(`${this.value}.${parts}`);
  }

  contains(other: CodeActionKind): boolean {
    return this.value === other.value || other.value.startsWith(`${this.value}.`);
  }

  intersects(other: CodeActionKind): boolean {
    return this.contains(other) || other.contains(this);
  }
}

export class CodeAction {
  edit?: unknown;
  diagnostics?: unknown[];
  isPreferred?: boolean;
  command?: unknown;
  constructor(
    readonly title: string,
    readonly kind?: CodeActionKind,
  ) {}
}


export class Hover {
  constructor(
    readonly contents: MarkdownString | MarkdownString[],
    readonly range?: Range,
  ) {}
}

export const CompletionItemKind = {
  Text: 0,
  Method: 1,
  Function: 2,
  Field: 4,
  Variable: 5,
  Class: 6,
  Property: 9,
  Reference: 17,
  File: 16,
  Folder: 18,
  Snippet: 14,
  Keyword: 13,
  Module: 8,
  Constant: 20,
  Struct: 21,
  Enum: 12,
  Value: 11,
} as const;

export class CompletionItem {
  detail: string | undefined;
  documentation: MarkdownString | string | undefined;
  insertText: string | SnippetString | undefined;
  sortText: string | undefined;
  filterText: string | undefined;
  range: Range | undefined;
  constructor(
    readonly label: string,
    readonly kind?: number,
  ) {}
}

/**
 * `isIncomplete: true` tells VS Code to re-ask on every keystroke rather than
 * filtering the first answer itself — which is why the path completions return
 * a list and not a bare array.
 */
export class CompletionList {
  constructor(
    readonly items: readonly unknown[] = [],
    readonly isIncomplete: boolean = false,
  ) {}
}

export const DocumentHighlightKind = { Text: 0, Read: 1, Write: 2 } as const;

export class DocumentHighlight {
  constructor(
    readonly range: Range,
    readonly kind?: number,
  ) {}
}

// ── Document ──

/**
 * `getText` is a plain method so a test can spy on it — which is how the Live
 * Mode ordering rule is checked: with no live view selected, a provider that
 * gates first never reads the document at all.
 */
export class TextDocumentDouble {
  readonly lineStarts: number[];
  constructor(
    private readonly source: string,
    readonly languageId: string = 'html',
    readonly uri: Uri = Uri.file('/w/templates/page.html'),
  ) {
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') this.lineStarts.push(i + 1);
    }
  }
  getText(): string {
    return this.source;
  }
  lineAt(lineOrPosition: number | Position): { text: string; lineNumber: number } {
    const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
    const from = this.lineStarts[line] ?? 0;
    const to = this.lineStarts[line + 1] ?? this.source.length + 1;
    return { text: this.source.slice(from, to).replace(/\n$/, ''), lineNumber: line };
  }
  offsetAt(position: Position): number {
    return (this.lineStarts[position.line] ?? 0) + position.character;
  }
  positionAt(offset: number): Position {
    let line = 0;
    for (let i = 0; i < this.lineStarts.length; i++) {
      if (this.lineStarts[i]! <= offset) line = i;
      else break;
    }
    return new Position(line, offset - this.lineStarts[line]!);
  }
  /** The Position of the character just after the first occurrence of `needle`. */
  positionAfter(needle: string): Position {
    const at = this.source.indexOf(needle);
    if (at === -1) throw new Error(`needle not in source: ${needle}`);
    return this.positionAt(at + needle.length);
  }
  /** The Position of the nth (0-based) occurrence of `needle`, plus `into`. */
  positionOf(needle: string, nth = 0, into = 0): Position {
    let at = -1;
    for (let i = 0; i <= nth; i++) at = this.source.indexOf(needle, at + 1);
    if (at === -1) throw new Error(`occurrence ${nth} of ${needle} not in source`);
    return this.positionAt(at + into);
  }
}

// ── Namespaces ──

/** Providers registered during a `register()` call, newest last. */
export const registered: unknown[] = [];

export const languages = {
  createDiagnosticCollection(name: string): DiagnosticCollectionDouble {
    const c = new DiagnosticCollectionDouble(name);
    diagnosticCollections.set(name, c);
    return c;
  },
  registerHoverProvider: (_sel: unknown, provider: unknown) => {
    registered.push(provider);
    return { dispose: () => undefined };
  },
  registerCompletionItemProvider: (_sel: unknown, provider: unknown, ..._trig: string[]) => {
    registered.push(provider);
    return { dispose: () => undefined };
  },
  registerDefinitionProvider: (_sel: unknown, provider: unknown) => {
    registered.push(provider);
    return { dispose: () => undefined };
  },
  registerDocumentHighlightProvider: (_sel: unknown, provider: unknown) => {
    registered.push(provider);
    return { dispose: () => undefined };
  },
};

/** The last provider handed to a `register*` call. */
export function lastRegistered<T>(): T {
  const provider = registered[registered.length - 1];
  if (!provider) throw new Error('no provider was registered');
  return provider as T;
}

export function resetRegistered(): void {
  registered.length = 0;
}

/** Files `workspace.fs.readFile` will serve, by fsPath. */
export const fileContents = new Map<string, string>();

/** Answers `workspace.findFiles` will give, in call order; see template-resolve. */
export let findFilesImpl: (pattern: unknown) => Promise<Uri[]> = () => Promise.resolve([]);

export function setFindFiles(impl: (pattern: unknown) => Promise<Uri[]>): void {
  findFilesImpl = impl;
}

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 } as const;

export class Diagnostic {
  source?: string;
  code?: unknown;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number = DiagnosticSeverity.Error,
  ) {}
}

// ── Document lifecycle + diagnostics ──
//
// The double had neither, which is the whole reason `adapters/diagnostics/`
// and `script-filter/` had no unit tests: those providers do not answer a
// request, they REACT to workspace events and write into a collection. With no
// way to fire an event or read a collection back, there was nothing to assert.

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private readonly listeners: Array<Listener<T>> = [];
  readonly event = (cb: Listener<T>) => {
    this.listeners.push(cb);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(cb);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  };
  fire(value: T): void {
    for (const l of [...this.listeners]) l(value);
  }
}

/** Fire these from a test to drive a reactive provider. */
export const documentEvents = {
  open: new Emitter<unknown>(),
  change: new Emitter<{ document: unknown }>(),
  save: new Emitter<unknown>(),
  close: new Emitter<unknown>(),
};

/** Every collection created since the last `resetDiagnostics()`, by name. */
export const diagnosticCollections = new Map<string, DiagnosticCollectionDouble>();

export class DiagnosticCollectionDouble {
  readonly entries = new Map<string, readonly unknown[]>();
  disposed = false;
  constructor(readonly name: string) {}
  set(uri: Uri, diags: readonly unknown[]): void {
    if (this.disposed) throw new Error(`set() on disposed collection ${this.name}`);
    this.entries.set(uri.toString(), diags);
  }
  delete(uri: Uri): void {
    this.entries.delete(uri.toString());
  }
  get(uri: Uri): readonly unknown[] {
    return this.entries.get(uri.toString()) ?? [];
  }
  clear(): void {
    this.entries.clear();
  }
  dispose(): void {
    this.disposed = true;
  }
}

export function resetDiagnostics(): void {
  diagnosticCollections.clear();
}

export const workspace = {
  onDidOpenTextDocument: (cb: Listener<never>) => documentEvents.open.event(cb as Listener<unknown>),
  onDidChangeTextDocument: (cb: Listener<never>) =>
    documentEvents.change.event(cb as Listener<{ document: unknown }>),
  onDidSaveTextDocument: (cb: Listener<never>) => documentEvents.save.event(cb as Listener<unknown>),
  onDidCloseTextDocument: (cb: Listener<never>) =>
    documentEvents.close.event(cb as Listener<unknown>),
  textDocuments: [] as unknown[],
  fs: {
    readFile: (uri: Uri): Promise<Uint8Array> =>
      Promise.resolve(new TextEncoder().encode(fileContents.get(uri.fsPath) ?? '')),
  },
  asRelativePath: (uri: Uri | string): string => {
    const path = typeof uri === 'string' ? uri : uri.fsPath;
    return path.replace(/^\/w\//, '');
  },
  findFiles: (pattern: unknown): Promise<Uri[]> => findFilesImpl(pattern),
  workspaceFolders: undefined as unknown,
  getConfiguration: () => ({ get: () => undefined }),
};

export const window = {
  activeTextEditor: undefined as unknown,
  createOutputChannel: () => ({
    appendLine: () => undefined,
    show: () => undefined,
    dispose: () => undefined,
  }),
};

/**
 * `Disposable.from` disposes IN ORDER, and providers rely on that: the one that
 * cancels pending timers is written last, after the collections it would
 * otherwise write into.
 */
export class Disposable {
  constructor(private readonly fn: () => void) {}
  static from(...items: ReadonlyArray<{ dispose(): void }>): Disposable {
    return new Disposable(() => {
      for (const i of items) i.dispose();
    });
  }
  dispose(): void {
    this.fn();
  }
}

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
  registerCommand: () => ({ dispose: () => undefined }),
};

export const EndOfLine = { LF: 1, CRLF: 2 } as const;
