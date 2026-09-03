/**
 * Safe JSON embedding inside an HTML `<script>` tag. Plain JSON.stringify can be
 * weaponised when a string value contains `</script>` — the HTML parser sees that
 * as the end of the script element and breaks out. Same idea for `<!--`. Escape
 * those to their JS-string equivalents, plus the U+2028/U+2029 separators that
 * are valid JSON but illegal in pre-ES2019 JS string literals.
 */
export function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
