/**
 * The old reader knew three shapes and hardcoded the variable name `context`.
 * Everything else came back empty — and a PARTIAL read is the dangerous kind:
 * Live Mode stays quiet when it finds nothing, but once it has found one key
 * it reports every key it missed as undefined.
 */
import { describe, it, expect } from 'vitest';
import { extractContextSurface } from './context-keys';

const keys = (src: string): string[] =>
  [...extractContextSurface(src.trim().split('\n')).keys].sort();
const helpers = (src: string): string[] =>
  [...extractContextSurface(src.trim().split('\n')).helperCalls].sort();

describe('dict literals', () => {
  it('reads an inline dict in render()', () => {
    expect(keys(`return render(request, 't.html', {'a': 1})`)).toEqual(['a']);
  });

  it('reads a dict spanning several lines', () => {
    expect(
      keys(`
context = {
    'a': 1,
    'b': 2,
}
return render(request, 't.html', context)
`),
    ).toEqual(['a', 'b']);
  });

  it('reads double-quoted keys', () => {
    expect(keys(`return render(request, 't.html', {"a": 1})`)).toEqual(['a']);
  });
});

describe('the variable can be called anything', () => {
  it('follows a name other than context', () => {
    expect(
      keys(`
ctx = {'a': 1}
ctx['b'] = 2
return render(request, 't.html', ctx)
`),
    ).toEqual(['a', 'b']);
  });

  it('follows the context= keyword form', () => {
    expect(
      keys(`
payload = {'a': 1}
return render(request, 't.html', context=payload)
`),
    ).toEqual(['a']);
  });

  it('follows a name that is simply returned — get_context_data', () => {
    expect(
      keys(`
ctx = super().get_context_data(**kwargs)
ctx['a'] = 1
return ctx
`),
    ).toEqual(['a']);
  });
});

describe('keys injected after the fact', () => {
  it('reads update() with a literal on one line', () => {
    expect(
      keys(`
context = {}
context.update({'a': 1})
return render(request, 't.html', context)
`),
    ).toEqual(['a']);
  });

  it('reads update() with a literal across lines', () => {
    expect(
      keys(`
context = {}
context.update({
    'a': 1,
})
return render(request, 't.html', context)
`),
    ).toEqual(['a']);
  });

  it('reads the |= dict union', () => {
    expect(
      keys(`
context = {'a': 1}
context |= {'b': 2}
return render(request, 't.html', context)
`),
    ).toEqual(['a', 'b']);
  });

  it('reads setdefault', () => {
    expect(
      keys(`
context = {}
context.setdefault('a', 1)
return render(request, 't.html', context)
`),
    ).toEqual(['a']);
  });
});

describe('a context assembled from pieces', () => {
  it('expands ** spreads of dicts built earlier in the body', () => {
    expect(
      keys(`
part_a = {'a': 1}
part_b = {'b': 2}
context = {**part_a, **part_b, 'c': 3}
return render(request, 't.html', context)
`),
    ).toEqual(['a', 'b', 'c']);
  });

  it('ignores a spread of something it cannot see', () => {
    expect(
      keys(`
context = {**mystery, 'c': 3}
return render(request, 't.html', context)
`),
    ).toEqual(['c']);
  });
});

describe('other response helpers', () => {
  it('reads TemplateResponse', () => {
    expect(keys(`return TemplateResponse(request, 't.html', {'a': 1})`)).toEqual(['a']);
  });

  it('reads render_to_string', () => {
    expect(keys(`return render_to_string('t.html', {'a': 1})`)).toEqual(['a']);
  });

  it('reads a CBV extra_context class attribute', () => {
    expect(
      keys(`
template_name = 't.html'
extra_context = {
    'a': 1,
}
`),
    ).toEqual(['a']);
  });
});

describe('helper calls', () => {
  it('records a helper assigned to the context', () => {
    expect(
      helpers(`
context = build_ctx(request)
return render(request, 't.html', context)
`),
    ).toEqual(['build_ctx']);
  });

  it('records a helper merged in with update', () => {
    expect(
      helpers(`
context = {}
context.update(build_ctx(request))
return render(request, 't.html', context)
`),
    ).toEqual(['build_ctx']);
  });

  it('takes the bare name of a dotted call', () => {
    expect(
      helpers(`
context = {}
context.update(header.to_dict(request))
return render(request, 't.html', context)
`),
    ).toEqual(['to_dict']);
  });

  it('does not mistake builtins for helpers', () => {
    expect(
      helpers(`
context = dict(a=1)
context.update(super().get_context_data())
return render(request, 't.html', context)
`),
    ).not.toContain('dict');
  });
});

describe('things that must NOT count as keys', () => {
  it('ignores a comparison', () => {
    expect(
      keys(`
if context['a'] == 1:
    pass
return render(request, 't.html', {'b': 2})
`),
    ).toEqual(['b']);
  });

  it('returns nothing for a view with no context at all', () => {
    expect(keys(`return redirect('home')`)).toEqual([]);
  });

  it('survives an unbalanced brace without throwing', () => {
    expect(() => keys(`context = {'a': 1`)).not.toThrow();
  });
});

// The surface reader is allowed to miss things — Python is not parsed here.
// What it must NOT do is stay quiet about having missed them: a key absent
// from a PARTIAL list is this tool's gap, and reporting it as undefined
// accuses the user of a mistake they did not make.
describe('knowing when the read is incomplete', () => {
  const incomplete = (src: string): boolean =>
    extractContextSurface(src.trim().split('\n')).unresolved;

  it('flags update() with a value it cannot read', () => {
    expect(
      incomplete(`
context = {'a': 1}
context.update(request.session['prefs'])
return render(request, 't.html', context)
`),
    ).toBe(true);
  });

  it('flags a spread of something built elsewhere', () => {
    expect(
      incomplete(`
context = {**get_defaults(), 'a': 1}
return render(request, 't.html', context)
`),
    ).toBe(true);
  });

  it('does not flag a helper call — the scanner resolves those', () => {
    expect(
      incomplete(`
context = {}
context.update(build_ctx(request))
return render(request, 't.html', context)
`),
    ).toBe(false);
  });

  it('does not flag update() with a dict built in the body', () => {
    expect(
      incomplete(`
part = {'a': 1}
context = {}
context.update(part)
return render(request, 't.html', context)
`),
    ).toBe(false);
  });

  it('reads the keys of that dict too', () => {
    expect(
      keys(`
part = {'a': 1}
context = {}
context.update(part)
return render(request, 't.html', context)
`),
    ).toEqual(['a']);
  });

  it('does not flag a plainly-written context', () => {
    expect(
      incomplete(`
context = {'a': 1}
context['b'] = 2
return render(request, 't.html', context)
`),
    ).toBe(false);
  });
});
