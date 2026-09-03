/**
 * PRV-004, DTL-010 — DTL tag and filter hover documentation.
 *
 * On hover over a tag name (inside {% %}) or a filter name (after |),
 * displays the built-in documentation from the DTL tag registry.
 *
 * Delegates to pure `domain/dtl-tag-registry` for lookups.
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { getTagDoc, getFilterDoc, type DtlDoc } from '$domain/dtl-tag-registry/tag-registry';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { PY_IDENT } from '$domain/parsers/_shared/python-tokens';

const TAG_RE = new RegExp(String.raw`\{%[-+]?\s*(${PY_IDENT})`, 'u');

function formatDoc(doc: DtlDoc): vscode.MarkdownString {
  const icon = doc.type === 'tag' ? '$(symbol-keyword)' : '$(symbol-function)';
  // This one renders a static catalogue, not workspace text, so it was never
  // exploitable — but the flag is unnecessary here too: the only link is an
  // https: one, which needs no trust. Kept off so the rule stays one rule.
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;
  md.supportHtml = true;

  md.appendMarkdown(`${icon} **${doc.type === 'tag' ? `{% ${doc.name} %}` : `|${doc.name}`}**\n\n`);
  md.appendMarkdown(`${doc.description}\n\n`);
  md.appendMarkdown(`**Syntax:** \`${doc.syntax}\`\n\n`);
  md.appendMarkdown(`**Example:**\n\`\`\`django\n${doc.example}\n\`\`\`\n\n`);
  md.appendMarkdown(`[$(link-external) Django Documentation](${doc.url})`);

  return md;
}

class DtlHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    try {
      const lineText = document.lineAt(position.line).text;
      const wordRange = document.getWordRangeAtPosition(position, /[\w]+/);
      if (!wordRange) return undefined;

      const word = document.getText(wordRange);
      const textBefore = lineText.substring(0, wordRange.start.character);
      const charBefore =
        wordRange.start.character > 0 ? lineText[wordRange.start.character - 1] : '';

      // Check filter (preceded by |)
      if (charBefore === '|' || textBefore.trimEnd().endsWith('|')) {
        const doc = getFilterDoc(word);
        if (doc) return new vscode.Hover(formatDoc(doc), wordRange);
      }

      // Check tag name inside {% %}
      const lastTagOpen = textBefore.lastIndexOf('{%');
      const lastTagClose = textBefore.lastIndexOf('%}');
      if (lastTagOpen > lastTagClose) {
        const afterBrace = textBefore.substring(lastTagOpen);
        if (afterBrace.match(/\{%[-+]?\s*$/) || afterBrace.match(/\{%[-+]?\s+\w*$/)) {
          const doc = getTagDoc(word);
          if (doc) return new vscode.Hover(formatDoc(doc), wordRange);
        }
      }

      // Also check if cursor is on a tag keyword at start of {% %} content
      const fullTagMatch = TAG_RE.exec(lineText);
      if (fullTagMatch?.[1] === word) {
        const tagStart = lineText.indexOf(fullTagMatch[0]);
        const tagNameStart = tagStart + fullTagMatch[0].indexOf(word);
        if (
          position.character >= tagNameStart &&
          position.character <= tagNameStart + word.length
        ) {
          const doc = getTagDoc(word);
          if (doc) return new vscode.Hover(formatDoc(doc), wordRange);
        }
      }

      return undefined;
    } catch (err) {
      logError('DTL hover failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(DTL_SELECTOR, new DtlHoverProvider());
}
