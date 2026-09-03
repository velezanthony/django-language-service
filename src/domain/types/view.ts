import type { ContextVar } from './context-var';

/** Django view metadata (FBV or CBV).
 *  @inventory CTX-001, CTX-007, INS-018, PRV-018, PRV-019, PRV-020
 */
export interface View {
  readonly kind: 'view';
  readonly name: string;
  readonly filePath: string;
  /** Resolved by the scanner: deriving it needs the workspace roots, which
   *  only the scanner has. Absent on views built outside a scan. */
  readonly appLabel?: string;
  readonly line: number;
  readonly isClass: boolean; // true = CBV, false = FBV
  readonly templateName: string | null;
  readonly contextKeys: readonly string[];
  readonly contextVars: readonly ContextVar[];
  readonly decorators: readonly string[];
  readonly modelRef?: string; // "app.Model"
  /** Helpers called but not defined in this file; the parser cannot follow
   *  imports, so the scanner resolves them in pass 2. */
  readonly pendingHelpers?: readonly string[];
  /** Base classes of a CBV, exactly as written — the scanner follows them to
   *  pick up context keys a mixin's own get_context_data adds. */
  readonly bases?: readonly string[];
  /**
   * The context surface is known to be incomplete: the view injects keys in a
   * way the reader could not follow, or a helper/mixin it uses was never
   * found. Consumers must soften "not defined in the view context" to a note —
   * the missing key is this tool's gap, not the user's mistake.
   */
  readonly contextIncomplete?: boolean;
}
