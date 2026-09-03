/**
 * PRV-020, INS-018 — Context variable go-to-definition.
 *
 * Ctrl+Click resolution through the view-context engine:
 *   - `{{ product }}` (root)          → the view that provides the variable
 *   - `{{ product.name }}` (field)    → the model class declaring the field
 *   - `{{ product.category }}` (rel)  → the model declaring the relation
 *   - `{{ author.orders }}` (reverse) → the model declaring the FK/M2M
 *   - annotations                     → the view (where .annotate() lives)
 *
 * Deep chains resolve hop by hop (describeChainSegment), so
 * `{{ post.author.username }}` jumps to the USER model, not the view.
 * Model classes carry their definition line; fields don't (Field has no
 * line info), so field jumps land on the owning class line.
 *
 * Only active when Live Mode is enabled (a live view is selected in
 * workspaceState). Without Live Mode the same template can be reached
 * by multiple views, making a single definition location meaningless.
 */
import * as vscode from 'vscode';
import { isInsideTemplateExpr } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import type { Model } from '$domain/types/model';
import type { View } from '$domain/types/view';
import type { ResolvedType } from '$domain/view-context';
import {
  contextVarToResolvedType,
  buildIteratorTypes,
  applyIncludeWithKwargs,
  describeChainSegment,
} from '$domain/view-context';
import { LIVE_VIEW_KEY } from '$adapters/sidebar/compare-state';
import { graphFor } from '$adapters/_shared/project-graph';
import { collectIncomingKwargs } from '$adapters/_shared/include-kwargs';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

/** Extract chain around cursor, e.g. "order.customer" → parts + cursor segment. */
function extractChainAtCursor(
  lineText: string,
  cursor: number,
): { parts: string[]; cursorPartIndex: number } | null {
  const re = /[\w.]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (cursor < start || cursor > end) continue;

    const parts = m[0].split('.');
    let pos = start;
    let cursorPartIndex = 0;
    for (let i = 0; i < parts.length; i++) {
      const partEnd = pos + (parts[i]?.length ?? 0);
      if (cursor <= partEnd) {
        cursorPartIndex = i;
        break;
      }
      pos = partEnd + 1;
    }
    return { parts, cursorPartIndex };
  }
  return null;
}

function modelLocation(model: Model): vscode.Location {
  const line = model.line > 0 ? model.line - 1 : 0;
  return new vscode.Location(vscode.Uri.file(model.filePath), new vscode.Position(line, 0));
}

function viewLocation(view: View): vscode.Location {
  const line = view.line > 0 ? view.line - 1 : 0;
  return new vscode.Location(vscode.Uri.file(view.filePath), new vscode.Position(line, 0));
}

class ContextVarDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly services: AdapterServices,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Definition | undefined {
    try {
      // Live Mode gate FIRST — stored value is the qualified '<app>.<name>'
      // index key. With no live view selected, which is the default, this
      // rejects every call; reading the whole document to find that out is the
      // one thing a Ctrl-hover must not do.
      const liveViewKey = this.ctx.workspaceState.get<string>(LIVE_VIEW_KEY);
      if (!liveViewKey) return undefined;

      const project = this.services.getProject();
      const view = project.views.byKey(liveViewKey);
      if (!view) return undefined;

      const lineText = document.lineAt(position.line).text;
      const chainInfo = extractChainAtCursor(lineText, position.character);
      if (!chainInfo) return undefined;
      const rootName = chainInfo.parts[0];
      if (!rootName) return undefined;

      if (!isInsideTemplateExpr(document.getText(), document.offsetAt(position))) return undefined;

      // Root segment → the view providing the variable (legacy behavior).
      if (chainInfo.cursorPartIndex === 0) {
        const isInContext = view.contextVars.some(v => v.name === rootName);
        return isInContext ? viewLocation(view) : undefined;
      }

      // Deep segment → resolve through the engine to the owning model.
      const graph = graphFor(project);
      const contextTypes = new Map<string, ResolvedType>();
      for (const cv of view.contextVars) {
        const t = contextVarToResolvedType(cv, graph);
        if (t) contextTypes.set(cv.name, t);
      }
      const iteratorTypes = buildIteratorTypes(document.getText(), contextTypes, graph);
      const incomingKwargs = collectIncomingKwargs(project.templates.all(), document.uri.fsPath);
      if (incomingKwargs.length > 0) {
        applyIncludeWithKwargs(incomingKwargs, contextTypes, iteratorTypes, graph);
      }
      const rootType = iteratorTypes.get(rootName) ?? contextTypes.get(rootName);
      if (!rootType) return undefined;

      const info = describeChainSegment(
        chainInfo.parts,
        chainInfo.cursorPartIndex,
        rootType,
        graph,
      );
      if (!info) return undefined;

      switch (info.kind) {
        case 'field':
        case 'relation':
        case 'property':
          return modelLocation(info.owner);
        case 'reverse':
          return info.source ? modelLocation(info.source) : undefined;
        case 'annotation':
          // The synthetic field is declared in the view's .annotate() call.
          return viewLocation(view);
        default:
          return undefined;
      }
    } catch (err) {
      logError('Context var definition resolution failed', err);
      return undefined;
    }
  }
}

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDefinitionProvider(
    DTL_SELECTOR,
    new ContextVarDefinitionProvider(services, ctx),
  );
}
