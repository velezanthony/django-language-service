/** A field declared directly on a Form class (`name = forms.CharField(...)`).
 *  @inventory INS-013
 */
export interface FormField {
  readonly name: string;
  readonly fieldType: string;
}

/** Django form or modelform.
 *  @inventory INS-013
 */
export interface Form {
  readonly kind: 'form';
  readonly name: string;
  readonly filePath: string;
  readonly line: number;
  readonly modelRef?: string; // "app.Model" if ModelForm
  /** Fields declared directly on the class body. */
  readonly fields: readonly FormField[];
  /** `Meta.fields` list for ModelForms — `['__all__']` for the shortcut. */
  readonly metaFields?: readonly string[];
}
