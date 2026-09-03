/**
 * DTL-020 — Script/Style Diagnostics Filter.
 *
 * Django templates mix HTML, DTL, JS and CSS. Built-in html.validate.scripts
 * and html.validate.styles choke on {{ }}, {% %}, {# #} inside <script>/<style>.
 *
 * Strategy:
 * 1. Disable built-in html.validate.scripts and html.validate.styles — but
 *    only in Workspace settings, only with a workspace open, and only when
 *    `djangoLanguageService.suppressBuiltinHtmlValidation` is on. See
 *    ./suppression-plan.ts for that decision.
 * 2. Run our own validation after cleaning DTL to valid JS/CSS equivalents.
 * 3. Report only REAL syntax errors — DTL-caused noise is eliminated.
 *
 * DTL cleaning rules (length-preserving for position mapping):
 *   JS:  {{ expr }} → (0)+spaces | {% tag %} → //comment | {# #} → //comment
 *   CSS: {{ expr }} → inherit+spaces | {% tag %} → block comment | {# #} → block comment
 */
import * as vscode from 'vscode';
import { cleanDtlForJs, cleanDtlForCss } from '$domain/parsers/_shared/dtl-blanking';
import * as vm from 'vm';
import type { AdapterServices } from '$adapters/types';
import type { Project } from '$infra/types/project';
import { logError, logInfo } from '$shared/logger';
import { HTML_ONLY_LANGUAGES } from '$adapters/_shared/languages';
import { suppressionPlan } from './suppression-plan';
import { findEmbeddedBlocks } from './embedded-blocks';

/**
 * Line number of `offset`, given the offsets of every line start.
 *
 * The line was previously found with `text.substring(0, start).split('\n')`,
 * which walks the document from the top again for every block — quadratic in a
 * page with many blocks, on a path that runs while the author types.
 */
function lineAt(lineStarts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Offset of the first character of every line, in order. */
function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

// ── Syntax checkers ──

interface SyntaxError {
  message: string;
  line: number;
  column: number;
}

function checkJsSyntax(code: string): SyntaxError | null {
  try {
    new vm.Script(code, { filename: 'inline.js' });
    return null;
  } catch (e: unknown) {
    if (e instanceof Error && e.constructor.name === 'SyntaxError') {
      const stack = (e as { stack?: string }).stack ?? '';
      const locMatch = stack.match(/inline\.js:(\d+)\n/);
      const line = locMatch?.[1] ? parseInt(locMatch[1], 10) : 1;
      let column = 0;
      for (const l of stack.split('\n')) {
        const idx = l.indexOf('^');
        if (idx >= 0) {
          column = idx;
          break;
        }
      }
      return { message: e.message, line, column };
    }
    return null;
  }
}

function checkCssSyntax(code: string): SyntaxError | null {
  let depth = 0;
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth < 0) return { message: 'Unexpected closing brace', line: i, column: 0 };
    }
  }
  if (depth > 0)
    return { message: `Unclosed brace (${depth} open)`, line: lines.length - 1, column: 0 };
  return null;
}

// ── Validators ──

function validateScriptBlocks(text: string, source: string): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  const lineStarts = lineStartOffsets(text);
  for (const block of findEmbeddedBlocks(text, 'script')) {
    const content = block.content;
    if (!content.trim()) continue;
    const startLine = lineAt(lineStarts, block.contentStart);
    const cleaned = cleanDtlForJs(content);
    const error = checkJsSyntax(cleaned);
    if (error) {
      const line = startLine + (error.line - 1);
      const range = new vscode.Range(line, error.column, line, error.column + 1);
      const diag = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
      diag.source = source;
      diags.push(diag);
    }
  }
  return diags;
}

function validateStyleBlocks(text: string, source: string): vscode.Diagnostic[] {
  const diags: vscode.Diagnostic[] = [];
  const lineStarts = lineStartOffsets(text);
  for (const block of findEmbeddedBlocks(text, 'style')) {
    const content = block.content;
    if (!content.trim()) continue;
    const startLine = lineAt(lineStarts, block.contentStart);
    const cleaned = cleanDtlForCss(content);
    const error = checkCssSyntax(cleaned);
    if (error) {
      const line = startLine + error.line;
      const range = new vscode.Range(line, 0, line, 1);
      const diag = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Warning);
      diag.source = source;
      diags.push(diag);
    }
  }
  return diags;
}

// ── Built-in suppression ──

/** Django artifacts parsed out of the workspace's Python — see SuppressionInput. */
const looksLikeDjango = (project: Project): boolean =>
  project.models.all().length > 0 ||
  project.views.all().length > 0 ||
  project.urls.all().length > 0;

async function suppressBuiltinValidation(project: Project): Promise<void> {
  // Writing `.vscode/settings.json` is a change to somebody's repository, and
  // in an untrusted workspace the user has said, in as many words, that they
  // are only looking. Opening a repo to read it left its tree modified.
  if (!vscode.workspace.isTrusted) return;

  const config = vscode.workspace.getConfiguration('html.validate');
  const plan = suppressionPlan({
    enabled: vscode.workspace
      .getConfiguration('djangoLanguageService')
      .get<boolean>('suppressBuiltinHtmlValidation', true),
    hasWorkspace: (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
    isDjangoProject: looksLikeDjango(project),
    scripts: config.get<boolean>('scripts'),
    styles: config.get<boolean>('styles'),
  });
  if (plan.length === 0) return;

  try {
    // Awaited, not `void`-ed. The old code fired the updates and logged success
    // on the next line: the enclosing catch could never see a rejected write,
    // so a failure to edit settings.json was reported to the log as a success.
    await Promise.all(
      plan.map(key => config.update(key, false, vscode.ConfigurationTarget.Workspace)),
    );
    logInfo(
      `Disabled built-in html.validate.${plan.join(' and html.validate.')} ` +
        'in Workspace settings so the DTL-aware checkers can replace them ' +
        '(djangoLanguageService.suppressBuiltinHtmlValidation to opt out).',
    );
  } catch (err) {
    logError('Could not disable built-in HTML validation', err);
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  // Deferred until a scan proves this is a Django workspace, and run at most
  // once per session. At register() time the first scan has not happened yet,
  // so the only thing we could have known is that SOME folder is open.
  let suppressionDone = false;
  const suppressWhenDjango = (project: Project): void => {
    if (suppressionDone || !looksLikeDjango(project)) return;
    suppressionDone = true;
    void suppressBuiltinValidation(project);
  };
  suppressWhenDjango(services.getProject());
  const suppressionWatch = services.onProjectChange?.(suppressWhenDjango);

  const jsCollection = vscode.languages.createDiagnosticCollection('django-js');
  const cssCollection = vscode.languages.createDiagnosticCollection('django-css');

  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const doValidate = (doc: vscode.TextDocument): void => {
    if (!HTML_ONLY_LANGUAGES.has(doc.languageId)) return;
    const text = doc.getText();
    jsCollection.set(doc.uri, validateScriptBlocks(text, 'django'));
    cssCollection.set(doc.uri, validateStyleBlocks(text, 'django'));
  };

  const scheduleValidate = (doc: vscode.TextDocument): void => {
    const key = doc.uri.toString();
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        try {
          doValidate(doc);
        } catch (err) {
          logError('Script filter validation failed', err);
        }
      }, 500),
    );
  };

  // Validate currently open documents
  for (const doc of vscode.workspace.textDocuments) {
    try {
      doValidate(doc);
    } catch (err) {
      logError('Script filter initial validation failed', err);
    }
  }

  return vscode.Disposable.from(
    ...(suppressionWatch ? [suppressionWatch] : []),
    jsCollection,
    cssCollection,
    vscode.workspace.onDidOpenTextDocument(doValidate),
    vscode.workspace.onDidSaveTextDocument(doValidate),
    vscode.workspace.onDidChangeTextDocument(e => scheduleValidate(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => {
      // Cancel first. Closing within the 500 ms debounce used to leave the
      // timer running, so it fired afterwards and wrote diagnostics for a
      // document that was gone — and this handler, the only thing that clears
      // them, had already run. VS Code keeps a closed file's problems, so they
      // stayed for the rest of the session.
      const pending = timers.get(doc.uri.toString());
      if (pending) {
        clearTimeout(pending);
        timers.delete(doc.uri.toString());
      }
      jsCollection.delete(doc.uri);
      cssCollection.delete(doc.uri);
    }),
    {
      dispose(): void {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
      },
    },
  );
}
