/* SR Physical Fitness — core: helpers, native bridge, local database (only on this device), migrations. One global PF. */
'use strict';
const PF = window.PF = {};

/* ---------- helpers ---------- */
PF.$ = (sel, root = document) => root.querySelector(sel);
PF.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
PF.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
PF.clone = o => JSON.parse(JSON.stringify(o));
PF.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
PF.uid = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
PF.now = () => new Date().toISOString();
PF.iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
PF.parseD = s => new Date(s + 'T00:00:00');
PF.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
PF.today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
PF.todayIso = () => PF.iso(PF.today());
PF.nextMonday = () => { const d = PF.today(); const dow = (d.getDay() + 6) % 7; return PF.addDays(d, 7 - dow); };
PF.fmtD = d => (typeof d === 'string' ? PF.parseD(d) : d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
PF.fmtDY = d => (typeof d === 'string' ? PF.parseD(d) : d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
PF.num = (v, d = 1) => { const n = Math.round(v * 10 ** d) / 10 ** d; return String(n); };
PF.DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
PF.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
PF.toast = (msg, err) => { const t = PF.$('#toast'); if (!t) return; t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(PF._tt); PF._tt = setTimeout(() => t.className = '', err ? 4200 : 2400); };

/* ---------- native bridge (falls back to the browser for development and tests) ---------- */
const N = window.PFNative || null;
PF.native = !!N;
const cbs = {};
window.PFNativeCallback = (id, res) => { const f = cbs[id]; delete cbs[id]; f && f(res); };
const cbId = f => { const id = 'cb' + Math.random().toString(36).slice(2); cbs[id] = f; return id; };
PF.b64 = {
  fromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  toBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
PF.saveFile = (name, mime, bytes) => new Promise(res => {
  if (N) { N.saveFile(name, mime, PF.b64.fromBytes(bytes), cbId(res)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); res({ ok: true, msg: name });
});
PF.shareFile = (name, mime, bytes, text = '') => {
  if (N) { N.shareFile(name, mime, PF.b64.fromBytes(bytes), text); return; }
  try { const f = new File([bytes], name, { type: mime }); if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: text }).catch(() => { }); return; } } catch (e) { }
  PF.saveFile(name, mime, bytes);
};
PF.openFile = (mimes = '') => new Promise(res => {
  if (N) { N.openFile(mimes, cbId(r => res(r.ok ? { ok: true, name: r.msg, bytes: PF.b64.toBytes(r.data) } : { ok: false, msg: r.msg }))); return; }
  const i = document.createElement('input'); i.type = 'file'; if (mimes) i.accept = mimes;
  i.onchange = async () => { const f = i.files[0]; if (!f) return res({ ok: false, msg: 'cancelled' }); res({ ok: true, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
  i.click();
});
PF.VERSION = '0.4.0';
PF.appInfo = () => { try { return N ? JSON.parse(N.appInfo()) : { version: PF.VERSION, android: '-', device: navigator.userAgent.slice(0, 60) }; } catch (e) { return { version: PF.VERSION }; } };

/* ---------- database ----------
   Everything the user enters lives in one file on the phone (files/db.json, written atomically, previous copy
   db.bak.json). Nothing is sent anywhere. Data safety across app updates (see MIGRATIONS.md):
   - db.schema = data version. Every app version reads every older one: each step in MIGRATIONS turns schema n-1
     into n, only adding or converting, never deleting entries or unknown fields.
   - Before migrating, the native side keeps a copy (files/backups/db-schema<n>-<date>.json).
   - Data written by a newer app (schema > PF.SCHEMA) is never overwritten: the app opens it read-only.
   - A damaged db.json falls back to the previous copy (db.bak.json); the damaged file is kept in backups.
   Tables are flat lists of rows with a permanent id and an `at` change time, so they map 1:1 to Excel sheets. */
PF.SCHEMA = 2;
PF.APP_ID = 'sr-physical-fitness';
PF.TABLES = ['assessments', 'plans', 'sets', 'sessions', 'activities', 'mobility', 'drinks', 'weights'];
/* user profile (Settings › User profile); more fields can come later. Metric: kg, cm, ml. */
PF.DEFAULT_PROFILE = () => ({ startKg: null, startDate: '', heightCm: null, goalKg: null, drinkMl: 2000 });
/* drinking reminders (0.4.0): number per day (0 = off) and the typical day; reminders spread evenly, none at the start */
PF.DEFAULT_REMIND = () => ({ n: 0, start: '08:00', end: '20:00' });
PF.DEFAULT_SETTINGS = () => ({
  sessions: 3, minutes: 45, days: ['Mon', 'Wed', 'Fri'],
  eq: { kb: [10, 12, 16, 24], db: [], sb: [10, 20], bar: true, bands: ['light', 'medium', 'heavy'], mini: true, bench: true, gripper: false, roller: false },
  skip: [],          // muscle groups not targeted (PF.plan.MGROUPS keys); new blocks start with these
  profile: PF.DEFAULT_PROFILE(),
  remind: PF.DEFAULT_REMIND(), // 0.4.0 drinking reminders: n per day, spread over the typical day start..end
  theme: 'auto'
});
PF.emptyDb = () => ({
  app: PF.APP_ID, schema: PF.SCHEMA, created: PF.now(), updated: PF.now(),
  settings: PF.DEFAULT_SETTINGS(),
  assessments: [],   // {id, date, at, swingKg, gobletKg, pressKg, pullup, pushup, situp, hang, toe, squat, reachR, reachL, note}
  plans: [],         // {id, at, block, start, status, prev, assessment, cfgHist:[{from, cfg}], base:{pattern:{kg|max|sec}}, swaps:[{from, slot, ex}]}
  sets: [],          // {id, at, plan, week, sess, slot, ex, set, reps, kg, sec, m, done, date}
  sessions: [],      // {id, at, plan, week, sess, date, done, note}
  activities: [],    // {id, at, date, type, name, min, km, m, elev, kg, hr, rpe, note}
  mobility: [],      // {id, at, date, item}
  drinks: [],        // {id, at, date, time, ml}            (0.3.0) one row per drink, no types
  weights: [],       // {id, at, date, kg, note}            (0.3.0) one row per day
  deleted: [],       // {table, id, at}: deletions, so an Excel import does not bring a deleted row back
  trash: [],         // {table, row, at, label}: what this phone deleted, kept 30 days for Undo (not exported)
  ui: {},            // small view state (not exported)
  history: []        // migrations done on this file
});
PF.MIGRATIONS = {
  // add/convert only, never delete user entries
  2: db => {         // 0.3.0: drinks and weight log, user profile (new, empty; nothing existing changes)
    if (!Array.isArray(db.drinks)) db.drinks = [];
    if (!Array.isArray(db.weights)) db.weights = [];
    db.settings = db.settings || {};
    if (!db.settings.profile) db.settings.profile = PF.DEFAULT_PROFILE();
  }
};
PF.normalize = db => {
  const e = PF.emptyDb();
  db.settings = Object.assign(e.settings, db.settings || {});
  db.settings.eq = Object.assign(PF.DEFAULT_SETTINGS().eq, db.settings.eq || {});
  if (!Array.isArray(db.settings.skip)) db.settings.skip = [];
  db.settings.remind = Object.assign(PF.DEFAULT_REMIND(), db.settings.remind && typeof db.settings.remind === 'object' ? db.settings.remind : {});
  db.settings.profile = Object.assign(PF.DEFAULT_PROFILE(), db.settings.profile && typeof db.settings.profile === 'object' ? db.settings.profile : {});
  for (const t of PF.TABLES.concat(['deleted', 'history', 'trash'])) if (!Array.isArray(db[t])) db[t] = [];
  const cut30 = new Date(Date.now() - 30 * 864e5).toISOString(), cut365 = new Date(Date.now() - 365 * 864e5).toISOString();
  db.trash = db.trash.filter(x => x && x.row && x.at >= cut30);                // Recently deleted: 30 days
  db.deleted = db.deleted.filter(d => d && d.table && d.id && (!d.at || d.at >= cut365));   // tombstones: 365 days (contract E)
  if (!db.ui || typeof db.ui !== 'object') db.ui = {};
  for (const t of PF.TABLES) {               // every row has an id; duplicates (same id) are merged to one
    const seen = new Map();
    db[t] = db[t].filter(r => r && typeof r === 'object').map(r => { if (!r.id) r.id = PF.uid(t[0]); if (!r.at) r.at = db.updated || PF.now(); return r; })
      .filter(r => { const o = seen.get(r.id); if (o) { if (r.at > o.at) Object.assign(o, r); return false; } seen.set(r.id, r); return true; });
  }
  return db;
};
PF.migrate = db => {
  const from = db.schema == null || db.schema === '' ? 1 : +db.schema;
  if (!db.app) db.app = PF.APP_ID;
  if (from > PF.SCHEMA) return db;
  for (let v = from + 1; v <= PF.SCHEMA; v++) { if (PF.MIGRATIONS[v]) PF.MIGRATIONS[v](db); db.schema = v; }
  db.schema = PF.SCHEMA;
  PF.normalize(db);
  if (from < PF.SCHEMA) db.history.push({ at: PF.now(), from, to: PF.SCHEMA, app: PF.appInfo().version || 'web' });
  return db;
};
PF.isOurs = j => j && typeof j === 'object' && !Array.isArray(j) && (!j.app || j.app === PF.APP_ID) && (j.settings || j.plans || j.sets);
const parse = txt => { if (!txt) return null; try { const j = JSON.parse(txt); return PF.isOurs(j) ? j : null; } catch (e) { return null; } };
function readDb() {
  let txt = '';
  try { txt = N ? N.loadDb() : (localStorage.getItem('pf.db') || ''); } catch (e) { }
  let db = parse(txt);
  if (!db && txt) {
    PF.recovered = true;
    try { if (N) { N.backupDb('db-damaged-' + Date.now() + '.json'); db = parse(N.loadDbBackup()); } else { localStorage.setItem('pf.db.damaged', txt); db = parse(localStorage.getItem('pf.db.bak')); } } catch (e) { }
  }
  return db;
}
PF.load = () => {
  PF.recovered = false; PF.migrated = 0;
  PF.db = readDb();
  PF.firstRun = !PF.db;
  if (!PF.db) PF.db = PF.emptyDb();
  PF.dataSchema = PF.db.schema == null || PF.db.schema === '' ? 1 : +PF.db.schema;
  PF.readOnly = PF.dataSchema > PF.SCHEMA;
  if (PF.readOnly) {                                   // newer app wrote this file: fill gaps in memory only, never save
    const keep = PF.db; PF.db = PF.normalize(PF.clone(keep));
  } else {
    if (PF.dataSchema < PF.SCHEMA && !PF.firstRun) {
      try { N ? N.backupDb(`db-schema${PF.dataSchema}-${PF.todayIso()}.json`) : localStorage.setItem('pf.db.pre' + PF.dataSchema, localStorage.getItem('pf.db')); } catch (e) { }
      PF.migrated = PF.dataSchema;
    }
    PF.migrate(PF.db);
  }
  return PF.db;
};
const writeNow = () => {
  if (PF.readOnly) return false;
  PF.db.updated = PF.now();
  const txt = JSON.stringify(PF.db);
  let ok = false;
  try { ok = N ? N.saveDb(txt) : (localStorage.setItem('pf.db.bak', localStorage.getItem('pf.db') || ''), localStorage.setItem('pf.db', txt), true); } catch (e) { ok = false; }
  if (!ok) PF.toast('Could not save on this device.', true);
  return ok;
};
const writeLater = PF.debounce(writeNow, 300);
PF.save = now => now ? writeLater.now() : writeLater();
PF.flush = () => writeLater.now();
PF.backupDb = name => { try { return N ? N.backupDb(name) : (localStorage.setItem('pf.db.' + name, localStorage.getItem('pf.db') || ''), true); } catch (e) { return false; } };
window.addEventListener('pagehide', () => PF.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) PF.flush(); });

/* row helpers: every change stamps `at`; deletes leave a tombstone */
PF.put = (table, row) => {
  if (PF.readOnly) return row;
  row.at = PF.now(); if (!row.id) row.id = PF.uid(table[0]);
  const list = PF.db[table]; const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) list[i] = row; else list.push(row);
  PF.save(); return row;
};
/** delete a row everywhere (tombstone, contract E); with a label it is kept 30 days under Settings › Recently deleted */
PF.del = (table, id, label) => {
  if (PF.readOnly) return;
  const row = PF.db[table].find(r => r.id === id), at = PF.now();
  PF.db[table] = PF.db[table].filter(r => r.id !== id);
  PF.db.deleted = PF.db.deleted.filter(d => !(d.table === table && d.id === id));
  PF.db.deleted.push({ table, id, at, label: label || '' });
  if (row && label) PF.db.trash.push({ table, row: PF.clone(row), at, label });
  PF.save();
};
/** Undo a delete: the entry is saved again with a new change time, which beats the delete on every device */
PF.undel = i => {
  if (PF.readOnly) return false;
  const x = PF.db.trash[i]; if (!x) return false;
  PF.db.trash.splice(i, 1);
  PF.put(x.table, PF.clone(x.row));
  return true;
};
PF.load();
