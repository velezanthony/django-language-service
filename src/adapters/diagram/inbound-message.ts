/**
 * Opening an inbound webview message safely: `onDidReceiveMessage` is typed
 * `(e: any) => void`, so the adapter's annotation is intent, not a guard.
 */

/** The discriminant, or undefined. */
export const inboundMessageType = (message: unknown): string | undefined => {
  if (typeof message !== 'object' || message === null) return undefined;
  let type: unknown;
  try {
    // A throwing getter here lands in the same uncatchable place as the TypeError.
    type = (message as { type?: unknown }).type;
  } catch {
    return undefined;
  }
  return typeof type === 'string' ? type : undefined;
};

/** A label safe to log. Not `String(message)`: the payload carries paths. */
export const describeInboundMessage = (message: unknown): string =>
  inboundMessageType(message) ?? '<malformed message>';
