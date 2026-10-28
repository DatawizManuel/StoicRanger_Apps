/* Stoic Ranger - Training Log — core: storage, native bridge, helpers, tables. Plain scripts, one global TL. */
'use strict';
const TL = window.TL = {};

/* ---------- helpers ---------- */
TL.$ = (sel, root = document) => root.querySelector(sel);
TL.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
TL.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
TL.num = v => { if (v === '' || v == null) return null; const n = +String(v).trim().replace(',', '.'); return isFinite(n) ? n : null; };
TL.fx = (v, d = 1) => v == null || !isFinite(v) ? '' : (+v).toFixed(d).replace(/^-(0(\.0+)?)$/, '$1');
/** Hours: 2 → "2", 2.5 → "2.5", 1.25 → "1.25" */
TL.fh = v => v == null || !isFinite(v) ? '' : String(Math.round(v * 100) / 100);
TL.fmtInt = v => v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('de-AT');
TL.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
TL.fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
TL.clone = o => JSON.parse(JSON.stringify(o));
TL.debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.now = (...a) => { clearTimeout(t); fn(...a); }; return f; };
TL.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
/** Permanent, globally unique id of a record. Never changes, also not on export/import: other Stoic Ranger apps
    will refer to entries by it once linking is switched on. */
TL.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
}));
TL.webUrl = u => !u ? '' : /^https?:\/\//i.test(u) ? u : 'https://' + u;

/* ---------- native bridge (falls back to the browser for development) ---------- */
const N = window.TLNative || null;
TL.native = !!N;
const cbs = {};
window.TLNativeCallback = (id, res) => { const f = cbs[id]; delete cbs[id]; f && f(res); };
const cbId = f => { const id = 'cb' + Math.random().toString(36).slice(2); cbs[id] = f; return id; };
TL.b64 = {
  fromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  toBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
};
TL.saveFile = (name, mime, bytesOrText) => new Promise(res => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.saveFile(name, mime, TL.b64.fromBytes(u8), cbId(res)); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); res({ ok: true, msg: name });
});
TL.shareFile = (name, mime, bytesOrText, text = '') => {
  const u8 = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  if (N) { N.shareFile(name, mime, TL.b64.fromBytes(u8), text); return; }
  TL.saveFile(name, mime, u8);
};
/** Open a file; resolves {ok, name, bytes:Uint8Array}. */
TL.openFile = (mimes = '') => new Promise(res => {
  if (N) { N.openFile(mimes, cbId(r => res(r.ok ? { ok: true, name: r.msg, bytes: TL.b64.toBytes(r.data) } : { ok: false, msg: r.msg }))); return; }
  const i = document.createElement('input'); i.type = 'file'; if (mimes) i.accept = mimes;
  i.onchange = async () => { const f = i.files[0]; if (!f) return res({ ok: false, msg: 'cancelled' }); res({ ok: true, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
  i.click();
});
TL.print = (html, job) => {
  if (N) { N.print(html, job); return; }
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.srcdoc = html; f.onload = () => { setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
};
TL.appInfo = () => { try { return N ? JSON.parse(N.appInfo()) : { version: 'web', android: '-', device: navigator.userAgent.slice(0, 60) }; } catch (e) { return {}; } };

/* ---------- tables ----------
   [key, label, type, opts]; types: text | int | num | date | time | select | area | tel | email | url */
TL.TABLES = {
  shooters: {
    title: 'Shooters', one: 'shooter', prefix: 'S',
    fields: [
      ['name', 'Name', 'text', { req: true }],
      ['status', 'Status', 'select', { span: 3, options: ['Active', 'Inactive'] }],
      ['notes', 'Notes', 'area'],
    ],
  },
  weapons: {
    title: 'Guns', one: 'gun', prefix: 'W',   // table key stays 'weapons' (data compatibility with the Gun Database / database.xlsx)
    fields: [
      ['name', 'Name', 'text', { req: true, hint: 'How it appears in lists, e.g. "Tikka T3x TAC A1"' }],
      ['type', 'Type', 'select', { span: 3, options: ['', 'Rifle', 'Pistol', 'Revolver', 'Shotgun', 'Air rifle', 'Air pistol', 'Other'] }],
      ['caliber', 'Caliber', 'text', { span: 3 }],
      ['make', 'Make', 'text', { span: 3 }], ['model', 'Model', 'text', { span: 3 }],
      ['zeroM', 'Zero distance m', 'num', { span: 3 }],
      ['serial', 'Serial no.', 'text', { span: 3 }],
      ['status', 'Status', 'select', { span: 3, options: ['Active', 'Sold', 'Retired'] }],
      ['notes', 'Notes', 'area'],
    ],
  },
  trainers: {
    title: 'Trainers', one: 'trainer / organizer', prefix: 'T',
    fields: [
      ['name', 'Trainer / organizer', 'text', { req: true, hint: 'Person, club, school or range' }],
      ['contact', 'Contact person', 'text'],
      ['phone', 'Phone', 'tel', { span: 3 }], ['email', 'E-mail', 'email', { span: 3 }],
      ['website', 'Website', 'url'],
      ['notes', 'Notes', 'area'],
    ],
  },
};
TL.TRAINING_FIELDS = ['shooterId', 'date', 'start', 'durationH', 'fire', 'desc', 'weapons', 'trainerId', 'remarks'];
/** Live fire or dry fire (Manuel 2026-10-27): dry fire never counts as rounds (totals, print, Gun Database). */
TL.FIRE = { live: 'Live fire', dry: 'Dry fire' };
TL.isDry = t => !!t && t.fire === 'dry';

/* ---------- database ----------
   Data safety across app updates (see MIGRATIONS.md):
   - db.schema says which data version a file has. Every app version reads every older one: each step in
     MIGRATIONS turns schema n-1 into n and never deletes a user's entries or unknown fields.
   - Before migrating, the native side keeps a copy (files/backups/db-schema<n>-<date>.json).
   - Data written by a newer app (schema > TL.SCHEMA) is never overwritten: the app opens it read-only.
   - A damaged db.json falls back to the previous copy (db.bak.json). */
TL.SCHEMA = 3;
TL.APP_ID = 'sr-training-log';
TL.LISTS = ['shooters', 'weapons', 'trainers', 'trainings'];
TL.emptyDb = () => ({
  app: TL.APP_ID, schema: TL.SCHEMA, created: new Date().toISOString(), updated: new Date().toISOString(),
  shooters: [], weapons: [], trainers: [], trainings: [],
  settings: {
    theme: 'auto', lastShooter: '',
    dashFilter: { shooter: '', year: '', weapon: '', trainer: '', fire: '' },
    // linking with other Stoic Ranger apps: off until the user agrees in a later version
    link: { enabled: false, apps: {} },
  },
  history: [],
});
TL.MIGRATIONS = {
  // 0.2.0 -> 0.3.0: no example data any more (Manuel, 2026-10-25). Only entries flagged example:true go; an example
  // shooter / gun / trainer that an own training uses becomes the user's own entry. A copy of the old file is kept.
  2(db) {
    const own = (db.trainings || []).filter(t => !t.example);
    own.forEach(tr => [['shooters', tr.shooterId], ['trainers', tr.trainerId], ...(tr.weapons || []).map(w => ['weapons', w.weaponId])].forEach(([t, id]) => {
      const r = id && (db[t] || []).find(x => x.id === id); if (r && r.example) delete r.example;
    }));
    TL.LISTS.forEach(t => { if (Array.isArray(db[t])) db[t] = db[t].filter(r => !r.example); });
    (db.weapons || []).forEach(w => { if (typeof w.zeroM === 'string') w.zeroM = TL.num(w.zeroM); });
    return db;
  },
  // 0.3.0 -> 0.4.0: trainings are live fire or dry fire; every existing training was live fire.
  3(db) {
    (db.trainings || []).forEach(t => { if (t && t.fire !== 'dry' && t.fire !== 'live') t.fire = 'live'; });
    return db;
  },
  // next data format: 4(db) { … } (add/convert only, never delete user entries)
};
/** Fill gaps every version relies on: ids, permanent uids, arrays. Safe to run on any data, any number of times. */
TL.normalize = db => {
  TL.LISTS.forEach(t => {
    if (!Array.isArray(db[t])) db[t] = [];
    db[t].forEach(r => { if (!r.uid) r.uid = TL.uuid(); });
  });
  ['shooters', 'weapons', 'trainers'].forEach(t => db[t].forEach(r => { if (!r.id) r.id = TL.nextId(db[t], TL.TABLES[t].prefix); }));
  db.trainings.forEach(r => {
    if (!r.id) r.id = TL.nextId(db.trainings, 'TR', 4);
    if (!Array.isArray(r.weapons)) r.weapons = [];
    r.weapons = r.weapons.filter(w => w && w.weaponId).map(w => Object.assign(w, { rounds: TL.num(w.rounds) }));
    if (typeof r.durationH === 'string') r.durationH = TL.num(r.durationH);
    if (r.fire !== 'dry') r.fire = 'live';
  });
  return db;
};
TL.migrate = db => {
  const e = TL.emptyDb();
  const from = +db.schema || 1;
  db.settings = Object.assign(e.settings, db.settings || {});
  db.settings.dashFilter = Object.assign({ shooter: '', year: '', weapon: '', trainer: '', fire: '' }, db.settings.dashFilter || {});
  if (!Array.isArray(db.history)) db.history = [];
  if (!db.app) db.app = TL.APP_ID;
  if (from > TL.SCHEMA) return db;                       // newer than this app: leave untouched
  for (let v = from + 1; v <= TL.SCHEMA; v++) { if (TL.MIGRATIONS[v]) TL.MIGRATIONS[v](db); db.schema = v; }
  db.schema = TL.SCHEMA;
  TL.normalize(db);
  if (from < TL.SCHEMA) db.history.push({ at: new Date().toISOString(), from, to: TL.SCHEMA, app: (TL.appInfo().version || 'web') });
  return db;
};
TL.isOurs = j => j && typeof j === 'object' && Array.isArray(j.trainings);
function parse(txt) { if (!txt) return null; try { const j = JSON.parse(txt); return TL.isOurs(j) ? j : null; } catch (e) { return null; } }
function readDb() {
  let txt = '';
  try { txt = N ? N.loadDb() : (localStorage.getItem('tl.db') || ''); } catch (e) { }
  let db = parse(txt);
  if (!db && txt) {                                       // damaged file: use the previous copy, keep the damaged one
    TL.recovered = true;
    try { if (N) { N.backupDb('db-damaged-' + Date.now() + '.json'); db = parse(N.loadDbBackup()); } else db = parse(localStorage.getItem('tl.db.bak')); } catch (e) { }
  }
  return db;
}
TL.nextId = (list, prefix, pad = 3) => {
  let n = 0; list.forEach(r => { const m = new RegExp('^(?:EX-)?' + prefix + '-(\\d+)$').exec(r.id || ''); if (m) n = Math.max(n, +m[1]); });
  return `${prefix}-${String(n + 1).padStart(pad, '0')}`;
};
TL.db = readDb();
TL.firstRun = !TL.db;
if (!TL.db) TL.db = TL.emptyDb();
TL.dataSchema = +TL.db.schema || 1;
TL.readOnly = TL.dataSchema > TL.SCHEMA;
if (!TL.readOnly && TL.dataSchema < TL.SCHEMA && !TL.firstRun) {
  try { N ? N.backupDb(`db-schema${TL.dataSchema}-${new Date().toISOString().slice(0, 10)}.json`) : localStorage.setItem('tl.db.pre' + TL.dataSchema, localStorage.getItem('tl.db')); } catch (e) { }
  TL.migrate(TL.db);
  TL.migrated = TL.dataSchema;
} else if (!TL.readOnly) TL.migrate(TL.db);
const writeNow = () => {
  if (TL.readOnly) return;                                 // never overwrite data from a newer app version
  TL.db.updated = new Date().toISOString();
  const txt = JSON.stringify(TL.db);
  let ok = false;
  try { ok = N ? N.saveDb(txt) : (localStorage.setItem('tl.db.bak', localStorage.getItem('tl.db') || ''), localStorage.setItem('tl.db', txt), true); } catch (e) { ok = false; }
  if (!ok) TL.toast && TL.toast('Could not save data on this device.', true);
};
const writeLater = TL.debounce(writeNow, 400);
TL.save = (now) => now ? writeLater.now() : writeLater();
TL.flush = () => writeLater.now();
TL.backupDb = name => { try { return N ? N.backupDb(name) : (localStorage.setItem('tl.db.' + name, localStorage.getItem('tl.db') || ''), true); } catch (e) { return false; } };
window.addEventListener('pagehide', TL.flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) TL.flush(); });

TL.byId = (list, id) => list.find(r => r.id === id) || null;
TL.shooter = id => TL.byId(TL.db.shooters, id);
TL.weapon = id => TL.byId(TL.db.weapons, id);
TL.trainer = id => TL.byId(TL.db.trainers, id);
TL.training = id => TL.byId(TL.db.trainings, id);
TL.nameOf = (t, id) => { const r = TL.byId(TL.db[t], id); return r ? r.name : (id ? '(deleted)' : ''); };
TL.sorted = t => TL.db[t].slice().sort((a, b) => (a.status === 'Active' || !a.status ? 0 : 1) - (b.status === 'Active' || !b.status ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
/** Rounds fired in a training: 0 for dry fire (its count is kept as dry-fire reps, see TL.reps). */
TL.rounds = tr => TL.isDry(tr) ? 0 : tr.weapons.reduce((a, w) => a + (TL.num(w.rounds) || 0), 0);
TL.reps = tr => TL.isDry(tr) ? tr.weapons.reduce((a, w) => a + (TL.num(w.rounds) || 0), 0) : 0;
/** How many trainings use a record (for delete checks and list cards). */
TL.usage = (t, id) => TL.db.trainings.filter(tr => t === 'shooters' ? tr.shooterId === id : t === 'trainers' ? tr.trainerId === id : tr.weapons.some(w => w.weaponId === id));

/* ---------- example data: flagged example:true; the first own training removes the examples ---------- */
TL.purgeExamples = db => {
  const gone = [];
  // an own training may point at an example shooter/gun/trainer: that entry becomes the user's own (unflagged)
  const own = db.trainings.filter(r => !r.example);
  own.forEach(tr => {
    [['shooters', tr.shooterId], ['trainers', tr.trainerId], ...(tr.weapons || []).map(w => ["weapons", w.weaponId])].forEach(([t, id]) => {
      const r = id && db[t].find(x => x.id === id); if (r && r.example) delete r.example;
    });
  });
  // the examples are one connected set: the first own training removes all of them (own shooters, guns and
  // trainers added before that simply stay)
  const hasEx = TL.LISTS.some(t => db[t].some(r => r.example));
  if (hasEx && own.length) TL.LISTS.forEach(t => { if (db[t].some(r => r.example)) { db[t] = db[t].filter(r => !r.example); gone.push(t); } });
  return gone;
};
TL.hasExamples = () => TL.LISTS.some(t => (TL.db[t] || []).some(r => r.example));

/* ---------- filters + aggregation (dashboard and printed sheet use the same numbers) ---------- */
TL.years = () => Array.from(new Set(TL.db.trainings.map(t => (t.date || '').slice(0, 4)).filter(Boolean))).sort().reverse();
TL.filtered = f => TL.db.trainings.filter(t =>
  (!f.shooter || t.shooterId === f.shooter) &&
  (!f.year || (t.date || '').startsWith(f.year)) &&
  (!f.trainer || t.trainerId === f.trainer) &&
  (!f.weapon || t.weapons.some(w => w.weaponId === f.weapon)) &&
  (!f.fire || (f.fire === 'dry') === TL.isDry(t))
).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.start || '').localeCompare(a.start || ''));
TL.summary = (list, f) => {
  const per = {};
  let rounds = 0, reps = 0, hours = 0, hoursDry = 0, nDry = 0;
  list.forEach(t => {
    const dry = TL.isDry(t), h = TL.num(t.durationH) || 0;
    hours += h; if (dry) { hoursDry += h; nDry++; }
    t.weapons.forEach(w => {
      if (f.weapon && w.weaponId !== f.weapon) return;   // a gun filter counts only that gun's rounds
      const p = per[w.weaponId] || (per[w.weaponId] = { weaponId: w.weaponId, rounds: 0, reps: 0, trainings: 0, live: 0, dry: 0 });
      const n = TL.num(w.rounds) || 0;
      p.trainings++;
      if (dry) { p.dry++; p.reps += n; reps += n; } else { p.live++; p.rounds += n; rounds += n; }   // dry fire: no rounds
    });
  });
  const perWeapon = Object.values(per).sort((a, b) => b.rounds - a.rounds || b.trainings - a.trainings);
  return { n: list.length, nLive: list.length - nDry, nDry, hours, hoursLive: hours - hoursDry, hoursDry, rounds, reps, perWeapon,
    last: list[0] ? list[0].date : '', trainers: new Set(list.map(t => t.trainerId).filter(Boolean)).size };
};
TL.filterText = f => [
  ['Shooter', f.shooter ? TL.nameOf('shooters', f.shooter) : 'All'],
  ['Year', f.year || 'All'],
  ['Gun', f.weapon ? TL.nameOf('weapons', f.weapon) : 'All'],
  ['Trainer', f.trainer ? TL.nameOf('trainers', f.trainer) : 'All'],
  ['Type', f.fire ? TL.FIRE[f.fire] : 'Live + dry fire'],
];

/* ---------- UI primitives shared by views ---------- */
TL.toast = (msg, err) => {
  let t = TL.$('#toast'); if (!t) return;
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(TL._tt); TL._tt = setTimeout(() => t.classList.remove('on'), err ? 5000 : 2600);
};
/** Two-tap confirm for destructive buttons. */
TL.armed = (btn, fn) => {
  const label = btn.innerHTML; let t;
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.innerHTML = label; fn(); return; }
    btn.dataset.armed = 1; btn.textContent = 'Tap again to confirm';
    t = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = label; }, 3000);
  });
};
TL.sheet = (title, bodyHtml, { onClose } = {}) => {     // bottom sheet / modal
  const m = TL.h(`<div class="modal" role="dialog" aria-modal="true"><div class="mcard"><div class="mhead"><h3>${TL.esc(title)}</h3><button class="ib" data-close aria-label="Close">✕</button></div><div class="mbody">${bodyHtml}</div></div></div>`);
  document.body.appendChild(m);
  const close = () => { m.remove(); TL._modal = null; onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  TL._modal = close;
  return { el: m, body: TL.$('.mbody', m), close };
};
