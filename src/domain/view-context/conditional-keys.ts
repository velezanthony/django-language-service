/**
 * detectConditionalContextKeys — finds context keys that are ONLY assigned
 * inside if/elif/else branches of a view body, so consumers can mark them
 * `ContextVar.conditional` ("not always available").
 *
 * NEW in this architecture — the legacy had NO if-branch detection in the
 * view body: its `conditionalKeys` came exclusively from nested helper→helper
 * chains (see helper-keys.ts). This module adds the missing same-body half.
 *
 * Detected assignment sites (mirrors view-context/context-keys.ts extractContextSurface):
 *   - context['key'] = ...
 *   - context.update({...})   (multi-line dicts supported)
 *
 * A key is NOT conditional when:
 *   - it is also assigned outside any if/elif/else block, or
 *   - one non-nested if-statement WITH an else branch assigns it in EVERY
 *     branch (full coverage). Coverage inside a nested if does not bubble
 *     up — conservative: those keys stay conditional.
 *
 * Known limits (documented, deliberate):
 *   - for/while/try blocks are treated as unconditional scope
 *   - keys in `render(..., {...})` inline dicts are never conditional (an
 *     early-return render targets its own template, out of scope here)
 *   - reads (`if context['k']:`) are not assignments
 *
 * Pure domain: no vscode / fs / path imports.
 */

import { dictBodyOf, extractDictKeys } from '$domain/parsers/_shared/python-tokens';
import { collectLinesUntilBalanced } from './helper-keys';
import { contextVariableNames } from './context-keys';

// ── Patterns ──────────────────────────────────────────────────────────────────

/**
 * The two assignment shapes, for whatever the view calls its context dict.
 *
 * These were anchored to the literal name `context`, so a view using `ctx`,
 * `data` or `payload` — all ordinary — lost 100% of the detection: two views
 * that behave identically produced different diagnostics, and the one with the
 * short name produced none at all. `context-keys.ts` had already learned this
 * and exports `contextVariableNames` for exactly this question.
 *
 * The names come from that reader and are identifiers, but they are filtered to
 * `\w+` before reaching `new RegExp` all the same — the same guard
 * `context-keys.ts` applies at its own construction site.
 */
function assignmentPatterns(rawBodyLines: readonly string[]): {
  bracket: RegExp;
  update: RegExp;
} {
  const names = [...contextVariableNames(rawBodyLines.join('\n'), rawBodyLines)].filter(name =>
    /^\w+$/.test(name),
  );
  const any = names.length > 0 ? names.join('|') : 'context';
  return {
    bracket: new RegExp(`\\b(?:${any})\\s*\\[\\s*['"](\\w+)['"]\\s*\\]\\s*=(?!=)`),
    update: new RegExp(`\\b(?:${any})\\.update\\s*\\(\\s*\\{`),
  };
}
const IF_RE = /^if[\s(]/;
const ELIF_RE = /^elif[\s(]/;
const ELSE_RE = /^else\s*:/;
const BLOCK_HEADER_END_RE = /:\s*$/;

// ── State ─────────────────────────────────────────────────────────────────────

interface Frame {
  readonly indent: number;
  readonly stmtId: number;
  branchIdx: number;
}

interface Stmt {
  branchCount: number;
  hasElse: boolean;
  /** true when the statement itself sits inside another if/elif/else. */
  readonly nested: boolean;
  readonly keyBranches: Map<string, Set<number>>;
}

// ── Detector ──────────────────────────────────────────────────────────────────

/**
 * @param rawBodyLines - view body lines with ORIGINAL indentation
 *                       (RawBlock.rawBodyLines in parsers/views.ts)
 * @returns keys assigned exclusively under uncovered conditional branches
 */
export function detectConditionalContextKeys(rawBodyLines: readonly string[]): Set<string> {
  const { bracket: bracketAssignRe, update: updateDictRe } = assignmentPatterns(rawBodyLines);
  const unconditional = new Set<string>();
  const seenConditional = new Set<string>();
  const stmts = new Map<number, Stmt>();
  const stack: Frame[] = [];
  let nextStmtId = 0;

  for (let i = 0; i < rawBodyLines.length; i++) {
    const line = rawBodyLines[i] ?? '';
    const trimmed = line.trimStart();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = line.length - trimmed.length;
    const isIf = IF_RE.test(trimmed);
    const isElif = ELIF_RE.test(trimmed);
    const isElse = ELSE_RE.test(trimmed);
    const isBlockHeader = BLOCK_HEADER_END_RE.test(trimmed);

    // Close frames we have dedented out of. An elif/else at the exact
    // frame indent continues that statement instead of closing it.
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      if (top.indent < indent) break;
      if (top.indent === indent && (isElif || isElse)) break;
      stack.pop();
    }

    if (isElif || isElse) {
      const top = stack[stack.length - 1];
      if (top && top.indent === indent) {
        top.branchIdx += 1;
        const stmt = stmts.get(top.stmtId)!;
        stmt.branchCount += 1;
        if (isElse) stmt.hasElse = true;
      }
      // Block form: header line carries no assignment. Inline form
      // (`else: context['k'] = v`) falls through to key extraction.
      if (isBlockHeader) continue;
    } else if (isIf) {
      const stmtId = nextStmtId++;
      stmts.set(stmtId, {
        branchCount: 1,
        hasElse: false,
        nested: stack.length > 0,
        keyBranches: new Map(),
      });
      stack.push({ indent, stmtId, branchIdx: 0 });
      // Block form: the condition line itself assigns nothing
      // (`if context['flag']:` is a read). Inline one-liners
      // (`if cond: context['k'] = v`) fall through.
      if (isBlockHeader) continue;
    }

    // ── Assignment-site key extraction ──────────────────────────────────
    const keys: string[] = [];
    const bracketMatch = trimmed.match(bracketAssignRe);
    if (bracketMatch) keys.push(bracketMatch[1]!);
    if (updateDictRe.test(trimmed)) {
      keys.push(
        ...extractDictKeys(dictBodyOf(collectLinesUntilBalanced(rawBodyLines, i, '{', '}'))),
      );
    }
    if (keys.length === 0) continue;

    const top = stack[stack.length - 1];
    if (!top) {
      for (const k of keys) unconditional.add(k);
      continue;
    }
    const stmt = stmts.get(top.stmtId)!;
    for (const k of keys) {
      seenConditional.add(k);
      let branches = stmt.keyBranches.get(k);
      if (!branches) {
        branches = new Set<number>();
        stmt.keyBranches.set(k, branches);
      }
      branches.add(top.branchIdx);
    }
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  const result = new Set<string>();
  for (const key of seenConditional) {
    if (unconditional.has(key)) continue;
    const covered = [...stmts.values()].some(
      s => s.hasElse && !s.nested && s.keyBranches.get(key)?.size === s.branchCount,
    );
    if (!covered) result.add(key);
  }
  return result;
}
