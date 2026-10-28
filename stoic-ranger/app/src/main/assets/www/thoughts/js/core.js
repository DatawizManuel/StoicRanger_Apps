/* Stoic Ranger - Daily Thoughts — core: storage, native bridge, helpers, content helpers. Plain scripts, one global DT. */
'use strict';
const DT = window.DT = {};

/* ---------- helpers ---------- */
DT.$ = (sel, root = document) => root.querySelector(sel);
DT.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
DT.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
DT.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
DT.fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
DT.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
DT.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- native bridge (falls back to the browser for development) ---------- */
const N = window.DTNative || null;
DT.native = !!N;
const cbs = {};
window.DTNativeCallback = (id, res) => { const f = cbs[id]; delete cbs[id]; f && f(res); };
const cbId = f => { const id = 'cb' + Math.random().toString(36).slice(2); cbs[id] = f; return id; };
DT.b64 = {
  fromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  toBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
DT.saveFile = (name, mime, bytesOrText) => new Promise(res => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.saveFile(name, mime, DT.b64.fromBytes(u8), cbId(res)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); res({ ok: true, msg: name });
});
DT.shareFile = (name, mime, bytesOrText, text = '') => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.shareFile(name, mime, DT.b64.fromBytes(u8), text); return; }
  try {   // iPhone / web: the system share sheet takes files too (Files, Mail, AirDrop …)
    const f = new File([u8], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: text }).catch(() => { }); return; }
  } catch (e) { }
  DT.saveFile(name, mime, u8);
};
DT.shareText = (subject, text) => {
  if (N) { N.shareText(subject, text); return; }
  if (navigator.share) navigator.share({ title: subject, text }).catch(() => { });
  else navigator.clipboard && navigator.clipboard.writeText(text).then(() => DT.toast('Copied to the clipboard.'));
};
/** Open a file; resolves {ok, name, bytes:Uint8Array}. */
DT.openFile = (mimes = '') => new Promise(res => {
  if (N) { N.openFile(mimes, cbId(r => res(r.ok ? { ok: true, name: r.msg, bytes: DT.b64.toBytes(r.data) } : { ok: false, msg: r.msg }))); return; }
  const i = document.createElement('input'); i.type = 'file'; if (mimes) i.accept = mimes;
  i.onchange = async () => { const f = i.files[0]; if (!f) return res({ ok: false, msg: 'cancelled' }); res({ ok: true, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
  i.click();
});
DT.print = (html, job) => {
  if (N) { N.print(html, job); return; }
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.srcdoc = html; f.onload = () => { setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
};
/** App version: Android reads it from the APK, the web app (iPhone / iPad) from DT.VERSION. Bump both together. */
DT.VERSION = '0.1.2';
DT.appInfo = () => { try { return N ? JSON.parse(N.appInfo()) : { version: DT.VERSION, android: '-', device: navigator.userAgent.slice(0, 60) }; } catch (e) { return {}; } };
/** Web app started from the home screen (iPhone "Add to Home Screen", or an installed app on Android / desktop). */
DT.standalone = () => !N && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);

/* ---------- database ----------
   Only the user's own data lives here: favourites and settings. Quotes, author pages and coins are app content
   (js/content.js, coins/) and may change with every version; favourites point at a quote by its permanent id
   (e.g. "q-marcus-aurelius-01"), which never changes or gets reused.
   Data safety across app updates (see MIGRATIONS.md):
   - db.schema says which data version a file has. Every app version reads every older one: each step in
     MIGRATIONS turns schema n-1 into n and never deletes a user's entries or unknown fields.
   - Before migrating, the native side keeps a copy (files/backups/db-schema<n>-<date>.json).
   - Data written by a newer app (schema > DT.SCHEMA) is never overwritten: the app opens it read-only.
   - A damaged db.json falls back to the previous copy (db.bak.json). */
DT.SCHEMA = 1;
DT.APP_ID = 'sr-daily-thoughts';
DT.emptyDb = () => ({
  app: DT.APP_ID, schema: DT.SCHEMA, created: new Date().toISOString(), updated: new Date().toISOString(),
  favs: [],            // [{ id: quote id, at: ISO time }], newest last
  settings: { theme: 'auto' },
  history: [],
});
DT.MIGRATIONS = {
  // next data format: 2(db) { … } (add/convert only, never delete user entries)
};
/** Fill gaps every version relies on. Safe to run on any data, any number of times. */
DT.normalize = db => {
  if (!Array.isArray(db.favs)) db.favs = [];
  db.favs = db.favs.map(f => typeof f === 'string' ? { id: f, at: '' } : f).filter(f => f && f.id);
  const seen = new Set(); db.favs = db.favs.filter(f => !seen.has(f.id) && seen.add(f.id));
  return db;
};
DT.migrate = db => {
  const e = DT.emptyDb();
  const from = +db.schema || 1;
  db.settings = Object.assign(e.settings, db.settings || {});
  if (!Array.isArray(db.history)) db.history = [];
  if (!db.app) db.app = DT.APP_ID;
  if (from > DT.SCHEMA) return db;                       // newer than this app: leave untouched
  for (let v = from + 1; v <= DT.SCHEMA; v++) { if (DT.MIGRATIONS[v]) DT.MIGRATIONS[v](db); db.schema = v; }
  db.schema = DT.SCHEMA;
  DT.normalize(db);
  if (from < DT.SCHEMA) db.history.push({ at: new Date().toISOString(), from, to: DT.SCHEMA, app: (DT.appInfo().version || 'web') });
  return db;
};
DT.isOurs = j => j && typeof j === 'object' && (!j.app || j.app === DT.APP_ID) && Array.isArray(j.favs);
function parse(txt) { if (!txt) return null; try { const j = JSON.parse(txt); return DT.isOurs(j) ? j : null; } catch (e) { return null; } }
function readDb() {
  let txt = '';
  try { txt = N ? N.loadDb() : (localStorage.getItem('dt.db') || ''); } catch (e) { }
  let db = parse(txt);
  if (!db && txt) {                                       // damaged file: use the previous copy, keep the damaged one
    DT.recovered = true;
    try { if (N) { N.backupDb('db-damaged-' + Date.now() + '.json'); db = parse(N.loadDbBackup()); } else db = parse(localStorage.getItem('dt.db.bak')); } catch (e) { }
  }
  return db;
}
DT.db = readDb();
DT.firstRun = !DT.db;
if (!DT.db) DT.db = DT.emptyDb();
DT.dataSchema = +DT.db.schema || 1;
DT.readOnly = DT.dataSchema > DT.SCHEMA;
if (!DT.readOnly && DT.dataSchema < DT.SCHEMA && !DT.firstRun) {
  try { N ? N.backupDb(`db-schema${DT.dataSchema}-${new Date().toISOString().slice(0, 10)}.json`) : localStorage.setItem('dt.db.pre' + DT.dataSchema, localStorage.getItem('dt.db')); } catch (e) { }
  DT.migrate(DT.db);
  DT.migrated = DT.dataSchema;
} else if (!DT.readOnly) DT.migrate(DT.db);
else {                                                   // read-only: fill gaps in memory only, the file stays untouched
  DT.db.settings = Object.assign(DT.emptyDb().settings, DT.db.settings || {});
  if (!Array.isArray(DT.db.favs)) DT.db.favs = [];
}
// web app: ask the browser to keep the favourites even when storage runs low (home screen apps on iPhone are kept anyway)
if (!N && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
const writeNow = () => {
  if (DT.readOnly) return;                                 // never overwrite data from a newer app version
  DT.db.updated = new Date().toISOString();
  const txt = JSON.stringify(DT.db);
  let ok = false;
  try { ok = N ? N.saveDb(txt) : (localStorage.setItem('dt.db.bak', localStorage.getItem('dt.db') || ''), localStorage.setItem('dt.db', txt), true); } catch (e) { ok = false; }
  if (!ok) DT.toast && DT.toast('Could not save data on this device.', true);
};
const writeLater = DT.debounce(writeNow, 400);
DT.save = (now) => now ? writeLater.now() : writeLater();
DT.flush = () => writeLater.now();
DT.backupDb = name => { try { return N ? N.backupDb(name) : (localStorage.setItem('dt.db.' + name, localStorage.getItem('dt.db') || ''), true); } catch (e) { return false; } };
window.addEventListener('pagehide', DT.flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) DT.flush(); });

/* ---------- content (js/content.js) ---------- */
DT.author = slug => DT._A[slug] || null;
DT.quote = id => DT._Q[id] || null;
DT.indexContent = () => {
  DT._A = {}; DT.AUTHORS.forEach(a => DT._A[a.slug] = a);
  DT._Q = {}; DT.QUOTES.forEach(q => DT._Q[q.id] = q);
};
DT.quoteText = q => q.q.join(' ');
/** Day number in local time, so the quote changes at local midnight. */
DT.dayNo = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);
/** Same quote all day, a new one the next day; all quotes come round once before any repeats. */
DT.quoteOfDay = (offset = 0) => DT.quote(DT.DAY_ORDER[(((DT.dayNo() + offset) % DT.DAY_ORDER.length) + DT.DAY_ORDER.length) % DT.DAY_ORDER.length]);
DT.dayLabel = (offset = 0) => { const d = new Date(Date.now() + offset * 864e5); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
DT.isFav = id => DT.db.favs.some(f => f.id === id);
DT.toggleFav = id => {
  if (DT.readOnly) { DT.toast('Read-only: update the app first.', true); return DT.isFav(id); }
  const i = DT.db.favs.findIndex(f => f.id === id);
  if (i < 0) DT.db.favs.push({ id, at: new Date().toISOString() }); else DT.db.favs.splice(i, 1);
  DT.save(true);
  return i < 0;
};

/* ---------- coins: coins/<slug>.svg holds <symbol id="coin-<slug>">, added to the page sprite on demand ---------- */
DT._coinSrc = {};
const coinLoads = {};
DT.loadCoin = slug => coinLoads[slug] || (coinLoads[slug] = fetch('coins/' + slug + '.svg').then(r => r.text()).then(t => {
  DT._coinSrc[slug] = t;
  const sp = DT.$('#sprite'); sp.insertAdjacentHTML('beforeend', t);
  DT.$$(`use[data-coin="${slug}"]`).forEach(u => u.setAttribute('href', '#coin-' + slug));   // repaint uses drawn before the symbol arrived
}).catch(() => { delete coinLoads[slug]; }));
DT.coin = (slug, cls = '') => {
  const a = DT.author(slug);
  DT.loadCoin(slug);
  return `<svg class="coin ${cls}" viewBox="0 0 240 240" role="img" aria-label="Stoic Ranger challenge coin of ${DT.esc(a ? a.name : slug)}"><use data-coin="${slug}" href="#coin-${slug}"/></svg>`;
};

/* ---------- UI primitives shared by views ---------- */
DT.toast = (msg, err) => {
  let t = DT.$('#toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(DT._tt); DT._tt = setTimeout(() => t.classList.remove('on'), err ? 5000 : 2600);
};
DT.sheet = (title, bodyHtml, { onClose } = {}) => {     // bottom sheet / modal
  const m = DT.h(`<div class="modal" role="dialog" aria-modal="true"><div class="mcard"><div class="mhead"><h3>${DT.esc(title)}</h3><button class="ib" data-close aria-label="Close">✕</button></div><div class="mbody">${bodyHtml}</div></div></div>`);
  document.body.appendChild(m);
  const close = () => { m.remove(); DT._modal = null; onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  DT._modal = close;
  return { el: m, body: DT.$('.mbody', m), close };
};
