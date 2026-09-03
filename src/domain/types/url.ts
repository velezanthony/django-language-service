/** Django URL pattern entry.
 *  @inventory INS-006, INS-007, INS-008
 */
/** A template a URL renders directly, with no view function of its own. */
export interface InlineTemplate {
  readonly templateName: string;
  /** Keys from `extra_context={…}`, if any. */
  readonly contextKeys: readonly string[];
}

export interface Url {
  readonly kind: 'url';
  readonly name: string; // "app:home"
  readonly pattern: string;
  readonly viewName: string;
  readonly filePath: string;
  readonly line: number;
  /** Set when the URL conf renders a template itself — a generic view used
   *  inline, such as `TemplateView.as_view(template_name='about.html')`. */
  readonly inlineTemplate?: InlineTemplate;
}
