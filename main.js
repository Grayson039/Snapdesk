'use strict';
// Snapdesk desktop shell. Offline: the only things this process does are capture the screen, show the editor,
// copy/save files you ask it to, and sit in the tray. It makes no network requests.
const { app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen, ipcMain, clipboard, nativeImage, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const TEST = process.env.SNAPDESK_TEST === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ICON = path.join(__dirname, 'assets', 'icon.png');
const TRAY = path.join(__dirname, 'assets', 'tray.png');

if (!TEST && !app.requestSingleInstanceLock()) { app.quit(); }

let tray = null, capturing = false, quitting = false, settings = { autosave: false };
const hotkeyStatus = {};

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { settings = Object.assign({ autosave: false }, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch (e) { /* first run */ } }
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (e) { /* ignore */ } }
const shotsDir = () => (TEST && process.env.SNAPDESK_SAVE_DIR) || path.join(app.getPath('pictures'), 'Snapdesk');
function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }

// ---------- editor windows ----------
function isEditor(wc) { try { return wc.getURL().endsWith('/editor.html'); } catch (e) { return false; } }
function editors() { return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && isEditor(w.webContents)); }

function openEditor(png) {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 920, minHeight: 600, show: false, backgroundColor: '#0a0c10', title: 'Snapdesk', icon: ICON, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: !app.isPackaged }
  });
  win.setMenuBarVisibility(false);
  win.__dirty = false;
  win.loadFile('editor.html');
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.webContents.on('did-finish-load', () => { if (png) win.webContents.send('image', png); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (win.__dirty && !quitting && !TEST) {
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Discard changes', 'Keep editing'], defaultId: 1, cancelId: 1, title: 'Snapdesk', message: 'Close without saving?', detail: 'This image has edits you have not saved or copied.' });
      if (r === 1) e.preventDefault();
    }
  });
  return win;
}
function showEditor() {
  const list = editors();
  if (list.length) { const w = list[list.length - 1]; if (w.isMinimized()) w.restore(); w.show(); w.focus(); return w; }
  return openEditor(null);
}

// ---------- screen capture ----------
async function grabDisplays() {
  const displays = screen.getAllDisplays(), out = [];
  for (let i = 0; i < displays.length; i++) {
    const d = displays[i], w = Math.round(d.size.width * d.scaleFactor), h = Math.round(d.size.height * d.scaleFactor);
    const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
    const s = srcs.find((x) => x.display_id === String(d.id)) || srcs[i] || srcs[0];
    if (!s || s.thumbnail.isEmpty()) throw new Error('Could not read the screen. Check Windows privacy settings.');
    out.push({ display: d, img: s.thumbnail });
  }
  return out;
}

function runOverlay(shots) {
  return new Promise((resolve) => {
    const wins = []; let done = false, timer = null;
    const finish = (v) => {
      if (done) return; done = true; clearTimeout(timer); ipcMain.removeListener('overlay-done', onDone);
      wins.forEach((w) => { try { w.destroy(); } catch (e) { /* gone */ } }); resolve(v);
    };
    const onDone = (e, p) => {
      const idx = wins.findIndex((w) => !w.isDestroyed() && w.webContents === e.sender); if (idx < 0) return;
      if (!p || typeof p !== 'object') return finish(null);
      finish({ index: idx, full: !!p.full, x: +p.x || 0, y: +p.y || 0, w: +p.w || 0, h: +p.h || 0, vw: +p.vw || 1, vh: +p.vh || 1 });
    };
    ipcMain.on('overlay-done', onDone);
    shots.forEach((s) => {
      const b = s.display.bounds;
      const w = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height, frame: false, show: false, resizable: false, movable: false, minimizable: false, maximizable: false,
        fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#000000', enableLargerThanScreen: true,
        webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false }
      });
      w.setBounds(b); w.setAlwaysOnTop(true, 'screen-saver');
      w.loadFile('overlay.html');
      w.webContents.once('did-finish-load', () => {
        const size = s.img.getSize();
        w.webContents.send('shot', { jpg: s.img.toJPEG(92), imgW: size.width, imgH: size.height });
        w.show(); w.focus();
      });
      wins.push(w);
    });
    timer = setTimeout(() => finish(null), 120000);
  });
}

async function startCapture(mode, delay) {
  if (capturing) return null; capturing = true;
  const hidden = [];
  let result = null;
  try {
    BrowserWindow.getAllWindows().forEach((w) => { if (w.isVisible()) { hidden.push(w); w.hide(); } });
    await sleep(hidden.length ? 320 : 80);
    if (delay > 0) await sleep(delay * 1000);
    const shots = await grabDisplays();
    let png = null;
    if (mode === 'full') {
      const cur = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const s = shots.find((x) => x.display.id === cur.id) || shots[0]; png = s.img.toPNG();
    } else {
      const r = await runOverlay(shots);
      if (r) {
        const s = shots[r.index], size = s.img.getSize();
        if (r.full) png = s.img.toPNG();
        else {
          const sx = size.width / r.vw, sy = size.height / r.vh;
          const x = Math.max(0, Math.round(r.x * sx)), y = Math.max(0, Math.round(r.y * sy));
          const w = Math.min(size.width - x, Math.max(1, Math.round(r.w * sx))), h = Math.min(size.height - y, Math.max(1, Math.round(r.h * sy)));
          png = s.img.crop({ x, y, width: w, height: h }).toPNG();
        }
      }
    }
    if (png) {
      result = png;
      if (settings.autosave) { try { fs.mkdirSync(shotsDir(), { recursive: true }); fs.writeFileSync(path.join(shotsDir(), 'Snapdesk-' + stamp() + '.png'), png); } catch (e) { /* disk full etc: editor still opens */ } }
      openEditor(png);
    } else hidden.forEach((w) => { if (!w.isDestroyed()) w.show(); });
  } catch (err) {
    hidden.forEach((w) => { if (!w.isDestroyed()) w.show(); });
    dialog.showErrorBox('Snapdesk could not capture the screen', String(err && err.message || err));
  } finally { capturing = false; }
  return result;
}

// ---------- IPC (only from our own editor windows) ----------
function fromEditor(e) { try { return isEditor(e.sender); } catch (err) { return false; } }
const asBuffer = (b) => (b && (b instanceof Uint8Array || Buffer.isBuffer(b)) && b.length > 0 && b.length < 300 * 1024 * 1024) ? Buffer.from(b) : null;

ipcMain.handle('capture', (e, delay) => { if (!fromEditor(e)) return false; startCapture('region', Math.max(0, Math.min(30, parseInt(delay, 10) || 0))); return true; });
ipcMain.handle('copy-png', (e, bytes) => {
  if (!fromEditor(e)) return false; const buf = asBuffer(bytes); if (!buf) return false;
  const img = nativeImage.createFromBuffer(buf); if (img.isEmpty()) return false; clipboard.writeImage(img); return true;
});
ipcMain.handle('read-clipboard-image', (e) => { if (!fromEditor(e)) return null; const img = clipboard.readImage(); return img.isEmpty() ? null : img.toPNG(); });
ipcMain.handle('save-file', async (e, bytes, name, ext) => {
  if (!fromEditor(e)) return null; const buf = asBuffer(bytes); if (!buf) return null;
  ext = ['png', 'jpg', 'snapdesk'].includes(String(ext)) ? String(ext) : 'png';
  const base = path.basename(String(name || 'snapdesk.' + ext)).replace(/[^\w.\- ]/g, '_');
  const win = BrowserWindow.fromWebContents(e.sender);
  let target;
  if (TEST) target = path.join(shotsDir(), base);
  else {
    try { fs.mkdirSync(shotsDir(), { recursive: true }); } catch (err) { /* ignore */ }
    const r = await dialog.showSaveDialog(win, { title: 'Save', defaultPath: path.join(shotsDir(), base), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return null; target = r.filePath;
  }
  try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, buf); return target; } catch (err) { dialog.showErrorBox('Could not save', String(err.message || err)); return null; }
});
ipcMain.on('set-dirty', (e, d) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && fromEditor(e)) w.__dirty = !!d; });
ipcMain.handle('info', (e) => (fromEditor(e) ? { hotkeys: hotkeyStatus, autosave: settings.autosave, folder: shotsDir() } : null));

// ---------- tray + hotkeys ----------
function printScreenHelp() {
  dialog.showMessageBox({
    type: 'info', title: 'Use PrintScreen with Snapdesk', buttons: ['Open that Windows setting', 'Close'], defaultId: 0, cancelId: 1,
    message: hotkeyStatus.printscreen ? 'PrintScreen is set to capture a region with Snapdesk.' : 'Snapdesk could not claim PrintScreen yet.',
    detail: 'Windows opens its own Snipping Tool when you press PrintScreen. To let Snapdesk have the key, turn that off:\n\nSettings > Accessibility > Keyboard > \"Use the Print screen button to open screen capture\" > Off.\n\nSnapdesk notices the change within a few seconds, so no restart is needed.'
  }).then((r) => { if (r.response === 0) shell.openExternal('ms-settings:easeofaccess-keyboard'); }).catch(() => {});
}
let refreshTray = () => {};
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY));
  const rebuild = () => {
    tray.setToolTip('Snapdesk: ' + (hotkeyStatus.region ? 'Ctrl+Shift+X to capture' : 'right-click for options'));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Capture a region', accelerator: 'Ctrl+Shift+X', click: () => startCapture('region', 0) },
      { label: 'Capture the whole screen', accelerator: 'Ctrl+Shift+Z', click: () => startCapture('full', 0) },
      { label: 'Open the editor', click: () => showEditor() },
      { type: 'separator' },
      { label: hotkeyStatus.printscreen ? 'PrintScreen captures a region (on)' : 'PrintScreen: not active yet. How to fix...', click: () => printScreenHelp() },
      { label: 'Auto-save every capture', type: 'checkbox', checked: !!settings.autosave, click: (m) => { settings.autosave = m.checked; saveSettings(); } },
      { label: 'Open the screenshots folder', click: () => { try { fs.mkdirSync(shotsDir(), { recursive: true }); } catch (e) { /* ignore */ } shell.openPath(shotsDir()); } },
      { type: 'separator' },
      { label: 'Quit Snapdesk', click: () => { quitting = true; app.quit(); } }
    ]));
  };
  refreshTray = rebuild; rebuild(); tray.on('click', () => showEditor());
}
function registerHotkeys() {
  const reg = (name, key, fn) => { let ok = false; try { ok = globalShortcut.register(key, fn); } catch (e) { ok = false; } hotkeyStatus[name] = ok ? key : null; };
  reg('region', 'CommandOrControl+Shift+X', () => startCapture('region', 0));
  reg('full', 'CommandOrControl+Shift+Z', () => startCapture('full', 0));
  tryPrintScreen();
  // Windows may hold PrintScreen for its own Snipping Tool. Keep trying quietly so a changed setting takes effect without a restart.
  if (!hotkeyStatus.printscreen) { psTimer = setInterval(() => { if (tryPrintScreen()) { clearInterval(psTimer); psTimer = null; } }, 4000); if (psTimer.unref) psTimer.unref(); }
}
let psTimer = null;
function tryPrintScreen() {
  if (hotkeyStatus.printscreen) return true;
  let ok = false; try { ok = globalShortcut.register('PrintScreen', () => startCapture('region', 0)); } catch (e) { ok = false; }
  hotkeyStatus.printscreen = ok ? 'PrintScreen' : null; if (ok) refreshTray(); return ok;
}

// ---------- lifecycle ----------
app.whenReady().then(() => {
  loadSettings();
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => cb({ cancel: true })); // belt and braces: no network, ever
  app.on('web-contents-created', (_e, wc) => { wc.on('will-attach-webview', (ev) => ev.preventDefault()); });
  try { buildTray(); } catch (e) { /* no tray available */ }
  registerHotkeys();
  if (!process.argv.includes('--background')) openEditor(null);
  if (TEST) global.__snapdeskTest = { startCapture, editors, hotkeyStatus, get tray() { return tray; }, settings };
});
app.on('second-instance', () => showEditor());
app.on('window-all-closed', () => { /* stay in the tray so the hotkey keeps working */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
