/* Stoic Ranger Dashboard for Windows (0.1.0). Shows one overview of all Stoic Ranger apps from the shared
   database.xlsx. READ ONLY: this shell only ever reads the file (fs.readFile); there is no code path that writes,
   moves or deletes it. The page code is www/ (js/data.js reads the sheets, js/app.js draws the pages).
   The file is read at start, when it changes (its size/time is checked every 10 s, e.g. after the Nextcloud desktop
   client brought a new copy), when the window comes to the front, and with Reload (F5).
   Settings (file path, window, theme, units, apps shown) live in %APPDATA%\Stoic Ranger Dashboard\config.json. */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WWW = path.join(__dirname, 'www');
const ORIGIN = 'app://srd';
const CFG = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { xlsx: '', pending: '', bounds: null, maximized: false, theme: 'system', units: 'metric', apps: null, start: 'overview', period: 'year', laneRange: 'h', laneStep: 'day' };
let win = null, seen = '';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const readText = f => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } };
function loadCfg() { try { Object.assign(cfg, JSON.parse(readText(CFG()) || '{}')); } catch { } }
function saveCfg() {   // only the dashboard's own config.json is ever written
  try { fs.mkdirSync(path.dirname(CFG()), { recursive: true }); const t = CFG() + '.tmp'; fs.writeFileSync(t, JSON.stringify(cfg, null, 1)); fs.renameSync(t, CFG()); } catch { }
}

/* ---------- the file (read only) ---------- */
const sig = s => s ? s.size + ':' + Math.round(s.mtimeMs) : '';
function fileInfo() {
  if (!cfg.xlsx) return null;
  try { const s = fs.statSync(cfg.xlsx); return { path: cfg.xlsx, name: path.basename(cfg.xlsx), size: s.size, mtime: Math.round(s.mtimeMs) }; }
  catch { return { path: cfg.xlsx, name: path.basename(cfg.xlsx), size: 0, mtime: 0, missing: true }; }
}
async function readFile() {
  const f = fileInfo();
  if (!f) return { ok: false, msg: '' };
  if (f.missing) return { ok: false, file: f, msg: `${f.path} was not found. It may have been moved or renamed, or the drive is not connected. Choose the file again under Data file.` };
  // Excel may be saving it right now: try a few times; a half-written file is refused by the page (not a zip)
  for (let i = 0; i < 4; i++) {
    try { const bytes = await fs.promises.readFile(f.path); seen = sig(fs.statSync(f.path)); return { ok: true, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), file: fileInfo() }; }
    catch (e) { if (i === 3) return { ok: false, file: f, msg: /EBUSY|EPERM|EACCES/.test(String(e.code)) ? `${f.name} is locked by another program. It is read again automatically.` : String(e.message) }; await new Promise(r => setTimeout(r, 700)); }
  }
}
function watch() {
  setInterval(() => {
    if (!win || !cfg.xlsx) return;
    let s = ''; try { s = sig(fs.statSync(cfg.xlsx)); } catch { }
    if (s && seen && s !== seen) { seen = s; win.webContents.send('srd:changed'); }
  }, 10000);
}
async function choose() {
  const r = await dialog.showOpenDialog(win, { title: 'Choose your database.xlsx', defaultPath: cfg.xlsx ? path.dirname(cfg.xlsx) : guessDir(),
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  cfg.xlsx = r.filePaths[0]; cfg.pending = ''; seen = ''; saveCfg();
  return { ok: true, path: cfg.xlsx };
}
/** Where the SR Shooting Windows app keeps its file, then the usual Nextcloud and project folders. */
function guessDir() {
  const home = app.getPath('home'), c = [];
  try { const sr = JSON.parse(readText(path.join(app.getPath('appData'), 'Stoic Ranger', 'config.json')) || '{}'); if (sr.xlsx) c.push(path.dirname(sr.xlsx)); } catch { }
  c.push(path.join(home, 'Nextcloud', 'Stoic Ranger'), path.join(home, 'Nextcloud'));
  for (const b of ['D:\\Claude\\12_Stoic Ranger Apps', path.join(home, 'Desktop', 'Wichtig', 'Claude', '12_Stoic Ranger Apps')]) c.push(path.join(b, '01_SR Shooting', '02_Data', 'pc-dashboard', '03_registry'));
  c.push(app.getPath('documents'));
  return c.find(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }) || home;
}

/* ---------- calls from the page ---------- */
const CALLS = {
  version: () => app.getVersion(),
  getCfg: () => ({ theme: cfg.theme, units: cfg.units, apps: cfg.apps, start: cfg.start, period: cfg.period, laneRange: cfg.laneRange, laneStep: cfg.laneStep }),
  setCfg: o => { if (o && typeof o === 'object') { for (const k of ['theme', 'units', 'apps', 'start', 'period', 'laneRange', 'laneStep']) if (k in o) cfg[k] = o[k]; saveCfg(); } return true; },
  setTheme: t => { nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system'; return true; },
};
ipcMain.on('srd', (e, m, a) => { try { e.returnValue = CALLS[m] ? CALLS[m](...(a || [])) : null; } catch (err) { e.returnValue = null; } });
ipcMain.handle('srd:read', () => readFile());
ipcMain.handle('srd:choose', () => choose());
ipcMain.handle('srd:excel', async () => { if (!cfg.xlsx) return { ok: false, msg: 'No file chosen.' }; const err = await shell.openPath(cfg.xlsx); return err ? { ok: false, msg: err } : { ok: true }; });
ipcMain.handle('srd:folder', () => { if (cfg.xlsx) shell.showItemInFolder(cfg.xlsx); return true; });

/* ---------- window ---------- */
function create() {
  const b = cfg.bounds || { width: 1360, height: 900 };
  win = new BrowserWindow(Object.assign({}, b, { minWidth: 760, minHeight: 520, show: false, title: 'Stoic Ranger Dashboard', backgroundColor: nativeTheme.shouldUseDarkColors ? '#141612' : '#f8f7f3',
    icon: path.join(__dirname, 'res', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: false } }));
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  const keep = () => { if (!win.isMaximized() && !win.isMinimized()) cfg.bounds = win.getBounds(); cfg.maximized = win.isMaximized(); };
  win.on('resize', keep); win.on('move', keep);
  win.on('close', () => { keep(); saveCfg(); });
  win.on('focus', () => { let s = ''; try { s = sig(fs.statSync(cfg.xlsx)); } catch { } if (s && seen && s !== seen) { seen = s; win.webContents.send('srd:changed'); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
  win.loadURL(ORIGIN + '/www/index.html');
}
app.whenReady().then(() => {
  protocol.handle('app', req => {
    const u = new URL(req.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const f = path.normalize(path.join(__dirname, rel));
    if (!f.startsWith(WWW + path.sep)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(f).toString());
  });
  loadCfg();
  if (cfg.pending && !cfg.xlsx) { cfg.xlsx = cfg.pending; cfg.pending = ''; saveCfg(); }   // set by the installer
  nativeTheme.themeSource = ['light', 'dark'].includes(cfg.theme) ? cfg.theme : 'system';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Choose database.xlsx…', accelerator: 'Ctrl+O', click: async () => { const r = await choose(); if (r.ok) win.webContents.send('srd:changed'); } },
      { label: 'Read again', accelerator: 'F5', click: () => win.webContents.send('srd:changed') },
      { label: 'Open database.xlsx in Excel', click: () => cfg.xlsx && shell.openPath(cfg.xlsx) }, { type: 'separator' }, { role: 'quit', label: 'Exit' }] },
    { label: 'View', submenu: [{ role: 'zoomIn', accelerator: 'Ctrl+=' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools', visible: false }] },
  ]));
  create(); watch();
});
app.on('window-all-closed', () => app.quit());
