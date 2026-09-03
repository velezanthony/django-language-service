import { describe, it, expect } from 'vitest';
import {
  DTL_LANGUAGE_IDS,
  DTL_LANGUAGES,
  DTL_SELECTOR,
  DTL_AND_PYTHON_SELECTOR,
  HTML_ONLY_LANGUAGES,
} from './languages';

// Every template-facing adapter used to redefine its own language list, and
// they drifted: the include CodeLens and diagnostics silently lost django-txt.
// These tests pin the single source of truth so the drift cannot come back.

describe('DTL_LANGUAGE_IDS', () => {
  it('lists exactly the three template languages', () => {
    expect([...DTL_LANGUAGE_IDS].sort()).toEqual(['django-html', 'django-txt', 'html']);
  });

  it('puts plain html first — it is the primary file type this extension targets', () => {
    // django-html/django-txt are contributed with no file extensions, so a real
    // project's templates open as `html` unless the user configures
    // files.associations. html must never be the afterthought.
    expect(DTL_LANGUAGE_IDS[0]).toBe('html');
  });
});

describe('DTL_LANGUAGES', () => {
  it('matches the id list', () => {
    expect(DTL_LANGUAGES.size).toBe(DTL_LANGUAGE_IDS.length);
    for (const id of DTL_LANGUAGE_IDS) expect(DTL_LANGUAGES.has(id)).toBe(true);
  });

  it('accepts html, django-html and django-txt', () => {
    expect(DTL_LANGUAGES.has('html')).toBe(true);
    expect(DTL_LANGUAGES.has('django-html')).toBe(true);
    expect(DTL_LANGUAGES.has('django-txt')).toBe(true);
  });

  it('rejects unrelated languages', () => {
    expect(DTL_LANGUAGES.has('python')).toBe(false);
    expect(DTL_LANGUAGES.has('javascript')).toBe(false);
  });
});

describe('DTL_SELECTOR', () => {
  it('is one { language } filter per template language', () => {
    expect(DTL_SELECTOR).toEqual([
      { language: 'html' },
      { language: 'django-html' },
      { language: 'django-txt' },
    ]);
  });

  // Phase 6 added `scheme: 'file'` to every template selector "for consistency"
  // and broke 33 integration tests: providers stopped attaching to `untitled:`
  // documents and in-memory buffers. Never again.
  it('carries NO scheme filter on the template languages', () => {
    for (const filter of DTL_SELECTOR) {
      expect(filter).not.toHaveProperty('scheme');
    }
  });
});

describe('DTL_AND_PYTHON_SELECTOR', () => {
  it('adds python after the template languages', () => {
    expect(DTL_AND_PYTHON_SELECTOR).toEqual([
      { language: 'html' },
      { language: 'django-html' },
      { language: 'django-txt' },
      { language: 'python', scheme: 'file' },
    ]);
  });

  it('keeps scheme: file on python only — the pre-rewrite contract', () => {
    const python = DTL_AND_PYTHON_SELECTOR.find(f => f.language === 'python');
    expect(python?.scheme).toBe('file');
    for (const filter of DTL_AND_PYTHON_SELECTOR.filter(f => f.language !== 'python')) {
      expect(filter).not.toHaveProperty('scheme');
    }
  });
});

describe('HTML_ONLY_LANGUAGES', () => {
  it('excludes django-txt — a .txt template has no <script> or <style> blocks', () => {
    expect(HTML_ONLY_LANGUAGES.has('html')).toBe(true);
    expect(HTML_ONLY_LANGUAGES.has('django-html')).toBe(true);
    expect(HTML_ONLY_LANGUAGES.has('django-txt')).toBe(false);
  });
});
