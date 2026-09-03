/** Django field choice definition.
 *  @inventory DGM-023
 */
export interface Choice {
  readonly value: string;
  readonly label?: string;
}

/**
 * A field's `choices=`, carrying HOW it was obtained.
 *
 * The provenance is the point: `unresolved` keeps the symbol name so the
 * scanner's cross-file pass can finish the job later, and so the UI can say
 * which symbol it failed on instead of showing an empty list.
 */
export type FieldChoices =
  | { readonly kind: 'inline'; readonly values: readonly Choice[] }
  | {
      readonly kind: 'resolved';
      readonly symbolName: string;
      readonly values: readonly Choice[];
      readonly sourceModule?: string;
    }
  | { readonly kind: 'unresolved'; readonly symbolName: string };

/** Values a `FieldChoices` carries, or [] when the reference never resolved. */
export function choiceValues(choices: FieldChoices | undefined): readonly Choice[] {
  if (!choices) return [];
  return choices.kind === 'unresolved' ? [] : choices.values;
}
