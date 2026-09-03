import type { FieldChoices } from './choice';

/** Django model field definition.
 *  @inventory DGM-001, DGM-021, CTX-006, CTX-011
 */
export type OnDeleteAction =
  'CASCADE' | 'PROTECT' | 'SET_NULL' | 'SET_DEFAULT' | 'DO_NOTHING' | 'RESTRICT';

/** Kwargs that make up a field's signature. Parsed by one shared reader
 *  (parsers/_shared/field-attrs) from both models.py and migration files, so a
 *  snapshot field and the live field it describes stay comparable. */
export interface FieldAttrs {
  readonly maxLength?: number;
  readonly maxDigits?: number;
  readonly decimalPlaces?: number;
  readonly isNull?: boolean;
  readonly isBlank?: boolean;
  readonly isUnique?: boolean;
  readonly isPrimaryKey?: boolean;
  readonly isDbIndex?: boolean;
  readonly autoNow?: boolean;
  readonly autoNowAdd?: boolean;
  readonly defaultValue?: string;
}

export interface Field extends FieldAttrs {
  readonly name: string;
  readonly fieldType: string;
  readonly docComment?: string;
  readonly isGenericFk?: boolean;
  readonly choices?: FieldChoices;
  /** Set when the field comes from a base class rather than this model's body. */
  readonly inheritedFrom?: string;
}
