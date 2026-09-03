// Subscribe to data messages from the extension. The provider posts
// { type: 'data', payload: <section-specific shape> } when a scan completes
// (and replays the latest cached payload when the view resolves). The
// caller's onData runs on every payload; the returned function unsubscribes.

export function subscribeToData<T>(onData: (payload: T) => void): () => void {
  const handler = (event: MessageEvent): void => {
    const msg = event.data;
    if (msg && typeof msg === 'object' && msg.type === 'data') {
      onData(msg.payload as T);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
