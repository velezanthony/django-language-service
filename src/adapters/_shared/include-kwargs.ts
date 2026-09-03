/**
 * collectIncomingKwargs — the `{% include 'X' with k=v %}` kwargs every
 * parent template passes INTO the active template. Feeds
 * applyIncludeWithKwargs so the partial's diagnostics/completion see the
 * names its includers bind.
 *
 * Matching mirrors the scanner's pass-2 template resolution: include
 * targets are short template refs ('blog/_card.html'), so the active
 * template's relativePath must equal the target or end with '/<target>'.
 *
 * Pure logic — no vscode imports (testable like orphan-logic.ts).
 */
import type { Template } from '$domain/types/template';

export interface IncludeKwarg {
  readonly name: string;
  readonly expr: string;
}

/**
 * Answers per template set, so the walk happens once per scan instead of once
 * per keystroke.
 *
 * Four providers call this — completion, definition, hover and diagnostics —
 * and each call walked every template and every include in the project. On a
 * project with a few thousand templates that is a full sweep between one
 * character and the next, four times over.
 *
 * Keyed on the templates array itself, which `IndexImpl.all()` now keeps
 * stable until the index changes; a new scan produces new indexes, so a stale
 * entry cannot outlive the data it was computed from, and the WeakMap lets the
 * old snapshot be collected with it.
 */
const byTemplateSet = new WeakMap<readonly Template[], Map<string, IncludeKwarg[]>>();

export function collectIncomingKwargs(
  templates: readonly Template[],
  activeFsPath: string,
): IncludeKwarg[] {
  let memo = byTemplateSet.get(templates);
  if (!memo) {
    memo = new Map<string, IncludeKwarg[]>();
    byTemplateSet.set(templates, memo);
  }
  const hit = memo.get(activeFsPath);
  if (hit) return hit;

  const answer = computeIncomingKwargs(templates, activeFsPath);
  memo.set(activeFsPath, answer);
  return answer;
}

function computeIncomingKwargs(
  templates: readonly Template[],
  activeFsPath: string,
): IncludeKwarg[] {
  const active = templates.find(t => t.filePath === activeFsPath);
  if (!active) return [];
  const activeRef = active.relativePath || active.filePath;

  const kwargs: IncludeKwarg[] = [];
  for (const tmpl of templates) {
    if (tmpl === active) continue;
    for (const ref of tmpl.includes) {
      if (ref.kwargs.length === 0) continue;
      if (ref.target.startsWith('__url__:') || ref.target.startsWith('__static__:')) continue;
      if (activeRef === ref.target || activeRef.endsWith(`/${ref.target}`)) {
        kwargs.push(...ref.kwargs);
      }
    }
  }
  return kwargs;
}
