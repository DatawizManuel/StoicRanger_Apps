/* Stoic Ranger web apps (iPhone, iPad, any browser) — stands in for the Android shell (MainActivity.java,
   LinkProvider.java). The app code in android/<app>/app/src/main/assets/www runs unchanged: it talks to
   window.<P>Native exactly as on Android, and this file answers.

   Storage: IndexedDB "stoic-ranger" (one store "files", keys like "gundb/db.json"), plus a localStorage
   mirror of db.json when it fits, so a save that iOS cuts short still leaves a copy. The app's calls are
   synchronous (loadDb, saveDb …), so boot() loads this app's files and the other apps' link data into memory
   first, then loads the app scripts and fires DOMContentLoaded for them.

   Linking: the three apps live under one web address, so they share this storage when the browser allows it
   (the same browser, or Home Screen apps on iOS versions that share storage). The provider side of
   LinkProvider.java runs here against the other app's db.json, with the same rule: nothing but status is
   answered unless the user switched linking on in that app. Writes go to the other app's inbox file, which
   that app merges on its next start or return to the foreground (it owns its db.json, no write races). */
'use strict';
(() => {
const CFG = window.SR_WEB;                       // written by tools/build-web.mjs: {app, prefix, version, code, scripts}
const APP = CFG.app, P = CFG.prefix;
const IDB_NAME = 'stoic-ranger', STORE = 'files';
const LS_MIRROR = 'sr.' + APP + '.db', LS_MIRROR_MAX = 2000000;
const OTHERS = ['gundb', 'training-log', 'shooting-drills'].filter(a => a !== APP);
const mem = new Map();                           // key -> string, the synchronous view of the stored files

/* ---------- IndexedDB ---------- */
let idbP = null;
const idb = () => idbP || (idbP = new Promise((res, rej) => {
  const r = indexedDB.open(IDB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const idbGet = keys => idb().then(d => new Promise(res => {
  const out = {}, t = d.transaction(STORE, 'readonly'), s = t.objectStore(STORE);
  keys.forEach(k => { const q = s.get(k); q.onsuccess = () => { if (typeof q.result === 'string') out[k] = q.result; }; });
  t.oncomplete = () => res(out); t.onerror = t.onabort = () => res(out);
})).catch(() => ({}));
const idbKeys = prefix => idb().then(d => new Promise(res => {
  const q = d.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'));
  q.onsuccess = () => res(q.result || []); q.onerror = () => res([]);
})).catch(() => []);
/** Writes run one after another in call order; each is one transaction (all keys or none). */
let queue = Promise.resolve();
const idbPut = (puts, dels = []) => (queue = queue.then(() => idb().then(d => new Promise(res => {
  const t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
  Object.keys(puts).forEach(k => s.put(puts[k], k));
  dels.forEach(k => s.delete(k));
  t.oncomplete = () => res(true);
  t.onerror = t.onabort = () => { console.error('Stoic Ranger: storage write failed', t.error); warnSave(); res(false); };
})).catch(e => { console.error(e); warnSave(); return false; })));
const warnSave = () => { try { const T = window[P]; T && T.toast && T.toast('Could not save data on this device. Make a backup (More › Backup).', true); } catch (e) { } };

const k = (name, app = APP) => app + '/' + name;
const read = (name, app) => mem.get(k(name, app)) || '';
const updatedOf = txt => { try { return String(JSON.parse(txt).updated || ''); } catch (e) { return null; } };

/* ---------- boot: load into memory, then start the app ---------- */
async function load(withOwn) {
  const keys = OTHERS.flatMap(a => [k('db.json', a), k('info.json', a)]);
  if (withOwn) keys.push(k('db.json'), k('db.bak.json'));
  keys.push(k('link-inbox.json'), k('link-sd-inbox.json'));
  const got = await idbGet(keys);
  keys.forEach(key => { if (got[key] != null) mem.set(key, got[key]); else if (!withOwn || !key.startsWith(APP + '/db')) mem.delete(key); });
}
async function boot() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  await load(true);
  // The localStorage mirror wins only if it is newer (a save whose IndexedDB write did not finish) or IndexedDB holds a damaged copy.
  let ls = ''; try { ls = localStorage.getItem(LS_MIRROR) || ''; } catch (e) { }
  const own = read('db.json');
  if (ls && ls !== own) {
    const a = updatedOf(ls), b = own ? updatedOf(own) : '';
    if (a && (b === null || (b && a > b))) { mem.set(k('db.json'), ls); if (own) mem.set(k('db.bak.json'), own); idbPut({ [k('db.json')]: ls }); }
  }
  idbPut({ [k('info.json')]: JSON.stringify({ app: APP, version: CFG.version, code: CFG.code, seen: Date.now() }) });
  for (const src of CFG.scripts) await new Promise(res => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = s.onerror = res; document.body.appendChild(s);
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  if (navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* ---------- back from the background: the Android onResume / onPause ---------- */
const T = () => window[P] || {};
const run = f => { try { f(); } catch (e) { console.error(e); } };
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return;                     // the app flushes itself on hide (core.js)
  await load(false);
  const t = T();
  run(() => t.setSysDark && t.setSysDark(dark()));
  if (APP === 'gundb') run(() => t.linkMerge && t.linkMerge());
  if (APP === 'training-log') {
    run(() => t.linkSync && t.linkSync());
    run(() => { if (t.sdSync && t.sdSync() && t.route && /^#\/(dash|trainings)?$/.test(location.hash || '#/')) t.route(); });
  }
  if (APP === 'shooting-drills') run(() => t.linkSync && t.linkSync());
});
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const dark = () => !!(mq && mq.matches);
if (mq && mq.addEventListener) mq.addEventListener('change', () => run(() => T().setSysDark && T().setSysDark(dark())));

/* ---------- files: save, share, open ---------- */
const bytesOf = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const callback = (cb, ok, msg, data) => { const f = window[P + 'NativeCallback']; f && f(cb, data == null ? { ok, msg } : { ok, msg, data }); };
const download = (file) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
/** iOS only lets the share sheet open right after a tap. When the file took longer to make, ask for one more tap. */
function tapToShare(label, go) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center';
  d.innerHTML = `<div style="background:var(--card,#fff);color:var(--fg,#111);width:100%;max-width:560px;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));font:16px/1.4 var(--f-body,system-ui)">
    <p style="margin:0 0 14px">${label.replace(/[<>&]/g, '')}</p>
    <div style="display:flex;gap:10px"><button data-a="go" style="flex:1;padding:12px;font:inherit;font-weight:600;border:0;background:var(--accent,#333);color:#fff">Save / share</button>
    <button data-a="no" style="flex:1;padding:12px;font:inherit;border:1px solid var(--hair,#ccc);background:none;color:inherit">Cancel</button></div></div>`;
  document.body.appendChild(d);
  return new Promise(res => {
    d.querySelector('[data-a=go]').onclick = () => { d.remove(); res(go()); };
    d.querySelector('[data-a=no]').onclick = () => { d.remove(); res({ ok: false, msg: 'cancelled' }); };
  });
}
async function shareOrSave(name, mime, b64, text) {
  const file = new File([bytesOf(b64)], name, { type: mime || 'application/octet-stream' });
  const data = { files: [file] }; if (text) data.text = text;
  const canShare = navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })();
  if (!canShare) { download(file); return { ok: true, msg: name }; }
  const share = () => navigator.share(data).then(() => ({ ok: true, msg: name }),
    e => e && e.name === 'AbortError' ? { ok: false, msg: 'cancelled' } : (download(file), { ok: true, msg: name }));
  try { await navigator.share(data); return { ok: true, msg: name }; }
  catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, msg: 'cancelled' };
    if (e && e.name === 'NotAllowedError') return tapToShare(`${name} is ready.`, share);
    download(file); return { ok: true, msg: name };
  }
}

/* ---------- printing: A4 (or A5/A6 dope cards) through the browser's print dialog ---------- */
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

/* ---------- link providers (ports of LinkProvider.java), run against the other app's data ---------- */
const parseObj = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' ? j : null; } catch (e) { return null; } };
const own = (src, keys) => (Array.isArray(src) ? src : []).filter(o => o && typeof o === 'object' && !o.example)
  .map(o => { const c = {}; keys.forEach(x => { if (x in o) c[x] = o[x]; }); return c; });
const putInbox = (app, file, arg) => {
  const inbox = parseObj(arg || '{}') || {};
  inbox.received = Date.now();
  const txt = JSON.stringify(inbox);
  mem.set(k(file, app), txt);
  idbPut({ [k(file, app)]: txt });
  return { ok: true };
};
const PROVIDERS = {
  gundb(method, arg) {
    const db = parseObj(read('db.json', 'gundb')), info = parseObj(read('info.json', 'gundb')) || {};
    const enabled = !!(db && db.settings && db.settings.link && db.settings.link.enabled);
    if (method === 'status') return { app: 'gundb', version: info.version || '', enabled };
    if (!enabled) return { error: 'disabled' };
    if (method === 'shared') return {
      shooters: own(db.shooters, ['id', 'name', 'status', 'notes']),
      weapons: own(db.weapons, ['id', 'name', 'type', 'make', 'model', 'caliber', 'zeroM', 'serial', 'status', 'notes']),
      trainers: own(db.trainers, ['id', 'uid', 'name', 'contact', 'phone', 'email', 'website', 'notes']) };
    if (method === 'putRounds') return putInbox('gundb', 'link-inbox.json', arg);
    return { error: 'unknown method' };
  },
  'training-log'(method, arg) {
    const db = parseObj(read('db.json', 'training-log')), info = parseObj(read('info.json', 'training-log')) || {};
    const sd = db && db.settings && db.settings.link && db.settings.link.apps && db.settings.link.apps.shootingDrills;
    const enabled = !!(sd && sd.enabled);
    if (method === 'status') return { app: 'training-log', version: info.version || '', schema: db ? +db.schema || 0 : 0, enabled };
    if (!enabled) return { error: 'disabled' };
    if (method === 'shared') return {
      shooters: own(db.shooters, ['id', 'uid', 'name', 'status']),
      weapons: own(db.weapons, ['id', 'uid', 'name', 'type', 'make', 'model', 'caliber', 'zeroM', 'serial', 'status']) };
    if (method === 'trainings') {
      const a = parseObj(arg || '{}') || {};
      const from = String(a.date || a.from || ''), to = String(a.date || a.to || '');
      const trainers = Array.isArray(db.trainers) ? db.trainers : [];
      return { trainings: (Array.isArray(db.trainings) ? db.trainings : []).filter(t => {
        if (!t || typeof t !== 'object' || t.example) return false;
        const d = String(t.date || '');
        return !(from && d < from) && !(to && d > to);
      }).map(t => {
        const c = {};
        ['id', 'uid', 'date', 'start', 'durationH', 'fire', 'shooterId', 'desc', 'trainerId'].forEach(x => { if (x in t) c[x] = t[x]; });
        if (!('fire' in c)) c.fire = 'live';
        const ws = (Array.isArray(t.weapons) ? t.weapons : []).filter(w => w && typeof w === 'object');
        c.weaponIds = ws.map(w => String(w.weaponId == null ? '' : w.weaponId));
        c.weapons = ws.map(w => { const x = { weaponId: String(w.weaponId == null ? '' : w.weaponId) }; if ('rounds' in w) x.rounds = w.rounds; return x; });
        const tr = t.trainerId ? trainers.find(r => r && String(r.id) === String(t.trainerId)) : null;
        if (tr) c.trainer = String(tr.name == null ? '' : tr.name);
        return c;
      }) };
    }
    if (method === 'putResults') return putInbox('training-log', 'link-sd-inbox.json', arg);
    return { error: 'unknown method' };
  },
};
const LINK_TARGET = { 'training-log': 'gundb', 'shooting-drills': 'training-log' }[APP];
const installed = app => !!read('db.json', app);
const PACKAGES = { 'at.stoicranger.shootingdrills': 'shooting-drills', 'at.stoicranger.traininglog': 'training-log', 'at.rangebook.app': 'gundb' };

/* ---------- the bridge ---------- */
const N = {
  loadDb: () => read('db.json') || read('db.bak.json'),
  saveDb(json) {
    const prev = read('db.json'), puts = { [k('db.json')]: json };
    if (prev) { puts[k('db.bak.json')] = prev; mem.set(k('db.bak.json'), prev); }
    mem.set(k('db.json'), json);
    try { if (json.length <= LS_MIRROR_MAX) localStorage.setItem(LS_MIRROR, json); else localStorage.removeItem(LS_MIRROR); }
    catch (e) { try { localStorage.removeItem(LS_MIRROR); } catch (e2) { } }
    idbPut(puts);
    return true;
  },
  /** Copy of db.json under <app>/backups/ before a schema migration (or of a damaged file); keeps the newest 10. */
  backupDb(name) {
    const src = read('db.json');
    if (!src || !name || /[\/]|\.\./.test(name)) return false;
    idbPut({ [k('backups/' + name)]: src });
    idbKeys(k('backups/')).then(all => { if (all.length > 10) idbGet(all).then(got => {
      const sorted = all.sort((a, b) => (updatedOf(got[b]) || '').localeCompare(updatedOf(got[a]) || '') || b.localeCompare(a));
      idbPut({}, sorted.slice(10));
    }); });
    return true;
  },
  loadDbBackup: () => read('db.bak.json'),
  linkInbox: () => read('link-inbox.json'),
  readInbox: name => name === 'link-sd-inbox.json' ? read(name) : '',
  isInstalled: app => app === 'training-log' && installed('training-log'),
  appInstalled: pkg => { const p = String(pkg || '').replace(/\.debug$/, ''); return !!PACKAGES[p] && PACKAGES[p] !== APP && installed(PACKAGES[p]); },
  linkCall(method, arg) {
    if (!LINK_TARGET || !installed(LINK_TARGET)) return JSON.stringify({ error: 'not-installed' });
    try { return JSON.stringify(PROVIDERS[LINK_TARGET](method, arg)); } catch (e) { return JSON.stringify({ error: String(e && e.message) }); }
  },
  isNight: dark,
  getSecret: key => { try { return localStorage.getItem('sr.' + APP + '.secret.' + key) || ''; } catch (e) { return ''; } },
  setSecret: (key, v) => { try { localStorage.setItem('sr.' + APP + '.secret.' + key, v); } catch (e) { } },
  appInfo: () => JSON.stringify({ version: CFG.version, code: CFG.code, android: 'web app', sdk: 0,
    device: (navigator.standalone || (matchMedia && matchMedia('(display-mode: standalone)').matches) ? 'Home Screen · ' : 'Browser · ') + navigator.userAgent.slice(0, 80) }),
  saveFile: (name, mime, b64, cb) => { shareOrSave(name, mime, b64).then(r => callback(cb, r.ok, r.msg)); },
  shareFile: (name, mime, b64, text) => { shareOrSave(name, mime, b64, text); },
  openFile(mimes, cb) {
    const i = document.createElement('input'); i.type = 'file';
    // iOS greys out files whose type it does not know: only pass the list when it is a plain mime list
    if (mimes && !/\*/.test(mimes)) i.accept = mimes + ',' + mimes.split(',').map(m => ({ 'application/json': '.json', 'text/csv': '.csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx' })[m.trim()] || '').filter(Boolean).join(',');
    let done = false;
    const finish = (ok, msg, data) => { if (done) return; done = true; callback(cb, ok, msg, data); };
    i.onchange = () => {
      const f = i.files && i.files[0];
      if (!f) return finish(false, 'cancelled');
      const r = new FileReader();
      r.onload = () => finish(true, f.name, String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => finish(false, 'could not read the file');
      r.readAsDataURL(f);
    };
    i.addEventListener('cancel', () => finish(false, 'cancelled'));
    i.style.display = 'none'; document.body.appendChild(i); i.click(); setTimeout(() => i.remove(), 60000);
  },
  print: (html, job) => print(html, job, 'A4'),
  printSized: (html, job, size) => print(html, job, /^A[456]$/.test(size) ? size : 'A4'),
};
window[P + 'Native'] = N;
window.SR_WEB.ready = boot();
})();
