#!/usr/bin/env node
/**
 * engine.mjs — reusable VS Code automation engine over the Chrome DevTools
 * Protocol. Give it a recipe (shots.json); it launches a real VS Code window,
 * drives it like a user (free mouse, left/right click, drag, keyboard, palette
 * commands), captures screenshots, then tears down. The engine never changes
 * per project — only the recipe does.
 *
 *   node engine.mjs <recipe.json>
 *
 * No dependencies: Node 22+ ships global `fetch` and `WebSocket`.
 *
 * WHY CDP a pelo: VS Code is Electron/Chromium. The chrome-devtools MCP always
 * spawns its OWN Chrome and can't attach to an external port, so we speak CDP
 * directly to VS Code's --remote-debugging-port. Context menus are DOM (not
 * native), so right-click + click works entirely inside the renderer.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[engine]', ...a);

// ── CDP connection ────────────────────────────────────────────────────────────

async function findPage(port, match, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page =
        list.find(t => t.type === 'page' && new RegExp(match).test(t.url)) ||
        list.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* endpoint not up yet */
    }
    await sleep(700);
  }
  throw new Error('CDP page target not found');
}

function openCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve: r, reject: j } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? j(new Error(m.method + ': ' + JSON.stringify(m.error))) : r(m.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r, j) => {
      const myId = ++id;
      pending.set(myId, { resolve: r, reject: j });
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  return { ws, ready, send };
}

// ── Primitives ──────────────────────────────────────────────────────────────

const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const modMask = (mods = []) => mods.reduce((m, k) => m | (MODS[k] || 0), 0);

const SPECIAL = {
  Enter: { code: 'Enter', vk: 13 },
  Escape: { code: 'Escape', vk: 27 },
  Backspace: { code: 'Backspace', vk: 8 },
  Tab: { code: 'Tab', vk: 9 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
};

class VSCode {
  constructor(send) {
    this.send = send;
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error('evaluate: ' + exceptionDetails.text);
    return result.value;
  }

  async key(name, mods = []) {
    const s = SPECIAL[name];
    const modifiers = modMask(mods);
    const base = s
      ? { code: s.code, key: name, windowsVirtualKeyCode: s.vk }
      : {
          code: `Key${name.toUpperCase()}`,
          key: name,
          windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0),
        };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...base });
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async move(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async click(x, y, { button = 'left', clickCount = 1 } = {}) {
    const buttons = button === 'right' ? 2 : 1;
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button, buttons: 0 });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      buttons,
      clickCount,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      buttons: 0,
      clickCount,
    });
  }

  async drag(x1, y1, x2, y2, steps = 12) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1,
      y: y1,
      button: 'left',
      buttons: 0,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x1,
      y: y1,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button: 'left',
        buttons: 1,
        x: x1 + ((x2 - x1) * i) / steps,
        y: y1 + ((y2 - y1) * i) / steps,
      });
      await sleep(16);
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x2,
      y: y2,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  }

  async scroll(x, y, deltaY) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }

  /** Locate an element's viewport-center by CSS selector or visible/aria text. */
  async locate({ selector, text }) {
    const finder = `(() => {
      let el = null;
      ${selector ? `el = document.querySelector(${JSON.stringify(selector)});` : ''}
      ${
        text
          ? `if (!el) {
        const needle = ${JSON.stringify(text)}.toLowerCase();
        const nodes = [...document.querySelectorAll('a,button,[role],[aria-label],.monaco-list-row,.action-label,.codicon,.tab,.label-name,.view-line span')];
        // Prefer the SMALLEST visible match: a greedy container (e.g. the whole
        // editor) transitively contains every token, so match by own label/title
        // OR by short leaf text, then pick the least-area candidate.
        const cands = nodes.filter(n => {
          if (!n.getClientRects().length) return false;
          const label = ((n.getAttribute('aria-label')||'') + ' ' + (n.title||'')).toLowerCase();
          if (label.includes(needle)) return true;
          const t = (n.textContent||'').toLowerCase();
          return t.includes(needle) && !n.querySelector('*') && t.length < needle.length + 40;
        });
        cands.sort((a,b) => (a.getBoundingClientRect().width*a.getBoundingClientRect().height)
                          - (b.getBoundingClientRect().width*b.getBoundingClientRect().height));
        el = cands[0] || null;
      }`
          : ''
      }
      if (!el) return null;
      el.scrollIntoView({block:'center', inline:'center'});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
    })()`;
    return this.evaluate(finder);
  }

  async runCommand(title) {
    await this.key('p', ['ctrl', 'shift']);
    await sleep(400);
    // Ctrl+Shift+P opens the palette with '>' ALREADY in the box, and it can
    // still hold the previous query. Typing '> title' on top produced
    // '>> title', which matches no command — so commands silently did nothing
    // and every later step ran against a window that had not been set up.
    await this.key('a', ['ctrl']);
    await sleep(80);
    await this.type(`>${title}`);
    await sleep(700);
    await this.key('Enter');
    await sleep(700);
  }

  async quickOpen(query) {
    await this.key('p', ['ctrl']);
    await sleep(400);
    await this.type(query);
    await sleep(800);
    await this.key('Enter');
    await sleep(800);
  }

  /**
   * Throw away every unsaved edit and close the editors holding them.
   *
   * Recipes type into REAL files in src/test-django-project. Left dirty, two
   * things go wrong: "View: Close All Editors" pops a save prompt that stalls
   * the run (and writes the repo if anything answers it), and killing VS Code
   * with dirty buffers makes hot exit restore them into the NEXT run.
   *
   * Ctrl+W rather than a palette title for the close: it needs no guess about
   * command names, and after the revert the buffer is clean so it cannot
   * prompt. `Revert File` acts on the active editor only, hence the loop.
   */
  async discardEdits(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
      await this.runCommand('Revert File');
      await this.key('w', ['ctrl']);
      await sleep(250);
    }
    await this.runCommand('View: Close All Editors');
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(data, 'base64'));
    // Blank-frame guard: a fully uniform PNG usually means capture-before-paint.
    const size = Buffer.from(data, 'base64').length;
    if (!this.quiet) log('screenshot', path, size, 'bytes');
    if (size < 3000) log('  ⚠️ suspiciously small — verify by eye', path);
    return size;
  }
}

// ── Recipe runner ─────────────────────────────────────────────────────────────

async function runAction(vs, a, ctx) {
  const outDir = ctx.outDir;
  switch (a.do) {
    case 'wait':
      return sleep(a.ms ?? 500);
    case 'key':
      return vs.key(a.key, a.mods || []);
    case 'type':
      return vs.type(a.text);
    case 'command':
      return vs.runCommand(a.title);
    case 'openFile':
      return vs.quickOpen(a.query);
    case 'closeWelcome': {
      await vs.key('w', ['ctrl']);
      return sleep(800);
    }
    case 'discardEdits':
      return vs.discardEdits(a.rounds ?? 8);
    case 'move': {
      const p = await must(vs, a);
      return vs.move(p.x, p.y);
    }
    case 'click': {
      const p = a.x != null ? a : await must(vs, a);
      return vs.click(p.x, p.y, { button: a.button || 'left', clickCount: a.clickCount || 1 });
    }
    case 'rightClick': {
      const p = a.x != null ? a : await must(vs, a);
      return vs.click(p.x, p.y, { button: 'right' });
    }
    case 'doubleClick': {
      const p = a.x != null ? a : await must(vs, a);
      return vs.click(p.x, p.y, { clickCount: 2 });
    }
    case 'drag': {
      const from = a.from.x != null ? a.from : await must(vs, a.from);
      const to = a.to.x != null ? a.to : await must(vs, a.to);
      return vs.drag(from.x, from.y, to.x, to.y);
    }
    case 'scroll': {
      const p = a.x != null ? a : await must(vs, a);
      return vs.scroll(p.x, p.y, a.deltaY ?? 300);
    }
    case 'hook':
      return vs.evaluate(a.js);
    case 'screenshot':
      return vs.screenshot(join(outDir, a.file));
    // A run of frames for a GIF. `dir` is created under outDir and filled with
    // 000.png, 001.png … — feed it straight to gifski.
    case 'burst': {
      const dir = join(outDir, a.dir);
      mkdirSync(dir, { recursive: true });
      const start = ctx.burst[a.dir] ?? 0;
      vs.quiet = true;
      for (let i = 0; i < (a.frames ?? 10); i++) {
        await vs.screenshot(join(dir, String(start + i).padStart(3, '0') + '.png'));
        await sleep(a.every ?? 100);
      }
      vs.quiet = false;
      log('burst', a.dir, a.frames ?? 10, 'frames');
      ctx.burst[a.dir] = start + (a.frames ?? 10);
      return undefined;
    }
    default:
      throw new Error('unknown action: ' + a.do);
  }
}

async function must(vs, a) {
  const p = await vs.locate({ selector: a.selector, text: a.text });
  if (!p) throw new Error(`element not found: ${a.selector || a.text} (${a.as || ''})`);
  return p;
}

// ── Launch / attach ─────────────────────────────────────────────────────────

/** Newest VS Code the integration tests have downloaded, whatever its version.
 *  @vscode/test-electron names these `vscode-<platform>-<version>`, so the pin
 *  used to break on every upgrade and never resolved off linux-x64.
 *
 *  "Newest" has to mean the highest VERSION, and a plain `.sort()` of the paths
 *  does not: string order puts `1.132.0` before `1.85.0`, so `.at(-1)` handed
 *  back the OLDER binary the moment two cached versions differed in how many
 *  digits their minor had. The cache is cumulative, so this was not
 *  hypothetical — one leftover `1.85.x` silently reverted every screenshot to
 *  it, with the harness reporting success. */
function newestTestBinary(root) {
  const cacheRoot = join(root, '.vscode-test');
  if (!existsSync(cacheRoot)) return null;

  // `1.132.0` → [1, 132, 0]. A missing or non-numeric part sorts lowest, so a
  // directory this does not understand can never win.
  const version = dir => {
    const m = /-(\d+(?:\.\d+)*)$/.exec(dir);
    return m ? m[1].split('.').map(Number) : [-1];
  };
  const higher = (a, b) => {
    const va = version(a);
    const vb = version(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (va[i] ?? 0) - (vb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };

  const candidates = readdirSync(cacheRoot)
    .filter(name => name.startsWith('vscode-'))
    .sort(higher)
    .map(name => [
      join(cacheRoot, name, 'code'), // linux / win
      join(cacheRoot, name, 'Visual Studio Code.app/Contents/MacOS/Electron'), // darwin
    ])
    .flat()
    .filter(existsSync);
  return candidates.at(-1) ?? null;
}

function pickBin(recipe, root) {
  if (recipe.vscodeBin && existsSync(recipe.vscodeBin)) return recipe.vscodeBin;
  if (process.env.VSCODE_BIN && existsSync(process.env.VSCODE_BIN)) return process.env.VSCODE_BIN;
  return newestTestBinary(root) ?? 'code'; // snap / PATH
}

async function main() {
  const recipePath = process.argv[2];
  if (!recipePath) {
    console.error('usage: node engine.mjs <recipe.json>');
    process.exit(2);
  }
  const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
  const port = recipe.port ?? 9222;
  // Every path in a recipe is resolved against the recipe file, so recipes stay
  // relative and runnable from any cwd and any checkout.
  const rel = p => resolve(dirname(recipePath), p);
  const extensionPath = rel(recipe.extensionPath || '../..');
  const outDir = rel(recipe.outDir || 'shots');
  mkdirSync(outDir, { recursive: true });

  // Attach if a debug VS Code is already listening; else launch one.
  let child = null;
  let alreadyUp = false;
  const userDataDir = recipe.userDataDir || `/tmp/vscode-cdp-${port}`;
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    alreadyUp = true;
  } catch {
    /* nothing on the port yet: we launch it below */
  }

  if (!alreadyUp) {
    const bin = pickBin(recipe, extensionPath);
    // Pre-seed settings so runs start clean (no Welcome tab, no chat clutter).
    if (recipe.settings) {
      const userDir = join(userDataDir, 'User');
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, 'settings.json'), JSON.stringify(recipe.settings, null, 2));
    }
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--new-window',
      '--disable-workspace-trust',
      '--skip-release-notes',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ];
    // Other extensions get in the way of a clean capture — the built-in chat
    // one throws a full-screen sign-in dialog over the first shot. The
    // development extension still loads with this on; nothing else does.
    if (recipe.disableExtensions) args.push('--disable-extensions');
    args.push(`--extensionDevelopmentPath=${extensionPath}`);
    if (recipe.workspace) args.push(rel(recipe.workspace));
    log('launching', bin);
    child = spawn(bin, args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    });
    child.unref();
  } else {
    log('attaching to existing VS Code on port', port);
  }

  const page = await findPage(port, 'workbench', 90000);
  log('target', page.url.slice(0, 80));
  const { ws, ready, send } = openCdp(page.webSocketDebuggerUrl);
  await ready;
  await send('Page.enable');
  await send('Runtime.enable');
  const vs = new VSCode(send);
  await sleep(recipe.settleMs ?? 2500); // let the extension host activate

  let failed = false;
  const burst = {}; // per-directory frame counter, so bursts can be resumed
  for (const [i, a] of recipe.actions.entries()) {
    try {
      log(`action ${i + 1}/${recipe.actions.length}: ${a.do}${a.as ? ` (${a.as})` : ''}`);
      await runAction(vs, a, { outDir, burst });
      await sleep(a.after ?? 250);
    } catch (e) {
      failed = true;
      console.error(`  ✗ ${e.message}`);
      if (!recipe.continueOnError) break;
    }
  }

  // Unconditional, and NOT the recipe's job: the loop above breaks on the first
  // error, so any cleanup a recipe declared for itself is skipped exactly when
  // it matters most — after a failure that left a file half-typed.
  try {
    await vs.discardEdits();
  } catch (e) {
    console.error(`  ✗ teardown could not discard edits: ${e.message}`);
    failed = true;
  }

  ws.close();
  if (child && !recipe.keepOpen) {
    // Graceful teardown: VS Code spawns its main process in its OWN session, so
    // killing the spawned child's group misses it AND leaves a half-dead window
    // ("window terminated unexpectedly" dialog). SIGTERM by user-data-dir lets
    // it shut down cleanly; SIGKILL only mops up stragglers.
    try {
      execSync(`pkill -TERM -f ${JSON.stringify(userDataDir)}`, { stdio: 'ignore' });
    } catch {
      /* nothing left to signal */
    }
    await sleep(3500);
    try {
      execSync(`pkill -KILL -f ${JSON.stringify(userDataDir)}`, { stdio: 'ignore' });
    } catch {
      /* already gone, which is the goal */
    }
    log('closed launched VS Code cleanly');
  }
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('[engine] FATAL', e.message);
  process.exit(1);
});
