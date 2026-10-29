/* window.SRNative for the Windows app: the same calls MainActivity.java offers on Android (see sr/hub.js), done by
   main.js. Calls that return a value are synchronous (like Android's @JavascriptInterface); file dialogs answer
   through window.SRNativeCallback(id, {ok, msg, data}) like on the phone. */
const { ipcRenderer } = require('electron');

const sync = m => (...a) => ipcRenderer.sendSync('sr', m, a);
const answer = (cb, r) => setTimeout(() => window.SRNativeCallback && window.SRNativeCallback(cb, r), 0);
const EXT = { 'application/json': 'json', 'text/plain': 'txt', 'text/csv': 'csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };

/* printing: A4 (or A5/A6 dope cards) through the Windows print dialog ("Microsoft Print to PDF" saves a PDF) */
function print(html, job, size) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  const page = `<style>@page{size:${size || 'A4'} portrait;margin:0}</style>`;
  f.srcdoc = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, page + '</head>') : page + html;
  f.onload = () => setTimeout(() => {
    try { f.contentWindow.document.title = job || document.title; f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.error(e); }
    setTimeout(() => f.remove(), 60000);
  }, 400);
  document.body.appendChild(f);
}

window.SRNative = {
  loadDb: sync('loadDb'), saveDb: sync('saveDb'), backupDb: sync('backupDb'), loadDbBackup: sync('loadDbBackup'),
  loadData: sync('loadData'), saveData: sync('saveData'), backupData: sync('backupData'), loadDataBackup: sync('loadDataBackup'),
  isNight: sync('isNight'), getSecret: sync('getSecret'), setSecret: sync('setSecret'), appInfo: sync('appInfo'),
  xlsxInfo: sync('xlsxInfo'), xlsxRead: sync('xlsxRead'), xlsxWrite: sync('xlsxWrite'), xlsxUnlink: sync('xlsxUnlink'),
  xlsxLink: (mode, cb) => { ipcRenderer.invoke('sr:xlsxLink', mode).then(r => answer(cb, r), e => answer(cb, { ok: false, msg: e.message })); },
  saveFile: (name, mime, b64, cb) => { ipcRenderer.invoke('sr:saveFile', name, b64).then(r => answer(cb, r), e => answer(cb, { ok: false, msg: e.message })); },
  shareFile: (name, mime, b64) => { ipcRenderer.invoke('sr:saveFile', name, b64); },
  shareText: sync('shareText'),
  openFile: (mimes, cb) => {
    const exts = [...new Set(String(mimes || '').split(',').map(m => EXT[m.trim()]).filter(Boolean))];
    ipcRenderer.invoke('sr:openFile', exts).then(r => answer(cb, r), e => answer(cb, { ok: false, msg: e.message }));
  },
  print: (html, job) => print(html, job, 'A4'),
  printSized: (html, job, size) => print(html, job, /^A[456]$/.test(size) ? size : 'A4'),
};
