/* Stoic Ranger - Shooting Drills — core: storage, native bridge, helpers, tables, drill library helpers. Plain scripts, one global SD. */
'use strict';
const SD = window.SD = {};

/* ---------- helpers ---------- */
SD.$ = (sel, root = document) => root.querySelector(sel);
SD.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
SD.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
SD.num = v => { if (v === '' || v == null) return null; const n = +String(v).trim().replace(',', '.'); return isFinite(n) ? n : null; };
SD.fx = (v, d = 1) => v == null || !isFinite(v) ? '' : (+v).toFixed(d).replace(/^-(0(\.0+)?)$/, '$1');
/** Hours: 2 → "2", 2.5 → "2.5", 1.25 → "1.25" */
SD.fh = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 100) / 100);
SD.fmtInt = v => v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('de-AT');
SD.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
SD.fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
SD.clone = o => JSON.parse(JSON.stringify(o));
SD.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
SD.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
/** Permanent, globally unique id of a record. Never changes, also not on export/import: other Stoic Ranger apps
    will refer to entries by it once linking is switched on. */
SD.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
}));
SD.webUrl = u => !u ? '' : /^https?:\/\//i.test(u) ? u : 'https://' + u;

/* ---------- native bridge (falls back to the browser for development) ---------- */
const N = window.SDNative || null;
SD.native = !!N;
const cbs = {};
window.SDNativeCallback = (id, res) => { const f = cbs[id]; delete cbs[id]; f && f(res); };
const cbId = f => { const id = 'cb' + Math.random().toString(36).slice(2); cbs[id] = f; return id; };
SD.b64 = {
  fromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  toBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
SD.saveFile = (name, mime, bytesOrText) => new Promise(res => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.saveFile(name, mime, SD.b64.fromBytes(u8), cbId(res)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); res({ ok: true, msg: name });
});
SD.shareFile = (name, mime, bytesOrText, text = '') => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.shareFile(name, mime, SD.b64.fromBytes(u8), text); return; }
  SD.saveFile(name, mime, u8);
};
/** Open a file; resolves {ok, name, bytes:Uint8Array}. */
SD.openFile = (mimes = '') => new Promise(res => {
  if (N) { N.openFile(mimes, cbId(r => res(r.ok ? { ok: true, name: r.msg, bytes: SD.b64.toBytes(r.data) } : { ok: false, msg: r.msg }))); return; }
  const i = document.createElement('input'); i.type = 'file'; if (mimes) i.accept = mimes;
  i.onchange = async () => { const f = i.files[0]; if (!f) return res({ ok: false, msg: 'cancelled' }); res({ ok: true, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
  i.click();
});
SD.print = (html, job) => {
  if (N) { N.print(html, job); return; }
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.srcdoc = html; f.onload = () => { setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
};
SD.appInfo = () => { try { return N ? JSON.parse(N.appInfo()) : { version: 'web', android: '-', device: navigator.userAgent.slice(0, 60) }; } catch (e) { return {}; } };

/* ---------- tables ----------
   [key, label, type, opts]; types: text | int | num | date | time | select | area | tel | email | url */
/* ---------- tables (own data on this phone) ----------
   [key, label, type, opts]; types: text | int | num | date | time | select | area | tel | email | url */
SD.TABLES = {
  shooters: {
    title: 'Shooters', one: 'shooter', prefix: 'S',
    fields: [
      ['name', 'Name', 'text', { req: true }],
      ['status', 'Status', 'select', { span: 3, options: ['Active', 'Inactive'] }],
      ['notes', 'Notes', 'area'],
    ],
  },
  weapons: {
    title: 'Guns', one: 'gun', prefix: 'W',   // table key 'weapons' = same as Gun Database / Training Log / database.xlsx
    fields: [
      ['name', 'Name', 'text', { req: true, hint: 'How it appears in lists, e.g. "Tikka T3x TAC A1"' }],
      ['type', 'Type', 'select', { span: 3, options: ['', 'Rifle', 'Pistol', 'Revolver', 'Shotgun', 'Air rifle', 'Air pistol', 'Other'] }],
      ['caliber', 'Caliber', 'text', { span: 3 }],
      ['zeroM', 'Zero distance m', 'num', { span: 3 }],
      ['status', 'Status', 'select', { span: 3, options: ['Active', 'Sold', 'Retired'] }],
      ['notes', 'Notes', 'area'],
    ],
  },
};

/* ---------- database ----------
   Only the user's own entries live here (shooters, guns, drill results, favourites, settings). The drill library
   itself is app content (js/drills-data.js) and may change with every version; results point at a drill by its
   permanent drill id (e.g. "pst-01"), which never changes or gets reused.
   Data safety across app updates (see MIGRATIONS.md):
   - db.schema says which data version a file has. Every app version reads every older one: each step in
     MIGRATIONS turns schema n-1 into n and never deletes a user's entries or unknown fields.
   - Before migrating, the native side keeps a copy (files/backups/db-schema<n>-<date>.json).
   - Data written by a newer app (schema > SD.SCHEMA) is never overwritten: the app opens it read-only.
   - A damaged db.json falls back to the previous copy (db.bak.json). */
SD.SCHEMA = 1;
SD.APP_ID = 'sr-shooting-drills';
SD.LISTS = ['shooters', 'weapons', 'results'];
SD.emptyFilter = () => ({ weapon: '', fire: '', motion: '', timed: '', level: '', fav: false, q: '' });
SD.emptyDb = () => ({
  app: SD.APP_ID, schema: SD.SCHEMA, created: new Date().toISOString(), updated: new Date().toISOString(),
  shooters: [], weapons: [], results: [], favs: [],
  settings: {
    theme: 'auto', lastShooter: '', lastWeapon: '',
    filter: SD.emptyFilter(),
    // linking with the other Stoic Ranger apps: off until the user agrees in a later version
    link: { enabled: false, apps: {} },
  },
  history: [],
});
SD.MIGRATIONS = {
  // next data format: 2(db) { … } (add/convert only, never delete user entries)
};
/** Fill gaps every version relies on: ids, permanent uids, arrays. Safe to run on any data, any number of times. */
SD.normalize = db => {
  SD.LISTS.forEach(t => {
    if (!Array.isArray(db[t])) db[t] = [];
    db[t].forEach(r => { if (!r.uid) r.uid = SD.uuid(); });
  });
  ['shooters', 'weapons'].forEach(t => db[t].forEach(r => { if (!r.id) r.id = SD.nextId(db[t], SD.TABLES[t].prefix); }));
  db.results.forEach(r => {
    if (!r.id) r.id = SD.nextId(db.results, 'R', 4);
    ['timeS', 'hits', 'shots', 'points'].forEach(k => { if (typeof r[k] === 'string') r[k] = SD.num(r[k]); });
  });
  if (!Array.isArray(db.favs)) db.favs = [];
  return db;
};
SD.migrate = db => {
  const e = SD.emptyDb();
  const from = +db.schema || 1;
  db.settings = Object.assign(e.settings, db.settings || {});
  db.settings.filter = Object.assign(SD.emptyFilter(), db.settings.filter || {});
  if (!Array.isArray(db.history)) db.history = [];
  if (!db.app) db.app = SD.APP_ID;
  if (from > SD.SCHEMA) return db;                       // newer than this app: leave untouched
  for (let v = from + 1; v <= SD.SCHEMA; v++) { if (SD.MIGRATIONS[v]) SD.MIGRATIONS[v](db); db.schema = v; }
  db.schema = SD.SCHEMA;
  SD.normalize(db);
  if (from < SD.SCHEMA) db.history.push({ at: new Date().toISOString(), from, to: SD.SCHEMA, app: (SD.appInfo().version || 'web') });
  return db;
};
SD.isOurs = j => j && typeof j === 'object' && Array.isArray(j.results);
function parse(txt) { if (!txt) return null; try { const j = JSON.parse(txt); return SD.isOurs(j) ? j : null; } catch (e) { return null; } }
function readDb() {
  let txt = '';
  try { txt = N ? N.loadDb() : (localStorage.getItem('sd.db') || ''); } catch (e) { }
  let db = parse(txt);
  if (!db && txt) {                                       // damaged file: use the previous copy, keep the damaged one
    SD.recovered = true;
    try { if (N) { N.backupDb('db-damaged-' + Date.now() + '.json'); db = parse(N.loadDbBackup()); } else db = parse(localStorage.getItem('sd.db.bak')); } catch (e) { }
  }
  return db;
}
SD.nextId = (list, prefix, pad = 3) => {
  let n = 0; list.forEach(r => { const m = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id || ''); if (m) n = Math.max(n, +m[1]); });
  return `${prefix}-${String(n + 1).padStart(pad, '0')}`;
};
SD.db = readDb();
SD.firstRun = !SD.db;
if (!SD.db) SD.db = SD.emptyDb();
SD.dataSchema = +SD.db.schema || 1;
SD.readOnly = SD.dataSchema > SD.SCHEMA;
if (!SD.readOnly && SD.dataSchema < SD.SCHEMA && !SD.firstRun) {
  try { N ? N.backupDb(`db-schema${SD.dataSchema}-${new Date().toISOString().slice(0, 10)}.json`) : localStorage.setItem('sd.db.pre' + SD.dataSchema, localStorage.getItem('sd.db')); } catch (e) { }
  SD.migrate(SD.db);
  SD.migrated = SD.dataSchema;
} else if (!SD.readOnly) SD.migrate(SD.db);
else {                                                   // read-only: fill gaps in memory only, the file stays untouched
  SD.db.settings = Object.assign(SD.emptyDb().settings, SD.db.settings || {});
  SD.LISTS.concat('favs').forEach(t => { if (!Array.isArray(SD.db[t])) SD.db[t] = []; });
}
const writeNow = () => {
  if (SD.readOnly) return;                                 // never overwrite data from a newer app version
  SD.db.updated = new Date().toISOString();
  const txt = JSON.stringify(SD.db);
  let ok = false;
  try { ok = N ? N.saveDb(txt) : (localStorage.setItem('sd.db.bak', localStorage.getItem('sd.db') || ''), localStorage.setItem('sd.db', txt), true); } catch (e) { ok = false; }
  if (!ok) SD.toast && SD.toast('Could not save data on this device.', true);
};
const writeLater = SD.debounce(writeNow, 400);
SD.save = (now) => now ? writeLater.now() : writeLater();
SD.flush = () => writeLater.now();
SD.backupDb = name => { try { return N ? N.backupDb(name) : (localStorage.setItem('sd.db.' + name, localStorage.getItem('sd.db') || ''), true); } catch (e) { return false; } };
window.addEventListener('pagehide', SD.flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) SD.flush(); });

SD.byId = (list, id) => list.find(r => r.id === id) || null;
SD.nameOf = (t, id) => { const r = SD.byId(SD.db[t], id); return r ? r.name : (id ? '(deleted)' : ''); };
SD.sorted = t => SD.db[t].slice().sort((a, b) => (a.status === 'Active' || !a.status ? 0 : 1) - (b.status === 'Active' || !b.status ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
SD.usage = (t, id) => SD.db.results.filter(r => t === 'shooters' ? r.shooterId === id : r.weaponId === id);

/* ---------- drill library (app content from js/drills-data.js) ---------- */
SD.GROUPS = [
  ['pistol', 'static', true], ['pistol', 'static', false], ['pistol', 'dynamic', true], ['pistol', 'dynamic', false],
  ['rifle', 'static', true], ['rifle', 'static', false], ['rifle', 'dynamic', true], ['rifle', 'dynamic', false],
];
SD.groupTitle = (w, m, t) => `${w === 'pistol' ? 'Pistol' : 'Rifle'} · ${m === 'static' ? 'Static' : 'Dynamic'} · ${t ? 'Timed' : 'Not timed'}`;
SD.drill = id => SD.DRILLS.find(d => d.id === id) || null;
SD.fireText = d => d.live && d.dry ? 'Live + dry' : d.live ? 'Live fire' : 'Dry fire';
SD.isFav = id => SD.db.favs.includes(id);
SD.toggleFav = id => { if (SD.readOnly) return; const i = SD.db.favs.indexOf(id); if (i < 0) SD.db.favs.push(id); else SD.db.favs.splice(i, 1); SD.save(true); };
SD.matches = (d, f) =>
  (!f.weapon || d.weapon === f.weapon) &&
  (!f.fire || (f.fire === 'live' ? d.live : d.dry)) &&
  (!f.motion || d.motion === f.motion) &&
  (!f.timed || (f.timed === 'timed') === d.timed) &&
  (!f.level || d.level === +f.level) &&
  (!f.fav || SD.isFav(d.id)) &&
  (!f.q || SD.searchText(d).includes(f.q.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ')));
/** Name, common names, keywords, goal and target, so "Mozambique", "malfunction" or "1 to 5" find their drills. */
SD.searchText = d => d._s || (d._s = [d.name, ...(d.aka || []), ...(d.kw || []), d.goal, d.target].join(' ').toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' '));
SD.filterActive = f => Object.keys(SD.emptyFilter()).some(k => !!f[k]);
SD.resultsOf = id => SD.db.results.filter(r => r.drillId === id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
/** Best result of a drill: timed = fastest passed run (else fastest), not timed = most points / hits. */
SD.best = (d, list) => {
  if (!list.length) return null;
  const score = r => d.timed ? (r.timeS == null ? Infinity : r.timeS) + (r.pass === false ? 1e6 : 0) : -((r.points ?? r.hits ?? -1));
  return list.slice().sort((a, b) => score(a) - score(b))[0];
};
SD.resultText = (d, r) => [
  r.timeS != null && SD.fx(r.timeS, 2) + ' s',
  r.hits != null && `${r.hits}${r.shots != null ? '/' + r.shots : ''} hits`,
  r.points != null && r.points + ' pts',
  r.pass === true ? 'passed' : r.pass === false ? 'not passed' : '',
].filter(Boolean).join(' · ');
/** Same drill every day, a new one the next day. */
SD.drillOfDay = () => { const n = Math.floor(Date.now() / 864e5); return SD.DRILLS[(n * 37) % SD.DRILLS.length]; };

/* ---------- UI primitives shared by views ---------- */
SD.toast = (msg, err) => {
  let t = SD.$('#toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(SD._tt); SD._tt = setTimeout(() => t.classList.remove('on'), err ? 5000 : 2600);
};
/** Two-tap confirm for destructive buttons. */
SD.armed = (btn, fn) => {
  const label = btn.innerHTML; let t;
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.innerHTML = label; fn(); return; }
    btn.dataset.armed = 1; btn.textContent = 'Tap again to confirm';
    t = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = label; }, 3000);
  });
};
SD.sheet = (title, bodyHtml, { onClose } = {}) => {     // bottom sheet / modal
  const m = SD.h(`<div class="modal" role="dialog" aria-modal="true"><div class="mcard"><div class="mhead"><h3>${SD.esc(title)}</h3><button class="ib" data-close aria-label="Close">✕</button></div><div class="mbody">${bodyHtml}</div></div></div>`);
  document.body.appendChild(m);
  const close = () => { m.remove(); SD._modal = null; onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  SD._modal = close;
  return { el: m, body: SD.$('.mbody', m), close };
};
