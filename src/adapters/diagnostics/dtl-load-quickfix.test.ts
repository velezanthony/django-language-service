/**
 * The quickfix reads the library name back out of its own diagnostic message.
 *
 * The domain already hands the adapter `requiredLibrary` as a field; the
 * adapter drops it, builds `Filter 'x' requires {% load y %}` and then greps
 * `y` out of that string with `(\w+)`. So a library the message spells fine —
 * `índice_tags`, an ordinary Python module under `templatetags/` — matched
 * nothing, and the lightbulb simply never appeared. No error, no log: the fix
 * for a warning the extension itself raised was just absent.
 *
 * The coupling is the real finding and it is recorded in the module. This
 * closes the reachable half.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('$adapters/_shared/__fixtures__/vscode-double.js'));

import { missingLibFromMessage } from './dtl-load-quickfix';

describe('the library a missing-load diagnostic asks for', () => {
  it.each(['shop_tags', 'índice_tags', 'ação_tags', '記事_tags'])('is read from %s', lib => {
    expect(missingLibFromMessage(`Filter 'x' requires {% load ${lib} %}`)).toBe(lib);
  });

  it('is read from the tag wording too', () => {
    expect(missingLibFromMessage(`Tag 'card' requires {% load índice_tags %}`)).toBe('índice_tags');
  });

  it('is null for a message that names no load', () => {
    expect(missingLibFromMessage('Something else entirely')).toBeNull();
  });
});
