/**
 * PRV-014, INS-005 — Template path hover.
 *
 * On hover over a template path inside `{% include "path" %}` or
 * `{% extends "path" %}`, resolves the path and shows a preview of
 * the first 15 lines of the template.
 */
import * as vscode from 'vscode';
import { resolveTemplatePath } from '$adapters/_shared/template-resolve';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_SELECTOR } from '$adapters/_shared/languages';
import { firstStringArgAt } from '$adapters/_shared/tag-string-arg';

const PREVIEW_LINES = 15;

/** The two tags whose first quoted argument names a template. */
const TEMPLATE_REF_TAGS: ReadonlySet<string> = new Set(['include', 'extends']);

class DjangoTemplateHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    try {
      // Offset, not line text. A line may carry two `{% include %}` tags and a
      // tag may wrap across lines; only the cursor's absolute position says
      // which reference the pointer is on. The tokenization behind this is
      // memoised per source, so asking here costs nothing the rest of the
      // template providers on this document have not already paid.
      const ref = firstStringArgAt(
        document.getText(),
        document.offsetAt(position),
        TEMPLATE_REF_TAGS,
      );
      if (!ref) return undefined;

      const uri = await resolveTemplatePath(ref.value);
      if (!uri) return undefined;

      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder().decode(bytes);
      const lines = content.split('\n');
      const totalLines = lines.length;
      const preview = lines.slice(0, PREVIEW_LINES).join('\n');
      const truncated = totalLines > PREVIEW_LINES;

      const relPath = vscode.workspace.asRelativePath(uri);
      const range = new vscode.Range(document.positionAt(ref.start), document.positionAt(ref.end));

      // Not trusted: `relPath` is a workspace path, and a path is allowed to
      // contain markdown link syntax. Nothing here emits a command URI.
      const md = new vscode.MarkdownString();
      md.supportThemeIcons = true;

      md.appendMarkdown(`$(file) **${relPath}** (${totalLines} lines)\n\n`);
      md.appendCodeblock(preview, 'django-html');
      if (truncated) {
        md.appendMarkdown(`\n*...${totalLines - PREVIEW_LINES} more lines*`);
      }

      return new vscode.Hover(md, range);
    } catch (err) {
      logError('Template path hover failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  _services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(DTL_SELECTOR, new DjangoTemplateHoverProvider());
}
