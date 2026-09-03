import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Single source of truth for our identity: <publisher>.<name> from package.json.
// __dirname at runtime is out/src/integration-tests/suite → 4 levels up is the
// repo root (same convention as fixturePath()).
const MANIFEST = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
) as { publisher: string; name: string; contributes?: { commands?: Array<{ command: string }> } };
const EXTENSION_ID = `${MANIFEST.publisher}.${MANIFEST.name}`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Poll until the extension's commands are registered (activation complete), or timeout.
// Activation for test-django-project with 216 models takes ~4-5 seconds — a fixed sleep is brittle.
let _activationConfirmed = false;
async function ensureExtensionActivated(timeoutMs = 15_000): Promise<void> {
  if (_activationConfirmed) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes('django-language-service.toggleComment')) {
      _activationConfirmed = true;
      return;
    }
    await sleep(200);
  }
  throw new Error('Extension failed to activate within ' + timeoutMs + 'ms');
}

// Poll until `predicate` returns a truthy value, or throw at the deadline. Robust replacement
// for fixed sleeps: a slow CI box just polls a few more times instead of timing out a whole test.
async function waitFor<T>(
  predicate: () => T | undefined | Promise<T | undefined>,
  {
    timeoutMs = 12_000,
    intervalMs = 150,
    label = 'condition',
  }: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor: ${label} not met within ${timeoutMs}ms`);
}

/**
 * Close every open editor WITHOUT writing anything to disk.
 *
 * Almost every test here opens a real workspace file and then FORMATS it, which
 * mutates the editor buffer. Nothing used to close those editors, so two things
 * went wrong at once:
 *
 *   - The next test that opened the same file got the previous test's mutated
 *     buffer instead of the file on disk. Two consecutive dashboard.html format
 *     tests were really testing format-of-already-formatted-text.
 *   - Editors accumulated across all 136 tests, and with them their watchers and
 *     providers, until the host ran out of file descriptors (EMFILE) and the
 *     formatter warm-up timed out on the next run.
 *
 * `revertAndCloseActiveEditor` is the one that discards: plain closeAllEditors
 * would prompt on a dirty buffer and hang the run.
 */
async function closeAllEditorsWithoutSaving(): Promise<void> {
  // Bounded — a stuck editor must not spin here forever.
  for (let i = 0; i < 40 && vscode.window.activeTextEditor; i++) {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
  // Sweep whatever had no dirty state to revert (webview tabs, diff views).
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

// Runs after EVERY test, so no test can inherit another's buffers.
teardown(async () => {
  await closeAllEditorsWithoutSaving();
});

// One-time formatter warm-up. On a COLD run (first launch after compiling) the very first
// `editor.action.formatDocument` can fire before the formatting provider is attached or the
// editor has focus — the command resolves but applies NO edit, and every formatter test that
// follows fails with "expected true, actual false". Poll: re-focus the doc, format, and check
// that the edit actually landed, retrying until the provider answers.
let _formatterWarmedUp = false;
async function ensureFormatterReady(): Promise<void> {
  if (_formatterWarmedUp) return;
  await ensureExtensionActivated();
  // Await full activation explicitly — ensureExtensionActivated only proves the
  // command registrations landed, not that activate() finished resolving.
  await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
  const document = await vscode.workspace.openTextDocument({
    language: 'html',
    content: '{% if x %}\n<p>warmup</p>\n{% endif %}',
  });
  // Prime the provider path first: executeFormatDocumentProvider asks the
  // registered providers directly (no picker, no active-editor dependency),
  // which forces VS Code to resolve them for this document. Sessions where
  // editor.action.formatDocument silently applied nothing for the whole run
  // stopped reproducing once providers were primed this way.
  await waitFor(
    async () => {
      const edits = await vscode.commands.executeCommand(
        'vscode.executeFormatDocumentProvider',
        document.uri,
        { tabSize: 2, insertSpaces: true },
      );
      return Array.isArray(edits) && edits.length > 0 ? true : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 400, label: 'formatter provider edits' },
  );
  await waitFor(
    async () => {
      // Re-focus on EVERY retry — formatDocument acts on the active editor, and on a
      // cold host focus can land on another view between attempts.
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('editor.action.formatDocument');
      await sleep(COMMAND_YIELD_MS);
      return document.getText().includes('  <p>warmup</p>') ? true : undefined;
    },
    { timeoutMs: 45_000, intervalMs: 400, label: 'formatter warm-up edit' },
  );
  _formatterWarmedUp = true;
}

// Root-level hook: warm the formatter up ONCE before any suite runs, on its own generous
// budget, so no individual formatter test pays the cold-start cost (or times out on it).
suiteSetup(async function () {
  this.timeout(60_000);
  await ensureFormatterReady();
});

suite('Join wrapped tag code action', function () {
  this.timeout(30_000);

  test('offers to join a tag the author wrapped, and does it', async function () {
    const doc = await vscode.workspace.openTextDocument({
      language: 'django-html',
      content: '{% if user.is_staff\n   and user.is_active %}\n<p>hi</p>\n{% endif %}\n',
    });
    const editor = await vscode.window.showTextDocument(doc);
    await ensureExtensionActivated();
    await sleep(SETUP_SLEEPS.medium);

    const inTag = new vscode.Position(0, 8);
    const actions = await waitFor(
      async () => {
        const found = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          doc.uri,
          new vscode.Range(inTag, inTag),
        );
        return found?.some(a => a.title === 'Join tag into one line') ? found : undefined;
      },
      { timeoutMs: 15_000, label: 'join-tag code action' },
    );

    const join = actions.find(a => a.title === 'Join tag into one line');
    assert.ok(join?.edit, 'the action carries its edit');
    assert.ok(await vscode.workspace.applyEdit(join.edit), 'edit applied');
    assert.strictEqual(doc.getText().split('\n')[0], '{% if user.is_staff and user.is_active %}');
    assert.ok(editor);
  });

  // A wrapped tag is valid Django. Offering the action is fine; reporting it
  // would be exactly the false-positive noise this project keeps removing.
  test('reports no problem for the wrapped tag', async function () {
    const doc = await vscode.workspace.openTextDocument({
      language: 'django-html',
      content: '{% if a\n   and b %}\nx\n{% endif %}\n',
    });
    await vscode.window.showTextDocument(doc);
    await ensureExtensionActivated();
    await sleep(DIAGNOSTICS_WAIT_MS);
    const ours = vscode.languages.getDiagnostics(doc.uri).filter(d => d.source === 'django');
    assert.deepStrictEqual(
      ours.map(d => d.message),
      [],
    );
  });

  test('offers nothing on a tag already on one line', async function () {
    const doc = await vscode.workspace.openTextDocument({
      language: 'django-html',
      content: '{% if a and b %}\nx\n{% endif %}\n',
    });
    await vscode.window.showTextDocument(doc);
    await ensureExtensionActivated();
    await sleep(SETUP_SLEEPS.medium);

    const at = new vscode.Position(0, 6);
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      new vscode.Range(at, at),
    );
    assert.ok(!(actions ?? []).some(a => a.title === 'Join tag into one line'));
  });
});

suite('Test Harness Contracts', () => {
  // Guards closeAllEditorsWithoutSaving. Swap its revert for a save and this
  // test rewrites a real project file — which is precisely the accident it
  // exists to prevent.
  test('closing an edited file discards the edit instead of writing it', async function () {
    this.timeout(30_000);
    const uri = workspacePath('templates', 'base', 'base.html');
    const onDisk = fs.readFileSync(uri.fsPath, 'utf8');

    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), '<!-- scribble -->\n');
    assert.ok(await vscode.workspace.applyEdit(edit), 'edit applied');
    assert.ok(doc.isDirty, 'buffer is dirty before closing');

    await closeAllEditorsWithoutSaving();

    assert.strictEqual(
      fs.readFileSync(uri.fsPath, 'utf8'),
      onDisk,
      'closing must not write the edit to disk',
    );
    const reopened = await vscode.workspace.openTextDocument(uri);
    assert.ok(
      !reopened.getText().startsWith('<!-- scribble -->'),
      'reopening must give the file on disk, not the previous buffer',
    );
    assert.ok(!reopened.isDirty, 'reopened buffer starts clean');
  });

  test('test workspace pins OUR extension as default formatter', () => {
    // settings.json cannot interpolate, so the extension id is literal there.
    // This contract test keeps it honest: if the publisher or name ever
    // changes in package.json, this fails instead of the pin silently
    // pointing at a ghost and resurrecting the multi-formatter race.
    const settingsPath = path.resolve(
      __dirname,
      '../../../../src/test-django-project/.vscode/settings.json',
    );
    const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const settings = JSON.parse(raw) as Record<string, { 'editor.defaultFormatter'?: string }>;
    for (const lang of ['[html]', '[django-html]', '[django-txt]']) {
      assert.strictEqual(
        settings[lang]?.['editor.defaultFormatter'],
        EXTENSION_ID,
        `${lang} default formatter in test settings.json must be ${EXTENSION_ID}`,
      );
    }
  });
});

// Per-document provider-attachment wait, tiered by what the test actually exercises.
// The extension is already activated once the first test completes; the scanner has warmed up.
// Subsequent documents only need time for VS Code to attach formatter/hover/diagnostics providers.
type SetupTier = 'quick' | 'medium' | 'heavy';
const SETUP_SLEEPS: Record<SetupTier, number> = {
  // Trivial (0.5s): extension API, language registration, "has commands" checks — no providers needed.
  quick: 500,
  // Default (0.8s): formatter on small content, toggle comment, folding, DTL block tests.
  // Scanner is already warm; attaching a formatter provider to a fresh doc is ~200-400ms in practice.
  medium: 800,
  // Heavy (1.3s): Real Project tests with hover/completion/diagnostics, real fixture files, diagram.
  heavy: 1300,
};

async function openHtmlDocument(
  content: string,
  tier: SetupTier = 'medium',
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({ language: 'html', content });
  await vscode.window.showTextDocument(document);
  await ensureExtensionActivated();
  await sleep(SETUP_SLEEPS[tier]);
  return document;
}

async function openDjangoHtmlDocument(
  content: string,
  tier: SetupTier = 'medium',
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument({ language: 'django-html', content });
  await vscode.window.showTextDocument(document);
  await ensureExtensionActivated();
  await sleep(SETUP_SLEEPS[tier]);
  return document;
}

async function formatAndGetText(document: vscode.TextDocument): Promise<string> {
  // executeCommand resolves after VS Code applies the TextEdits — we only need a microtask yield
  // so the document state reflects the edit before we call getText().
  await vscode.commands.executeCommand('editor.action.formatDocument');
  await sleep(COMMAND_YIELD_MS);
  return document.getText();
}

function fixturePath(filename: string): string {
  return path.resolve(__dirname, '../../../../src/integration-tests/fixtures', filename);
}

// ════════════════════════════════════════════════════
// SECTION 1: Extension Activation & Registration
// ════════════════════════════════════════════════════

suite('Extension Activation', () => {
  test('VS Code API is available', () => {
    assert.ok(vscode.workspace);
    assert.ok(vscode.window);
    assert.ok(vscode.commands);
    assert.ok(vscode.languages);
  });

  test('django-html language is registered', async () => {
    const languages = await vscode.languages.getLanguages();
    assert.ok(languages.includes('django-html'));
  });

  test('django-txt language is registered', async () => {
    const languages = await vscode.languages.getLanguages();
    assert.ok(languages.includes('django-txt'));
  });

  test('All commands are registered after activation', async function () {
    this.timeout(15_000);
    // Quick tier — we only need commands to be registered, no provider attachment required.
    await openHtmlDocument('<p>trigger activation</p>', 'quick');

    // Derive the expected list from package.json's contributes.commands
    // instead of a hardcoded subset: a newly contributed command that the
    // extension forgets to register breaks this test automatically.
    const manifest = MANIFEST as {
      contributes?: { commands?: Array<{ command: string }> };
    };
    const declared = (manifest.contributes?.commands ?? []).map(c => c.command);
    assert.ok(
      declared.length > 0,
      'package.json declares no contributes.commands — manifest path broken?',
    );

    // Poll until every declared command is registered instead of a fixed sleep —
    // registration completes with activation but can land a beat after the first
    // command (the one ensureExtensionActivated waits on) appears.
    try {
      await waitFor(
        async () => {
          const commands = await vscode.commands.getCommands(true);
          return declared.every(id => commands.includes(id)) ? true : undefined;
        },
        { label: 'all contributed commands registered' },
      );
    } catch {
      // Fall through — the assert below reports WHICH commands are missing.
    }

    const commands = await vscode.commands.getCommands(true);
    const missing = declared.filter(id => !commands.includes(id));
    assert.strictEqual(
      missing.length,
      0,
      `Commands declared in package.json but never registered: ${missing.join(', ')}`,
    );
  });

  // 'Show log command opens output channel without error' was deleted, not
  // rewritten. It was the only test in this file with no assertion at all;
  // the one thing it did check — that the id is registered — is covered
  // exactly above, by the contract test derived from package.json. An
  // OutputChannel exposes nothing observable to assert on, and every
  // candidate assertion written for it was true regardless of the outcome.
  // A test that cannot fail is not coverage, and keeping it as one would
  // have been the same mistake it was flagged for.
});

// ════════════════════════════════════════════════════
// SECTION 2: Formatter — DTL Blocks
// ════════════════════════════════════════════════════

suite('Formatter — DTL Blocks', () => {
  test('if/endif indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% if x %}\n<p>Hello</p>\n{% endif %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <p>Hello</p>'), `Expected indent, got:\n${text}`);
  });

  test('if/else/endif indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% if x %}\n<p>yes</p>\n{% else %}\n<p>no</p>\n{% endif %}',
    );
    const text = await formatAndGetText(document);
    const lines = text.split('\n');
    assert.ok(
      lines.some(l => l === '{% else %}'),
      'else at level 0',
    );
    assert.ok(
      lines.some(l => l === '  <p>yes</p>'),
      'yes indented',
    );
    assert.ok(
      lines.some(l => l === '  <p>no</p>'),
      'no indented',
    );
  });

  test('for/empty/endfor indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% for i in items %}\n<li>{{ i }}</li>\n{% empty %}\n<li>none</li>\n{% endfor %}',
    );
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <li>{{ i }}</li>'), 'li indented');
    assert.ok(text.includes('{% empty %}'), 'empty at level 0');
  });

  test('block/endblock indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% block content %}\n<h1>Title</h1>\n{% endblock %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <h1>Title</h1>'), 'h1 indented inside block');
  });

  test('with/endwith indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% with x=1 %}\n{{ x }}\n{% endwith %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  {{ x }}'), 'variable indented inside with');
  });

  test('nested DTL blocks', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% if a %}\n{% for i in items %}\n<p>{{ i }}</p>\n{% endfor %}\n{% endif %}',
    );
    const text = await formatAndGetText(document);
    assert.ok(text.includes('    <p>{{ i }}</p>'), 'p indented 2 levels');
  });

  test('extends at column 0 with everything indented', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% extends "base.html" %}\n{% load static %}\n{% block content %}\n<h1>Hi</h1>\n{% endblock %}',
    );
    const text = await formatAndGetText(document);
    const lines = text.split('\n');
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    assert.ok(lines[1].startsWith('  '), 'load indented');
  });

  test('standalone tags do not indent', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% load static %}\n{% csrf_token %}\n{% url "home" %}',
    );
    const text = await formatAndGetText(document);
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      assert.ok(!line.startsWith(' '), `Should not indent: "${line}"`);
    }
  });
});

// ════════════════════════════════════════════════════
// SECTION 3: Formatter — Custom Tags (Dynamic Discovery)
// ════════════════════════════════════════════════════

suite('Formatter — Custom Tags', () => {
  test('element/endelement indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% element h1 %}\nHello\n{% endelement %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  Hello'), 'Hello indented inside element');
  });

  test('slot/endslot indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% slot body %}\n<p>content</p>\n{% endslot %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <p>content</p>'), 'content indented inside slot');
  });

  test('any custom tag pair is discovered', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% mywidget %}\n<div>inside</div>\n{% endmywidget %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <div>inside</div>'), 'custom tag discovered and indented');
  });
});

// ════════════════════════════════════════════════════
// SECTION 4: Formatter — HTML Edge Cases
// ════════════════════════════════════════════════════

suite('Formatter — HTML', () => {
  test('void elements do not indent', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<div>\n<br>\n<hr>\n<img src="x.png">\n</div>');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <br>'), 'br indented inside div');
    assert.ok(!text.includes('    <hr>'), 'hr should not be double-indented');
  });

  test('self-closing tags do not indent', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<div>\n<img src="x" />\n</div>');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <img'), 'img indented once');
  });

  test('same-line open+close does not indent next line', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<div>\n<p>text</p>\n<span>more</span>\n</div>');
    const text = await formatAndGetText(document);
    const lines = text.split('\n').filter(l => l.trim());
    assert.ok(lines[1].startsWith('  <p>'), 'p indented');
    assert.ok(lines[2].startsWith('  <span>'), 'span same level as p');
  });

  test('HTML + DTL mixed nesting', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<div>\n{% if x %}\n<p>Hi</p>\n{% endif %}\n</div>');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('    <p>Hi</p>'), 'p indented 2 levels (div + if)');
  });
});

// ════════════════════════════════════════════════════
// SECTION 5: Formatter — django-html language
// ════════════════════════════════════════════════════

suite('Formatter — django-html language', () => {
  test('Formatting works on django-html documents', async function () {
    this.timeout(15_000);
    const document = await openDjangoHtmlDocument('{% if x %}\n<p>Hello</p>\n{% endif %}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  <p>Hello</p>'), 'Should format django-html documents');
  });
});

// ════════════════════════════════════════════════════
// SECTION 6: Formatter — Idempotency
// ════════════════════════════════════════════════════

suite('Formatter — Idempotency', () => {
  test('Formatting twice produces same result', async function () {
    this.timeout(20_000);
    const document = await openHtmlDocument('{% if x %}\n<p>Hello</p>\n{% endif %}');
    const firstFormat = await formatAndGetText(document);
    const secondFormat = await formatAndGetText(document);
    assert.strictEqual(firstFormat, secondFormat, 'Second format should not change output');
  });

  test('Already formatted document is unchanged', async function () {
    this.timeout(15_000);
    const formatted = '{% if x %}\n  <p>Hello</p>\n{% endif %}\n';
    const document = await openHtmlDocument(formatted);
    const text = await formatAndGetText(document);
    assert.strictEqual(text, formatted, 'Formatted input should stay unchanged');
  });
});

// ════════════════════════════════════════════════════
// SECTION 7: Code Folding
// ════════════════════════════════════════════════════

suite('Code Folding', () => {
  test('Folding range for block/endblock', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% block x %}\n<p>1</p>\n<p>2</p>\n{% endblock %}');
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      document.uri,
    );
    assert.ok(ranges && ranges.length > 0, 'Should have folding range');
    assert.strictEqual(ranges![0].start, 0);
  });

  test('Folding range for if/endif', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% if x %}\n<p>1</p>\n<p>2</p>\n{% endif %}');
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      document.uri,
    );
    assert.ok(ranges && ranges.length > 0, 'if/endif should fold');
  });

  test('Folding range for custom tags', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% slot body %}\n<p>a</p>\n<p>b</p>\n{% endslot %}');
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      document.uri,
    );
    assert.ok(ranges && ranges.length > 0, 'Custom tags should fold');
  });

  test('Nested folding ranges', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% block a %}\n{% if x %}\n<p>deep</p>\n{% endif %}\n{% endblock %}',
    );
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      document.uri,
    );
    assert.ok(ranges && ranges.length >= 2, `Expected 2+ ranges, got ${ranges?.length}`);
  });

  test('Folding keeps opener and closer visible', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% block x %}\n<p>1</p>\n<p>2</p>\n{% endblock %}');
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
      'vscode.executeFoldingRangeProvider',
      document.uri,
    );
    assert.ok(ranges && ranges.length > 0);
    // endLine should be BEFORE the closer line (3) → endLine = 2
    assert.ok(ranges![0].end < 3, `End should be before closer, got ${ranges![0].end}`);
  });
});

// ════════════════════════════════════════════════════
// SECTION 8: Toggle Comment
// ════════════════════════════════════════════════════

suite('Toggle Comment', () => {
  test('Adds inline comment on single line', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<p>Hello</p>');
    // Poll for focus instead of a fixed sleep — toggleComment acts on the ACTIVE editor.
    const editor = await waitFor(
      () => {
        const e = vscode.window.activeTextEditor;
        return e && e.document === document ? e : undefined;
      },
      { label: 'toggle-comment doc focused' },
    );
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand('django-language-service.toggleComment');
    // Poll for the comment markers instead of a fixed yield — the command awaits its
    // edit, but the document text event can land a tick later.
    const text = await waitFor(
      () => {
        const t = document.getText();
        return t.includes('{#') && t.includes('#}') ? t : undefined;
      },
      { label: 'comment markers applied' },
    );
    assert.ok(text.includes('{#') && text.includes('#}'), `Should comment, got: ${text}`);
  });

  test('Removes existing inline comment', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{# <p>Hello</p> #}');
    // Poll for focus instead of a fixed sleep — toggleComment acts on the ACTIVE editor.
    const editor = await waitFor(
      () => {
        const e = vscode.window.activeTextEditor;
        return e && e.document === document ? e : undefined;
      },
      { label: 'toggle-comment doc focused' },
    );
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    await vscode.commands.executeCommand('django-language-service.toggleComment');
    // Poll for the STATE CHANGE (markers removed) instead of a fixed yield — the
    // starting text contains '{#', so their disappearance is a positive condition.
    const text = await waitFor(
      () => {
        const t = document.getText();
        return !t.includes('{#') ? t : undefined;
      },
      { label: 'comment markers removed' },
    );
    assert.ok(!text.includes('{#'), `Should uncomment, got: ${text}`);
    assert.ok(text.includes('<p>Hello</p>'), 'Content should be preserved');
  });
});

// ════════════════════════════════════════════════════
// SECTION 8.5: Bulk Include Operations
// ════════════════════════════════════════════════════

suite('Bulk Include Operations', () => {
  test('collapseAllIncludesInDocument collapses every multi-line tag', async function () {
    this.timeout(15_000);
    const content = [
      `{% include 'card.html'`,
      `    with title="One"`,
      `%}`,
      `<p>filler</p>`,
      `{% include 'card.html'`,
      `    with title="Two"`,
      `%}`,
    ].join('\n');
    const document = await openHtmlDocument(content);
    // Poll for focus instead of a fixed sleep — the command edits the ACTIVE editor.
    await waitFor(
      () => (vscode.window.activeTextEditor?.document === document ? true : undefined),
      { label: 'collapse-includes doc focused' },
    );

    await vscode.commands.executeCommand('django-language-service.collapseAllIncludesInDocument');
    // Poll until both includes are single-line instead of a fixed yield.
    await waitFor(
      () => {
        const ls = document
          .getText()
          .split('\n')
          .filter(line => line.includes('{% include'));
        return ls.length === 2 && ls.every(line => line.includes('%}')) ? true : undefined;
      },
      { label: 'includes collapsed to single lines' },
    );

    const resultLines = document.getText().split('\n');
    const includeLines = resultLines.filter(line => line.includes('{% include'));
    assert.strictEqual(
      includeLines.length,
      2,
      `Expected 2 single-line includes, got:\n${document.getText()}`,
    );
    for (const line of includeLines) {
      assert.ok(line.includes('%}'), `Include should be single-line, got: ${line}`);
    }
  });

  test('collapseAllIncludesInDocument leaves single-line tags unchanged', async function () {
    this.timeout(15_000);
    const content = [
      `{% include 'simple.html' %}`,
      `<p>between</p>`,
      `{% include 'another.html' %}`,
    ].join('\n');
    const document = await openHtmlDocument(content);
    // ABSENCE assert (document must stay UNCHANGED after the command) — there is no
    // positive condition to poll for, so a settle sleep is the only option here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const before = document.getText();

    await vscode.commands.executeCommand('django-language-service.collapseAllIncludesInDocument');
    await sleep(COMMAND_YIELD_MS);

    assert.strictEqual(
      document.getText(),
      before,
      'Document should be unchanged (no multi-line includes)',
    );
  });

  test('expandAllIncludesInDocument expands single-line tags with HTML props', async function () {
    this.timeout(15_000);
    const content = [
      `{% include 'card.html' with title="One" content="<p>hi</p>" %}`,
      `<p>between</p>`,
      `{% include 'card.html' with title="Two" content="<strong>ok</strong>" %}`,
    ].join('\n');
    const document = await openHtmlDocument(content);
    // Poll for focus instead of a fixed sleep — the command edits the ACTIVE editor.
    await waitFor(
      () => (vscode.window.activeTextEditor?.document === document ? true : undefined),
      { label: 'expand-includes doc focused' },
    );

    await vscode.commands.executeCommand('django-language-service.expandAllIncludesInDocument');
    // Poll until the expansion lands (line count grows) instead of a fixed yield.
    await waitFor(
      () => (document.getText().split('\n').length > content.split('\n').length ? true : undefined),
      { label: 'includes expanded to multiple lines' },
    );

    const text = document.getText();
    const closingTagCount = (text.match(/%\}/g) ?? []).length;
    assert.strictEqual(closingTagCount, 2, `Expected 2 closing %} tags, got: ${closingTagCount}`);
    // Each include now spans multiple lines — total line count must grow.
    assert.ok(
      text.split('\n').length > content.split('\n').length,
      `Expected expanded output to have more lines, got:\n${text}`,
    );
  });

  test('expandAllIncludesInDocument skips tags without HTML props', async function () {
    this.timeout(15_000);
    const content = [
      `{% include 'simple.html' %}`,
      `{% include 'card.html' with title="Plain" count="5" %}`,
    ].join('\n');
    const document = await openHtmlDocument(content);
    const before = document.getText();

    // These includes use Django `with` props (not HTML props), so the command is a no-op.
    await vscode.commands.executeCommand('django-language-service.expandAllIncludesInDocument');
    await sleep(COMMAND_YIELD_MS);

    assert.strictEqual(
      document.getText(),
      before,
      'Document should be unchanged (no HTML-prop includes)',
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION 9: Template Completion
// ════════════════════════════════════════════════════

suite('Template Completion', () => {
  test('Responds on {% include "', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% include "');
    // The first template-path completion warms findFiles over the fixture (13 apps).
    // Poll until items materialize instead of betting on a single fixed-delay attempt.
    const completions = await waitFor(
      async () => {
        const r = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          document.uri,
          new vscode.Position(0, 12),
        );
        return r && r.items.length > 0 ? r : undefined;
      },
      { label: 'template path completions' },
    );
    assert.ok(completions.items.length > 0, 'Provider should return template paths');
  });

  test('Responds on {% extends "', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% extends "');
    // `completions !== undefined` is guaranteed by VS Code whether or not
    // this extension contributes anything, so it could not fail. Poll like
    // the sibling above, then name a path the fixture really has.
    const completions = await waitFor(
      async () => {
        const r = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          document.uri,
          new vscode.Position(0, 12),
        );
        return r && r.items.length > 0 ? r : undefined;
      },
      { label: 'extends path completions' },
    );
    const labels = completions.items.map(i => String(i.label));
    assert.ok(
      labels.some(l => l.endsWith('base/base.html')),
      `Expected the fixture's base/base.html among ${labels.length} paths`,
    );
  });

  test('Does not trigger on {% if "', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{% if "');
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      document.uri,
      new vscode.Position(0, 6),
    );
    // Should not have template path items (might have other completions)
    const templateItems = (completions?.items ?? []).filter(
      i => i.kind === vscode.CompletionItemKind.File,
    );
    assert.strictEqual(templateItems.length, 0, 'Should not suggest templates in {% if %}');
  });
});

// ════════════════════════════════════════════════════
// SECTION 10: Whitespace Handling
// ════════════════════════════════════════════════════

suite('Formatter — Whitespace', () => {
  test('Collapses multiple blank lines to one', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<div>\n\n\n\n<p>text</p>\n\n\n</div>');
    const text = await formatAndGetText(document);
    // Should not have 3+ consecutive newlines
    assert.ok(!text.includes('\n\n\n'), 'Should collapse blank lines');
  });

  test('Preserves whitespace trim operators', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('{%- if x -%}\n<p>trimmed</p>\n{%- endif -%}');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('{%-'), 'Should preserve {%-');
    assert.ok(text.includes('-%}'), 'Should preserve -%}');
  });
});

// ════════════════════════════════════════════════════
// SECTION 11: i18n Tags
// ════════════════════════════════════════════════════

suite('Formatter — i18n', () => {
  test('trans inside block is indented', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% block title %}\n{% trans "Hello" %}\n{% endblock %}',
    );
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  {% trans'), 'trans should be indented');
  });

  test('blocktrans/endblocktrans indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '{% blocktrans %}\nHello {{ name }}\n{% endblocktrans %}',
    );
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  Hello'), 'Content indented inside blocktrans');
  });
});

// ════════════════════════════════════════════════════
// SECTION 12: Real-World Fixture
// ════════════════════════════════════════════════════

suite('Real-World Fixture', () => {
  test('Format allauth login template', async function () {
    this.timeout(20_000);
    const samplePath = fixturePath('sample.html');
    if (!fs.existsSync(samplePath)) {
      this.skip();
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(samplePath));
    await vscode.window.showTextDocument(document);
    await ensureExtensionActivated();
    // Heavy tier — this is a large real-world template with extensive DTL nesting.
    await sleep(SETUP_SLEEPS.heavy);

    const text = await formatAndGetText(document);
    const lines = text.split('\n');

    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');

    const loadLine = lines.find(l => l.includes('load static'));
    assert.ok(loadLine?.startsWith('  '), 'load indented after extends');

    const blockLine = lines.find(l => l.includes('block content'));
    assert.ok(blockLine?.startsWith('  '), 'block indented after extends');

    const lastLine = lines.filter(l => l.trim()).pop()!;
    assert.ok(lastLine.includes('endblock'), 'ends with endblock');
    assert.ok(lastLine.startsWith('  '), 'endblock indented (inside extends)');
  });
});

// ════════════════════════════════════════════════════
// SECTION 13: Cotton Components (c-tags)
// ════════════════════════════════════════════════════

suite('Formatter — Cotton Components', () => {
  test('c-tag open/close indentation', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument('<c-atoms.button>\nClick me\n</c-atoms.button>');
    const text = await formatAndGetText(document);
    assert.ok(text.includes('  Click me'), 'Content indented inside c-tag');
  });

  test('c-tag self-closing does not indent', async function () {
    this.timeout(15_000);
    const document = await openHtmlDocument(
      '<div>\n<c-atoms.icon name="home" />\n<p>after</p>\n</div>',
    );
    const text = await formatAndGetText(document);
    const lines = text.split('\n').filter(l => l.trim());
    const iconLine = lines.find(l => l.includes('c-atoms.icon'));
    const afterLine = lines.find(l => l.includes('<p>after'));
    assert.ok(iconLine?.startsWith('  '), 'icon indented once');
    assert.ok(afterLine?.startsWith('  '), 'after same level as icon');
  });
});

// ════════════════════════════════════════════════════
// REAL PROJECT TESTS — test-django-project workspace
// ════════════════════════════════════════════════════

function workspacePath(...segments: string[]): vscode.Uri {
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!wsFolder) {
    throw new Error('No workspace folder open');
  }
  return vscode.Uri.joinPath(wsFolder, ...segments);
}

async function openWorkspaceFile(...segments: string[]): Promise<vscode.TextDocument> {
  const uri = workspacePath(...segments);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  await ensureExtensionActivated();
  // Real workspace files exercise the scanner-dependent providers (hover, URL completion, static
  // files). They're inherently "heavy" — but we still gate by the same tier table, not a magic number.
  await sleep(SETUP_SLEEPS.heavy);
  return doc;
}

// First-call: activate + one-shot 3s warmup for the workspace scanner.
// Subsequent calls: no-op. Saves ~5s × (# of suiteSetups − 1) which adds up with 19 Real Project suites.
let _scanWarmedUp = false;
const INITIAL_WARMUP_MS = 3000;

// VS Code publishes diagnostics via a debounced pipeline (~1s default). 1500ms gives safe margin
// for the Problems panel / diagnostic collection to settle after opening or mutating a document.
const DIAGNOSTICS_WAIT_MS = 1500;

// Microtask yield after an awaited command — most `executeCommand` calls resolve once the edit has
// been applied, so we only need the event loop to turn once before reading document state.
const COMMAND_YIELD_MS = 100;

// Webview panel creation in VS Code — from `createWebviewPanel` to tab being discoverable via
// `vscode.window.tabGroups`. ~300ms is enough in practice.
const WEBVIEW_OPEN_MS = 300;
async function waitForExtension(): Promise<void> {
  if (_scanWarmedUp) return;
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (ext && !ext.isActive) {
    await ext.activate();
  }
  await ensureExtensionActivated();
  await sleep(INITIAL_WARMUP_MS);
  _scanWarmedUp = true;
}

suite('Real Project — Workspace Structure', function () {
  this.timeout(30_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('Workspace folder is test-django-project', () => {
    const folders = vscode.workspace.workspaceFolders;
    assert.ok(folders && folders.length > 0, 'No workspace folder');
    assert.ok(
      folders![0].uri.fsPath.includes('test-django-project'),
      `Unexpected workspace: ${folders![0].uri.fsPath}`,
    );
  });

  test('Templates directory exists', async () => {
    const uri = workspacePath('templates');
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.type === vscode.FileType.Directory);
  });

  test('Apps directory exists', async () => {
    const uri = workspacePath('apps');
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.type === vscode.FileType.Directory);
  });

  test('Views.py exists', async () => {
    const uri = workspacePath('apps', 'shop', 'views.py');
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.type === vscode.FileType.File);
  });

  test('Models.py exists', async () => {
    const uri = workspacePath('apps', 'shop', 'models.py');
    const stat = await vscode.workspace.fs.stat(uri);
    assert.ok(stat.type === vscode.FileType.File);
  });
});

suite('Real Project — Template Opening', function () {
  this.timeout(30_000);

  test('product_list.html opens without error', async () => {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    assert.ok(doc.getText().includes('{% extends'));
    assert.ok(doc.getText().includes('{% for product in products %}'));
  });

  test('dashboard.html has Chart.js + DTL', async () => {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    assert.ok(doc.getText().includes('Chart('));
    assert.ok(doc.getText().includes('{{ chart_labels|safe }}'));
    assert.ok(doc.getText().includes('{{ chart_values|safe }}'));
  });

  test('base.html has extends-able blocks', async () => {
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    assert.ok(doc.getText().includes('{% block content %}'));
    assert.ok(doc.getText().includes('{% block scripts %}'));
    assert.ok(doc.getText().includes('{% block breadcrumbs %}'));
  });

  test('login.html extends base', async () => {
    const doc = await openWorkspaceFile('templates', 'registration', 'login.html');
    assert.ok(doc.getText().includes("{% extends 'base/base.html' %}"));
    assert.ok(doc.getText().includes('{% csrf_token %}'));
  });
});

suite('Real Project — Formatting Real Templates', function () {
  this.timeout(30_000);

  test('product_list.html formats idempotently', async () => {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const first = await formatAndGetText(doc);
    // Format again — should be identical
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting should be idempotent');
  });

  test('dashboard.html formatting preserves script content', async () => {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const text = await formatAndGetText(doc);
    // Script content should still have Chart.js
    assert.ok(text.includes('new Chart('), 'Chart.js call preserved');
    assert.ok(text.includes('{{ chart_labels|safe }}'), 'DTL in script preserved');
    // endblock should be at correct level (not indented by script)
    const lines = text.split('\n');
    const endblock = lines.find(l => l.trim() === '{% endblock %}');
    assert.ok(endblock, 'endblock exists');
  });

  test('home.html formatting preserves style+DTL', async () => {
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    const text = await formatAndGetText(doc);
    assert.ok(text.includes('{{ theme_color|default'), 'DTL in style preserved');
  });
});

suite('Real Project — Diagnostics on Real Files', function () {
  this.timeout(30_000);

  test('No JS false-positive errors in dashboard script blocks', async () => {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    // ABSENCE assert — "no JS false-positive ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    // Filter for JS-related errors inside script
    const jsErrors = diags.filter(
      d => d.severity === vscode.DiagnosticSeverity.Error && d.source?.includes('JS'),
    );
    // There may be some from the DTL-cleaned validation but no "Property assignment expected"
    const falsePositives = jsErrors.filter(d => d.message.includes('Property assignment'));
    assert.strictEqual(
      falsePositives.length,
      0,
      `Unexpected JS false positives: ${falsePositives.map(d => d.message)}`,
    );
  });

  test('Load diagnostics detect missing loads', async () => {
    // Create a temp doc with a known missing load
    const doc = await openHtmlDocument("{% trans 'Hello' %}");
    // Poll for the diagnostic itself instead of a fixed publish-pipeline sleep.
    const loadDiags = await waitFor(
      () => {
        const found = vscode.languages
          .getDiagnostics(doc.uri)
          .filter(d => d.code === 'missing-load');
        return found.length > 0 ? found : undefined;
      },
      { label: 'missing-load diagnostic' },
    );
    assert.ok(loadDiags.length > 0, 'Should flag trans without {% load i18n %}');
    assert.ok(loadDiags[0].message.includes('i18n'), `Message: ${loadDiags[0].message}`);
  });

  test('Load diagnostics: no warning when loads are correct', async () => {
    const doc = await openHtmlDocument("{% load i18n %}\n{% trans 'Hello' %}");
    // ABSENCE assert — "no missing-load diagnostic ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const missingLoads = diags.filter(d => d.code === 'missing-load');
    assert.strictEqual(
      missingLoads.length,
      0,
      `Unexpected missing-load: ${missingLoads.map(d => d.message)}`,
    );
  });
});

suite('DTL Load Quick-Fix', () => {
  test('offers "Add {% load %}" for a missing-load diagnostic', async function () {
    this.timeout(15_000);
    // `trans` requires {% load i18n %} — same case proven to flag a missing-load above.
    const doc = await openHtmlDocument("{% trans 'Hello' %}");

    // Wait until dtl-load publishes the warning, then ask for code actions on it.
    await waitFor(
      () => {
        const found = vscode.languages
          .getDiagnostics(doc.uri)
          .filter(d => d.code === 'missing-load');
        return found.length > 0 ? found : undefined;
      },
      { label: 'missing-load diagnostic' },
    );

    const range = new vscode.Range(0, 0, doc.lineCount, 0);
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      doc.uri,
      range,
    );
    const loadFix = (actions ?? []).find(a => /^Add \{% load \w+ %\}$/.test(a.title));
    assert.ok(
      loadFix,
      `should offer an "Add {% load %}" quick-fix; got: ${(actions ?? []).map(a => a.title).join(', ')}`,
    );
  });
});

suite('Real Project — Completion Providers', function () {
  this.timeout(30_000);

  test('Filter completion triggers on |', async () => {
    const doc = await openHtmlDocument('{{ title| }}');
    const pos = new vscode.Position(0, 9); // after |
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
      '|',
    );
    assert.ok(completions, 'Completions returned');
    const filterItems = completions.items.filter(
      i => i.detail?.includes('Django Language Service') && i.detail?.includes('filter'),
    );
    assert.ok(
      filterItems.length > 0,
      `Expected filter items, got ${completions.items.length} total`,
    );
    const names = filterItems.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(names.includes('date'), `Missing 'date' filter: ${names.slice(0, 10)}`);
    assert.ok(names.includes('default'), `Missing 'default' filter`);
    assert.ok(names.includes('safe'), `Missing 'safe' filter`);
    assert.ok(names.includes('lower'), `Missing 'lower' filter`);
  });

  test('Block completion triggers inside {% block', async () => {
    // Every assertion here used to sit under three nested `if`s — a missing
    // fixture, an empty list or zero parent-block items each made the test
    // pass by doing nothing, so the feature had no test that could go red.
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const text = doc.getText();
    const blockIdx = text.indexOf('{% block content %}');
    assert.ok(blockIdx >= 0, 'Fixture product_list.html must contain {% block content %}');

    const pos = doc.positionAt(blockIdx + 9); // inside "{% block "
    const blockItems = await waitFor(
      async () => {
        const r = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          pos,
          ' ',
        );
        const parents = (r?.items ?? []).filter(i => i.detail?.includes('parent block'));
        return parents.length > 0 ? parents : undefined;
      },
      { label: 'parent block completions' },
    );

    // base.html has: title, breadcrumbs, content, extra_head, extra_css, scripts
    const names = blockItems.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(
      names.includes('scripts') || names.includes('extra_head'),
      `Expected parent blocks, got: ${names.join(', ')}`,
    );
  });
});

suite('Real Project — Custom Template Tags', function () {
  this.timeout(30_000);

  test('shop_tags.py has custom filters and tags', async () => {
    const doc = await openWorkspaceFile('apps', 'shop', 'templatetags', 'shop_tags.py');
    const text = doc.getText();
    assert.ok(text.includes('@register.filter'), 'Has @register.filter');
    assert.ok(text.includes('@register.simple_tag'), 'Has @register.simple_tag');
    assert.ok(text.includes('@register.inclusion_tag'), 'Has @register.inclusion_tag');
    assert.ok(text.includes('def currency'), 'Has currency filter');
    assert.ok(text.includes('def star_rating'), 'Has star_rating filter');
  });

  test('Templates using shop_tags have no missing-load warning', async () => {
    const doc = await openWorkspaceFile('templates', 'components', 'product_card.html');
    // ABSENCE assert — "no shop_tags missing-load ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const missingLoads = diags.filter(
      d => d.code === 'missing-load' && d.message.includes('shop_tags'),
    );
    assert.strictEqual(missingLoads.length, 0, `Unexpected: ${missingLoads.map(d => d.message)}`);
  });
});

// ════════════════════════════════════════════════════
// SECTION 15: Real Project — Formatter on Every Template
// ════════════════════════════════════════════════════

suite('Real Project — Formatter on Every Template', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  // ── base.html ──

  test('base.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting base.html should be idempotent');
  });

  test('base.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    // {% load static %} at col 0 (no extends, so load is top-level)
    assert.ok(lines[0].trim().startsWith('{%'), 'First line should be a DTL tag');
    // Script content preserved
    assert.ok(text.includes('tailwind.config'), 'Tailwind config script preserved');
    // Block tags present
    assert.ok(text.includes('{% block content %}'), 'block content present');
    assert.ok(text.includes('{% block scripts %}'), 'block scripts present');
  });

  // ── home.html ──

  test('home.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting home.html should be idempotent');
  });

  test('home.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    // extends at col 0
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    assert.ok(lines[0].includes('{% extends'), 'First line is extends');
    // Style content with DTL preserved
    assert.ok(text.includes('{{ theme_color|default'), 'DTL inside <style> preserved');
    // Alpine.js x-intersect preserved
    assert.ok(text.includes('x-intersect'), 'Alpine.js x-intersect attribute preserved');
    // endblock exists
    assert.ok(text.includes('{% endblock %}'), 'endblock present');
  });

  // ── product_list.html ──

  test('product_list.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting product_list.html should be idempotent');
  });

  test('product_list.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    // extends at col 0
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    // {% include %} preserved
    assert.ok(text.includes('{% include'), 'include tag preserved');
    // for/empty/endfor structure preserved
    assert.ok(text.includes('{% for product in products %}'), 'for loop preserved');
    assert.ok(text.includes('{% empty %}'), 'empty tag preserved');
    assert.ok(text.includes('{% endfor %}'), 'endfor tag preserved');
    // {{ products.count }} preserved
    assert.ok(text.includes('{{ products.count }}'), 'products.count expression preserved');
  });

  // ── product_detail.html ──

  test('product_detail.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_detail.html',
    );
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting product_detail.html should be idempotent');
  });

  test('product_detail.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_detail.html',
    );
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    // Custom filter preserved
    assert.ok(text.includes('{{ product.price|currency }}'), 'currency filter preserved');
    assert.ok(text.includes('{{ review.rating|star_rating }}'), 'star_rating filter preserved');
    // Alpine.js x-data preserved
    assert.ok(text.includes('x-data'), 'Alpine.js x-data preserved');
  });

  // ── dashboard.html ──

  test('dashboard.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting dashboard.html should be idempotent');
  });

  test('dashboard.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    // Chart.js preserved
    assert.ok(text.includes('new Chart('), 'Chart.js constructor preserved');
    assert.ok(text.includes('{{ chart_labels|safe }}'), 'chart_labels DTL preserved');
    assert.ok(text.includes('{{ chart_values|safe }}'), 'chart_values DTL preserved');
  });

  // ── _navbar.html ──

  test('_navbar.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting _navbar.html should be idempotent');
  });

  test('_navbar.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const text = await formatAndGetText(doc);
    // Alpine.js attributes preserved
    assert.ok(text.includes('x-data'), 'Alpine.js x-data preserved');
    assert.ok(text.includes('x-show'), 'Alpine.js x-show preserved');
    assert.ok(text.includes('@click'), 'Alpine.js @click preserved');
    // {% load shop_tags %} preserved
    assert.ok(text.includes('{% load shop_tags %}'), 'load shop_tags preserved');
    // {% active_nav %} custom tag preserved
    assert.ok(text.includes('{% active_nav'), 'active_nav custom tag preserved');
  });

  // ── _footer.html ──

  test('_footer.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_footer.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting _footer.html should be idempotent');
  });

  test('_footer.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_footer.html');
    const text = await formatAndGetText(doc);
    // {{ current_year }} preserved
    assert.ok(text.includes('{{ current_year }}'), 'current_year variable preserved');
    // {% trans %} preserved
    assert.ok(text.includes('{% trans'), 'trans tag preserved');
    // {% load i18n %} at col 0 (partial, no extends)
    const lines = text.split('\n');
    const loadLine = lines.find(l => l.includes('{% load i18n %}'));
    assert.ok(loadLine !== undefined, 'load i18n present');
  });

  // ── _filters.html ──

  test('_filters.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'partials', '_filters.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting _filters.html should be idempotent');
  });

  test('_filters.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'partials', '_filters.html');
    const text = await formatAndGetText(doc);
    // Alpine.js x-data and x-model preserved
    assert.ok(text.includes('x-data'), 'Alpine.js x-data preserved');
    assert.ok(text.includes('x-model'), 'Alpine.js x-model preserved');
    // DTL for loop preserved
    assert.ok(text.includes('{% for category in categories %}'), 'category loop preserved');
    assert.ok(text.includes('{{ search_query }}'), 'search_query variable preserved');
  });

  // ── product_card.html ──

  test('product_card.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'components', 'product_card.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting product_card.html should be idempotent');
  });

  test('product_card.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'components', 'product_card.html');
    const text = await formatAndGetText(doc);
    // {% load shop_tags %} present
    assert.ok(text.includes('{% load shop_tags %}'), 'load shop_tags present');
    // Custom filters preserved
    assert.ok(text.includes('{{ product.price|currency }}'), 'currency filter preserved');
    assert.ok(
      text.includes('{{ product.avg_rating|star_rating }}'),
      'star_rating filter preserved',
    );
  });

  // ── login.html ──

  test('login.html formats idempotently', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'registration', 'login.html');
    const first = await formatAndGetText(doc);
    const second = await formatAndGetText(doc);
    assert.strictEqual(first, second, 'Formatting login.html should be idempotent');
  });

  test('login.html structural assertions', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'registration', 'login.html');
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    // extends at col 0
    assert.ok(!lines[0].startsWith(' '), 'extends at col 0');
    // {% csrf_token %} preserved
    assert.ok(text.includes('{% csrf_token %}'), 'csrf_token preserved');
    // Form elements preserved
    assert.ok(text.includes('<form'), 'form element preserved');
    assert.ok(text.includes('</form>'), 'form closing tag preserved');
  });
});

// ════════════════════════════════════════════════════
// SECTION 16: Real Project — Formatter Script/Style Blocks
// ════════════════════════════════════════════════════

suite('Real Project — Formatter Script/Style Blocks', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('dashboard.html: Chart.js script block preserved after format', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const text = await formatAndGetText(doc);
    // Chart.js configuration should be fully preserved
    assert.ok(text.includes('new Chart(ctx,'), 'Chart constructor preserved');
    assert.ok(text.includes("type: 'bar'"), 'Chart type preserved');
    assert.ok(text.includes('{{ chart_labels|safe }}'), 'DTL labels inside script preserved');
    assert.ok(text.includes('{{ chart_values|safe }}'), 'DTL values inside script preserved');
    assert.ok(
      text.includes("backgroundColor: 'rgba(99, 102, 241, 0.15)'"),
      'Chart color config preserved',
    );
    assert.ok(text.includes('borderRadius: 8'), 'Chart borderRadius preserved');
  });

  test('dashboard.html: endblock is NOT over-indented by script braces', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const text = await formatAndGetText(doc);
    const lines = text.split('\n');
    // Find the last {% endblock %} — it should not be deeply indented
    const endblockLines = lines
      .map((l, i) => ({ line: l, index: i }))
      .filter(x => x.line.trim() === '{% endblock %}');
    assert.ok(endblockLines.length > 0, 'endblock exists');
    const lastEndblock = endblockLines[endblockLines.length - 1];
    const indent = lastEndblock.line.match(/^(\s*)/)?.[1].length ?? 0;
    // endblock should be indented at most 2 levels (extends context), not 8+ from script braces
    assert.ok(
      indent <= 4,
      `endblock indented ${indent} spaces — should not be over-indented by script braces`,
    );
  });

  test('home.html: style block with DTL preserved after format', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    const text = await formatAndGetText(doc);
    // CSS inside <style> should be preserved
    assert.ok(text.includes('.hero-bg'), 'CSS class .hero-bg preserved');
    assert.ok(text.includes('{{ theme_color|default:"#4f46e5" }}'), 'DTL inside CSS preserved');
    // Conditional CSS block
    assert.ok(text.includes('{% if debug_mode %}'), 'Conditional inside style preserved');
    assert.ok(text.includes('.debug-border'), 'Debug CSS class preserved');
  });

  test('_navbar.html: Alpine.js attributes preserved after format', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const text = await formatAndGetText(doc);
    // Alpine.js directives
    assert.ok(
      text.includes('x-data="{ mobileOpen: false, profileOpen: false }"'),
      'Complex x-data preserved',
    );
    assert.ok(text.includes('@click="open = !open"'), '@click binding preserved');
    assert.ok(text.includes('@click.away="open = false"'), '@click.away modifier preserved');
    assert.ok(text.includes('x-transition'), 'x-transition preserved');
    assert.ok(text.includes('x-show="open"'), 'x-show preserved');
    assert.ok(text.includes('x-show="mobileOpen"'), 'x-show mobileOpen preserved');
  });
});

// ════════════════════════════════════════════════════
// SECTION 17: Real Project — Context Validation
// ════════════════════════════════════════════════════

suite('Real Project — Context Validation', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('product_list.html: no undefined variable warnings for view context', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    // ABSENCE assert — "no undefined-variable diagnostics ever arrive" cannot be
    // polled (the nothing never becomes observable); a fixed settle sleep stays.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const undefinedVarDiags = diags.filter(
      d =>
        d.code === 'undefined-variable' || d.message.toLowerCase().includes('undefined variable'),
    );
    const knownVars = ['products', 'categories', 'search_query', 'site_name'];
    for (const varName of knownVars) {
      const falsePositive = undefinedVarDiags.find(d => d.message.includes(varName));
      assert.ok(!falsePositive, `Should not warn about '${varName}': ${falsePositive?.message}`);
    }
  });

  test('product_detail.html: no undefined variable warnings for view context', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_detail.html',
    );
    // ABSENCE assert — "no undefined-variable diagnostics ever arrive" cannot be
    // polled (the nothing never becomes observable); a fixed settle sleep stays.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const undefinedVarDiags = diags.filter(
      d =>
        d.code === 'undefined-variable' || d.message.toLowerCase().includes('undefined variable'),
    );
    const knownVars = ['product', 'reviews', 'tags', 'related_products'];
    for (const varName of knownVars) {
      const falsePositive = undefinedVarDiags.find(d => d.message.includes(varName));
      assert.ok(!falsePositive, `Should not warn about '${varName}': ${falsePositive?.message}`);
    }
  });

  test('dashboard.html: no undefined variable warnings for view context', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    // ABSENCE assert — "no undefined-variable diagnostics ever arrive" cannot be
    // polled (the nothing never becomes observable); a fixed settle sleep stays.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const undefinedVarDiags = diags.filter(
      d =>
        d.code === 'undefined-variable' || d.message.toLowerCase().includes('undefined variable'),
    );
    const knownVars = ['chart_labels', 'chart_values', 'recent_orders'];
    for (const varName of knownVars) {
      const falsePositive = undefinedVarDiags.find(d => d.message.includes(varName));
      assert.ok(!falsePositive, `Should not warn about '${varName}': ${falsePositive?.message}`);
    }
  });

  test('home.html: no undefined variable warnings for view context', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    // ABSENCE assert — "no undefined-variable diagnostics ever arrive" cannot be
    // polled (the nothing never becomes observable); a fixed settle sleep stays.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const undefinedVarDiags = diags.filter(
      d =>
        d.code === 'undefined-variable' || d.message.toLowerCase().includes('undefined variable'),
    );
    const knownVars = ['featured_products', 'total_products', 'total_categories'];
    for (const varName of knownVars) {
      const falsePositive = undefinedVarDiags.find(d => d.message.includes(varName));
      assert.ok(!falsePositive, `Should not warn about '${varName}': ${falsePositive?.message}`);
    }
  });
});

// ════════════════════════════════════════════════════
// SECTION 18: Real Project — Filter Completion
// ════════════════════════════════════════════════════

suite('Real Project — Filter Completion', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('product_detail.html: completion after | includes Django filters', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_detail.html',
    );
    const text = doc.getText();
    // Find position of a pipe character (e.g., product.price|currency)
    const pipeIdx = text.indexOf('|currency');
    assert.ok(pipeIdx > 0, 'Should find |currency in product_detail.html');
    const pos = doc.positionAt(pipeIdx + 1); // right after the |
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
      '|',
    );
    assert.ok(completions, 'Completions returned');
    const filterItems = completions.items.filter(
      i => i.detail?.includes('Django Language Service') && i.detail?.includes('filter'),
    );
    if (filterItems.length > 0) {
      const names = filterItems.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
      assert.ok(names.includes('date'), 'Missing date filter');
      assert.ok(names.includes('default'), 'Missing default filter');
      assert.ok(names.includes('safe'), 'Missing safe filter');
      assert.ok(names.includes('lower'), 'Missing lower filter');
    }
  });

  test('temp doc: filter completion on {{ value| }} includes built-in filters', async function () {
    this.timeout(30_000);
    const doc = await openHtmlDocument('{{ value| }}');
    const pos = new vscode.Position(0, 9); // after |
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
      '|',
    );
    assert.ok(completions, 'Completions returned');
    const filterItems = completions.items.filter(
      i => i.detail?.includes('Django Language Service') && i.detail?.includes('filter'),
    );
    assert.ok(
      filterItems.length > 0,
      `Expected filter items, got ${completions.items.length} total`,
    );
  });

  test('filter count is >= 50 (Django has 57+ built-in)', async function () {
    this.timeout(30_000);
    const doc = await openHtmlDocument('{{ value| }}');
    const pos = new vscode.Position(0, 9);
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
      '|',
    );
    assert.ok(completions, 'Completions returned');
    const filterItems = completions.items.filter(
      i => i.detail?.includes('Django Language Service') && i.detail?.includes('filter'),
    );
    assert.ok(
      filterItems.length >= 50,
      `Expected >= 50 built-in filters, got ${filterItems.length}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION 19: Real Project — Load Diagnostics
// ════════════════════════════════════════════════════

suite('Real Project — Load Diagnostics', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('product_list.html: no missing-load warnings for static, i18n, shop_tags', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    // ABSENCE assert — "no missing-load diagnostic ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const missingLoads = diags.filter(d => d.code === 'missing-load');
    assert.strictEqual(
      missingLoads.length,
      0,
      `Unexpected missing-load: ${missingLoads.map(d => d.message)}`,
    );
  });

  test('temp doc: {% trans %} without load should warn', async function () {
    this.timeout(30_000);
    const doc = await openHtmlDocument("{% trans 'Hello' %}");
    // Poll for the diagnostic itself instead of a fixed publish-pipeline sleep.
    const loadDiags = await waitFor(
      () => {
        const found = vscode.languages
          .getDiagnostics(doc.uri)
          .filter(d => d.code === 'missing-load');
        return found.length > 0 ? found : undefined;
      },
      { label: 'missing-load diagnostic' },
    );
    assert.ok(loadDiags.length > 0, 'Should flag trans without {% load i18n %}');
    assert.ok(
      loadDiags.some(d => d.message.includes('i18n')),
      `Expected i18n in message: ${loadDiags.map(d => d.message)}`,
    );
  });

  test('temp doc: {% load humanize %} without using humanize filter should hint unused-load', async function () {
    this.timeout(30_000);
    const doc = await openHtmlDocument('{% load humanize %}\n<p>Hello</p>');
    // Not optional either: DTL-014 ships and is unit-tested. Same reasoning
    // as the missing-load test below.
    const unusedLoads = await waitFor(
      () => {
        const found = vscode.languages
          .getDiagnostics(doc.uri)
          .filter(
            d =>
              d.code === 'unused-load' ||
              (d.message.toLowerCase().includes('unused') && d.message.includes('humanize')),
          );
        return found.length > 0 ? found : undefined;
      },
      { label: 'unused-load diagnostic for humanize' },
    );
    assert.ok(unusedLoads[0].message.includes('humanize'), 'Should mention humanize');
  });

  test('temp doc: {{ value|intcomma }} without load should warn about humanize', async function () {
    this.timeout(30_000);
    const doc = await openHtmlDocument('{{ value|intcomma }}');
    // Not optional: DTL-012/013 ship, and diagnose-loads.ts is unit-tested
    // for exactly this. The `if` made the assertion unreachable whenever
    // the feature broke, which is the only time it mattered.
    const loadDiags = await waitFor(
      () => {
        const found = vscode.languages
          .getDiagnostics(doc.uri)
          .filter(d => d.code === 'missing-load');
        return found.length > 0 ? found : undefined;
      },
      { label: 'missing-load diagnostic for intcomma' },
    );
    assert.ok(
      loadDiags.some(d => d.message.includes('humanize')),
      `Expected humanize in message: ${loadDiags.map(d => d.message).join(' | ')}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION 20: Real Project — Template Type Detection
// ════════════════════════════════════════════════════

suite('Real Project — Template Type Detection', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  // SCOPE NOTE — what integration can and cannot observe here.
  //
  // Template CLASSIFICATION (layout / partial / orphan) is computed by pure
  // builders that already have direct unit coverage:
  //   - layouts/partials → buildLayoutsPayload  (src/adapters/sidebar/sidebar-data.test.ts)
  //   - orphans          → computeOrphanTemplates (src/adapters/file-decoration/orphan-logic.test.ts)
  //                         + buildOrphansPayload (sidebar-data.test.ts)
  // That classification only SURFACES through the sidebar webviews, Explorer
  // file decorations and the status bar — none of which are queryable through
  // the VS Code extension API from a test host. What IS observable end-to-end
  // is the template GRAPH those classifiers consume: the {% extends %} and
  // {% include %} edges, resolved live by the extension's definition provider.
  //
  // The previous version of this suite asserted the CONTENT of the fixture
  // files (base.html contains {% block %}, _filters.html has no DOCTYPE…) —
  // that tested the fixtures, not the extension, and could not fail while the
  // fixture files existed. These tests exercise the extension instead.

  async function resolveTemplateEdge(
    doc: vscode.TextDocument,
    quotedPath: string,
    label: string,
  ): Promise<vscode.Location[]> {
    const text = doc.getText();
    const idx = text.indexOf(quotedPath);
    assert.ok(idx >= 0, `Fixture should contain ${quotedPath}`);
    // Position the cursor inside the quoted template path.
    const pos = doc.positionAt(idx + Math.floor(quotedPath.length / 2));
    return waitFor(
      async () => {
        const locs = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          doc.uri,
          pos,
        );
        return locs && locs.length > 0 ? locs : undefined;
      },
      { label },
    );
  }

  test('layout edge: {% extends %} in product_list.html resolves to base/base.html', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const locations = await resolveTemplateEdge(
      doc,
      "'base/base.html'",
      'extends → layout definition',
    );
    const target = locations[0].uri.fsPath.replace(/\\/g, '/');
    assert.ok(
      target.endsWith('templates/base/base.html'),
      `extends should resolve to the layout, got: ${target}`,
    );
  });

  test('partial edge: {% include %} in product_list.html resolves to shop/partials/_filters.html', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const locations = await resolveTemplateEdge(
      doc,
      "'shop/partials/_filters.html'",
      'include → partial definition',
    );
    const target = locations[0].uri.fsPath.replace(/\\/g, '/');
    assert.ok(
      target.endsWith('templates/shop/partials/_filters.html'),
      `include should resolve to the partial, got: ${target}`,
    );
  });

  test('orphan_page.html keeps full language service: extends edge resolves and no extension errors', async function () {
    this.timeout(30_000);
    // Orphan CLASSIFICATION itself (Explorer badge / ORPHANS sidebar) has no
    // queryable API surface — covered by the unit tests referenced in the
    // suite-level note. Here we pin the behaviour an orphan template still
    // gets from the extension: its template graph works and nothing errors.
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'orphan_page.html');
    const locations = await resolveTemplateEdge(
      doc,
      "'base/base.html'",
      'orphan extends → layout definition',
    );
    const target = locations[0].uri.fsPath.replace(/\\/g, '/');
    assert.ok(target.endsWith('templates/base/base.html'), `Got: ${target}`);

    // ABSENCE assert — "no django-sourced errors ever arrive" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    // Our adapters set source 'django' / 'django: <view>' — the old suite
    // filtered on 'Django Language Service', which no adapter ever emits,
    // so the assert could never trip.
    const extensionErrors = diags.filter(
      d =>
        d.severity === vscode.DiagnosticSeverity.Error && (d.source?.startsWith('django') ?? false),
    );
    assert.strictEqual(
      extensionErrors.length,
      0,
      `Unexpected errors: ${extensionErrors.map(d => d.message)}`,
    );
  });

  test('views.py opens as non-template without template diagnostics', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('apps', 'shop', 'views.py');
    // ABSENCE assert — "no DTL diagnostics ever arrive on a Python file" cannot be
    // polled; a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    // Should not have DTL-related diagnostics on a Python file. Match on
    // the real source prefix ('django' / 'django: <view>') — the old
    // 'Django Language Service' string matched nothing.
    const dtlDiags = diags.filter(
      d =>
        (d.source?.startsWith('django') ?? false) &&
        (d.code === 'missing-load' || d.code === 'undefined-variable'),
    );
    assert.strictEqual(
      dtlDiags.length,
      0,
      `Python file should not get DTL diagnostics: ${dtlDiags.map(d => d.message)}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION 21: Real Project — Tag Pair Highlighting
// ════════════════════════════════════════════════════

suite('Real Project — Tag Pair Highlighting', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  // Poll executeDocumentHighlights until it yields results (provider
  // attachment on a fresh document takes a moment), then assert
  // UNCONDITIONALLY. The old version wrapped its assert in
  // `if (highlights && highlights.length > 0)` — a dead provider made the
  // test pass silently. Now waitFor throws when nothing ever comes back.
  async function highlightsAt(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    label: string,
  ): Promise<vscode.DocumentHighlight[]> {
    return waitFor(
      async () => {
        const h = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
          'vscode.executeDocumentHighlights',
          doc.uri,
          pos,
        );
        return h && h.length > 0 ? h : undefined;
      },
      { label },
    );
  }

  // The DTL provider answers an opener with its matching CLOSER — assert one
  // of the highlights actually covers an end-tag, so a generic word-highlight
  // provider can't satisfy this test by accident.
  function assertCoversEndTag(
    doc: vscode.TextDocument,
    highlights: vscode.DocumentHighlight[],
    endTag: string,
  ): void {
    const covered = highlights.map(h => doc.getText(h.range));
    assert.ok(
      covered.some(t => t.includes(endTag)),
      `Expected a highlight covering ${endTag}, got: ${JSON.stringify(covered)}`,
    );
  }

  test('product_list.html: cursor on {% for %} highlights matching {% endfor %}', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const text = doc.getText();
    const forIdx = text.indexOf('{% for product in products %}');
    assert.ok(forIdx >= 0, 'Should find {% for %} tag');
    const pos = doc.positionAt(forIdx + 4); // inside "for"
    const highlights = await highlightsAt(doc, pos, 'highlights for {% for %}');
    assertCoversEndTag(doc, highlights, 'endfor');
  });

  test('base.html: cursor on {% block breadcrumbs %} highlights matching {% endblock %}', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    const text = doc.getText();
    const blockBreadcrumbIdx = text.indexOf('{% block breadcrumbs %}');
    assert.ok(blockBreadcrumbIdx >= 0, 'Should find {% block breadcrumbs %}');
    const pos = doc.positionAt(blockBreadcrumbIdx + 4); // inside "block"
    const highlights = await highlightsAt(doc, pos, 'highlights for {% block breadcrumbs %}');
    assertCoversEndTag(doc, highlights, 'endblock');
  });

  test('home.html: cursor on {% if featured_products %} highlights matching {% endif %}', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    const text = doc.getText();
    const ifIdx = text.indexOf('{% if featured_products %}');
    assert.ok(ifIdx >= 0, 'Should find {% if featured_products %}');
    const pos = doc.positionAt(ifIdx + 4); // inside "if"
    const highlights = await highlightsAt(doc, pos, 'highlights for {% if featured_products %}');
    assertCoversEndTag(doc, highlights, 'endif');
  });
});

// ════════════════════════════════════════════════════
// SECTION 22: Real Project — JS/CSS DTL Cleaning
// ════════════════════════════════════════════════════

suite('Real Project — JS/CSS DTL Cleaning', function () {
  this.timeout(60_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('dashboard.html: no "Property assignment expected" errors in Problems', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    // ABSENCE assert — "no Property-assignment error ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const propertyAssignmentErrors = diags.filter(
      d =>
        d.severity === vscode.DiagnosticSeverity.Error && d.message.includes('Property assignment'),
    );
    assert.strictEqual(
      propertyAssignmentErrors.length,
      0,
      `Should not have "Property assignment expected" errors: ${propertyAssignmentErrors.map(d => `L${d.range.start.line}: ${d.message}`)}`,
    );
  });

  test('home.html: no CSS errors from DTL in <style> block', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile('templates', 'shop', 'pages', 'home.html');
    // ABSENCE assert — "no CSS error ever arrives" cannot be polled;
    // a fixed settle sleep is the only honest wait here.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    const cssErrors = diags.filter(
      d =>
        d.severity === vscode.DiagnosticSeverity.Error &&
        (d.source?.toLowerCase().includes('css') || d.message.toLowerCase().includes('css')),
    );
    assert.strictEqual(
      cssErrors.length,
      0,
      `Should not have CSS errors from DTL in style: ${cssErrors.map(d => `L${d.range.start.line}: ${d.message}`)}`,
    );
  });

  test('diagnostics carry the "django" source, not built-in JS/CSS', async function () {
    this.timeout(30_000);
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    // Mostly ABSENCE asserts below (naming contract over whatever arrived, plus "no
    // built-in JS/CSS false positives") — nothing pollable; fixed settle sleep stays.
    await sleep(DIAGNOSTICS_WAIT_MS);
    const diags = vscode.languages.getDiagnostics(doc.uri);
    // Our adapters emit source 'django' (dtl-load, url-refs, include-pretty,
    // script-filter) or 'django: <view>' (context-vars). The old filter on
    // 'Django Language Service' matched nothing, so the loop was dead code.
    // Pin the naming contract: any django-sourced diagnostic uses exactly
    // 'django' or the 'django: ' prefix — no third variant may sneak in.
    const ourDiags = diags.filter(d => d.source?.startsWith('django') ?? false);
    for (const d of ourDiags) {
      assert.ok(
        d.source === 'django' || d.source!.startsWith('django: '),
        `Diagnostic source should be 'django' or 'django: <view>', got: ${d.source}`,
      );
    }
    const falsePositiveErrors = diags.filter(
      d =>
        d.severity === vscode.DiagnosticSeverity.Error &&
        (d.source === 'js' || d.source === 'css' || d.source === 'ts') &&
        d.message.includes('{{'),
    );
    assert.strictEqual(
      falsePositiveErrors.length,
      0,
      `No DTL false-positives from built-in validators: ${falsePositiveErrors.map(d => `[${d.source}] ${d.message}`)}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION 23: Real Project — Hover Documentation
// ════════════════════════════════════════════════════

suite('Real Project — Hover Documentation', function () {
  this.timeout(30_000);

  async function getHover(
    doc: vscode.TextDocument,
    searchText: string,
    offset = 0,
  ): Promise<vscode.Hover[] | undefined> {
    const text = doc.getText();
    const idx = text.indexOf(searchText);
    if (idx < 0) return undefined;
    const pos = doc.positionAt(idx + offset);
    return vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
  }

  function hoverContains(hovers: vscode.Hover[] | undefined, text: string): boolean {
    if (!hovers || hovers.length === 0) return false;
    return hovers.some(h =>
      h.contents.some(c => {
        const val = typeof c === 'string' ? c : (c as vscode.MarkdownString).value;
        return val.includes(text);
      }),
    );
  }

  test('hover on {% if %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_detail.html',
    );
    const hovers = await getHover(doc, '{% if product.is_available %}', 4);
    assert.ok(hoverContains(hovers, 'if'), `Hover should mention "if" tag`);
    assert.ok(hoverContains(hovers, 'Django'), `Hover should link to Django docs`);
  });

  test('hover on {% for %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% for product in products %}', 4);
    assert.ok(hoverContains(hovers, 'for'), `Hover should mention "for" tag`);
  });

  test('hover on {% block %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% block content %}', 4);
    assert.ok(hoverContains(hovers, 'block'), `Hover should mention "block" tag`);
  });

  test('hover on {% extends %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% extends', 4);
    assert.ok(hoverContains(hovers, 'extends'), `Hover should mention "extends" tag`);
  });

  test('hover on {% include %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% include', 4);
    assert.ok(hoverContains(hovers, 'include'), `Hover should mention "include" tag`);
  });

  test('hover on {% url %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const hovers = await getHover(doc, "{% url 'home' %}", 4);
    assert.ok(hoverContains(hovers, 'url'), `Hover should mention "url" tag`);
  });

  test('hover on {% csrf_token %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile('templates', 'registration', 'login.html');
    const hovers = await getHover(doc, '{% csrf_token %}', 4);
    assert.ok(hoverContains(hovers, 'csrf'), `Hover should mention csrf`);
  });

  test('hover on {% load %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% load static %}', 4);
    assert.ok(hoverContains(hovers, 'load'), `Hover should mention "load" tag`);
  });

  test('hover on {% trans %} shows tag documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const hovers = await getHover(doc, '{% trans', 4);
    assert.ok(hoverContains(hovers, 'trans'), `Hover should mention "trans" tag`);
  });

  test('hover on |date filter shows documentation', async function () {
    const doc = await openHtmlDocument('{{ created|date:"Y-m-d" }}');
    const text = doc.getText();
    const pipeIdx = text.indexOf('|date');
    const pos = doc.positionAt(pipeIdx + 1); // on "date"
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hoverContains(hovers, 'date'), `Hover should mention "date" filter`);
  });

  test('hover on |default filter shows documentation', async function () {
    const doc = await openHtmlDocument('{{ name|default:"N/A" }}');
    const text = doc.getText();
    const pipeIdx = text.indexOf('|default');
    const pos = doc.positionAt(pipeIdx + 1);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hoverContains(hovers, 'default'), `Hover should mention "default" filter`);
  });

  test('hover on |safe filter shows documentation', async function () {
    const doc = await openHtmlDocument('{{ content|safe }}');
    const text = doc.getText();
    const pipeIdx = text.indexOf('|safe');
    const pos = doc.positionAt(pipeIdx + 1);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hoverContains(hovers, 'safe'), `Hover should mention "safe" filter`);
  });

  test('hover on |truncatechars shows documentation', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'dashboard',
      'dashboard.html',
    );
    const hovers = await getHover(doc, '|truncatechars', 1);
    assert.ok(hoverContains(hovers, 'truncate'), `Hover should mention truncate`);
  });

  test('hover on regular HTML does NOT show DTL docs', async function () {
    const doc = await openHtmlDocument('<div class="container">Hello</div>');
    const pos = new vscode.Position(0, 5); // on "class"
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    // Should not show any DTL-specific documentation
    const hasDtlDoc = hoverContains(hovers, 'Django Documentation');
    assert.ok(!hasDtlDoc, 'Regular HTML should not show DTL docs');
  });
});

// ════════════════════════════════════════════════════
// SECTION: URL Completion, Hover, Go-to-definition
// ════════════════════════════════════════════════════

suite('Real Project — URL Features', function () {
  this.timeout(30_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('URL completion triggers inside {% url "" %}', async function () {
    const doc = await openHtmlDocument('{% url "');
    const pos = new vscode.Position(0, 8);
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
    );
    const items = completions?.items ?? [];
    assert.ok(items.length > 0, 'Should provide URL completions');
    const labels = items.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(
      labels.some(l => l.includes('home')),
      `Should include 'home', got: ${labels.slice(0, 5)}`,
    );
  });

  test('URL completion includes product_detail', async function () {
    const doc = await openHtmlDocument('{% url "');
    const pos = new vscode.Position(0, 8);
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
    );
    const items = completions?.items ?? [];
    const labels = items.map(i => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(
      labels.some(l => l.includes('product_detail')),
      `Should include 'product_detail', got: ${labels.slice(0, 10)}`,
    );
  });

  test('URL hover on {% url "home" %} shows pattern', async function () {
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const text = doc.getText();
    const idx = text.indexOf("{% url 'home' %}");
    assert.ok(idx >= 0, 'Should find {% url "home" %} in navbar');
    // Position cursor on "home" inside the quotes
    const homeIdx = text.indexOf("'home'", idx) + 1;
    const pos = doc.positionAt(homeIdx + 1);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hovers && hovers.length > 0, 'Should show hover on URL name');
    const hoverText = hovers!
      .map(h =>
        h.contents
          .map(c => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
          .join(''),
      )
      .join('');
    assert.ok(hoverText.includes('home'), 'Hover should mention "home"');
  });

  test('URL go-to-definition jumps to urls.py', async function () {
    const doc = await openWorkspaceFile('templates', 'base', 'partials', '_navbar.html');
    const text = doc.getText();
    const homeIdx = text.indexOf("'home'") + 1;
    const pos = doc.positionAt(homeIdx + 1);
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      doc.uri,
      pos,
    );
    assert.ok(locations && locations.length > 0, 'Should resolve definition');
    assert.ok(
      locations![0].uri.fsPath.includes('urls.py'),
      `Should point to urls.py, got: ${locations![0].uri.fsPath}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION: Template Preview Hover
// ════════════════════════════════════════════════════

suite('Real Project — Template Preview Hover', function () {
  this.timeout(30_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('hover on {% include %} path shows template preview', async function () {
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    const text = doc.getText();
    const includeIdx = text.indexOf("'base/partials/_navbar.html'");
    assert.ok(includeIdx >= 0, 'Should find include path');
    const pos = doc.positionAt(includeIdx + 5); // inside the path
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hovers && hovers.length > 0, 'Should show hover for include path');
    const hoverText = hovers!
      .map(h =>
        h.contents
          .map(c => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
          .join(''),
      )
      .join('');
    assert.ok(
      hoverText.includes('_navbar.html') || hoverText.includes('lines'),
      'Hover should contain file info or preview',
    );
  });

  test('hover on {% extends %} path shows template preview', async function () {
    const doc = await openWorkspaceFile(
      'templates',
      'shop',
      'pages',
      'products',
      'product_list.html',
    );
    const text = doc.getText();
    const extendsIdx = text.indexOf("'base/base.html'");
    assert.ok(extendsIdx >= 0, 'Should find extends path');
    const pos = doc.positionAt(extendsIdx + 3);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      pos,
    );
    assert.ok(hovers && hovers.length > 0, 'Should show hover for extends path');
    const hoverText = hovers!
      .map(h =>
        h.contents
          .map(c => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
          .join(''),
      )
      .join('');
    assert.ok(
      hoverText.includes('base.html') || hoverText.includes('lines'),
      'Hover should reference the template',
    );
  });

  test('Ctrl+Click on template path resolves definition', async function () {
    const doc = await openWorkspaceFile('templates', 'base', 'base.html');
    const text = doc.getText();
    const pathStr = 'base/partials/_navbar.html';
    const pathIdx = text.indexOf(pathStr);
    assert.ok(pathIdx >= 0, 'Should find path');
    const pos = doc.positionAt(pathIdx + 5);
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      doc.uri,
      pos,
    );
    assert.ok(locations && locations.length > 0, 'Should resolve definition for template path');
    assert.ok(
      locations![0].uri.fsPath.includes('_navbar.html'),
      `Should point to _navbar.html, got: ${locations![0].uri.fsPath}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION: Static File Completion
// ════════════════════════════════════════════════════

suite('Real Project — Static File Completion', function () {
  this.timeout(30_000);

  suiteSetup(async () => {
    await waitForExtension();
  });

  test('static completion triggers inside {% static "" %}', async function () {
    // This asserted `completions !== undefined`, which VS Code guarantees,
    // and its own comment admitted the fixture might have no static files
    // at all — it had none. The fixture now carries assets under both
    // static roots its settings.py declares, so the paths can be named.
    const doc = await openHtmlDocument('{% load static %}\n{% static "');
    const pos = new vscode.Position(1, 11);
    const items = await waitFor(
      async () => {
        const r = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          pos,
        );
        return r && r.items.length > 0 ? r.items : undefined;
      },
      { label: 'static path completions' },
    );

    const labels = items.map(i => String(i.label));
    // Stripped of the static root: STATICFILES_DIRS gives 'css/site.css',
    // the app loader gives 'shop/cart.js'.
    assert.ok(
      labels.includes('css/site.css'),
      `Expected 'css/site.css' among: ${labels.join(', ')}`,
    );
    assert.ok(
      labels.includes('shop/cart.js'),
      `Expected the app-root asset 'shop/cart.js' among: ${labels.join(', ')}`,
    );
  });
});

// ════════════════════════════════════════════════════
// SECTION: Formatter End-to-End
// ════════════════════════════════════════════════════

suite('Real Project — Formatter End-to-End', function () {
  this.timeout(30_000);

  test('formatting a document via command produces valid output', async function () {
    const input = '<div>\n{% if x %}\n<p>hello</p>\n{% endif %}\n</div>';
    const doc = await openHtmlDocument(input);
    const formatted = await formatAndGetText(doc);
    assert.ok(formatted.includes('<div>'), 'Should contain <div>');
    assert.ok(formatted.includes('{% if x %}'), 'Should contain {% if %}');
    assert.ok(formatted.includes('{% endif %}'), 'Should contain {% endif %}');
    // Verify indentation happened
    const lines = formatted.split('\n');
    const ifLine = lines.find(l => l.includes('{% if x %}'));
    assert.ok(ifLine && ifLine.startsWith('  '), 'if tag should be indented inside div');
  });

  test('formatting is idempotent', async function () {
    const input = '<div>\n  {% if show %}\n    <p>{{ message }}</p>\n  {% endif %}\n</div>\n';
    const doc = await openHtmlDocument(input);
    const first = await formatAndGetText(doc);
    // Format again — same microtask-yield pattern as formatAndGetText.
    await vscode.commands.executeCommand('editor.action.formatDocument');
    await sleep(COMMAND_YIELD_MS);
    const second = doc.getText();
    assert.strictEqual(first, second, 'Formatting should be idempotent');
  });

  test('formatting preserves DTL tags inside script blocks', async function () {
    const input = '<script>\nconst x = "{{ csrf_token }}";\n</script>';
    const doc = await openHtmlDocument(input);
    const formatted = await formatAndGetText(doc);
    assert.ok(formatted.includes('{{ csrf_token }}'), 'DTL tag should be preserved in script');
  });
});

// ════════════════════════════════════════════════════
// SECTION N: Model Diagram Webview
// ════════════════════════════════════════════════════

suite('Model Diagram Webview', () => {
  test('showModelDiagram command opens a webview panel without errors', async function () {
    this.timeout(20_000);

    // Wait for activation + one-shot scanner warmup; no extra fixed 4s needed.
    await waitForExtension();

    // Track any 'error' tab labels or unhandled rejections during this test
    let capturedError: unknown = null;
    const handler = (reason: unknown) => {
      capturedError = reason;
    };
    process.on('unhandledRejection', handler);

    try {
      await vscode.commands.executeCommand('django-language-service.showModelDiagram');
      await sleep(WEBVIEW_OPEN_MS);

      // Find the webview panel among open tabs
      const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
      const diagramTab = tabs.find(t => t.label === 'Django Model Diagram');
      assert.ok(diagramTab, 'diagram webview tab should be open');

      // The tab exists even when the bundle fails to parse — VS Code
      // opens it either way, as the old comment here admitted. The
      // webview now posts `ready` as the last statement of its boot, so
      // this can assert that the Svelte app actually mounted.
      await waitFor(
        async () =>
          (await vscode.commands.executeCommand<boolean>(
            'django-language-service.diagramBooted',
          )) || undefined,
        { label: 'diagram webview ready handshake', timeoutMs: 15_000 },
      );

      assert.strictEqual(
        capturedError,
        null,
        `unexpected error during diagram open: ${String(capturedError)}`,
      );
    } finally {
      process.off('unhandledRejection', handler);
    }
  });
});
