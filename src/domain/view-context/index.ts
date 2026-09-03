/**
 * view-context — pure Django context-variable engine (Live Mode data layer).
 *
 * Consumption pattern for adapters (Fase-6 part 2):
 *
 *   1. Once per Project snapshot:  graph = createModelGraph(project.models.all())
 *   2. Per view:                   view.contextVars is ALREADY populated by
 *                                  parseViews; convert entries you need via
 *                                  contextVarToResolvedType(v)
 *   3. Per template request:       iters = buildIteratorTypes(src, ctxTypes, graph)
 *                                  applyIncludeWithKwargs(kwargs, ctxTypes, iters, graph)
 *   4. Per dotted expression:      resolveChain(parts, rootType, graph)
 *
 * Named exports only — no default exports.
 */

export type { ResolvedKind, ResolvedType, ReverseRelation, ChainError, ChainResult } from './types';
export { hasAnnotation } from './types';

export { createModelGraph } from './model-graph';
export type { ModelGraph } from './model-graph';

export { resolveChain, MANAGER_ATTRS } from './chain-resolver';

export { inferContextTypes } from './context-inference';

export { buildContextVars, contextVarToResolvedType } from './context-vars';

export { detectConditionalContextKeys } from './conditional-keys';

export { extractHelperBodies, resolveHelperKeys } from './helper-keys';
export type { HelperBody, ResolvedHelperKeys } from './helper-keys';

export {
  buildIteratorTypes,
  applyIncludeWithKwargs,
  collectTemplateLocalNames,
  findLocalOrigin,
} from './template-scope';
export type { LocalOrigin } from './template-scope';

export { diagnoseTemplate, DTL_BUILTIN_VARS } from './diagnose';
export type { ContextDiagnostic, ContextDiagnosticCode, DiagnoseTemplateOptions } from './diagnose';

export {
  buildRootEntries,
  buildChainEntries,
  matchFormVar,
  buildFormFieldEntries,
} from './completion-entries';
export type { CompletionEntry, CompletionEntryKind } from './completion-entries';

export { describeChainSegment } from './describe-chain';
export type { ChainSegmentInfo } from './describe-chain';

export { findSimilar, levenshtein } from './find-similar';
