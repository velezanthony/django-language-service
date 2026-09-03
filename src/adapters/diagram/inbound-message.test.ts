import { describe, it, expect } from 'vitest';
import { inboundMessageType, describeInboundMessage } from './inbound-message';

/**
 * `onDidReceiveMessage` hands over whatever crossed the webview boundary. The
 * type annotation on the callback is a claim about what the app SHOULD send,
 * not a check on what arrived — a `postMessage(undefined)`, a message from a
 * half-torn-down document, or anything else that reaches the port arrives
 * exactly as it is.
 *
 * These two functions are the only place that opens such a value, and the rule
 * is total: for EVERY input, they answer without throwing. That matters most in
 * the panel's `.catch()` handler, where a throw is not caught by anything and
 * surfaces as an unhandled rejection that hides the failure it was reporting.
 */

const NOT_MESSAGES: ReadonlyArray<readonly [name: string, value: unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['a bare string', 'ready'],
  ['a number', 42],
  ['a boolean', true],
  ['an array', []],
  ['an object with no type', {}],
  ['an object whose type is not a string', { type: 7 }],
  ['an object whose type is null', { type: null }],
  ['a null-prototype object', Object.create(null) as unknown],
  [
    'an object whose type getter throws',
    new Proxy(
      {},
      {
        get: () => {
          throw new Error('hostile');
        },
      },
    ),
  ],
];

describe('inboundMessageType', () => {
  it.each([['ready'], ['refresh'], ['navigate'], ['webviewError']] as const)(
    'reads the discriminant of a well-formed %s message',
    type => {
      expect(inboundMessageType({ type })).toBe(type);
    },
  );

  it.each(NOT_MESSAGES)('returns undefined for %s instead of throwing', (_name, value) => {
    expect(() => inboundMessageType(value)).not.toThrow();
    expect(inboundMessageType(value)).toBeUndefined();
  });
});

describe('describeInboundMessage', () => {
  it('describes a well-formed message by its discriminant', () => {
    expect(describeInboundMessage({ type: 'navigate', model: 'shop.Product' })).toBe('navigate');
  });

  it.each(NOT_MESSAGES)('yields a printable label for %s instead of throwing', (_name, value) => {
    let label: string | undefined;

    expect(() => {
      label = describeInboundMessage(value);
    }).not.toThrow();

    expect(typeof label).toBe('string');
    expect(label).not.toBe('');
  });

  it('never interpolates the word "undefined" into the label', () => {
    // The label goes into a log line a human reads; "action 'undefined' failed"
    // reads like the app sent a message named undefined.
    expect(describeInboundMessage(undefined)).not.toContain('undefined');
  });
});
