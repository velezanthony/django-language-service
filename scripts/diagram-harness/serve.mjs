/* Static server for the diagram browser harness.
 *
 * Serves this directory at / and the repo's dist/ at /dist/, so the page runs
 * the SAME bundle the VS Code webview loads — not a rebuild, not a mock.
 *
 * Usage: node scripts/diagram-harness/serve.mjs [port]
 * Requires `npm run compile` first (it serves dist/, it does not build it).
 *
 * No dependencies, by design: this repo ships zero runtime deps and the
 * harness should not be the thing that changes that.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PORT = Number(process.argv[2] ?? 5599);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Map a URL path to a file, refusing anything that escapes its root. */
function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]));
  if (clean.includes('..')) return null;
  if (clean === '/' || clean === '') return join(HERE, 'index.html');
  if (clean.startsWith('/dist/')) return join(REPO, clean);
  // PAYLOAD=<file> swaps the fixture for another payload — how the docs
  // screenshots are taken against real parsed models instead of the synthetic
  // one. Unset, the committed fixture is served as before.
  if (clean === '/payload.js' && process.env.PAYLOAD) return process.env.PAYLOAD;
  return join(HERE, clean);
}

createServer(async (req, res) => {
  const file = resolve(req.url ?? '/');
  if (!file) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end(`not found: ${req.url}`);
  }
}).listen(PORT, () => {
  console.log(`[harness] http://localhost:${PORT}`);
  console.log('[harness] serving dist/ from', REPO);
});
