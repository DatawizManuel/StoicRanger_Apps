/* Stoic Ranger web app (iPhone, iPad, any browser) — stands in for the Android shell (MainActivity.java).
   The app code in app/src/main/assets/www runs unchanged: sr/hub.js talks to window.SRNative exactly as on
   Android, and this file answers.

   Storage: IndexedDB "stoic-ranger" (one store "files"; keys "sr/db.json", "sr/db.bak.json", "sr/backups/…", and
   since 1.0.1 "sr/thoughts.json", "sr/thoughts.bak.json", "sr/backups-thoughts/…" for Daily Thoughts),
   plus a localStorage mirror of each file when it fits, so a save that iOS cuts short still leaves a copy. The
   bridge is synchronous (loadDb, saveDb …), so boot() loads the files into memory first, then loads the page's
   scripts and fires DOMContentLoaded for them. Each page (home, gun/, training/, drills/) boots the same way. */
'use strict';
(() => {
const CFG = window.SR_WEB;                       // written by tools/build-web.mjs: {version, code, root, scripts, lock}
const APP = 'sr';
const IDB_NAME = 'stoic-ranger', STORE = 'files';
const LS_MIRROR = 'sr.db', LS_MIRROR_MAX = 2000000;
const DATA = ['thoughts', 'xlsxbase'];            // files of their own next to db.json (1.0.1; xlsxbase 1.1.0), see loadData()
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
const warnSave = () => { try { const t = document.getElementById('toast'); if (t) { t.textContent = 'Could not save data on this device. Save a backup (Data › Backup).'; t.classList.add('on', 'err'); } } catch (e) { } };

const k = (name, app = APP) => app + '/' + name;
const read = (name, app) => mem.get(k(name, app)) || '';
const updatedOf = txt => { try { return String(JSON.parse(txt).updated || ''); } catch (e) { return null; } };

/* ---------- boot: load into memory, then start the app ---------- */
async function load() {
  const keys = ['db', ...DATA].flatMap(n => [k(n + '.json'), k(n + '.bak.json')]);
  const got = await idbGet(keys);
  keys.forEach(key => { if (got[key] != null) mem.set(key, got[key]); });
}
const lsKey = n => n === 'db' ? LS_MIRROR : 'sr.' + n;
/** One file: keep the previous version as .bak, mirror into localStorage when it fits, write to IndexedDB. */
function writeFile(n, json) {
  const f = n + '.json', b = n + '.bak.json', prev = read(f), puts = { [k(f)]: json };
  if (prev) { puts[k(b)] = prev; mem.set(k(b), prev); }
  mem.set(k(f), json);
  try { if (json.length <= LS_MIRROR_MAX) localStorage.setItem(lsKey(n), json); else localStorage.removeItem(lsKey(n)); }
  catch (e) { try { localStorage.removeItem(lsKey(n)); } catch (e2) { } }
  idbPut(puts);
  return true;
}
/** Copy of a file under <app>/<dir>/ (newest 10 kept). */
function backupFile(n, dir, name) {
  const src = read(n + '.json');
  if (!src || !name || /[\/]|\.\./.test(name)) return false;
  idbPut({ [k(dir + '/' + name)]: src });
  idbKeys(k(dir + '/')).then(all => { if (all.length > 10) idbGet(all).then(got => {
    const sorted = all.sort((a, b) => (updatedOf(got[b]) || '').localeCompare(updatedOf(got[a]) || '') || b.localeCompare(a));
    idbPut({}, sorted.slice(10));
  }); });
  return true;
}

/* ---------- one-time password (Manuel 2026-10-28): asked once per device, then remembered ----------
   Only a PBKDF2 hash is in the code (CFG.lock, from tools/build-web.mjs). The unlock is kept in localStorage and
   IndexedDB under the hash, so a new password asks again. It keeps strangers out of the app, not a hacker out of the code. */
const UNLOCK_KEY = 'sr.unlock';
async function derive(pw) {
  const L = CFG.lock, enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(L.salt.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: L.iterations }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function unlocked() {
  if (!CFG.lock) return true;
  try { if (localStorage.getItem(UNLOCK_KEY) === CFG.lock.hash) return true; } catch (e) { }
  const got = await idbGet([UNLOCK_KEY]);
  if (got[UNLOCK_KEY] === CFG.lock.hash) { try { localStorage.setItem(UNLOCK_KEY, CFG.lock.hash); } catch (e) { } return true; }
  return false;
}
function lockScreen() {
  const d = document.createElement('div');
  d.id = 'srLock';
  d.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg,#f4f2ec);color:var(--fg,#1b1b18);font:16px/1.45 var(--f-body,system-ui)';
  d.innerHTML = `<form style="width:100%;max-width:360px;text-align:center" autocomplete="off">
    <img src="${CFG.root || ''}icon-180.png" alt="" width="96" height="96" style="border-radius:20px">
    <h2 style="margin:14px 0 4px;padding:0;border:0;font:700 22px var(--f-disp,system-ui);letter-spacing:.03em;text-transform:uppercase">${document.title.replace(/[<>&]/g, '')}</h2>
    <p style="margin:0 0 18px;color:var(--muted,#5d5b52)">Enter the password once to use the app on this device.</p>
    <input type="password" name="pw" placeholder="Password" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"
      style="width:100%;box-sizing:border-box;padding:12px;font:inherit;font-size:17px;border:1px solid var(--hair,#ccc);background:var(--card,#fff);color:inherit;border-radius:0">
    <button class="btn pri" style="width:100%;margin-top:10px">Unlock</button>
    <p data-msg role="alert" style="min-height:1.4em;margin:12px 0 0;color:var(--bad,#b3261e)"></p></form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form'), msg = d.querySelector('[data-msg]'), btn = d.querySelector('button');
  return new Promise(res => {
    f.onsubmit = async e => {
      e.preventDefault();
      btn.disabled = true; msg.textContent = '';
      let h = '';
      try { h = await derive(f.pw.value); } catch (err) { msg.textContent = 'This browser cannot check the password (open the app via https).'; btn.disabled = false; return; }
      if (h !== CFG.lock.hash) { msg.textContent = 'Wrong password.'; f.pw.value = ''; f.pw.focus(); btn.disabled = false; return; }
      try { localStorage.setItem(UNLOCK_KEY, h); } catch (err) { }
      await idbPut({ [UNLOCK_KEY]: h });
      d.remove(); res();
    };
    setTimeout(() => f.pw.focus(), 50);
  });
}

async function boot() {
  if (navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register((CFG.root || '') + 'sw.js', { scope: CFG.root || './' }).catch(() => { });
  if (!(await unlocked())) await lockScreen();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  await load();
  // The localStorage mirror wins only if it is newer (a save whose IndexedDB write did not finish) or IndexedDB holds a damaged copy.
  ['db', ...DATA].forEach(n => {
    let ls = ''; try { ls = localStorage.getItem(lsKey(n)) || ''; } catch (e) { }
    const own = read(n + '.json');
    if (ls && ls !== own) {
      const a = updatedOf(ls), b = own ? updatedOf(own) : '';
      if (a && (b === null || (b && a > b))) { mem.set(k(n + '.json'), ls); if (own) mem.set(k(n + '.bak.json'), own); idbPut({ [k(n + '.json')]: ls }); }
    }
  });
  for (const src of CFG.scripts) await new Promise(res => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = s.onerror = res; document.body.appendChild(s);
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

/* ---------- back from the background: the Android onResume ---------- */
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const dark = () => !!(mq && mq.matches);
const resume = () => { try { window.SR && SR.onResume && SR.onResume(); } catch (e) { console.error(e); } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
if (mq && mq.addEventListener) mq.addEventListener('change', resume);

/* ---------- files: save, share, open ---------- */
const bytesOf = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const callback = (cb, ok, msg, data) => { const f = window.SRNativeCallback; f && f(cb, data == null ? { ok, msg } : { ok, msg, data }); };
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

/* ---------- the bridge ---------- */
const N = {
  loadDb: () => read('db.json') || read('db.bak.json'),
  saveDb: json => writeFile('db', json),
  /** Copy of db.json under <app>/backups/ before a schema migration (or of a damaged file); keeps the newest 10. */
  backupDb: name => backupFile('db', 'backups', name),
  loadDbBackup: () => read('db.bak.json'),
  // files of their own (Daily Thoughts: "thoughts"), same rules as db.json; MainActivity.java has the same four
  loadData: n => DATA.includes(n) ? read(n + '.json') || read(n + '.bak.json') : '',
  saveData: (n, json) => DATA.includes(n) && writeFile(n, json),
  backupData: (n, name) => DATA.includes(n) && backupFile(n, 'backups-' + n, name),
  loadDataBackup: n => DATA.includes(n) ? read(n + '.bak.json') : '',
  isNight: dark,
  getSecret: key => { try { return localStorage.getItem('sr.secret.' + key) || ''; } catch (e) { return ''; } },
  setSecret: (key, v) => { try { localStorage.setItem('sr.secret.' + key, v); } catch (e) { } },
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
window.SRNative = N;
window.SR_WEB.ready = boot();
})();
