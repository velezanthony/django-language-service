import type { RelationKind } from './relations';

export type { RelationKind };

/**
 * Discriminated union describing a Django field's `choices=` argument.
 * Mirrors OLD core/view-context/model-parser.ts `FieldChoices` — kept local
 * so the webview bundle stays decoupled from the extension-host domain layer.
 */
// Wire copy of $domain/types/choice. Kept separate on purpose (the bundle stays
// off the extension-host layer); domain/diagram/choices-contract.test.ts is what
// stops the two drifting.
export type FieldChoices =
  | { kind: 'inline'; values: FieldChoice[] }
  | { kind: 'unresolved'; symbolName: string }
  | { kind: 'resolved'; symbolName: string; values: FieldChoice[]; sourceModule?: string };

export interface FieldChoice {
  value: string;
  label?: string;
}

/** Wire copy of $domain/types/model — a @property with its source. */
export interface PropertyDef {
  name: string;
  source: string;
}

export interface FieldLine {
  name: string;
  type: string;
  /** Canonical kwarg tokens — joined for display, compared token-by-token. */
  attrs: readonly string[];
  doc: string;
  choices?: FieldChoices;
  /** Base class the field comes from, when inherited. */
  inheritedFrom?: string;
}

export interface RelationLine {
  name: string;
  type: RelationKind;
  target: string;
}

export interface IncomingRef {
  from: string;
  fieldName: string;
  type: RelationKind;
}

export interface TooltipData {
  name: string;
  appLabel?: string;
  dbTable: string;
  verboseName?: string;
  tableComment?: string;
  fieldCount: number;
  fields: FieldLine[];
  relations: RelationLine[];
  referencedBy: IncomingRef[];
  properties: PropertyDef[];
}
