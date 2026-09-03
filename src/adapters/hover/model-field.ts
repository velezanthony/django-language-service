/**
 * PRV-019, INS-011, CTX-011 — Model field hover.
 *
 * On hover over a dot-chain like `{{ product.name }}` or
 * `{{ order.customer.email }}`, resolves the chain through the view-context
 * engine (describeChainSegment) and shows what the segment under the cursor
 * IS: model field (with type/attrs), forward/reverse relation, @property,
 * annotation, manager attr, or dict key. Deep chains, for-loop iterators,
 * with-bindings and include-with kwargs all resolve — same engine the
 * diagnostics use, so hover never disagrees with the squiggles.
 *
 * Gated on Live Mode (same reasoning as context-vars completion):
 * returns undefined if no live view is selected.
 */
import * as vscode from 'vscode';
import { isInsideTemplateExpr } from '$domain/parsers/_shared/dtl-lexer';
import type { AdapterServices } from '$adapters/types';
import { escapeMarkdown, codeSpan } from '$adapters/_shared/markdown-escape';
import type { ResolvedType, ChainSegmentInfo } from '$domain/view-context';
import { choiceValues } from '$domain/types/choice';
import {
  contextVarToResolvedType,
  buildIteratorTypes,
  applyIncludeWithKwargs,
  collectTemplateLocalNames,
  findLocalOrigin,
  describeChainSegment,
} from '$domain/view-context';
import type { View } from '$domain/types/view';
import { LIVE_VIEW_KEY } from '$adapters/sidebar/compare-state';
import { graphFor } from '$adapters/_shared/project-graph';
import { collectIncomingKwargs } from '$adapters/_shared/include-kwargs';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';

/** Extract chain around cursor position, e.g. "order.customer" → ['order','customer'] */
function extractChainAtCursor(
  lineText: string,
  cursor: number,
): { parts: string[]; cursorPartIndex: number; start: number; fullText: string } | null {
  // Find the dot-chain token that includes cursor
  const re = /[\w.]+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(lineText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;

    if (cursor < start || cursor > end) continue;

    const parts = m[0].split('.');

    // Determine which part cursor is in
    let pos = start;
    let cursorPartIndex = 0;
    for (let i = 0; i < parts.length; i++) {
      const partEnd = pos + (parts[i]?.length ?? 0);
      if (cursor <= partEnd) {
        cursorPartIndex = i;
        break;
      }
      pos = partEnd + 1; // skip the dot
    }

    return { parts, cursorPartIndex, start, fullText: m[0] };
  }

  return null;
}

/**
 * Hover for a name that IS in scope but carries no model type.
 *
 * Two ways that happens: a context key whose value the inference could not
 * shape (anything not spelled `Model.objects…`), and a template local bound to
 * one of those.
 */
function describeUntypedRoot(
  name: string,
  templateSource: string,
  view: View,
): vscode.MarkdownString | undefined {
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;

  const origin = findLocalOrigin(templateSource, name);
  if (origin) {
    const verb = origin.kind === 'loop' ? 'loop variable over' : 'bound by `{% with %}` to';
    md.appendMarkdown(`$(symbol-variable) \`${name}\` — ${verb} \`${origin.source}\`\n\n`);
    md.appendMarkdown('_Type not inferred, so its attributes are not checked._');
    return md;
  }
  if (collectTemplateLocalNames(templateSource).has(name)) {
    md.appendMarkdown(`$(symbol-variable) \`${name}\` — template-local variable\n\n`);
    md.appendMarkdown('_Type not inferred, so its attributes are not checked._');
    return md;
  }

  const cv = view.contextVars.find(v => v.name === name);
  if (!cv) return undefined;
  const where = `\`${view.name}\``;
  md.appendMarkdown(`$(symbol-variable) \`${name}\` — in the context of ${where}\n\n`);
  if (cv.conditional) {
    md.appendMarkdown('$(warning) Only present on some branches of the view.\n\n');
  }
  md.appendMarkdown('_Type not inferred, so its attributes are not checked._');
  return md;
}

/** Render the segment info as hover markdown. */
function renderSegment(info: ChainSegmentInfo, pathText: string): vscode.MarkdownString {
  // Not trusted: field names, choice labels and `docComment` are all read out
  // of the workspace's models.py. Nothing here emits a command URI.
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;

  switch (info.kind) {
    case 'root': {
      md.appendMarkdown(`$(symbol-variable) **${info.name}**\n\n`);
      const typeLabel = info.type.model
        ? `${info.type.kind}\\<${info.type.model}\\>`
        : info.type.kind;
      md.appendMarkdown(`**Type:** ${typeLabel}\n\n`);
      if (info.model) {
        md.appendMarkdown(`**Fields:** ${info.model.fields.map(f => f.name).join(', ')}\n`);
      }
      break;
    }
    case 'field': {
      md.appendMarkdown(`$(symbol-field) **${pathText}**\n\n`);
      md.appendMarkdown(`**Model:** \`${info.owner.name}\`\n\n`);
      md.appendMarkdown(`**Type:** \`${info.field.fieldType}\`\n\n`);
      if (info.field.maxLength !== undefined)
        md.appendMarkdown(`**Max length:** ${info.field.maxLength}\n\n`);
      if (info.field.isNull) md.appendMarkdown(`**null:** True\n\n`);
      if (info.field.isBlank) md.appendMarkdown(`**blank:** True\n\n`);
      const choiceList = choiceValues(info.field.choices);
      if (choiceList.length > 0) {
        md.appendMarkdown(`**Choices:** ${choiceList.map(c => `\`${c.value}\``).join(', ')}\n\n`);
      } else if (info.field.choices?.kind === 'unresolved') {
        // Say which symbol we could not follow rather than omitting the row.
        md.appendMarkdown(`**Choices:** \`${info.field.choices.symbolName}\` (unresolved)\n\n`);
      }
      // appendText, not appendMarkdown: a docComment is free prose lifted from
      // models.py, so rendering it as markup lets the file decide what a hover
      // draws. Plain text is also the honest rendering of a comment.
      if (info.field.docComment) {
        md.appendText(`${info.field.docComment}\n`);
      }
      break;
    }
    case 'relation': {
      const shape = info.relation.kind === 'm2m' ? 'Manager' : 'Instance';
      md.appendMarkdown(`$(references) **${pathText}**\n\n`);
      md.appendMarkdown(
        `**Relation:** \`${info.relation.kind}\` → \`${info.target?.name ?? info.relation.toModel}\` (${shape})\n\n`,
      );
      md.appendMarkdown(`**Declared on:** \`${info.owner.name}\`\n`);
      break;
    }
    case 'property': {
      md.appendMarkdown(`$(symbol-property) **${pathText}**\n\n`);
      md.appendMarkdown(`**@property** on \`${info.owner.name}\`\n`);
      break;
    }
    case 'annotation': {
      md.appendMarkdown(`$(symbol-field) **${pathText}**\n\n`);
      md.appendMarkdown(`**Annotation:** \`${info.func}\` (synthesized on the queryset)\n`);
      break;
    }
    case 'reverse': {
      const shape = info.rel.relationKind === 'o2o' ? 'Instance' : 'Manager';
      md.appendMarkdown(`$(references) **${pathText}**\n\n`);
      md.appendMarkdown(
        `**Reverse relation** ← \`${info.source?.name ?? info.rel.sourceModel}\` (${shape})\n`,
      );
      break;
    }
    case 'manager-attr': {
      md.appendMarkdown(`$(symbol-method) **${pathText}**\n\n`);
      md.appendMarkdown(`**Manager attribute** on \`${info.modelRef ?? 'QuerySet'}\`\n`);
      break;
    }
    case 'choice-display': {
      md.appendMarkdown(`$(symbol-method) **${pathText}**\n\n`);
      md.appendMarkdown(`Django's display method for \`${info.owner.name}.${info.field.name}\` — `);
      md.appendMarkdown('returns the **label**, not the stored value.\n\n');
      const list = choiceValues(info.field.choices);
      if (list.length > 0) {
        md.appendMarkdown('| value | shown |\n| --- | --- |\n');
        for (const c of list) {
          md.appendMarkdown(`| \`${c.value}\` | ${c.label ?? '—'} |\n`);
        }
      } else if (info.field.choices?.kind === 'unresolved') {
        md.appendMarkdown(`**Choices:** ${codeSpan(info.field.choices.symbolName)} (unresolved)\n`);
      }
      break;
    }
    case 'implicit-pk': {
      md.appendMarkdown(`$(key) **${escapeMarkdown(pathText)}**\n\n`);
      const real = info.owner.fields.find(f => f.isPrimaryKey);
      md.appendMarkdown(
        real
          ? `Primary key of ${codeSpan(info.owner.name)} — alias for ${codeSpan(real.name)} (${codeSpan(real.fieldType)})\n`
          : `Primary key of ${codeSpan(info.owner.name)} — the implicit \`AutoField\`\n`,
      );
      break;
    }
    case 'fk-id': {
      md.appendMarkdown(`$(key) **${escapeMarkdown(pathText)}**\n\n`);
      md.appendMarkdown(
        `The stored key of ${codeSpan(info.relation.fieldName)} on ` +
          `${codeSpan(info.owner.name)} — it points at ` +
          `${codeSpan(info.relation.toModel)}.\n\n`,
      );
      // Why anyone writes it: reading the attname is how a template avoids the
      // query that `order.customer.pk` costs.
      md.appendMarkdown('Reading this does **not** hit the database; ');
      md.appendMarkdown(`${codeSpan(`${info.relation.fieldName}.pk`)} does.\n`);
      break;
    }
    case 'date-nav': {
      md.appendMarkdown(`$(symbol-method) **${escapeMarkdown(pathText)}**\n\n`);
      md.appendMarkdown(
        `Django adds this for ${codeSpan(info.field.name)} ` +
          `(${codeSpan(info.field.fieldType)}) because it is not nullable.\n\n`,
      );
      // The part a template author needs and the signature does not say.
      md.appendMarkdown('Each call runs a **query**, and raises `DoesNotExist` ');
      md.appendMarkdown('when there is no neighbour — which a template swallows in silence.\n');
      break;
    }
    case 'method': {
      md.appendMarkdown(`$(symbol-method) **${pathText}**\n\n`);
      md.appendMarkdown(
        `Zero-argument method on \`${info.owner.name}\` — Django calls it for you.\n`,
      );
      break;
    }
    case 'dict-key': {
      md.appendMarkdown(`$(symbol-field) **${pathText}**\n\n`);
      md.appendMarkdown(`**Dict key** (aggregate result)\n`);
      break;
    }
  }
  return md;
}

class ModelFieldHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly services: AdapterServices,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    try {
      // Live Mode gate FIRST — stored value is the qualified '<app>.<name>'
      // index key. It rejects every call while Live Mode is off, which is the
      // default, and a hover fires on every pointer rest. The document-wide
      // check below costs a full `getText` plus a blanking pass; paying it to
      // reach a `return undefined` is paying it for nothing.
      const liveViewKey = this.ctx.workspaceState.get<string>(LIVE_VIEW_KEY);
      if (!liveViewKey) return undefined;

      const project = this.services.getProject();
      const view = project.views.byKey(liveViewKey);
      if (!view) return undefined;

      const lineText = document.lineAt(position.line).text;
      const chainInfo = extractChainAtCursor(lineText, position.character);
      if (!chainInfo || chainInfo.parts.length === 0) return undefined;

      const rootName = chainInfo.parts[0];
      if (!rootName) return undefined;

      if (!isInsideTemplateExpr(document.getText(), document.offsetAt(position))) return undefined;

      const graph = graphFor(project);

      // Root type: context var, or a template-local binding (iterator /
      // with / include-with kwarg) — iterators shadow context vars.
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
      if (!rootType) {
        // The name can be perfectly well known and still have no MODEL type —
        // `context['tags'] = product.tags.all()` infers nothing, because the
        // value comes off a local rather than `Model.objects…`. Returning
        // nothing there reads as "this variable is unknown", which is the
        // opposite of the truth, so say what is actually known.
        const untyped = describeUntypedRoot(rootName, document.getText(), view);
        if (!untyped) return undefined;
        const range = new vscode.Range(
          position.line,
          chainInfo.start,
          position.line,
          chainInfo.start + (chainInfo.parts[0]?.length ?? 0),
        );
        return new vscode.Hover(untyped, range);
      }

      const info = describeChainSegment(
        chainInfo.parts,
        chainInfo.cursorPartIndex,
        rootType,
        graph,
      );
      if (!info) return undefined;

      const range = new vscode.Range(
        position.line,
        chainInfo.start,
        position.line,
        chainInfo.start + chainInfo.fullText.length,
      );
      const pathText = chainInfo.parts.slice(0, chainInfo.cursorPartIndex + 1).join('.');
      return new vscode.Hover(renderSegment(info, pathText), range);
    } catch (err) {
      logError('Model field hover failed', err);
      return undefined;
    }
  }
}

export function register(
  ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    DTL_SELECTOR,
    new ModelFieldHoverProvider(services, ctx),
  );
}
