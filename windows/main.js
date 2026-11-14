/* Stoic Ranger for Windows (1.1.0). The same app as on Android and iPhone: the page code is the Android app's
   www folder (copied into the package at build time), with this shell standing in for the Android one
   (window.SRNative, see preload.js). The app keeps its own copy of the data in %APPDATA%\Stoic Ranger\data
   (db.json with the same rules as on the phone: atomic writes, previous copy, backups) and works from and into the
   shared database.xlsx the user picked (Data page, or the installer): changes in the file come in when the window
   comes back to the front, the app's changes go out when the window loses focus or closes. A backup of the file
   goes to <folder of database.xlsx>\backups before every write; if Excel has the file open, the write waits.
   Settings (database.xlsx path, window size, theme) live in %APPDATA%\Stoic Ranger\config.json. */
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, protocol, net, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WWW = path.join(__dirname, 'www');
const ORIGIN = 'app://sr';
const HOME = ORIGIN + '/www/index.html';
const DASH = 'Stoic-Ranger-Dashboard.html';
const CFG = () => path.join(app.getPath('userData'), 'config.json');
const DATA = () => path.join(app.getPath('userData'), 'data');
let cfg = { xlsx: '', pending: '', asked: false, bounds: null, maximized: false, theme: 'system', zoom: 0 };
let win = null, closing = false;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const readText = f => { try { return fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); } catch { return ''; } };
function loadCfg() { try { Object.assign(cfg, JSON.parse(readText(CFG()) || '{}')); } catch { } }
function saveCfg() { try { writeAtomic(CFG(), JSON.stringify(cfg, null, 1)); } catch { } }
function writeAtomic(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.sr-tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, f); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}
/** Keeps the newest n files of a folder whose names start with prefix (never touches other files). */
function prune(dir, prefix, n) {
  try {
    const all = fs.readdirSync(dir).filter(f => f.startsWith(prefix)).map(f => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    all.slice(n).forEach(f => { try { fs.unlinkSync(f); } catch { } });
  } catch { }
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/* ---------- the app's own files (same as MainActivity.java) ---------- */
const DATANAMES = ['thoughts', 'xlsxbase'];
const safe = n => !!n && !/[\\/]|\.\./.test(n);
function dataFile(n) { return path.join(DATA(), n); }
function saveFile(base, json) {
  const f = dataFile(base + '.json'), bak = dataFile(base + '.bak.json');
  try {
    fs.mkdirSync(DATA(), { recursive: true });
    const tmp = f + '.sr-tmp', fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, Buffer.from(String(json), 'utf8')); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(f)) { try { fs.unlinkSync(bak); } catch { } fs.renameSync(f, bak); }
    fs.renameSync(tmp, f);
    return true;
  } catch { return false; }
}
function backupFile(base, dir, name) {
  const src = dataFile(base + '.json');
  if (!fs.existsSync(src) || !safe(name)) return false;
  try { const d = dataFile(dir); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(src, path.join(d, name)); prune(d, '', 10); return true; } catch { return false; }
}

/* ---------- the shared database.xlsx ---------- */
function xlsxInfo() {
  if (!cfg.xlsx) return { linked: false };
  try { const s = fs.statSync(cfg.xlsx); return { linked: true, name: path.basename(cfg.xlsx), path: cfg.xlsx, size: s.size, mtime: Math.round(s.mtimeMs) }; }
  catch { return { linked: true, name: path.basename(cfg.xlsx), path: cfg.xlsx, size: 0, mtime: 0, missing: true }; }
}
function xlsxWrite(b64) {
  if (!cfg.xlsx) return { ok: false, msg: 'no file linked' };
  const f = cfg.xlsx, bytes = Buffer.from(b64, 'base64');
  try {
    if (fs.existsSync(f) && fs.statSync(f).size > 0) {
      const d = path.join(path.dirname(f), 'backups');
      fs.mkdirSync(d, { recursive: true });
      fs.copyFileSync(f, path.join(d, `database_before-app_${stamp()}.xlsx`));
      prune(d, 'database_before-app_', 30);
    }
    writeAtomic(f, bytes);
    const s = fs.statSync(f);
    return { ok: true, size: s.size, mtime: Math.round(s.mtimeMs) };
  } catch (e) {
    const busy = /EBUSY|EPERM|EACCES/.test(String(e.code || e.message));
    return { ok: false, msg: busy ? `${path.basename(f)} is open in Excel (or locked). Close it there; the app saves again when you leave a part or switch windows.` : String(e.message) };
  }
}
/** "create": a new database.xlsx (never over an existing file); "open": an existing one; "pending": the one the installer set up. */
async function xlsxLink(mode) {
  let f = '';
  if (mode === 'pending') f = cfg.pending;
  else if (mode === 'create') {
    const r = await dialog.showSaveDialog(win, { title: 'Where should the new database.xlsx go?', defaultPath: path.join(guessDir() || app.getPath('documents'), 'database.xlsx'),
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }], properties: ['createDirectory'] });
    if (r.canceled || !r.filePath) return { ok: false, msg: 'cancelled' };
    f = r.filePath;
    if (fs.existsSync(f)) return { ok: false, msg: `There is a ${path.basename(f)} there already. It is never overwritten: use "Use an existing database.xlsx" to work with it.` };
  } else {
    const r = await dialog.showOpenDialog(win, { title: 'Choose your database.xlsx', defaultPath: guessDir() || app.getPath('documents'),
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, msg: 'cancelled' };
    f = r.filePaths[0];
  }
  if (!f) return { ok: false, msg: 'cancelled' };
  cfg.xlsx = f; cfg.pending = ''; cfg.asked = true; saveCfg(); buildMenu();
  return { ok: true, msg: path.basename(f) };
}
/** Usual places of the data folder (the new project folder first, then the 0.1.0 one). */
function guessDir() {
  if (cfg.xlsx) return path.dirname(cfg.xlsx);
  const home = app.getPath('home'), c = [];
  for (const b of [path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'Documents'), home]) {
    c.push(path.join(b, 'Wichtig', 'Claude', '12_Stoic Ranger Apps', '02_shared', 'pc-dashboard', '03_registry'));
  }
  if (cfg.folder) c.push(path.join(cfg.folder, '03_registry'));
  return c.find(d => fs.existsSync(d)) || '';
}
/** The PC dashboard sits next to the data (pc-dashboard\Stoic-Ranger-Dashboard.html, database.xlsx in 03_registry). */
function dashboardFile() {
  if (!cfg.xlsx) return '';
  let d = path.dirname(cfg.xlsx);
  for (let i = 0; i < 3; i++, d = path.dirname(d)) { const f = path.join(d, DASH); if (fs.existsSync(f)) return f; }
  return '';
}

/* ---------- the bridge (preload.js calls these) ---------- */
const SYNC = {
  loadDb: () => readText(dataFile('db.json')) || readText(dataFile('db.bak.json')),
  saveDb: json => saveFile('db', json),
  backupDb: name => backupFile('db', 'backups', name),
  loadDbBackup: () => readText(dataFile('db.bak.json')),
  loadData: n => DATANAMES.includes(n) ? readText(dataFile(n + '.json')) || readText(dataFile(n + '.bak.json')) : '',
  saveData: (n, json) => DATANAMES.includes(n) && saveFile(n, json),
  backupData: (n, name) => DATANAMES.includes(n) && backupFile(n, 'backups-' + n, name),
  loadDataBackup: n => DATANAMES.includes(n) ? readText(dataFile(n + '.bak.json')) : '',
  isNight: () => nativeTheme.shouldUseDarkColors,
  getSecret: k => { try { return JSON.parse(readText(dataFile('secrets.json')) || '{}')[k] || ''; } catch { return ''; } },
  setSecret: (k, v) => { let o = {}; try { o = JSON.parse(readText(dataFile('secrets.json')) || '{}'); } catch { } o[k] = v; try { writeAtomic(dataFile('secrets.json'), JSON.stringify(o)); } catch { } return true; },
  appInfo: () => JSON.stringify({ version: app.getVersion(), code: 0, windows: true, device: 'Windows ' + require('os').release() }),
  xlsxInfo: () => JSON.stringify(xlsxInfo()),
  xlsxRead: () => { try { return cfg.xlsx ? fs.readFileSync(cfg.xlsx).toString('base64') : ''; } catch { return ''; } },
  xlsxWrite: b64 => JSON.stringify(xlsxWrite(b64)),
  xlsxUnlink: () => { cfg.xlsx = ''; cfg.pending = ''; saveCfg(); buildMenu(); return true; },
  shareText: (subject, text) => { clipboard.writeText(text || ''); return true; },
};
ipcMain.on('sr', (e, m, args) => {
  try { e.returnValue = SYNC[m] ? SYNC[m](...(args || [])) : null; } catch (err) { console.error(m, err); e.returnValue = null; }
});
ipcMain.handle('sr:xlsxLink', (_, mode) => xlsxLink(mode));
ipcMain.handle('sr:saveFile', async (_, name, b64) => {
  const r = await dialog.showSaveDialog(win, { title: 'Save ' + name, defaultPath: path.join(app.getPath('documents'), name) });
  if (r.canceled || !r.filePath) return { ok: false, msg: 'cancelled' };
  if (path.resolve(r.filePath) === path.resolve(cfg.xlsx || ' ')) return { ok: false, msg: 'That is the linked database.xlsx: the app keeps it up to date itself.' };
  try { writeAtomic(r.filePath, Buffer.from(b64, 'base64')); return { ok: true, msg: path.basename(r.filePath) }; } catch (e) { return { ok: false, msg: e.message }; }
});
ipcMain.handle('sr:openFile', async (_, exts) => {
  const r = await dialog.showOpenDialog(win, { title: 'Open', defaultPath: app.getPath('documents'), properties: ['openFile'],
    filters: exts && exts.length ? [{ name: exts.join(', '), extensions: exts }, { name: 'All files', extensions: ['*'] }] : [] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, msg: 'cancelled' };
  try { return { ok: true, msg: path.basename(r.filePaths[0]), data: fs.readFileSync(r.filePaths[0]).toString('base64') }; } catch (e) { return { ok: false, msg: e.message }; }
});

/* ---------- window ---------- */
const js = code => win && !win.isDestroyed() ? win.webContents.executeJavaScript(code, true).catch(() => null) : Promise.resolve(null);
const flush = () => js('window.SR && SR.flush ? JSON.stringify(SR.flush() || null) : null');
const back = () => js('window.SR && SR.back ? SR.back() : false');
function setTheme(t) { cfg.theme = t; nativeTheme.themeSource = t; saveCfg(); buildMenu(); }
function zoom(d) { cfg.zoom = d === 0 ? 0 : Math.max(-3, Math.min(4, (cfg.zoom || 0) + d)); win.webContents.setZoomLevel(cfg.zoom); saveCfg(); }

function buildMenu() {
  const t = cfg.theme, has = !!cfg.xlsx, dash = dashboardFile();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Home', accelerator: 'Alt+Home', click: () => win.loadURL(HOME) },
      { label: 'Data and database.xlsx', click: () => win.loadURL(HOME + '#/data') },
      { type: 'separator' },
      { label: 'Open database.xlsx in Excel', enabled: has, click: async () => { await flush(); shell.openPath(cfg.xlsx); } },
      { label: 'Show database.xlsx in Explorer', enabled: has, click: () => shell.showItemInFolder(cfg.xlsx) },
      { label: 'Open the PC dashboard (browser)', enabled: !!dash, click: async () => { await flush(); shell.openPath(dash); } },
      { type: 'separator' },
      { label: 'Exit', role: 'quit' },
    ] },
    { label: 'View', submenu: [
      { label: 'Back', accelerator: 'Alt+Left', click: back },
      { label: 'Reload', accelerator: 'F5', click: async () => { await flush(); win.reload(); } },
      { type: 'separator' },
      { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => zoom(1) },
      { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => zoom(-1) },
      { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
      { type: 'separator' },
      { label: 'Theme', submenu: [['system', 'Like Windows'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => ({ label: l, type: 'radio', checked: t === k, click: () => setTheme(k) })) },
      { label: 'Full screen', role: 'togglefullscreen' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Open the app data folder', click: () => shell.openPath(DATA()) },
      { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win.webContents.toggleDevTools() },
      { type: 'separator' },
      { label: 'About Stoic Ranger', click: () => dialog.showMessageBox(win, { type: 'info', title: 'About', icon: path.join(__dirname, 'res', 'icon.png'), message: `Stoic Ranger ${app.getVersion()}`,
        detail: `Gun Database, Training Log and Shooting Drills: the same app as on Android and iPhone.\n\ndatabase.xlsx:\n${cfg.xlsx || '(none linked yet: File › Data and database.xlsx)'}\n\nThe app's own copy of the data:\n${DATA()}` }) },
    ] },
  ]));
}

/** First start without a database.xlsx: ask once (the installer usually set one up already). */
async function firstStart() {
  if (cfg.pending && cfg.pending !== cfg.xlsx) {        // set up by the installer: link it (the first sync merges, nothing is lost)
    const res = await js("window.SR && SR.xlsx ? SR.xlsx.link('pending').then(r => JSON.stringify(r)) : null");
    let o = null; try { o = JSON.parse(res); } catch { }
    if (o && !o.ok) dialog.showMessageBox(win, { type: 'warning', title: 'Stoic Ranger', message: 'database.xlsx could not be linked', detail: String(o.msg || '') });
    else if (o) win.loadURL(HOME + '#/data');
    return;
  }
  if (cfg.xlsx) return;
  if (cfg.asked) return;
  cfg.asked = true; saveCfg();
  const r = await dialog.showMessageBox(win, { type: 'question', title: 'Stoic Ranger', message: 'Work with a database.xlsx?',
    detail: 'Stoic Ranger keeps its data in one database.xlsx that the phone, the iPhone web app and Excel can use too. Use your existing file (for example 02_shared\\pc-dashboard\\03_registry\\database.xlsx) or create a new one. You can change this later under File › Data and database.xlsx.',
    buttons: ['Use an existing database.xlsx', 'Create a new database.xlsx', 'Later'], defaultId: 0, cancelId: 2, noLink: true });
  if (r.response === 2) return;
  const res = await js(`window.SR && SR.xlsx && SR.xlsx.link('${r.response === 0 ? 'open' : 'create'}').then(r => JSON.stringify(r))`);
  let o = null; try { o = JSON.parse(res); } catch { }
  if (o && !o.ok && o.msg !== 'cancelled') dialog.showMessageBox(win, { type: 'warning', title: 'Stoic Ranger', message: o.msg });
  if (o && o.ok) win.loadURL(HOME + '#/data');
}

function createWindow() {
  const b = cfg.bounds || { width: 1100, height: 860 };
  win = new BrowserWindow({
    ...b, minWidth: 380, minHeight: 500, show: false, backgroundColor: nativeTheme.shouldUseDarkColors ? '#111111' : '#ffffff',
    title: 'Stoic Ranger', icon: path.join(__dirname, 'res', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  let first = true;
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomLevel(cfg.zoom || 0); if (first) { first = false; setTimeout(firstStart, 300); } });
  const keep = () => { if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) cfg.bounds = win.getBounds(); cfg.maximized = win.isMaximized(); };
  win.on('resize', keep); win.on('move', keep);
  // like the phone: changes go out when the window goes to the background or closes, and come in when it is back
  win.on('blur', () => { flush(); });
  win.on('focus', () => { js('window.SR && SR.onResume && SR.onResume()'); });
  win.on('close', e => {
    keep(); saveCfg();
    if (closing) return;
    e.preventDefault(); closing = true;
    Promise.race([flush(), new Promise(r => setTimeout(r, 4000))]).finally(() => win.destroy());
  });
  // mouse back button and the keyboard's Back key walk back like the phone's Back (never closes the app here)
  win.on('app-command', (e, cmd) => { if (cmd === 'browser-backward') back(); });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'BrowserBack') { e.preventDefault(); back(); } });
  win.on('page-title-updated', e => { e.preventDefault(); win.setTitle('Stoic Ranger'); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  nativeTheme.on('updated', () => js('window.SR && SR.onResume && SR.onResume()'));
  win.loadURL(HOME);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    app.setAppUserModelId('at.stoicranger.desktop');
    protocol.handle('app', req => {
      const u = new URL(req.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const f = path.join(__dirname, rel);
      if (!rel.startsWith('www/') || !f.startsWith(WWW + path.sep)) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(f).toString());
    });
    loadCfg(); nativeTheme.themeSource = cfg.theme || 'system';
    buildMenu(); createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
