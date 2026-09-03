/* Capture the diagram webview for the docs.
 *
 * Drives the SHIPPED bundle in the harness over CDP and writes PNGs plus
 * frame sequences for GIFs. Nothing is mocked or drawn by hand: this is the
 * real webview rendering a real payload.
 *
 *   node scripts/diagram-harness/serve.mjs                  # in one terminal
 *   node scripts/diagram-harness/capture-docs.mjs out/      # in another
 *
 * Arguments: <outDir> [filePrefix] [zoom]
 *   zoom > 0 overrides "Fit to screen", which on a wide canvas settles on a
 *   level that leaves most of the viewport empty.
 *
 * PAYLOAD=<file> on the SERVER swaps the committed fixture for another
 * payload — that is how docs shots are taken against real parsed models.
 *
 * Encode the frame directories with gifski:
 *   gifski --fps 10 --width 900 --quality 80 -o focus.gif out/focus/*.png
 *
 * Requires Google Chrome on PATH at /opt/google/chrome/chrome. */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2];
const PREFIX = process.argv[3] ?? '';
const ZOOM = Number(process.argv[4] ?? 0);
const PORT = 9510;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'diag-cap-'));
const chrome = spawn(
  '/opt/google/chrome/chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1280,760',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2',
    'http://localhost:5599/',
  ],
  { stdio: 'ignore' },
);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let url;
for (let i = 0; i < 80; i++) {
  try {
    const l = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    const p = l.find(t => t.type === 'page' && t.url.startsWith('http://localhost:5599'));
    if (p?.webSocketDebuggerUrl) {
      url = p.webSocketDebuggerUrl;
      break;
    }
  } catch {
    /* harness not up yet: retry after the sleep below */
  }
  await sleep(200);
}
const ws = new WebSocket(url);
await new Promise(r => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (m, p = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
  return new Promise(r => pend.set(i, r));
};
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};
const mouse = (t, x, y, b = 'none', c = 0) =>
  send('Input.dispatchMouseEvent', {
    type: t,
    x,
    y,
    button: b,
    clickCount: c,
    buttons: b === 'left' ? 1 : 0,
  });
const click = async (x, y) => {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y, 'left', 1);
  await mouse('mouseReleased', x, y, 'left', 1);
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT}/${PREFIX}${name}.png`;
  writeFileSync(path, Buffer.from(r.result.data, 'base64'));
  console.log('  ->', path);
};
const frame = async (dir, n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(`${OUT}/${PREFIX}${dir}`, { recursive: true });
  writeFileSync(
    `${OUT}/${PREFIX}${dir}/${String(n).padStart(3, '0')}.png`,
    Buffer.from(r.result.data, 'base64'),
  );
};
const byText = (label, tag = 'button') =>
  ev(
    '(()=>{const want=' +
      JSON.stringify(label) +
      `;const el=[...document.querySelectorAll(${JSON.stringify(tag)})]` +
      '.filter(e=>e.offsetParent&&(e.textContent||"").trim()===want)[0];' +
      'if(!el) return "no encontrado"; el.click(); return "ok";})()',
  );
const boxAt = key =>
  ev(
    `(()=>{const e=document.querySelector('[data-model="${key}"]');` +
      'if(!e||getComputedStyle(e).display==="none") return null;' +
      'const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()',
  );

await send('Runtime.enable');
await sleep(3500);

// The onboarding hint is a first-run overlay; hide it so it does not sit in
// the middle of every screenshot.
await ev(
  '(()=>{const h=document.getElementById("pan-hint"); if(h) h.style.display="none"; return "ok";})()',
);
// Fill the viewport rather than shooting a diagram parked in one corner.
const fit = async () => {
  await ev(
    '(()=>{const b=[...document.querySelectorAll("button")]' +
      '.find(e=>(e.textContent||"").trim()==="Fit to screen"); if(b) b.click(); return "ok";})()',
  );
  await sleep(1200);
};
await fit();
// Fit computes a zoom that leaves most of the viewport empty on a wide
// canvas, so the readable pass drives the zoom itself and centres the boxes.
if (ZOOM > 0) {
  await ev(
    `(()=>{const c=document.getElementById('canvas-content');` +
      `c.style.zoom='${ZOOM}'; c.style.transform='scale(1)'; return 'ok';})()`,
  );
  await sleep(500);
  await ev(
    `(()=>{const boxes=[...document.querySelectorAll('[data-model]')]` +
      `.filter(e=>getComputedStyle(e).display!=='none');` +
      `if(!boxes.length) return 'sin cajas';` +
      `const rs=boxes.map(b=>b.getBoundingClientRect());` +
      `const cv=document.getElementById('canvas');` +
      `const minX=Math.min(...rs.map(r=>r.left)), minY=Math.min(...rs.map(r=>r.top));` +
      `const maxX=Math.max(...rs.map(r=>r.right)), maxY=Math.max(...rs.map(r=>r.bottom));` +
      `cv.scrollLeft += minX - (cv.clientWidth-(maxX-minX))/2;` +
      `cv.scrollTop  += minY - cv.getBoundingClientRect().top - (cv.clientHeight-(maxY-minY))/2;` +
      `return 'ok';})()`,
  );
  await sleep(700);
}

// ── 1. Overview ──────────────────────────────────────────────────────────
console.log('overview');
await shot('diagram-overview');

// ── 2. Focus / blast radius, as a GIF ────────────────────────────────────
console.log('focus (gif)');
const keys = await ev(
  '(()=>[...document.querySelectorAll("[data-model]")]' +
    '.map(e=>e.getAttribute("data-model")))()',
);
const target = keys.find(k => /Product$|Invoice$|Order$/.test(k)) ?? keys[0];
let n = 0;
for (let i = 0; i < 6; i++) {
  await frame('focus', n++);
  await sleep(60);
}
const b = await boxAt(target);
if (b) {
  await mouse('mouseMoved', b.x, b.y);
  for (let i = 0; i < 4; i++) {
    await frame('focus', n++);
    await sleep(60);
  }
  await click(b.x, b.y);
  for (let i = 0; i < 18; i++) {
    await frame('focus', n++);
    await sleep(90);
  }
  await shot('diagram-focus');
  // Release the selection so later shots start clean.
  await click(30, 700);
  await sleep(600);
}

// ── 3. Migration history + comparator, as a GIF ──────────────────────────
console.log('migration history (gif)');
console.log('  Analyze:', await byText('Analyze'));
await sleep(400);
console.log('  Migration history:', await byText('Migration history'));
await sleep(1400);
await ev(
  '(()=>{const h=document.getElementById("pan-hint"); if(h) h.style.display="none"; return "ok";})()',
);
let m = 0;
for (let i = 0; i < 8; i++) {
  await frame('history', m++);
  await sleep(80);
}
await shot('diagram-history');

// Step through the timeline entries.
const steps = await ev(
  '(()=>{const g=document.getElementById("tl-graph");if(!g)return 0;' +
    'return [...g.querySelectorAll("button")].length;})()',
);
for (let s = 0; s < Math.min(steps, 5); s++) {
  await ev(
    `(()=>{const g=document.getElementById("tl-graph");` +
      `const b=[...g.querySelectorAll("button")][${s}]; if(b) b.click(); return "ok";})()`,
  );
  await sleep(700);
  for (let i = 0; i < 5; i++) {
    await frame('history', m++);
    await sleep(90);
  }
}

// Open the before/after comparator on a changed model.
const visible = await ev(
  '(()=>[...document.querySelectorAll("[data-model]")]' +
    '.filter(e=>getComputedStyle(e).display!=="none")' +
    '.map(e=>e.getAttribute("data-model")))()',
);
if (visible.length) {
  const c = await boxAt(visible[0]);
  if (c) {
    await click(c.x, c.y);
    await sleep(900);
    for (let i = 0; i < 14; i++) {
      await frame('history', m++);
      await sleep(90);
    }
    await shot('diagram-comparator');
  }
}

console.log('errores de consola: ninguno esperado');
ws.close();
chrome.kill();
process.exit(0);
