import { describe, it, expect } from 'vitest';
import { extractPropertyBlock } from './property-block';

const at = (src: string, decoratorLine: number) =>
  extractPropertyBlock(src.split('\n'), decoratorLine);

describe('extractPropertyBlock', () => {
  const SRC = [
    'class Invoice(models.Model):', // 0
    '    total = models.DecimalField()', // 1
    '', // 2
    '    @property', // 3
    '    def extracted_by(self):', // 4
    '        """Who ran the OCR."""', // 5
    '        if self.audited_by:', // 6
    '            return self.audited_by', // 7
    '        return self.uploaded_by', // 8
    '', // 9
    '    @property', // 10
    '    def is_paid(self):', // 11
    '        return self.paid_at is not None', // 12
    '', // 13
    '    def not_a_property(self):', // 14
    '        pass', // 15
  ].join('\n');

  it('reads the name from the def under the decorator', () => {
    expect(at(SRC, 3)?.name).toBe('extracted_by');
  });

  it('captures the whole body, dedented', () => {
    expect(at(SRC, 3)?.source).toBe(
      [
        '@property',
        'def extracted_by(self):',
        '    """Who ran the OCR."""',
        '    if self.audited_by:',
        '        return self.audited_by',
        '    return self.uploaded_by',
      ].join('\n'),
    );
  });

  // The blank line and the next decorator belong to what comes after.
  it('stops before the next member', () => {
    expect(at(SRC, 3)?.nextIdx).toBe(9);
    expect(at(SRC, 10)?.source).toBe(
      ['@property', 'def is_paid(self):', '    return self.paid_at is not None'].join('\n'),
    );
  });

  it('returns null when the decorator is not followed by a def', () => {
    expect(at(['    @property', '    x = 1'].join('\n'), 0)).toBeNull();
  });

  it('tolerates a blank line or comment between decorator and def', () => {
    const src = [
      '    @property',
      '    # why',
      '',
      '    def slug(self):',
      '        return self.name',
    ].join('\n');
    expect(at(src, 0)?.name).toBe('slug');
  });

  it('works with any indentation width', () => {
    const src = ['\t@property', '\tdef x(self):', '\t\treturn 1'].join('\n');
    expect(at(src, 0)?.source).toBe(['@property', 'def x(self):', '\treturn 1'].join('\n'));
  });
});
