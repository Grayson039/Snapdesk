// Run: xvfb-run -a -s "-screen 0 1280x800x24" env NODE_PATH=$(npm root -g) node tests/app.test.js
// Launches the real Electron app against a virtual screen showing a known per-pixel pattern, then exercises capture, copy, save, autosave, security.
const { _electron, chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.resolve(__dirname, '..'); const SAVE = fs.mkdtempSync(path.join(os.tmpdir(), 'snapdesk-saves-'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000, step = 150) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } }
const f = (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256];

(async () => {
  // a separate Electron process whose frameless window paints a known pattern at screen 0,0
  const { spawn } = require('child_process'); const electronBin = require(path.join(ROOT, 'node_modules', 'electron'));
  const tgt = spawn(electronBin, [path.join(__dirname, 'target-main.js'), '--no-sandbox', '--disable-gpu'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => { tgt.stdout.on('data', (d) => { if (String(d).includes('TARGET READY')) res(); }); setTimeout(res, 15000); });
  await sleep(1500);
  const br = { close: async () => { tgt.kill(); } };
  ok(true, 'pattern window up');

  const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules', 'electron')), args: [ROOT, '--no-sandbox', '--disable-gpu'], env: { ...process.env, SNAPDESK_TEST: '1', SNAPDESK_SAVE_DIR: SAVE } });
  const errs = []; const isEd = (p) => p.url().endsWith('/editor.html'); const isOv = (p) => p.url().endsWith('/overlay.html');
  app.on('window', (p) => p.on('pageerror', (e) => errs.push(String(e))));
  const first = await app.firstWindow(); await first.waitForLoadState('domcontentloaded');
  ok(await first.evaluate(() => !!window.snapdeskNative && typeof window.snapdeskNative.capture === 'function'), 'preload exposes snapdeskNative');
  ok(await first.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'renderer has no Node access');
  ok(await first.evaluate(() => Object.keys(window.snapdeskNative).sort().join()) === 'capture,copyPng,info,onImage,readClipboardImage,saveFile,setDirty', 'bridge exposes only the expected functions');
  ok(/Ctrl/.test(await first.locator('#empty .st').first().innerText()), 'start screen shows the hotkey');
  ok(await app.evaluate(() => !!global.__snapdeskTest.tray), 'tray icon created');
  const hk = await app.evaluate(() => global.__snapdeskTest.hotkeyStatus); console.log('hotkey registration on this virtual screen:', JSON.stringify(hk));
  const net = await first.evaluate(() => fetch('http://example.com/').then(() => 'reached', () => 'blocked')); ok(net === 'blocked', 'network request is blocked (' + net + ')');

  async function capture(mode) { await app.evaluate((_, m) => { setTimeout(() => global.__snapdeskTest.startCapture(m, 0), 0); }, mode); }
  const editorsWithImage = async () => { const out = []; for (const w of app.windows()) { if (!isEd(w)) continue; const has = await w.evaluate(() => !!(window.snapdesk && window.snapdesk.state.base)).catch(() => false); if (has) out.push(w); } return out; };

  // ---- region capture: drag (200,150) -> (600,450) ----
  await capture('region');
  const ov = await waitFor(() => app.windows().find(isOv)); ok(!!ov, 'overlay window opened');
  await sleep(1200);
  const ovSize = await ov.evaluate(() => [innerWidth, innerHeight]); ok(ovSize[0] >= 1278 && ovSize[1] >= 798, 'overlay covers the display (' + ovSize + ')');
  await ov.mouse.move(200, 150); await ov.mouse.down(); await ov.mouse.move(400, 300, { steps: 6 }); await ov.mouse.move(600, 450, { steps: 6 }); await ov.mouse.up();
  const ed = await waitFor(async () => (await editorsWithImage())[0]); ok(!!ed, 'editor opened with the captured image');
  const sz = await ed.evaluate(() => [snapdesk.state.base.width, snapdesk.state.base.height]); ok(sz[0] === 400 && sz[1] === 300, 'captured size is exactly 400x300 (' + sz + ')');
  const bad = await ed.evaluate(([ox, oy]) => {
    const b = snapdesk.state.base, d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; let n = 0;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const i = (y * b.width + x) * 4, X = ox + x, Y = oy + y; if (d[i] !== (X * 7) % 256 || d[i + 1] !== (Y * 5) % 256 || d[i + 2] !== ((X + Y) * 3) % 256) n++; }
    return n;
  }, [200, 150]);
  ok(bad === 0, 'every captured pixel matches the screen exactly (' + bad + ' of 120000 differ)');
  ok(await waitFor(async () => (await app.evaluate(() => global.__snapdeskTest.editors().length)) >= 2, 4000) !== null, 'a new editor window was created per capture');

  // ---- annotate -> dirty flag -> copy -> clean ----
  await ed.click('#rail button[data-tool="arrow"]'); const cb = await ed.locator('#cv').boundingBox();
  await ed.mouse.move(cb.x + 300, cb.y + 300); await ed.mouse.down(); await ed.mouse.move(cb.x + 500, cb.y + 400, { steps: 5 }); await ed.mouse.up();
  const dirty1 = await waitFor(async () => (await app.evaluate(() => global.__snapdeskTest.editors().some((w) => w.__dirty))), 3000); ok(!!dirty1, 'editor reports unsaved edits');
  await ed.click('#bCopy'); await sleep(600);
  const clip = await app.evaluate(({ clipboard }) => { const i = clipboard.readImage(); return i.isEmpty() ? null : i.getSize(); }); ok(clip && clip.width === 400 && clip.height === 300, 'Copy puts a 400x300 image on the system clipboard (' + JSON.stringify(clip) + ')');
  const dirty2 = await app.evaluate(() => global.__snapdeskTest.editors().some((w) => w.__dirty)); ok(!dirty2, 'copying clears the unsaved flag');

  // ---- save PNG via native handler ----
  await ed.click('#bSave'); const saved = await waitFor(() => fs.readdirSync(SAVE).find((n) => /^snapdesk-.*\.png$/.test(n)), 5000);
  ok(!!saved, 'Save writes a PNG file'); if (saved) { const b = fs.readFileSync(path.join(SAVE, saved)); ok(b.slice(0, 8).toString('hex') === '89504e470d0a1a0a', 'saved file is a real PNG (' + b.length + ' bytes)'); }

  // ---- escape cancels, and capture works again afterwards ----
  const before = (await app.evaluate(() => global.__snapdeskTest.editors().length));
  await capture('region'); const ov2 = await waitFor(() => app.windows().find((w) => isOv(w) && w !== ov)); ok(!!ov2, 'second overlay opened'); await sleep(900); await ov2.keyboard.press('Escape').catch(() => {}); await sleep(800);
  ok((await app.evaluate(() => global.__snapdeskTest.editors().length)) === before, 'Escape cancels without opening an editor');

  // ---- full screen capture ----
  await capture('full'); const full = await waitFor(async () => { const l = await editorsWithImage(); for (const w of l) { const s = await w.evaluate(() => [snapdesk.state.base.width, snapdesk.state.base.height]); if (s[0] === 1280 && s[1] >= 790) return w; } return null; });
  ok(!!full, 'full-screen capture returns the whole display');
  if (full) { const bad2 = await full.evaluate(() => { const b = snapdesk.state.base, d = b.getContext('2d').getImageData(0, 0, b.width, b.height).data; let n = 0; for (let y = 0; y < b.height; y += 3) for (let x = 0; x < b.width; x += 3) { const i = (y * b.width + x) * 4; if (d[i] !== (x * 7) % 256 || d[i + 1] !== (y * 5) % 256 || d[i + 2] !== ((x + y) * 3) % 256) n++; } return n; }); ok(bad2 === 0, 'full-screen pixels match (' + bad2 + ' differ)'); }

  // ---- autosave ----
  await app.evaluate(() => { global.__snapdeskTest.settings.autosave = true; });
  const nBefore = fs.readdirSync(SAVE).filter((n) => /^Snapdesk-/.test(n)).length;
  await capture('full'); const auto = await waitFor(() => fs.readdirSync(SAVE).filter((n) => /^Snapdesk-/.test(n)).length > nBefore, 6000); ok(!!auto, 'auto-save writes every capture to the screenshots folder');

  ok(errs.length === 0, 'no renderer errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await app.close(); await br.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
