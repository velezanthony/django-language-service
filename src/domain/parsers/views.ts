/**
 * parseViews — pure parser for Django function-based and class-based views.
 * Extracts view name, template references, context keys, decorators, modelRef,
 * and typed contextVars (via the view-context inference engine).
 *
 * contextVars are populated HERE (not in the scanner's pass 2) on purpose:
 * the legacy computed them at scan time only because inference lived apart
 * from the parser; in the new architecture the inference is pure domain, the
 * parser already owns the per-view body slicing, and doing it at parse time
 * keeps the scanner's mtime cache coherent — a cached View is a
 * fully-populated View, no post-processing to re-run on cache hits.
 *
 * Helper calls (`context.update(fn(request))` / `context = fn(request)`) are
 * resolved against helpers defined in the SAME FILE (view-context/helper-keys):
 * the direct helper's dict keys join contextKeys; keys from nested
 * helper→helper hops become contextVars with `conditional: true` (they are
 * NOT added to contextKeys — legacy parity). Helpers the parser cannot see
 * (defined in another module) are NOT dropped: their names are recorded on
 * `pendingHelpers`, and the scanner's pass 2 resolves them across files
 * (infra/scanner.ts `resolveCrossFileViewHelpers`, run on every scan).
 * That split is what keeps the cache-coherence rule above intact — a cached
 * View carries its unresolved list, so a change to a helpers file is picked
 * up by the next pass 2 instead of leaving consumer Views stale.
 *
 * Keys assigned only under if/elif/else in the view body are also flagged
 * `conditional: true` (view-context/conditional-keys) — new in this
 * architecture, the legacy never detected them.
 *
 * No vscode / fs / path imports — purity is rg-verifiable.
 */

import type { View } from '$domain/types/view';
import type { ParseResult, ParserOpts } from '$domain/contracts/parser';
import { inferContextTypes } from '$domain/view-context/context-inference';
import { buildContextVars } from '$domain/view-context/context-vars';
import { detectConditionalContextKeys } from '$domain/view-context/conditional-keys';
import { extractHelperBodies, resolveHelperKeys } from '$domain/view-context/helper-keys';
import { extractContextSurface } from '$domain/view-context/context-keys';
import type { HelperBody } from '$domain/view-context/helper-keys';
import { PY_IDENT } from './_shared/python-tokens';

// ── Regex patterns ────────────────────────────────────────────────────────────

// Every name captured here is a Python identifier, which is Unicode — see
// PY_IDENT. Spelled `\w`, these regexes matched ASCII only, so `def índice`
// never became a block at all: no view, no context vars, no diagnostics.
const FBV_DEF_RE = new RegExp(String.raw`^def\s+(${PY_IDENT})\s*\(`, 'u');
const CBV_DEF_RE = new RegExp(String.raw`^class\s+(${PY_IDENT})\s*\(([^)]*)\)\s*:`, 'u');
const DECORATOR_RE = new RegExp(String.raw`^@(${PY_IDENT})(?:\(|$)`, 'u');
const METHOD_DECORATOR_RE = new RegExp(
  String.raw`@method_decorator\s*\(\s*(${PY_IDENT})\s*\(`,
  'u',
);

const TEMPLATE_NAME_ASSIGN_RE = /^\s*_?template_name\s*=\s*['"]([^'"]+)['"]/;
const RENDER_INLINE_TEMPLATE_RE = new RegExp(
  String.raw`render\s*\(\s*${PY_IDENT}\s*,\s*['"]([^'"]+)['"]`,
  'u',
);

// RENDER_INLINE_DICT_RE — used inline below via joined string search
const MODEL_ASSIGN_RE = new RegExp(String.raw`^\s*model\s*=\s*(${PY_IDENT})\s*$`, 'u');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawBlock {
  decoratorLines: string[];
  defLine: string;
  defLineNum: number;
  bodyLines: string[];
  bodyLineNums: number[];
  /** Body lines with ORIGINAL indentation — the context-type inference
   *  needs indentation to walk method bodies (get_queryset overrides). */
  rawBodyLines: string[];
}

// ── Block splitter ────────────────────────────────────────────────────────────

function splitIntoBlocks(lines: string[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let decorators: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();

    if (trimmed.startsWith('@')) {
      decorators.push(trimmed);
      i++;
      continue;
    }

    const fbvMatch = trimmed.match(FBV_DEF_RE);
    const cbvMatch = trimmed.match(CBV_DEF_RE);

    if (fbvMatch || cbvMatch) {
      const defLine = trimmed;
      const defLineNum = i + 1; // 1-based
      const defIndent = line.length - trimmed.length;
      const bodyLines: string[] = [];
      const bodyLineNums: number[] = [];
      const rawBodyLines: string[] = [];
      i++;

      while (i < lines.length) {
        const bodyLine = lines[i] ?? '';
        const bodyTrimmed = bodyLine.trimStart();
        const bodyIndent = bodyLine.length - bodyTrimmed.length;

        if (bodyTrimmed === '' || bodyTrimmed.startsWith('#')) {
          bodyLines.push(bodyTrimmed);
          bodyLineNums.push(i + 1);
          rawBodyLines.push(bodyLine);
          i++;
          continue;
        }

        if (bodyIndent > defIndent) {
          bodyLines.push(bodyTrimmed);
          bodyLineNums.push(i + 1);
          rawBodyLines.push(bodyLine);
          i++;
        } else {
          break;
        }
      }

      blocks.push({
        decoratorLines: decorators,
        defLine,
        defLineNum,
        bodyLines,
        bodyLineNums,
        rawBodyLines,
      });
      decorators = [];
    } else {
      // Reset decorators only on substantive non-import lines
      if (
        trimmed !== '' &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('from ') &&
        !trimmed.startsWith('import ')
      ) {
        decorators = [];
      }
      i++;
    }
  }

  return blocks;
}

// ── Decorator extraction ──────────────────────────────────────────────────────

function extractDecorators(decoratorLines: string[]): string[] {
  const decorators: string[] = [];
  for (const line of decoratorLines) {
    const methodDecMatch = line.match(METHOD_DECORATOR_RE);
    if (methodDecMatch) {
      decorators.push(methodDecMatch[1]!);
      continue;
    }
    const decMatch = line.match(DECORATOR_RE);
    if (decMatch) {
      decorators.push(decMatch[1]!);
    }
  }
  return decorators;
}

// ── Context surface (keys + typed vars) ───────────────────────────────────────

interface ContextSurface {
  readonly contextKeys: string[];
  readonly contextVars: View['contextVars'];
  /** Helper calls no function in THIS file defines — the scanner follows
   *  the imports and resolves them in pass 2. */
  readonly pendingHelpers: string[];
  /** Injection this reader could not follow — see View.contextIncomplete. */
  readonly contextIncomplete: boolean;
}

/**
 * Merge the three context-key sources into the View's surface:
 *   1. body assignments (view-context/context-keys.ts extractContextSurface)
 *   2. same-file helper resolution — direct keys join contextKeys;
 *      nested-hop keys become conditional contextVars only
 *   3. if/elif/else detection — body keys assigned only conditionally
 *      keep their contextKeys slot but are flagged on the contextVar
 */
function buildContextSurface(
  block: RawBlock,
  helperBodies: ReadonlyMap<string, HelperBody>,
): ContextSurface {
  const surface = extractContextSurface(block.bodyLines);
  const bodyKeys = surface.keys;
  const resolved = resolveHelperKeys(surface.helperCalls, helperBodies);
  const pendingHelpers = surface.helperCalls.filter(name => !helperBodies.has(name));
  const conditionalBodyKeys = detectConditionalContextKeys(block.rawBodyLines);

  const contextKeys = [...new Set([...bodyKeys, ...resolved.direct])];

  // Unconditional = body keys outside if-branches + direct helper keys.
  const unconditional = new Set<string>(resolved.direct);
  for (const k of bodyKeys) {
    if (!conditionalBodyKeys.has(k)) unconditional.add(k);
  }
  const conditionalKeys = new Set<string>();
  for (const k of conditionalBodyKeys) {
    if (!unconditional.has(k)) conditionalKeys.add(k);
  }
  for (const k of resolved.conditional) {
    if (!unconditional.has(k)) conditionalKeys.add(k);
  }

  // Types: the view's own inference wins; helper-chain types fill gaps.
  const viewSource = [block.defLine, ...block.rawBodyLines].join('\n');
  const inferred = inferContextTypes(viewSource);
  for (const [k, t] of resolved.types) {
    if (!inferred.has(k)) inferred.set(k, t);
  }

  return {
    contextKeys,
    contextVars: buildContextVars(contextKeys, inferred, conditionalKeys),
    pendingHelpers,
    contextIncomplete: surface.unresolved,
  };
}

// ── FBV parser ────────────────────────────────────────────────────────────────

function parseFBV(
  block: RawBlock,
  name: string,
  filePath: string,
  helperBodies: ReadonlyMap<string, HelperBody>,
): View {
  const decorators = extractDecorators(block.decoratorLines);
  let templateName: string | null = null;

  for (const line of block.bodyLines) {
    if (!templateName) {
      const tmplMatch = line.match(TEMPLATE_NAME_ASSIGN_RE);
      if (tmplMatch) {
        templateName = tmplMatch[1] ?? null;
        continue;
      }
    }
    if (!templateName) {
      const renderMatch = line.match(RENDER_INLINE_TEMPLATE_RE);
      if (renderMatch) {
        templateName = renderMatch[1] ?? null;
      }
    }
  }

  const { contextKeys, contextVars, pendingHelpers, contextIncomplete } = buildContextSurface(
    block,
    helperBodies,
  );

  return {
    kind: 'view',
    name,
    filePath,
    line: block.defLineNum,
    isClass: false,
    templateName,
    contextKeys,
    contextVars,
    ...(pendingHelpers.length > 0 && { pendingHelpers }),
    ...(contextIncomplete && { contextIncomplete: true }),
    decorators,
  };
}

// ── CBV parser ────────────────────────────────────────────────────────────────

function parseCBV(
  block: RawBlock,
  name: string,
  filePath: string,
  helperBodies: ReadonlyMap<string, HelperBody>,
  bases: readonly string[],
): View {
  const decorators = extractDecorators(block.decoratorLines);
  let templateName: string | null = null;
  let modelRef: string | undefined;

  for (const line of block.bodyLines) {
    if (!templateName) {
      const tmplMatch = line.match(TEMPLATE_NAME_ASSIGN_RE);
      if (tmplMatch) {
        templateName = tmplMatch[1] ?? null;
        continue;
      }
    }
    const modelMatch = line.match(MODEL_ASSIGN_RE);
    if (modelMatch) {
      modelRef = modelMatch[1]!;
      continue;
    }
  }

  const { contextKeys, contextVars, pendingHelpers, contextIncomplete } = buildContextSurface(
    block,
    helperBodies,
  );

  const view: View = {
    kind: 'view',
    name,
    filePath,
    line: block.defLineNum,
    isClass: true,
    templateName,
    // Kept so pass 2 can follow a mixin into the file that defines it.
    ...(bases.length > 0 && { bases }),
    contextKeys,
    contextVars,
    ...(pendingHelpers.length > 0 && { pendingHelpers }),
    ...(contextIncomplete && { contextIncomplete: true }),
    decorators,
  };

  return modelRef !== undefined ? { ...view, modelRef } : view;
}

// ── Block router ──────────────────────────────────────────────────────────────

function parseBlock(
  block: RawBlock,
  filePath: string,
  helperBodies: ReadonlyMap<string, HelperBody>,
): View | null {
  const cbvMatch = block.defLine.match(CBV_DEF_RE);
  if (cbvMatch) {
    const bases = cbvMatch[2]!
      .split(',')
      .map(b => b.trim())
      .filter(Boolean);
    return parseCBV(block, cbvMatch[1]!, filePath, helperBodies, bases);
  }

  const fbvMatch = block.defLine.match(FBV_DEF_RE);
  if (fbvMatch) return parseFBV(block, fbvMatch[1]!, filePath, helperBodies);

  return null;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse Django views (FBV + CBV) from a Python source string.
 *
 * @param source  - Raw Python file content
 * @param opts    - Optional parser options (filePath, onWarn)
 * @returns ParseResult<View[]> — always ok:true; partial results on malformed input
 */
export function parseViews(source: string, opts?: ParserOpts): ParseResult<View[]> {
  if (!source.trim()) return { ok: true, value: [] };

  const filePath = opts?.filePath ?? '';
  const lines = source.split('\n');
  const blocks = splitIntoBlocks(lines);

  // Same-file helper bodies, extracted once per file — every view block
  // resolves its helper calls against this map.
  const helperBodies = extractHelperBodies(source);

  const views: View[] = [];
  for (const block of blocks) {
    const view = parseBlock(block, filePath, helperBodies);
    if (view) views.push(view);
  }

  return { ok: true, value: views };
}
