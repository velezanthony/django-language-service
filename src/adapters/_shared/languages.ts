/** The language ids this extension serves. Import from here, never a literal. */
export const DTL_LANGUAGE_IDS = ['html', 'django-html', 'django-txt'] as const;

export type DtlLanguageId = (typeof DTL_LANGUAGE_IDS)[number];

/** Membership test for `document.languageId` gates. */
export const DTL_LANGUAGES: ReadonlySet<string> = new Set(DTL_LANGUAGE_IDS);

/** Templates only. NO `scheme` filter: it would exclude `untitled:` buffers. */
export const DTL_SELECTOR: readonly { readonly language: string }[] = DTL_LANGUAGE_IDS.map(
  language => ({ language }),
);

/** The Python half. `scheme: 'file'` belongs here and only here. */
export const PYTHON_FILE_SELECTOR = { language: 'python', scheme: 'file' } as const;

/** Templates plus Python source files. */
export const DTL_AND_PYTHON_SELECTOR: readonly {
  readonly language: string;
  readonly scheme?: string;
}[] = [...DTL_SELECTOR, PYTHON_FILE_SELECTOR];

/** The subset that can hold `<script>`/`<style>`. `django-txt` is absent by
 *  design: plain text has no HTML elements. */
export const HTML_ONLY_LANGUAGES: ReadonlySet<string> = new Set(['html', 'django-html']);
