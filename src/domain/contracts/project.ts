import type { View, Model, Form, Migration, Template, Url, Helper } from '$domain/types';
import type { Index } from './index-type';

/** Immutable snapshot of the workspace, produced by `$infra/scanner`.
 *
 * Every field is an `Index<T, string>`. Keys are `"app.Name"` — see
 * `$infra/view-key` — except two:
 *   templates  → `relativePath`, an ABSOLUTE path for anything the scanner
 *                produced, so lookups suffix-match
 *   urls       → "app:url_name", or bare "url_name" when the urls.py
 *                declares no app_name (see domain/parsers/urls.ts)
 *   helpers    → "library.name"
 *
 */
export interface Project {
  readonly views: Index<View, string>;
  readonly models: Index<Model, string>;
  readonly forms: Index<Form, string>;
  readonly migrations: Index<Migration, string>;
  readonly templates: Index<Template, string>;
  readonly urls: Index<Url, string>;
  readonly helpers: Index<Helper, string>;
  readonly workspaceFingerprint: string;
  readonly scannedAt: number;
}
