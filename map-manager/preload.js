/* Stoic Ranger Map Manager — the page's only way to the computer: window.mm (all calls return {ok, v | error}). */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld("mm", {
  state: () => call("state"), saveSettings: p => call("saveSettings", p), pickFolder: () => call("pickFolder"), openFolder: () => call("openFolder"),
  estimate: id => call("estimate", id), updates: () => call("updates"), remove: id => call("remove", id),
  download: ids => call("download", ids), cancel: () => call("cancel"), onProgress: fn => ipcRenderer.on("progress", (e, d) => fn(d)),
  mapRead: async (file, offset, length) => { const r = await call("mapRead", file, offset, length); if (!r.ok) throw new Error(r.error); const b = r.v; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  routes: () => call("routes"), saveRoute: (n, g, o) => call("saveRoute", n, g, o), deleteRoute: f => call("deleteRoute", f),
  exportRoute: (n, g) => call("exportRoute", n, g), importRoute: () => call("importRoute"),
});
