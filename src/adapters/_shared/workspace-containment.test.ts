import { describe, it, expect } from 'vitest';
import { isInsideRoot, isInsideAnyRoot } from './workspace-containment';

describe('isInsideRoot', () => {
  it('accepts a path inside the root', () => {
    expect(isInsideRoot('/ws/app/templates/a.html', '/ws')).toBe(true);
    expect(isInsideRoot('/ws/a.html', '/ws')).toBe(true);
  });

  it('accepts the root itself', () => {
    expect(isInsideRoot('/ws', '/ws')).toBe(true);
    expect(isInsideRoot('/ws/', '/ws')).toBe(true);
  });

  it('rejects a path that climbs out', () => {
    expect(isInsideRoot('/ws/app/../../etc/shadow', '/ws')).toBe(false);
    expect(isInsideRoot('/etc/shadow', '/ws')).toBe(false);
  });

  it.each([
    '/ws/../../../../etc/shadow',
    '/ws/a/../../b',
    '/ws/./../outside',
    '/ws/templates/../../../root/.ssh/id_rsa',
  ])('rejects %s', target => {
    expect(isInsideRoot(target, '/ws')).toBe(false);
  });

  // A raw `startsWith` says `/ws-evil` is inside `/ws`. Segments say otherwise.
  it('does not accept a sibling whose name begins with the root name', () => {
    expect(isInsideRoot('/ws-evil/a.html', '/ws')).toBe(false);
    expect(isInsideRoot('/wsx', '/ws')).toBe(false);
  });

  it('accepts a climb that lands back inside', () => {
    expect(isInsideRoot('/ws/app/../other/a.html', '/ws')).toBe(true);
  });

  it('treats backslashes as separators', () => {
    expect(isInsideRoot('C:/ws/app/a.html', 'C:/ws')).toBe(true);
    expect(isInsideRoot('C:\\ws\\app\\a.html', 'C:/ws')).toBe(true);
    expect(isInsideRoot('C:\\ws\\..\\etc', 'C:/ws')).toBe(false);
  });

  it('contains nothing when the root is empty', () => {
    expect(isInsideRoot('/anything', '')).toBe(false);
  });
});

describe('isInsideAnyRoot', () => {
  const roots = ['/api', '/admin'];

  it('accepts a path under either root', () => {
    expect(isInsideAnyRoot('/api/a.html', roots)).toBe(true);
    expect(isInsideAnyRoot('/admin/b.html', roots)).toBe(true);
  });

  it('rejects a path under neither', () => {
    expect(isInsideAnyRoot('/etc/shadow', roots)).toBe(false);
  });

  it('contains nothing when there are no roots', () => {
    expect(isInsideAnyRoot('/api/a.html', [])).toBe(false);
  });
});
