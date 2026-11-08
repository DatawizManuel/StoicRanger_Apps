/* Stoic Ranger Map Manager — Electron main process: the window and the bridge to lib/core.js. */
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path'), fs = require('fs');
const { Core } = require('./lib/core');

let win, core, job = null;
app.setName("Stoic Ranger Map Manager");
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win){ if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow(){
  core = new Core({ configDir: app.getPath("userData"), tmpDir: path.join(app.getPath("temp"), "sr-map-manager") });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, title: "Stoic Ranger Map Manager", backgroundColor: "#f4f1ea",
    icon: path.join(__dirname, "res", "icon.png"), webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, "www", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.on("close", e => { if (job && dialog.showMessageBoxSync(win, { type: "question", buttons: ["Keep downloading", "Stop and close"], defaultId: 0, message: "A map is still downloading. Stop it and close?" }) === 0) e.preventDefault(); else if (job) job.ac.abort(); });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };
const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => { try { return { ok: true, v: await fn(...a) }; } catch(err){ return { ok: false, error: err.message }; } });

handle("state", () => ({ cfg: core.cfg, folder: core.folderState(), catalog: core.catalog(), regions: core.regions(), job: job ? job.state : null, version: app.getVersion() }));
handle("saveSettings", patch => core.saveCfg(patch));
handle("pickFolder", async () => { const r = await dialog.showOpenDialog(win, { title: "The maps folder inside your Nextcloud folder", properties: ["openDirectory", "createDirectory"], defaultPath: core.cfg.folder || app.getPath("home") }); return r.canceled ? null : r.filePaths[0]; });
handle("openFolder", () => { core.ensureFolder(); return shell.openPath(core.cfg.folder); });
handle("estimate", id => core.estimate(id));
handle("updates", () => core.updates());
handle("remove", id => core.remove(id));
handle("download", ids => {
  if (job) throw new Error("A download is already running.");
  const ac = new AbortController(); job = { ac, state: { queue: ids.slice(), current: null, done: [], failed: [] } };
  (async () => {
    for (const id of ids){
      if (ac.signal.aborted) break;
      job.state.current = id; job.state.queue = job.state.queue.filter(x => x !== id);
      try { await core.download(id, p => { job.state.progress = p; send("progress", job.state); }, ac.signal); job.state.done.push(id); }
      catch(e){ job.state.failed.push({ id, error: e.message === "cancelled" || ac.signal.aborted ? "Stopped." : e.message }); }
      send("progress", job.state);
    }
    const st = job.state; job = null; st.current = null; st.finished = true; send("progress", st);
  })();
  return true;
});
handle("cancel", () => { if (job) job.ac.abort(); return true; });
handle("mapRead", (file, offset, length) => {
  const fd = fs.openSync(core.mapPath(file), "r"); try { const b = Buffer.alloc(length); const n = fs.readSync(fd, b, 0, length, offset); return b.subarray(0, n); } finally { fs.closeSync(fd); }
});
handle("routes", () => core.routes());
handle("saveRoute", (name, gpx, oldFile) => core.saveRoute(name, gpx, oldFile));
handle("deleteRoute", file => core.deleteRoute(file));
handle("exportRoute", async (name, gpx) => { const r = await dialog.showSaveDialog(win, { title: "Export route as GPX", defaultPath: path.join(app.getPath("documents"), name.replace(/[\\/:*?"<>|]+/g, " ") + ".gpx"), filters: [{ name: "GPX route", extensions: ["gpx"] }] }); if (r.canceled) return null; fs.writeFileSync(r.filePath, gpx); return r.filePath; });
handle("importRoute", async () => { const r = await dialog.showOpenDialog(win, { title: "Import a GPX file", filters: [{ name: "GPX", extensions: ["gpx"] }], properties: ["openFile"] }); if (r.canceled) return null; const f = r.filePaths[0]; if (fs.statSync(f).size > 5e6) throw new Error("This file is too big for a route."); return { name: path.basename(f).replace(/\.gpx$/i, ""), gpx: fs.readFileSync(f, "utf8") }; });
