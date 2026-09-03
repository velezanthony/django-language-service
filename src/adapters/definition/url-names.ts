/**
 * PRV-017, INS-008 — URL name go-to-definition.
 *
 * Ctrl+Click on a URL name inside `{% url 'name' %}` jumps to the
 * corresponding path() declaration in urls.py.
 *
 * URL entries are read from the Project snapshot (scanner-indexed).
 */
import * as vscode from 'vscode';
import type { AdapterServices } from '$adapters/types';
import { logError } from '$shared/logger';
import { DTL_AND_PYTHON_SELECTOR } from '$adapters/_shared/languages';
import { firstStringArgAt } from '$adapters/_shared/tag-string-arg';

/** The tag whose first quoted argument is a URL name. */
const URL_TAG: ReadonlySet<string> = new Set(['url']);

class DjangoUrlDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly services: AdapterServices) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Definition | undefined {
    try {
      // By cursor offset, the same way the hover for this reference locates it.
      // A search of the line starts at the tag's `{%` and so can land on the
      // KEYWORD `url` when the path is itself called `url`; the offset cannot.
      // It also reads a tag the author wrapped, which one line cannot, and
      // skips one inside `{# ... #}`, which Django never evaluates.
      const ref = firstStringArgAt(document.getText(), document.offsetAt(position), URL_TAG);
      if (!ref) return undefined;

      const project = this.services.getProject();
      const entry = project.urls.byKey(ref.value);
      if (!entry) return undefined;

      const uri = vscode.Uri.file(entry.filePath);
      return new vscode.Location(uri, new vscode.Position(entry.line, 0));
    } catch (err) {
      logError('URL definition resolution failed', err);
      return undefined;
    }
  }
}

export function register(
  _ctx: vscode.ExtensionContext,
  services: AdapterServices,
): vscode.Disposable {
  return vscode.languages.registerDefinitionProvider(
    DTL_AND_PYTHON_SELECTOR,
    new DjangoUrlDefinitionProvider(services),
  );
}
