/**
 * The locator three providers now share, under attack.
 *
 * `hover/url-names`, `hover/template-paths` and `definition/url-names` all ask
 * this one function WHERE the reference under the cursor is. Every sibling in
 * `_shared/` had a test; this did not, and it is the only one with dependents.
 *
 * Written to break it, not to confirm it.
 */
import { describe, it, expect } from 'vitest';
import { firstStringArgAt } from './tag-string-arg';

const URL = new Set(['url']);
const INCLUDE = new Set(['include', 'extends']);

/** Offset just inside whatever follows `marker`. */
const at = (src: string, marker: string) => src.indexOf(marker) + marker.length;

describe('what it must get right', () => {
  it('reads the name and its exact span', () => {
    const src = `<a href="{% url 'detail' %}">`;
    const got = firstStringArgAt(src, at(src, "'det"), URL);
    expect(got?.value).toBe('detail');
    expect(src.slice(got!.start, got!.end)).toBe('detail');
  });

  it('reads a tag the author wrapped across lines', () => {
    const src = `{% url\n   'detail'\n   pk=1 %}`;
    expect(firstStringArgAt(src, at(src, "'det"), URL)?.value).toBe('detail');
  });

  it('takes the second of two tags on a line, not the first', () => {
    const src = `{% url 'a' %} {% url 'b' %}`;
    expect(firstStringArgAt(src, at(src, "'b"), URL)?.value).toBe('b');
  });

  it('tells apart two tags carrying the SAME name', () => {
    const src = `{% url 'same' %}{% url 'same' %}`;
    const second = firstStringArgAt(src, src.lastIndexOf('same') + 1, URL);
    expect(second?.start).toBe(src.lastIndexOf('same'));
  });

  it('ignores a tag Django never evaluates', () => {
    const src = `{# {% url 'home' %} #}`;
    expect(firstStringArgAt(src, at(src, "'ho"), URL)).toBeNull();
  });

  it('ignores a tag inside {% comment %}', () => {
    const src = `{% comment %}{% url 'home' %}{% endcomment %}`;
    expect(firstStringArgAt(src, at(src, "'ho"), URL)).toBeNull();
  });

  it('says nothing for a different tag', () => {
    const src = `{% static 'css/app.css' %}`;
    expect(firstStringArgAt(src, at(src, "'css"), URL)).toBeNull();
  });

  it('says nothing when the cursor is on the tag keyword', () => {
    const src = `{% url 'detail' %}`;
    expect(firstStringArgAt(src, at(src, '{% u'), URL)).toBeNull();
  });

  it('keeps a namespaced name whole', () => {
    const src = `{% url 'shop:detail' pk=item.pk %}`;
    expect(firstStringArgAt(src, at(src, "'shop"), URL)?.value).toBe('shop:detail');
  });
});

describe('the awkward strings', () => {
  it('reads a path holding an apostrophe, quoted with double quotes', () => {
    // Django's own tokenizer takes `"user's.html"` as one string: the delimiter
    // is the OUTER quote and the inner one is ordinary text.
    const src = `{% include "user's-profile.html" %}`;
    expect(firstStringArgAt(src, at(src, "user'"), INCLUDE)?.value).toBe("user's-profile.html");
  });

  it('reads a name holding a double quote, quoted with single quotes', () => {
    const src = `{% url 'say-"hi"' %}`;
    expect(firstStringArgAt(src, at(src, 'say'), URL)?.value).toBe('say-"hi"');
  });

  it('does not offer an empty string as a reference', () => {
    // `byKey('')` misses, so the caller is unharmed — but reporting a hit for
    // a name nobody wrote invites a Range over nothing.
    const src = `{% url '' %}`;
    expect(firstStringArgAt(src, at(src, "''") - 1, URL)).toBeNull();
  });

  it('says nothing for a tag with no quoted argument at all', () => {
    const src = `{% url my_view_name %}`;
    expect(firstStringArgAt(src, at(src, 'my_'), URL)).toBeNull();
  });
});

describe('the edges of the span', () => {
  const src = `{% url 'detail' %}`;
  const start = src.indexOf('detail');
  const end = start + 'detail'.length;

  it('accepts the cursor resting against the opening quote', () => {
    expect(firstStringArgAt(src, start, URL)?.value).toBe('detail');
  });

  it('accepts the cursor resting against the closing quote', () => {
    expect(firstStringArgAt(src, end, URL)?.value).toBe('detail');
  });

  it('rejects the cursor one before the opening quote', () => {
    expect(firstStringArgAt(src, start - 2, URL)).toBeNull();
  });

  it('rejects the cursor one past the closing quote', () => {
    expect(firstStringArgAt(src, end + 2, URL)).toBeNull();
  });

  it('rejects an offset past the end of the source', () => {
    expect(firstStringArgAt(src, src.length + 50, URL)).toBeNull();
  });

  it('rejects a negative offset rather than throwing', () => {
    expect(firstStringArgAt(src, -1, URL)).toBeNull();
  });
});
