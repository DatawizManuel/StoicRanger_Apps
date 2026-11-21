/* window.SRDN for the dashboard page: the few things only the Windows side can do (read the file, pick it, open it
   in Excel, keep the settings). Nothing here can write database.xlsx. */
const { ipcRenderer } = require('electron');
const sync = m => (...a) => ipcRenderer.sendSync('srd', m, a);
window.SRDN = {
  version: sync('version'), getCfg: sync('getCfg'), setCfg: sync('setCfg'), setTheme: sync('setTheme'),
  read: () => ipcRenderer.invoke('srd:read'),
  choose: () => ipcRenderer.invoke('srd:choose'),
  openExcel: () => ipcRenderer.invoke('srd:excel'),
  showFolder: () => ipcRenderer.invoke('srd:folder'),
  onChanged: cb => ipcRenderer.on('srd:changed', () => cb()),
};
