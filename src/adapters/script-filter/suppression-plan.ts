/**
 * DTL-020a — whether to turn VS Code's built-in HTML script/style validation
 * off, and for which keys. Pure and vscode-free, because it is a side effect on
 * the user's settings.json.
 *
 * Writes nothing without a workspace, without the opt-in, or without Django
 * artifacts: `activationEvents` wakes this extension in any repo holding a
 * stray `.py`, and an open folder was never evidence the folder is ours.
 * A key already set to false is left alone.
 */

export type SuppressionKey = 'scripts' | 'styles';

export interface SuppressionInput {
  readonly enabled: boolean;
  readonly hasWorkspace: boolean;
  /** Models, views or urls — a `templates/` alone is Flask and Jinja too. */
  readonly isDjangoProject: boolean;
  /** Current `html.validate.scripts`, or undefined when unset. */
  readonly scripts: boolean | undefined;
  /** Current `html.validate.styles`, or undefined when unset. */
  readonly styles: boolean | undefined;
}

/** The `html.validate.*` keys that still need to be set to false. */
export function suppressionPlan(input: SuppressionInput): SuppressionKey[] {
  if (!input.enabled || !input.hasWorkspace || !input.isDjangoProject) return [];

  const plan: SuppressionKey[] = [];
  if (input.scripts !== false) plan.push('scripts');
  if (input.styles !== false) plan.push('styles');
  return plan;
}
