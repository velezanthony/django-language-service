/**
 * Barrel index for domain parsers.
 * Re-exports all 8 pure parser functions and ParserOpts contract type.
 * Named exports only — no default exports (spec FILE-BUDGET scenario #9).
 */

export { parseModels } from './models';
export { parseViews } from './views';
export { parseForms } from './forms';
export { parseMigrations } from './migrations';
export { parseHelpers } from './helpers';
export { parseTemplate } from './template';
export { parseTemplateVariables } from './template-variables';
export { parseUrls } from './urls';
export type { ParserOpts } from '$domain/contracts/parser';
