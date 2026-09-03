/**
 * PRV-018, INS-010 — Context variable completion.
 *
 * Autocomplete inside {{ }} / {% %}:
 *   - root level: the live view's context vars + template-local bindings
 *     (for-loop iterators, with-bindings, incoming include-with kwargs)
 *   - dotted chains: resolved hop by hop through the view-context engine —
 *     model fields, forward/reverse relations, @properties, annotations,
 *     values() projections, manager attrs (all/count/first/...), dict keys
 *   - form vars ({{ form.field }}): declared fields + Meta.fields resolved
 *     through the bound model + standard form attributes
 *
 * All resolution comes from $domain/view-context (resolveChain +
 * buildChainEntries + matchFormVar); model refs resolve via the memoized
 * ModelGraph — NOT via project.models.byKey, which misses bare typeRefs.
 *
 * Gated on Live Mode: returns undefined if no live view is selected
 * (a template can be reached by many views and guessing alphabetically
 * would confuse more than help). Live Mode selection is stored in
 * workspaceState by compare-state.ts (P10/CTX-017).
 */
import * as vscode from 'vscode';
import { isInsideTemplateExpr } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import type { ResolvedType, CompletionEntry } from '$domain/view-context';
import {
  contextVarToResolvedType,
  buildIteratorTypes,
  applyIncludeWithKwargs,
  resolveChain,
  buildChainEntries,
  buildRootEntries,
  matchFormVar,
  buildFormFieldEntries,
} from '$domain/view-context';
import { LIVE_VIEW_KEY } from '$adapters/sidebar/compare-state';
import { graphFor } from '$adapters/_shared/project-graph';
import { collectIncomingKwargs } from '$adapters/_shared/include-kwargs';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

const APP_NAME = 'Django Language Service';

/** Extract dot-chain prefix before cursor. Returns [] for root level. */
function extractChain(textBefore: string): string[] | null {
  // "user.profile." → ['user', 'profile']
  const dotMatch = textBefore.match(/([\w.]+)\.$/);
  if (dotMatch?.[1]) return dotMatch[1].split('.');
  // "user.profile.na" → ['user', 'profile']
  const partialDot = textBefore.match(/([\w.]+)\.(\w+)$/);
  if (partialDot?.[1]) return partialDot[1].split('.');
  // Root: {{ var or {{ prefix
  const rootMatch = textBefore.match(/\{\{[-+]?\s*\w*$/);
  if (rootMatch) return [];
  // Inside tag: {% for x in ...
  const tagMatch = textBefore.match(/\{%[-+]?\s+\w+\s+(?:in\s+)?\w*$/);
  if (tagMatch) return [];
  return null;
}

const ENTRY_ITEM_KIND: Record<CompletionEntry['kind'], vscode.CompletionItemKind> = {
  field: vscode.CompletionItemKind.Field,
  relation: vscode.CompletionItemKind.Field,
  property: vscode.CompletionItemKind.Property,
  annotation: vscode.CompletionItemKind.Field,
  reverse: vscode.CompletionItemKind.Reference,
  'manager-attr': vscode.CompletionItemKind.Method,
  'dict-key': vscode.CompletionItemKind.Field,
  'form-field': vscode.CompletionItemKind.Field,
  'form-attr': vscode.CompletionItemKind.Property,
  'context-var': vscode.CompletionItemKind.Variable,
  'template-local': vscode.CompletionItemKind.Variable,
  'choice-display': vscode.CompletionItemKind.Method,
  method: vscode.CompletionItemKind.Method,
};

function toItem(entry: CompletionEntry): vscode.CompletionItem {
  const item = new vscode.CompletionItem(entry.label, ENTRY_ITEM_KIND[entry.kind]);
  item.detail = `${APP_NAME} — ${entry.detail}`;
  if (entry.sortLast) item.sortText = `z_${entry.label}`;
  return item;
}

class ContextVarsCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly services: AdapterServices,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] | undefined {
    try {
      // Live Mode gate FIRST — a workspaceState lookup, and it rejects 100% of
      // calls in the DEFAULT configuration. Everything below it reads the whole
      // document, and this runs on `{`, `.` and space, which is most keystrokes
      // in a template. The three cheap gates follow in cost order; the document
      // read is last.
      const liveViewKey = this.ctx.workspaceState.get<string>(LIVE_VIEW_KEY);
      if (!liveViewKey) return undefined;

      const project = this.services.getProject();
      const view = project.views.byKey(liveViewKey);
      if (!view) return undefined;

      const lineText = document.lineAt(position).text;
      const textBefore = lineText.substring(0, position.character);

      const chain = extractChain(textBefore);
      if (chain === null) return undefined;

      if (!isInsideTemplateExpr(document.getText(), document.offsetAt(position))) return undefined;

      const graph = graphFor(project);

      // Context types + template-local scope (iterators / with / include-with).
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

      // ── Root level — context vars + template-local bindings ────────────────
      if (chain.length === 0) {
        return buildRootEntries(view.contextVars, document.getText(), iteratorTypes).map(toItem);
      }

      // ── Dotted chain — engine resolution ────────────────────────────────────
      const rootName = chain[0]!;
      // Iterator bindings shadow context vars of the same name.
      const rootType = iteratorTypes.get(rootName) ?? contextTypes.get(rootName);

      if (!rootType) {
        // {{ form.| }} — legacy tryFormCompletion heuristic against the
        // scanner's forms index (untyped roots only).
        if (chain.length === 1) {
          const form = matchFormVar(rootName, project.forms.all());
          if (form) return buildFormFieldEntries(form, graph).map(toItem);
        }
        return undefined;
      }

      const finalType =
        chain.length > 1 ? resolveChain(chain, rootType, graph).finalType : rootType;
      if (!finalType) return undefined;

      return buildChainEntries(finalType, graph).map(toItem);
    } catch (err) {
      logError('Context vars completion failed', err);
      return undefined;
    }
  }
}

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    DTL_SELECTOR,
    new ContextVarsCompletionProvider(services, ctx),
    '{',
    '.',
    ' ',
  );
}
