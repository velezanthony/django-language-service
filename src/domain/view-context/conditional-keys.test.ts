import { describe, it, expect } from 'vitest';
import { detectConditionalContextKeys } from './conditional-keys';

/** Build raw body lines (original indentation preserved) from a snippet.
 *  The snippet is written as the BODY of a def whose body sits at indent 4. */
const body = (src: string): string[] => src.split('\n').slice(1, -1);

describe('detectConditionalContextKeys — if-branch detection', () => {
  it('key assigned only under if → conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    context = {}
    if request.user.is_staff:
        context['is_admin'] = True
    return render(request, 't.html', context)
`),
    );
    expect(keys).toEqual(new Set(['is_admin']));
  });

  it('same key assigned in BOTH if and else branches → NOT conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    context = {}
    if request.user.is_staff:
        context['banner'] = 'admin'
    else:
        context['banner'] = 'guest'
    return render(request, 't.html', context)
`),
    );
    expect(keys).toEqual(new Set());
  });

  it('different keys in if vs else → both conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    context = {}
    if request.user.is_staff:
        context['is_admin'] = True
    else:
        context['is_guest'] = True
`),
    );
    expect(keys).toEqual(new Set(['is_admin', 'is_guest']));
  });

  it('if/elif/else all assigning the same key → NOT conditional (covered)', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if a:
        context['mode'] = 'a'
    elif b:
        context['mode'] = 'b'
    else:
        context['mode'] = 'c'
`),
    );
    expect(keys).toEqual(new Set());
  });

  it('if/elif WITHOUT else, same key in all branches → still conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if a:
        context['mode'] = 'a'
    elif b:
        context['mode'] = 'b'
`),
    );
    expect(keys).toEqual(new Set(['mode']));
  });

  it('key assigned under if AND unconditionally → NOT conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    context['total'] = 0
    if cart:
        context['total'] = cart.total
`),
    );
    expect(keys).toEqual(new Set());
  });

  it('key assigned only in an else branch → conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if a:
        pass
    else:
        context['fallback'] = True
`),
    );
    expect(keys).toEqual(new Set(['fallback']));
  });

  it('context.update({...}) multi-line dict under if → all keys conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if request.user.is_authenticated:
        context.update({
            'wishlist': wishlist,
            'cart_count': count,
        })
`),
    );
    expect(keys).toEqual(new Set(['wishlist', 'cart_count']));
  });

  it('context.update({...}) at top level → NOT conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    context.update({'nav': nav_items})
    if x:
        context['extra'] = 1
`),
    );
    expect(keys).toEqual(new Set(['extra']));
  });

  it('nested if fully covered by inner if/else stays conditional (conservative)', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if a:
        if b:
            context['x'] = 1
        else:
            context['x'] = 2
`),
    );
    // inner statement is itself nested under `if a:` — coverage does not
    // bubble up, so 'x' remains conditional.
    expect(keys).toEqual(new Set(['x']));
  });

  it('reading context["k"] inside an if condition is NOT an assignment', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if context['flag']:
        do_something()
`),
    );
    expect(keys).toEqual(new Set());
  });

  it('inline one-liner `if cond: context[k] = v` → conditional', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if request.user.is_staff: context['is_admin'] = True
`),
    );
    expect(keys).toEqual(new Set(['is_admin']));
  });

  it('CBV method body: if inside get_context_data → conditional; sibling unconditional not', () => {
    const keys = detectConditionalContextKeys(
      body(`
    model = Product

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['always'] = 1
        if self.request.user.is_staff:
            context['staff_tools'] = True
        return context
`),
    );
    expect(keys).toEqual(new Set(['staff_tools']));
  });

  it('dedent out of the if closes the conditional scope', () => {
    const keys = detectConditionalContextKeys(
      body(`
    if a:
        x = 1
    context['after'] = 2
`),
    );
    expect(keys).toEqual(new Set());
  });

  it('empty body → empty set', () => {
    expect(detectConditionalContextKeys([])).toEqual(new Set());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The context dict is not always called `context`.
//
// Both patterns were anchored to the literal name, so a view that calls its
// dict `ctx` or `data` — as many do — lost 100% of the detection: two views
// that behave identically got different diagnostics, and the one with the short
// name got none. `context-keys.ts` learned this already and exports
// `contextVariableNames` for exactly this question.
// ─────────────────────────────────────────────────────────────────────────────
describe('the context dict under any name', () => {
  const view = (name: string) => [
    `    ${name} = {'always': 1}`,
    '    if request.user.is_staff:',
    `        ${name}['secret'] = compute()`,
    `    return render(request, 't.html', ${name})`,
  ];

  it.each(['context', 'ctx', 'data', 'payload'])('detects a conditional key in %s', name => {
    expect([...detectConditionalContextKeys(view(name))]).toEqual(['secret']);
  });

  it('detects a conditional update() under any name', () => {
    const lines = [
      '    ctx = {}',
      '    if flag:',
      "        ctx.update({'extra': 1})",
      "    return render(request, 't.html', ctx)",
    ];
    expect([...detectConditionalContextKeys(lines)]).toEqual(['extra']);
  });

  it('does not report a key that is also assigned unconditionally', () => {
    const lines = [
      '    ctx = {}',
      "    ctx['always'] = 1",
      '    if flag:',
      "        ctx['always'] = 2",
      "    return render(request, 't.html', ctx)",
    ];
    expect([...detectConditionalContextKeys(lines)]).toEqual([]);
  });

  it('does not treat an unrelated dict as the context', () => {
    const lines = [
      '    ctx = {}',
      '    if flag:',
      "        other['nope'] = 1",
      "    return render(request, 't.html', ctx)",
    ];
    expect([...detectConditionalContextKeys(lines)]).toEqual([]);
  });
});
