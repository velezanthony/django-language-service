import { describe, it, expect } from 'vitest';
import { parseTemplateVariables } from './template-variables';

describe('parseTemplateVariables', () => {
  it('happy path — dotted chain extraction (spec PARSETEMPLATEVAR)', () => {
    const source = `
<h1>{{ product.name }}</h1>
<p>{{ product.category.name }}</p>
<span>{{ product.price }}</span>
`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const vars = result.value;
    expect(vars.length).toBeGreaterThanOrEqual(3);

    // product.name → name='product', chain=['name']
    const productName = vars.find(v => v.name === 'product' && v.chain.join('.') === 'name');
    expect(productName).toBeDefined();
    expect(productName?.kind).toBe('template-var');
    expect(productName?.chain).toEqual(['name']);
    expect(productName?.line).toBe(2); // line 2 in source (1-based, skipping blank first line)

    // product.category.name → name='product', chain=['category','name']
    const catName = vars.find(v => v.name === 'product' && v.chain.join('.') === 'category.name');
    expect(catName).toBeDefined();
    expect(catName?.chain).toEqual(['category', 'name']);
  });

  it('extracts variables from for-loop iterable', () => {
    const source = `{% for item in order.items.all %}{{ item.name }}{% endfor %}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orderVar = result.value.find(v => v.name === 'order');
    expect(orderVar).toBeDefined();
    expect(orderVar?.chain).toEqual(['items', 'all']);
  });

  it('extracts variables from if-tag expressions', () => {
    const source = `{% if user.is_authenticated and not user.is_banned %}OK{% endif %}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const authVar = result.value.find(v => v.name === 'user' && v.chain[0] === 'is_authenticated');
    expect(authVar).toBeDefined();
  });

  it('strips filters — only variable part captured', () => {
    const source = `{{ product.name|capfirst|upper }}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBe(1);
    expect(result.value[0]!.name).toBe('product');
    expect(result.value[0]!.chain).toEqual(['name']);
  });

  it('comments are stripped — variables inside {# #} ignored', () => {
    const source = `{# {{ secret_var }} #}\n{{ visible }}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.find(v => v.name === 'secret_var')).toBeUndefined();
    expect(result.value.find(v => v.name === 'visible')).toBeDefined();
  });

  it('skips string literals inside {{ }}', () => {
    const source = `{{ "hello" }} {{ 42 }} {{ True }}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('empty input → empty array', () => {
    const result = parseTemplateVariables('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('malformed/raw HTML with no DTL → empty array', () => {
    const source = `<div><p>No Django here</p></div>`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('line numbers are 1-based', () => {
    const source = `line1\nline2\n{{ myvar }}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const myvar = result.value.find(v => v.name === 'myvar');
    expect(myvar?.line).toBe(3);
  });

  // Was: the position of the opening {{. Consumers draw a squiggle from this
  // column, and pointing at the tag made two references on one line
  // indistinguishable — both ended up marked on the first one.
  it('col is the 1-based position of the VARIABLE, not of the {{', () => {
    const source = `    {{ myvar }}`;
    const result = parseTemplateVariables(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const myvar = result.value.find(v => v.name === 'myvar');
    // 4 spaces, then '{{', then a space → the name starts at col 8.
    expect(myvar?.col).toBe(8);
  });

  it('gives two references on one line their own columns', () => {
    const result = parseTemplateVariables(`{{ a }} and {{ a }}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map(v => v.col)).toEqual([4, 16]);
  });

  it('aims at the variable inside a block tag too', () => {
    const result = parseTemplateVariables(`{% if ready %}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.find(v => v.name === 'ready')?.col).toBe(7);
  });
});
