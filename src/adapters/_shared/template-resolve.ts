/**
 * Turning a written template path into a file on disk, once.
 *
 * Four adapters had their own copy of this, each issuing up to five
 * workspace-wide `findFiles` calls in series with no cache — and the
 * document-link provider re-runs on every document change, once per
 * `{% include %}`.
 */

import * as vscode from 'vscode';
import { templateSearchGlobs } from '$domain/parsers/_shared/template-search';

const TTL_MS = 30_000;

interface Hit {
  /** undefined is a real answer: "searched, found nothing". Cached too. */
  readonly uri: vscode.Uri | undefined;
  readonly expiresAt: number;
}

const cache = new Map<string, Hit>();

/**
 * Bumped by every clear, captured by every lookup before it starts.
 *
 * `cache.clear()` alone cannot invalidate a lookup already in flight: five
 * awaits sit between reading the cache and writing to it, and a result
 * computed before a clear must never be stored after it.
 *
 * A counter rather than an abort, because the in-flight answer is still worth
 * RETURNING to the caller who asked for it — a hover that was already resolving
 * should not come back empty. It just must not be remembered.
 */
let generation = 0;

/** Drop every entry, including results still being computed. */
export function clearTemplateResolveCache(): void {
  cache.clear();
  generation++;
}

/** The first file matching `templatePath`, or undefined if there is none. */
export async function resolveTemplatePath(templatePath: string): Promise<vscode.Uri | undefined> {
  const now = Date.now();
  const hit = cache.get(templatePath);
  if (hit && hit.expiresAt > now) return hit.uri;

  const startedAt = generation;

  let found: vscode.Uri | undefined;
  for (const pattern of templateSearchGlobs(templatePath)) {
    const matches = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
    if (matches.length > 0) {
      found = matches[0];
      break;
    }
  }

  // Only if no clear happened while this was searching. The answer below was
  // computed against a project state somebody has since declared stale.
  if (generation === startedAt) cache.set(templatePath, { uri: found, expiresAt: now + TTL_MS });
  return found;
}
