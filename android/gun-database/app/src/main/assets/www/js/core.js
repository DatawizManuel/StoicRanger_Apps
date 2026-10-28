/* Stoic Ranger — core: storage, native bridge, helpers, shared maths. Plain scripts, one global RB. */
'use strict';
const RB = window.RB = {};

/* ---------- helpers ---------- */
RB.$ = (sel, root = document) => root.querySelector(sel);
RB.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
RB.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
RB.num = v => { if (v === '' || v == null) return null; const n = +String(v).replace(',', '.'); return isFinite(n) ? n : null; };
RB.fx = (v, d = 1) => v == null || !isFinite(v) ? '' : (+v).toFixed(d).replace(/^-(0(\.0+)?)$/, '$1');
RB.fmtInt = v => v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('de-AT');
RB.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
RB.nowTime = () => new Date().toTimeString().slice(0, 5);
RB.fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
RB.uid = (p = 'X') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
RB.clone = o => JSON.parse(JSON.stringify(o));
RB.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
RB.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- native bridge (falls back to the browser for development) ---------- */
const N = window.RBNative || null;
RB.native = !!N;
const cbs = {};
window.RBNativeCallback = (id, res) => { const f = cbs[id]; delete cbs[id]; f && f(res); };
const cbId = f => { const id = 'cb' + Math.random().toString(36).slice(2); cbs[id] = f; return id; };
RB.b64 = {
  fromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  toBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
  fromText(t) { return RB.b64.fromBytes(new TextEncoder().encode(t)); },
};
RB.saveFile = (name, mime, bytesOrText) => new Promise(res => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.saveFile(name, mime, RB.b64.fromBytes(u8), cbId(res)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); res({ ok: true, msg: name });
});
RB.shareFile = (name, mime, bytesOrText, text = '') => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.shareFile(name, mime, RB.b64.fromBytes(u8), text); return; }
  RB.saveFile(name, mime, u8);
};
/** Open a file; resolves {ok, msg:name, bytes:Uint8Array}. */
RB.openFile = (mimes = '') => new Promise(res => {
  if (N) { N.openFile(mimes, cbId(r => res(r.ok ? { ok: true, name: r.msg, bytes: RB.b64.toBytes(r.data) } : { ok: false, msg: r.msg }))); return; }
  const i = document.createElement('input'); i.type = 'file'; if (mimes) i.accept = mimes;
  i.onchange = async () => { const f = i.files[0]; if (!f) return res({ ok: false, msg: 'cancelled' }); res({ ok: true, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
  i.click();
});
RB.print = (html, job, size) => {   // size: 'A4' (default), 'A5', 'A6'
  if (N) { if (size && N.printSized) N.printSized(html, job, size); else N.print(html, job); return; }
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.srcdoc = html; f.onload = () => { setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
};
RB.secret = {
  get: k => { try { return N ? N.getSecret(k) : (localStorage.getItem('rb.secret.' + k) || ''); } catch (e) { return ''; } },
  set: (k, v) => { try { N ? N.setSecret(k, v) : localStorage.setItem('rb.secret.' + k, v); } catch (e) { } },
};
RB.appInfo = () => { try { return N ? JSON.parse(N.appInfo()) : { version: 'web', android: '-', device: navigator.userAgent.slice(0, 60) }; } catch (e) { return {}; } };

/* Targets live in the database (table "targets"). Built-in ones are real entries, not examples.
   Geometry: 10-ring (or plate) Ø d10, equal ring width w outside it, `rings` scoring rings from the 10 outwards. */
RB.BUILTIN_TARGETS = [
  { id: 'T-ISSF300', name: 'ISSF 300 m rifle', type: 'Rings', rings: 10, d10: 100, w: 50, xd: 50, distM: 300, sizeMm: '1000 mm Ø (1-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-ISSF50', name: 'ISSF 50 m rifle', type: 'Rings', rings: 10, d10: 10.4, w: 8, xd: 5, distM: 50, sizeMm: '154.4 mm Ø (1-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-ISSF10R', name: 'ISSF 10 m air rifle', type: 'Rings', rings: 10, d10: 0.5, w: 2.5, xd: null, distM: 10, sizeMm: '45.5 mm Ø (1-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-ISSF50P', name: 'ISSF 50 m / 25 m precision pistol', type: 'Rings', rings: 10, d10: 50, w: 25, xd: 25, distM: 50, sizeMm: '500 mm Ø (1-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-ISSF25RF', name: 'ISSF 25 m rapid fire pistol', type: 'Rings', rings: 6, d10: 100, w: 40, xd: 50, distM: 25, sizeMm: '500 mm Ø (5-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-ISSF10P', name: 'ISSF 10 m air pistol', type: 'Rings', rings: 10, d10: 11.5, w: 8, xd: 5, distM: 10, sizeMm: '155.5 mm Ø (1-ring)', source: 'ISSF General Technical Rules, 6.3.4' },
  { id: 'T-SI100M', name: 'Sight-in 100 m · 0.1 mrad rings', type: 'Rings', rings: 10, d10: 20, w: 10, xd: null, distM: 100, sizeMm: '200 mm Ø', source: 'Generic: each ring = 1 cm = 0.1 mrad at 100 m' },
  { id: 'T-SI100Y', name: 'Sight-in 100 yd · ½ MOA rings', type: 'Rings', rings: 10, d10: 26.6, w: 13.3, xd: null, distM: 91.44, sizeMm: '266 mm Ø', source: 'Generic: each ring = ½ MOA at 100 yd' },
  { id: 'T-PL100', name: 'Steel plate Ø 100 mm', type: 'Steel plate', rings: 1, d10: 100, w: 50, distM: 100, sizeMm: '100 mm Ø', source: 'Generic' },
  { id: 'T-PL200', name: 'Steel plate Ø 200 mm', type: 'Steel plate', rings: 1, d10: 200, w: 100, distM: 300, sizeMm: '200 mm Ø', source: 'Generic' },
  { id: 'T-PL300', name: 'Steel plate Ø 300 mm', type: 'Steel plate', rings: 1, d10: 300, w: 150, distM: 600, sizeMm: '300 mm Ø', source: 'Generic' },
].map(t => Object.assign({ builtin: true, notes: '' }, t));
RB.target = id => RB.byId(RB.db.targets || [], id);
// RB.PRESETS keeps its old shape for the views: { id: { d10, w, rings, name, label } } plus "custom"
Object.defineProperty(RB, 'PRESETS', { get() {
  const o = {};
  (RB.db.targets && RB.db.targets.length ? RB.db.targets : RB.BUILTIN_TARGETS).forEach(t => {
    o[t.id] = { d10: +t.d10 || null, w: +t.w || null, rings: +t.rings || 10, name: t.name,
      label: `${t.name} (${t.rings == 1 ? 'Ø' + RB.U.fmt('len', t.d10) : '10: Ø' + RB.U.fmt('len', t.d10) + ', ring ' + RB.U.fmt('len', t.w)})` };
  });
  o.custom = { d10: null, w: null, rings: 10, name: 'Custom', label: 'Custom' };
  return o;
} });
/* ---------- database ----------
   Data safety across app updates (see MIGRATIONS.md in the project):
   - db.schema says which data version a file has. Every app version can read every older one: each step in
     MIGRATIONS turns schema n-1 into n and never deletes a user's entries or unknown fields.
   - Before migrating, the native side keeps a copy (files/backups/db-schema<n>-<date>.json).
   - Data written by a newer app (schema > RB.SCHEMA) is never overwritten: the app opens it read-only.
   - A damaged db.json falls back to the previous copy (db.bak.json). */
RB.SCHEMA = 5;
/* Purposes of a dataset. evalAs decides what a sheet is evaluated for:
   rifle (shown as Gun) = barrel wear and ammo precision (like Test), shooter = the shooter's progress (like Training), rounds = only counted. */
RB.DEFAULT_PURPOSES = [
  { id: 'training', name: 'Training', evalAs: 'shooter' },
  { id: 'test', name: 'Test', evalAs: 'rifle' },
  { id: 'competition', name: 'Competition', evalAs: 'shooter' },
  { id: 'loaddev', name: 'Load development', evalAs: 'rifle' },
  { id: 'zeroing', name: 'Zeroing', evalAs: 'rounds' },
  { id: 'hunting', name: 'Hunting', evalAs: 'rounds' },
];
RB.EVAL_AS = { rifle: 'Gun/ammo', shooter: 'Shooter', rounds: 'Rounds only' };
RB.emptyDb = () => ({
  schema: RB.SCHEMA, created: new Date().toISOString(), updated: new Date().toISOString(),
  weapons: [], barrels: [], munitions: [], shooters: [], trainers: [], roundsLog: [], sheets: [], targets: RB.BUILTIN_TARGETS.map(t => Object.assign({}, t)),
  settings: { preset: 'T-ISSF300', units: 'metric', claudeModel: 'claude-opus-5-5', theme: 'auto', sheetPrefix: 'ST', dashFilter: { shooter: '', weapon: '', munition: '' }, purposes: RB.DEFAULT_PURPOSES.map(p => Object.assign({}, p)), link: { enabled: false } },
  history: [],
});
const NUMERIC_SHEET_KEYS = ['rounds', 'bullet', 'v0', 'v0sd', 'zero', 'dialE', 'dialW', 'elev', 'dist', 'temp', 'hum', 'press', 'bd', 'd10', 'w'];
RB.MIGRATIONS = {
  // 0.5.0 -> 0.6.0: trainers table, gun type (existing guns are rifles), example data removed for good (own entries stay)
  5(db) {
    if (!Array.isArray(db.trainers)) db.trainers = [];
    (db.weapons || []).forEach(w => { if (!w.type) w.type = 'Rifle'; });
    RB.EX_TABLES.concat(['trainers']).forEach(t => { if (Array.isArray(db[t])) db[t] = db[t].filter(r => !r.example); });
    return db;
  },
  // 0.3.0 -> 0.4.0: targets table with the built-in targets, sheet presets become target ids, units setting
  4(db) {
    db.settings = db.settings || {};
    if (!Array.isArray(db.targets)) db.targets = [];
    RB.BUILTIN_TARGETS.forEach(t => { if (!db.targets.some(x => x.id === t.id)) db.targets.push(Object.assign({}, t)); });
    const map = { issf300: 'T-ISSF300', issf50: 'T-ISSF50' };
    (db.sheets || []).forEach(s => { if (map[s.preset]) s.preset = map[s.preset]; });
    if (map[db.settings.preset]) db.settings.preset = map[db.settings.preset];
    if (!db.settings.units) db.settings.units = 'metric';
    return db;
  },
  // 0.2.x -> 0.3.0: purposes list in settings (Test/Training keep their ids); unknown purposes on sheets become own categories
  3(db) {
    db.settings = db.settings || {};
    const P = Array.isArray(db.settings.purposes) ? db.settings.purposes : (db.settings.purposes = RB.DEFAULT_PURPOSES.map(p => Object.assign({}, p)));
    (db.sheets || []).forEach(s => {
      if (!s.purpose) return;
      const v = String(s.purpose).trim(), lc = v.toLowerCase();
      const hit = P.find(p => p.id === v || p.id === lc || p.name.toLowerCase() === lc);
      if (hit) { s.purpose = hit.id; return; }
      const id = 'p-' + lc.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'p-other';
      if (!P.some(p => p.id === id)) P.push({ id, name: v, evalAs: 'rounds' });
      s.purpose = id;
    });
    if (db.settings.dashFilter && db.settings.dashFilter.shooter == null) db.settings.dashFilter.shooter = '';
    return db;
  },
  // 0.1.0 -> 0.2.0: dashboard filters in settings, decimal commas on sheets, numeric hits, ids everywhere
  2(db) {
    db.settings = db.settings || {};
    if (!db.settings.dashFilter) db.settings.dashFilter = { weapon: '', munition: '', shooter: '' };
    (db.sheets || []).forEach((s, i) => {
      if (!s.id) s.id = 'SH-m' + Date.now().toString(36) + i;
      NUMERIC_SHEET_KEYS.forEach(k => { if (typeof s[k] === 'number') s[k] = String(s[k]); else if (typeof s[k] === 'string' && /^-?\d+,\d+$/.test(s[k].trim())) s[k] = s[k].trim().replace(',', '.'); });
      s.hits = Array.isArray(s.hits) ? s.hits.map(h => ({ x: +String(h.x).replace(',', '.') || 0, y: +String(h.y).replace(',', '.') || 0 })) : [];
      if (s.vel != null && !Array.isArray(s.vel)) s.vel = [];
    });
    ['weapons', 'barrels', 'munitions', 'shooters'].forEach(t => (db[t] || []).forEach((r, i) => { if (!r.id) r.id = 'X-m' + t + i; }));
    (db.roundsLog || []).forEach((r, i) => { if (!r.id) r.id = 'R-m' + i; });
    return db;
  },
};
/** Bring any older data up to RB.SCHEMA, step by step. Returns the same object. */
RB.purposes = () => (RB.db.settings.purposes && RB.db.settings.purposes.length ? RB.db.settings.purposes : RB.DEFAULT_PURPOSES);
RB.purpose = id => RB.purposes().find(p => p.id === id) || null;
RB.purposeName = id => { const p = RB.purpose(id); return p ? p.name : (id || ''); };
RB.evalAs = id => { const p = RB.purpose(id); return p ? p.evalAs : ''; };

/* Minimum data before anything is evaluated: 3 sets of at least 10 rounds per thing being rated. */
RB.MIN_SETS = 3; RB.SET_ROUNDS = 10;
/** sizes: rounds (or shots) of each candidate set. Returns { ok, sets, msg }. */
RB.enough = sizes => {
  const full = sizes.filter(n => n >= RB.SET_ROUNDS).length;
  if (full >= RB.MIN_SETS) return { ok: true, sets: full, msg: '' };
  const missing = RB.MIN_SETS - full;
  return { ok: false, sets: full, msg: `Not enough data to evaluate – need ${missing} more set${missing > 1 ? 's' : ''} of ${RB.SET_ROUNDS} rounds (${missing * RB.SET_ROUNDS} more rounds).` };
};

/* Example data: flagged example:true. The first real entry in a table removes that table's examples. */
RB.EX_TABLES = ['weapons', 'barrels', 'munitions', 'shooters', 'roundsLog', 'sheets'];
RB.purgeExamples = db => {
  const gone = [];
  for (const t of RB.EX_TABLES) {
    const L = db[t] || [];
    if (L.some(r => r.example) && L.some(r => !r.example)) { db[t] = L.filter(r => !r.example); gone.push(t); }
  }
  return gone;
};
RB.hasExamples = () => RB.EX_TABLES.some(t => (RB.db[t] || []).some(r => r.example));

RB.migrate = db => {
  const e = RB.emptyDb();
  const from = +db.schema || 1;
  for (const k of ['weapons', 'barrels', 'munitions', 'shooters', 'trainers', 'roundsLog', 'sheets']) if (!Array.isArray(db[k])) db[k] = [];
  if (!Array.isArray(db.targets) && from >= RB.SCHEMA) db.targets = RB.BUILTIN_TARGETS.map(t => Object.assign({}, t));
  db.settings = Object.assign(e.settings, db.settings || {});
  if (!Array.isArray(db.history)) db.history = [];
  if (from > RB.SCHEMA) return db;                       // newer than this app: leave untouched
  for (let v = from + 1; v <= RB.SCHEMA; v++) { if (RB.MIGRATIONS[v]) RB.MIGRATIONS[v](db); db.schema = v; }
  db.schema = RB.SCHEMA;
  if (from < RB.SCHEMA) db.history.push({ at: new Date().toISOString(), from, to: RB.SCHEMA, app: (RB.appInfo().version || 'web') });
  return db;
};
function parse(txt) { if (!txt) return null; try { const j = JSON.parse(txt); return j && typeof j === 'object' && Array.isArray(j.sheets) ? j : null; } catch (e) { return null; } }
function readDb() {
  let txt = '';
  try { txt = N ? N.loadDb() : (localStorage.getItem('rb.db') || ''); } catch (e) { }
  let db = parse(txt);
  if (!db && txt) {                                       // damaged file: use the previous copy, keep the damaged one
    RB.recovered = true;
    try { if (N) { N.backupDb('db-damaged-' + Date.now() + '.json'); db = parse(N.loadDbBackup()); } else db = parse(localStorage.getItem('rb.db.bak')); } catch (e) { }
  }
  return db;
}
RB.db = readDb();
RB.firstRun = !RB.db;
if (!RB.db) RB.db = RB.emptyDb();
RB.dataSchema = +RB.db.schema || 1;
RB.readOnly = RB.dataSchema > RB.SCHEMA;
if (!RB.readOnly && RB.dataSchema < RB.SCHEMA && !RB.firstRun) {
  try { N ? N.backupDb(`db-schema${RB.dataSchema}-${new Date().toISOString().slice(0, 10)}.json`) : localStorage.setItem('rb.db.pre' + RB.dataSchema, localStorage.getItem('rb.db')); } catch (e) { }
  RB.migrate(RB.db);
  RB.migrated = RB.dataSchema;
} else if (!RB.readOnly) RB.migrate(RB.db);
const writeNow = () => {
  if (RB.readOnly) return;                                 // never overwrite data from a newer app version
  RB.db.updated = new Date().toISOString();
  const txt = JSON.stringify(RB.db);
  let ok = false;
  try { ok = N ? N.saveDb(txt) : (localStorage.setItem('rb.db.bak', localStorage.getItem('rb.db') || ''), localStorage.setItem('rb.db', txt), true); } catch (e) { ok = false; }
  if (!ok) RB.toast && RB.toast('Could not save data on this device.', true);
};
const writeLater = RB.debounce(writeNow, 400);
RB.save = (now) => now ? writeLater.now() : writeLater();
RB.flush = () => writeLater.now();
RB.backupDb = name => { try { return N ? N.backupDb(name) : (localStorage.setItem('rb.db.' + name, localStorage.getItem('rb.db') || ''), true); } catch (e) { return false; } };
window.addEventListener('pagehide', RB.flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) RB.flush(); });

/* next free ID like W-004 */
RB.nextId = (list, prefix) => {
  let n = 0; list.forEach(r => { const m = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id || ''); if (m) n = Math.max(n, +m[1]); });
  return `${prefix}-${String(n + 1).padStart(3, '0')}`;
};
RB.byId = (list, id) => list.find(r => r.id === id) || null;
RB.weapon = id => RB.byId(RB.db.weapons, id);
RB.barrel = id => RB.byId(RB.db.barrels, id);
RB.munition = id => RB.byId(RB.db.munitions, id);
RB.shooter = id => RB.byId(RB.db.shooters, id);

/** Match a name as written on a sheet against Name + Aliases (case-insensitive). */
RB.matchName = (list, text) => {
  const t = String(text || '').trim().toLowerCase(); if (!t) return null;
  return list.find(r => [r.name, ...String(r.aliases || '').split(';')].some(a => a && a.trim().toLowerCase() === t)) || null;
};
/** Fitted barrel of a weapon at a date (latest installed on or before the date, not removed before it). */
RB.barrelAt = (weaponId, date) => {
  const c = RB.db.barrels.filter(b => b.weaponId === weaponId && (!b.installed || !date || b.installed <= date) && (!b.removed || !date || b.removed > date));
  c.sort((a, b) => (a.installed || '').localeCompare(b.installed || ''));
  return c.length ? c[c.length - 1] : (RB.db.barrels.filter(b => b.weaponId === weaponId && !b.removed)[0] || null);
};

/* ---------- target geometry (same as the datasheet page) ---------- */
RB.ringR = (k, t) => t.d10 / 2 + (10 - k) * t.w;                 // outer radius (mm) of ring k
RB.mmToF = (r, t) => r <= t.d10 / 2 ? r / (t.d10 / 2) : 1 + (r - t.d10 / 2) / t.w;  // schematic ring units
RB.fToMm = (f, t) => f <= 1 ? f * t.d10 / 2 : t.d10 / 2 + (f - 1) * t.w;
RB.tZoom = t => 10 / (t.rings >= 10 ? 10 : t.rings + 1);           // schematic: outermost drawn ring at radius 10
RB.scoreOf = (x, y, t, bd) => { const r = Math.hypot(x, y) - (bd || 0) / 2, lo = 11 - (t.rings || 10); for (let k = 10; k >= lo; k--) if (r <= RB.ringR(k, t)) return k; return 0; };
RB.tgtOf = s => { const p = RB.PRESETS[s.preset]; const d10 = RB.num(s.d10) || (p && p.d10) || 100, w = RB.num(s.w) || (p && p.w) || 50; return { d10, w, rings: Math.max(1, Math.min(10, (p && p.rings) || 10)) }; };

/** Bullet diameters by calibre (mm), used to prefill "Bullet Ø". */
RB.CAL_BD = [[/6[.,]5|264/i, 6.71], [/\.223|5[.,]56|\.224|22[- ]?(arc|br)/i, 5.70], [/\.308|7[.,]62\s*x\s*51|\.30|300|7[.,]62/i, 7.82], [/6\s?mm|\.243|6[.,]2/i, 6.20], [/\.338|8[.,]6/i, 8.59], [/7\s?mm|\.284|7[.,]2/i, 7.21], [/\.22\s*lr|\.22 ?l\.?r/i, 5.66]];
RB.bulletDia = cal => { const c = String(cal || ''); if (/\.22\s*lr/i.test(c)) return 5.66; for (const [re, d] of RB.CAL_BD) if (re.test(c)) return d; return null; };
/** Typical accuracy barrel life (rounds) by calibre; editable per barrel. Rough figures only. */
RB.barrelLifeFor = cal => {
  const c = String(cal || '');
  if (/6[.,]5\s*(cm|creedmoor)/i.test(c)) return 2750;
  if (/6[.,]5\s*prc|6[.,]5.?284|6\s?mm\s*(cm|creedmoor)|\.243/i.test(c)) return 2000;
  if (/\.300|7\s?mm\s*(rem|prc)|\.338/i.test(c)) return 2000;
  if (/\.308|7[.,]62\s*x\s*51/i.test(c)) return 5000;
  if (/\.223|5[.,]56/i.test(c)) return 10000;
  if (/\.22\s*lr/i.test(c)) return 50000;
  return 3000;
};

/* ---------- velocities (Garmin Xero C1 Pro) ---------- */
/** Parse a list of shot velocities (m/s) from free text or a CSV export: average, SD, ES. */
RB.parseVelocities = (text, fps) => {   // fps: the text is in ft/s (imperial setting); result is always m/s
  const vals = (String(text || '').match(/\d{3,4}(?:[.,]\d+)?/g) || []).map(v => +v.replace(',', '.') * (fps ? 0.3048 : 1)).filter(v => v >= 150 && v <= 1700);
  return RB.velStats(vals);
};
RB.velStats = vals => {
  const n = vals.length; if (!n) return { n: 0, vals: [] };
  const avg = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / (n - 1)) : null;
  return { n, vals, avg, sd, es: Math.max(...vals) - Math.min(...vals) };
};
/** Xero / ShotView CSV: pick the speed column if the header names one, else any plausible numbers. */
RB.parseXeroCsv = text => {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  const rows = lines.map(l => l.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, '')));
  let col = -1, unit = 'm/s';
  for (const r of rows.slice(0, 10)) {
    const i = r.findIndex(c => /speed|velocity|geschw|v0/i.test(c));
    if (i >= 0) { col = i; if (/fps|ft\/s/i.test(r[i]) || rows.some(x => /fps|ft\/s/i.test(x.join(' ')))) unit = 'fps'; break; }
  }
  if (col < 0) return RB.parseVelocities(text);
  let vals = rows.map(r => RB.num(r[col])).filter(v => v != null && v > 100);
  if (unit === 'fps') vals = vals.map(v => v * 0.3048);
  return Object.assign(RB.velStats(vals), { converted: unit === 'fps' });
};

/* ---------- UI primitives shared by views ---------- */
RB.toast = (msg, err) => {
  let t = RB.$('#toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(RB._tt); RB._tt = setTimeout(() => t.classList.remove('on'), err ? 5000 : 2600);
};
/** Two-tap confirm for destructive buttons. */
RB.armed = (btn, fn) => {
  const label = btn.innerHTML; let t;
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.innerHTML = label; fn(); return; }
    btn.dataset.armed = 1; btn.textContent = 'Tap again to confirm';
    t = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = label; }, 3000);
  });
};
RB.sheet = (title, bodyHtml, { onClose } = {}) => {     // bottom sheet / modal
  const m = RB.h(`<div class="modal" role="dialog" aria-modal="true"><div class="mcard"><div class="mhead"><h3>${RB.esc(title)}</h3><button class="ib" data-close aria-label="Close">✕</button></div><div class="mbody">${bodyHtml}</div></div></div>`);
  document.body.appendChild(m);
  const close = () => { m.remove(); RB._modal = null; onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  RB._modal = close;
  return { el: m, body: RB.$('.mbody', m), close };
};
