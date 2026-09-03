/**
 * DTL-012/013 quick-fix — insert the missing {% load %}.
 *
 * Companion to `diagnostics/dtl-load`: that adapter emits the `missing-load`
 * warnings; this one offers the lightbulb CodeAction that inserts the required
 * `{% load <library> %}` — one per library, plus a SourceFixAll that inserts
 * them all at once (drives format/fix-on-save). Ported from the OLD baseline
 * (core/dtl) which the refactor dropped.
 *
 * Reads the missing library straight from the diagnostic message produced by
 * dtl-load (`... requires {% load <lib> %}`), so it stays in lockstep with it.
 */
import * as vscode from 'vscode';
import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
import { extractLoadedLibraries } from '$domain/dtl-tag-registry/tag-registry';
import type { AdapterServices } from '$adapters/types';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';

const PROVIDED_KINDS: readonly vscode.CodeActionKind[] = [
  vscode.CodeActionKind.QuickFix,
  vscode.CodeActionKind.SourceFixAll,
];

/**
 * Pull the library name out of a `... {% load <lib> %}` diagnostic message.
 *
 * DESIGN NOTE, kept because it will bite again: the domain hands the adapter
 * `requiredLibrary` as a FIELD on the diagnostic, and `dtl-load.ts` drops it
 * when it builds the `vscode.Diagnostic` — so this has to recover, from prose,
 * a value that was already in hand two files away. `Diagnostic.code` is the
 * only channel that survives the trip and it is already carrying the type.
 *
 * The reachable half is closed: the library is a Python module name under
 * `templatetags/`, so `\w` could not spell `índice_tags` and the lightbulb
 * simply never appeared — no error, no log, just a warning the extension
 * raised and then would not fix.
 */
export function missingLibFromMessage(message: string): string | null {
  const m = message.match(MISSING_LIB_RE);
  return m?.[1] ?? null;
}

const MISSING_LIB_RE = new RegExp(String.raw`\{%\s*load\s+(${PY_IDENT})\s*%\}`, 'u');

class MissingLoadQuickFix implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Deduplicate missing libraries across the diagnostics in range.
    const missingLibs = new Set<string>();
    for (const diag of context.diagnostics) {
      if (diag.code !== 'missing-load') continue;
      const lib = missingLibFromMessage(diag.message);
      if (lib) missingLibs.add(lib);
    }
    if (missingLibs.size === 0) return actions;

    // One preferred quick-fix per missing library.
    for (const libName of missingLibs) {
      const action = createLoadAction(document, libName, vscode.CodeActionKind.QuickFix);
      action.diagnostics = context.diagnostics.filter(
        d => d.code === 'missing-load' && d.message.includes(libName),
      );
      action.isPreferred = true;
      actions.push(action);
    }

    // SourceFixAll: insert every missing {% load %} in one edit (fix-on-save).
    const fixAll = new vscode.CodeAction(
      'Add all missing {% load %} tags',
      vscode.CodeActionKind.SourceFixAll,
    );
    fixAll.diagnostics = context.diagnostics.filter(d => d.code === 'missing-load');
    fixAll.edit = new vscode.WorkspaceEdit();
    for (const libName of missingLibs) {
      applyLoadEdit(fixAll.edit, document, libName);
    }
    actions.push(fixAll);

    return actions;
  }
}

function createLoadAction(
  document: vscode.TextDocument,
  libName: string,
  kind: vscode.CodeActionKind,
): vscode.CodeAction {
  const action = new vscode.CodeAction(`Add {% load ${libName} %}`, kind);
  action.edit = new vscode.WorkspaceEdit();
  applyLoadEdit(action.edit, document, libName);
  return action;
}

/**
 * Insert a load for `libName`. If already loaded, no-op. If a {% load %} tag
 * exists, merge into the last one; otherwise insert a fresh tag after
 * {% extends %} (or at the top).
 */
function applyLoadEdit(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  libName: string,
): void {
  const text = document.getText();
  if (extractLoadedLibraries(text).includes(libName)) return; // already loaded

  // Against tokens, not raw lines: a `{% load %}` or `{% extends %}` written
  // inside a comment is not the anchor to insert against, and the old scan
  // would have put the fix there.
  const tags = liveTokens(text).filter(t => t.kind === 'tag');
  const lastLoad = tags.filter(t => t.name === 'load').at(-1);
  if (lastLoad) {
    // Just inside the closing delimiter, so `{% load a %}` becomes
    // `{% load a b %}` — and `-%}` keeps its marker.
    const close = lastLoad.start + lastLoad.raw.lastIndexOf('%}');
    const before = /[-+]$/.test(lastLoad.raw.slice(0, lastLoad.raw.lastIndexOf('%}')))
      ? close - 1
      : close;
    edit.insert(document.uri, document.positionAt(before), `${libName} `);
    return;
  }

  const extendsTag = tags.find(t => t.name === 'extends');
  const insertLine = extendsTag ? document.positionAt(extendsTag.start).line + 1 : 0;
  edit.insert(document.uri, new vscode.Position(insertLine, 0), `{% load ${libName} %}\n`);
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerCodeActionsProvider(DTL_SELECTOR, new MissingLoadQuickFix(), {
    providedCodeActionKinds: [...PROVIDED_KINDS],
  });
}
