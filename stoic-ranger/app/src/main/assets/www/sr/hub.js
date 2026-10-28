/* Stoic Ranger 1.0 — one app, one database (Manuel 2026-10-28).
   The app is made of parts that were separate apps until 0.x: Gun Database (gun/, global RB), Training Log
   (training/, TL) and Shooting Drills (drills/, SD), plus the home page (index.html). Each part is its own page
   and keeps its own code. This file sits between a part and the device storage (window.SRNative: the Android
   bridge, or sr/native-web.js in a browser):

   - The device holds ONE file, db.json = { app:'stoic-ranger', format, schemas:{gundb,tl,sd}, settings:{common,
     gundb,tl,sd,home}, history, shooters, weapons, trainers, barrels, munitions, targets, roundsLog, sheets,
     trainings, results, favs, … }.
   - A part sees the file through window.<P>Native exactly like its old app did: loadDb() gives it a database in
     its own old shape (its tables, its settings, its schema number), saveDb() puts its tables back. Shooters,
     guns and trainers are shared: a part's save merges them record by record (uid), keeping fields the part does
     not know; a shared record another part still uses is never deleted.
   - What the separate apps sent each other by linking is now computed from the one file: rounds of live-fire
     trainings → Gun Database rounds log, trainings of a day → Shooting Drills, drill results → Training Log.
   - An SR_Database db.json (the Android app this one updates in place) is converted on first start, with a copy
     kept in backups/ first. Nothing is ever dropped (standing rule since 2026-10-24).
   - Daily Thoughts is not part of the shooting database (Manuel 2026-10-28): since 1.0.1 its favourites, settings
     and history live in a file of their own, thoughts.json (window.SRNative.loadData('thoughts') …). 1.0.0 kept
     them in db.json (thoughtFavs, settings.dt, schemas.dt); on the first start of 1.0.1 they are copied over, with
     a backup of db.json first, and the old fields stay in db.json untouched (add-only). */
'use strict';
(() => {
const RAW = window.SRNative;
const FORMAT = 1;
const PARTS = {
  gundb: { prefix: 'RB', dir: 'gun', name: 'Gun Database', app: undefined,
    tables: ['weapons', 'barrels', 'munitions', 'shooters', 'trainers', 'roundsLog', 'sheets', 'targets'] },
  tl: { prefix: 'TL', dir: 'training', name: 'Training Log', app: 'sr-training-log', tables: ['shooters', 'weapons', 'trainers', 'trainings'] },
  sd: { prefix: 'SD', dir: 'drills', name: 'Shooting Drills', app: 'sr-shooting-drills', tables: ['shooters', 'weapons', 'results', 'favs'] },
  // Daily Thoughts (until 0.1.2 the app SR_Daily Thoughts): its own file thoughts.json, not the one database
  dt: { prefix: 'DT', dir: 'thoughts', name: 'Daily Thoughts', app: 'sr-daily-thoughts', tables: ['favs'], file: 'thoughts' },
};
const SHARED = ['shooters', 'weapons', 'trainers'];
const ALL_TABLES = [...new Set(Object.values(PARTS).filter(p => !p.file).flatMap(p => p.tables))];
const PART = document.documentElement.dataset.part || 'home';

const parse = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (e) { return null; } };
const arr = a => Array.isArray(a) ? a : [];
const clone = o => JSON.parse(JSON.stringify(o));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const now = () => new Date().toISOString();
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ---------- the one file ---------- */
const isUnified = j => !!(j && j.app === 'stoic-ranger');
const isGunDb = j => !!(j && Array.isArray(j.sheets) && !isUnified(j));
const isTrainingLog = j => !!(j && Array.isArray(j.trainings) && !isUnified(j));
const isDrills = j => !!(j && Array.isArray(j.results) && !isUnified(j));
const isThoughts = j => !!(j && j.app === 'sr-daily-thoughts' && Array.isArray(j.favs));
function emptyUnified() {
  const t = now();
  return { app: 'stoic-ranger', format: FORMAT, created: t, updated: t, schemas: {}, settings: { common: { theme: 'auto' } }, history: [] };
}
/** SR_Database (Gun Database 0.x) file → the one file. Its tables and settings move unchanged. */
function fromGunDb(g) {
  const u = emptyUnified();
  u.created = g.created || u.created;
  PARTS.gundb.tables.forEach(t => { u[t] = arr(g[t]); });
  u.schemas.gundb = +g.schema || 1;
  u.settings.gundb = g.settings || {};
  u.settings.common.theme = (g.settings && g.settings.theme) || 'auto';
  u.history = arr(g.history).map(h => Object.assign({ part: 'gundb' }, h));
  u.history.push({ at: now(), part: 'stoic-ranger', note: 'SR_Database data moved into Stoic Ranger 1.0' });
  return u;
}
function normalize(u) {
  ALL_TABLES.forEach(t => { if (!Array.isArray(u[t])) u[t] = []; });
  u.schemas = u.schemas || {};
  u.settings = u.settings || {};
  u.settings.common = Object.assign({ theme: 'auto' }, u.settings.common || {});
  if (!Array.isArray(u.history)) u.history = [];
  SHARED.forEach(t => u[t].forEach(r => { if (r && typeof r === 'object' && !r.uid) r.uid = uuid(); }));
  return u;
}

let U = null, damaged = false, converted = false, newer = false;
function readRaw() {
  let txt = '';
  try { txt = RAW.loadDb() || ''; } catch (e) { }
  let j = txt ? parse(txt) : null;
  if (txt && !j) {                                      // damaged: keep it, use the previous copy
    damaged = true;
    try { RAW.backupDb('db-damaged-' + Date.now() + '.json'); j = parse(RAW.loadDbBackup() || ''); } catch (e) { }
  }
  return j;
}
function load() {
  const j = readRaw();
  if (isUnified(j)) {
    U = j;
    if ((+U.format || 1) > FORMAT) newer = true;           // written by a newer Stoic Ranger: read-only
  } else if (isGunDb(j)) {
    try { RAW.backupDb('db-before-stoic-ranger-1.0-' + new Date().toISOString().slice(0, 10) + '.json'); } catch (e) { }
    U = fromGunDb(j); converted = true;
  } else if (j && (isTrainingLog(j) || isDrills(j))) {
    // not expected on a device (those apps had their own files), but never lose it
    try { RAW.backupDb('db-unknown-' + Date.now() + '.json'); } catch (e) { }
    U = emptyUnified(); U.pending = j;
  } else U = emptyUnified();
  normalize(U);
  if (converted && !newer) writeRaw();
  loadThoughts();
}
function writeRaw() {
  if (newer) return false;
  U.updated = now();
  let ok = false;
  try { ok = RAW.saveDb(JSON.stringify(U)); } catch (e) { ok = false; }
  return ok;
}

/* ---------- Daily Thoughts: thoughts.json ---------- */
const TFORMAT = 1;
const isThoughtsFile = j => !!(j && j.app === 'stoic-ranger-thoughts');
let TH = null, thSplit = false;
/** Daily Thoughts data out of a Stoic Ranger 1.0.0 file (or backup): its favourites, settings and history. */
function thoughtsFrom(u) {
  const t = now();
  const th = { app: 'stoic-ranger-thoughts', format: TFORMAT, created: t, updated: t, schema: null, settings: {}, favs: [], history: [] };
  if (!u) return th;
  if (u.schemas && u.schemas.dt != null) th.schema = +u.schemas.dt || 1;
  if (u.settings && u.settings.dt && typeof u.settings.dt === 'object') th.settings = clone(u.settings.dt);
  th.favs = clone(arr(u.thoughtFavs));
  th.history = clone(arr(u.history).filter(h => h && h.part === 'dt'));
  return th;
}
const hasThoughts = u => !!(u && (arr(u.thoughtFavs).length || (u.schemas && u.schemas.dt != null) || (u.settings && u.settings.dt)));
function normalizeThoughts(th) {
  th.favs = arr(th.favs); th.history = arr(th.history);
  if (!th.settings || typeof th.settings !== 'object') th.settings = {};
  return th;
}
function loadThoughts() {
  thSplit = false;
  let txt = '';
  try { txt = RAW.loadData('thoughts') || ''; } catch (e) { }
  let j = txt ? parse(txt) : null;
  if (txt && !isThoughtsFile(j)) {                       // damaged: keep it, use the previous copy
    try { RAW.backupData('thoughts', 'thoughts-damaged-' + Date.now() + '.json'); } catch (e) { }
    j = parse((() => { try { return RAW.loadDataBackup('thoughts') || ''; } catch (e) { return ''; } })());
  }
  if (isThoughtsFile(j)) {
    TH = normalizeThoughts(j);
    if ((+TH.format || 1) > TFORMAT) newer = true;         // written by a newer Stoic Ranger: read-only
    return;
  }
  // no thoughts.json yet: 1.0.0 kept Daily Thoughts in db.json. Copy it over (db.json itself is not changed).
  TH = thoughtsFrom(U);
  if (hasThoughts(U) && !newer) {
    try { RAW.backupDb('db-before-thoughts-file-' + new Date().toISOString().slice(0, 10) + '.json'); } catch (e) { }
    TH.history.push({ at: now(), part: 'dt', note: 'Daily Thoughts moved from db.json into its own file (Stoic Ranger 1.0.1)' });
    thSplit = writeThoughts();
  }
}
function writeThoughts() {
  if (newer) return false;
  TH.updated = now();
  try { return !!RAW.saveData('thoughts', JSON.stringify(TH)); } catch (e) { return false; }
}

/* ---------- a part's view ---------- */
function partSettings(part) {
  const s = U.settings[part] = U.settings[part] || {};
  s.theme = U.settings.common.theme || 'auto';
  // linking between the parts is built in: the Gun Database takes training rounds, Drills sees the trainings
  if (part === 'gundb') s.link = Object.assign({}, s.link, { enabled: true });
  if (part === 'tl') { s.link = Object.assign({}, s.link, { enabled: false }); s.link.apps = Object.assign({}, s.link.apps, { shootingDrills: { enabled: true } }); }
  if (part === 'sd') s.link = Object.assign({}, s.link, { enabled: true });
  return s;
}
function viewThoughts() {
  if (TH.schema == null && !TH.favs.length) return null;          // first start: its welcome screen
  const s = TH.settings; s.theme = U.settings.common.theme || 'auto';
  return { app: PARTS.dt.app, schema: TH.schema || 1, created: TH.created, updated: TH.updated, favs: TH.favs, settings: s, history: TH.history };
}
function view(part) {
  if (part === 'dt') return viewThoughts();
  const P = PARTS[part];
  if (U.schemas[part] == null && !hasData(part)) return null;   // first start of this part: its welcome screen
  const v = { schema: U.schemas[part] || 1, created: U.created, updated: U.updated };
  if (P.app) v.app = P.app;
  P.tables.forEach(t => { v[t] = U[t]; });
  v.settings = partSettings(part);
  v.history = arr(U.history).filter(h => !h.part || h.part === part);
  return v;
}
const hasData = part => PARTS[part].tables.some(t => arr(U[t]).length && !(part === 'gundb' && t === 'targets'));

/** Uses of a shared record outside the given part (so a part never deletes what another part still needs). */
function usedElsewhere(table, rec, part) {
  const id = rec.id;
  if (!id) return false;
  const k = table === 'weapons' ? 'weaponId' : table === 'shooters' ? 'shooterId' : 'trainerId';
  const inT = (t, f) => !PARTS[part].tables.includes(t) && arr(U[t]).some(f);
  return inT('barrels', r => r.weaponId === id) || inT('sheets', r => r[k] === id || r.weapon === id || r.shooter === id)
    || inT('roundsLog', r => r[k] === id) || inT('trainings', t => t[k] === id || arr(t.weapons).some(w => w.weaponId === id))
    || inT('results', r => r[k] === id);
}
function mergeShared(table, incoming, part) {
  const old = arr(U[table]);
  const byUid = new Map(old.filter(r => r && r.uid).map(r => [r.uid, r]));
  const byId = new Map(old.filter(r => r && r.id).map(r => [r.id, r]));
  const seen = new Set();
  const out = arr(incoming).filter(r => r && typeof r === 'object').map(r => {
    const m = (r.uid && byUid.get(r.uid)) || (!r.uid && r.id && byId.get(r.id)) || null;
    if (m) seen.add(m);
    const x = Object.assign({}, m || {}, r);
    if (!x.uid) x.uid = uuid();
    return x;
  });
  old.forEach(r => { if (!seen.has(r) && usedElsewhere(table, r, part)) out.push(r); });
  return out;
}
function saveThoughts(v) {
  if ('favs' in v) TH.favs = arr(v.favs);
  TH.schema = +v.schema || TH.schema || 1;
  if (v.settings) {
    TH.settings = v.settings;
    if (v.settings.theme && v.settings.theme !== U.settings.common.theme) { U.settings.common.theme = v.settings.theme; writeRaw(); }
  }
  if (Array.isArray(v.history)) TH.history = v.history;
  return writeThoughts();
}
function saveView(part, json) {
  if (newer) return false;
  const v = parse(json);
  if (!v) return false;
  if (part === 'dt') return saveThoughts(v);
  const P = PARTS[part];
  P.tables.forEach(t => {
    if (!(t in v)) return;
    const k = t, before = k === 'results' ? JSON.stringify(arr(U[k])) : '';
    U[k] = SHARED.includes(k) ? mergeShared(k, v[t], part) : arr(v[t]);
    if (k === 'results' && JSON.stringify(U[k]) !== before) U.resultsChanged = now();
  });
  U.schemas[part] = +v.schema || U.schemas[part] || 1;
  if (v.settings) {
    U.settings[part] = v.settings;
    if (v.settings.theme) U.settings.common.theme = v.settings.theme;
  }
  // a part appends to its history: keep the other parts' entries
  const mine = arr(v.history).map(h => Object.assign({ part }, h));
  U.history = arr(U.history).filter(h => h.part && h.part !== part).concat(mine);
  return writeRaw();
}

/* ---------- what the separate apps used to send each other ---------- */
const isDry = t => t && t.fire === 'dry';
/** Gun Database rounds log: one entry per live-fire training and gun (ids are the shared ones now). */
function roundsInbox() {
  const entries = arr(U.trainings).filter(t => t && !t.example && !isDry(t) && t.sendRounds !== false).flatMap(t => arr(t.weapons).map(w => {
    const n = Math.round(+String(w.rounds == null ? '' : w.rounds).replace(',', '.') || 0);
    if (!w || !w.weaponId || !(n > 0)) return null;
    const g = arr(U.weapons).find(x => x.id === w.weaponId);
    return { uid: t.uid + ':' + (g && g.uid || w.weaponId), date: t.date || '', weaponId: w.weaponId, shooterId: t.shooterId || '', rounds: n, note: t.desc || '', trainingId: t.id || '' };
  })).filter(Boolean);
  return JSON.stringify({ from: 'training-log', full: true, entries, received: hash(JSON.stringify(entries)) || 1 });
}
/** Training Log: drill results linked to a training. */
function drillInbox() {
  const names = window.SR_DRILL_NAMES || {};
  const name = id => arr(U.shooters).concat(arr(U.weapons)).find(x => x.id === id);
  const results = arr(U.results).filter(r => r && r.training && (r.training.uid || r.training.id)).map(r => ({
    uid: r.uid, trainingUid: r.training.uid || '', trainingId: r.training.id || '', date: r.date || '',
    drill: names[r.drillId] || r.drillName || r.drillId || '', drillId: r.drillId || '',
    result: r.points != null && r.points !== '' ? r.points + ' pts' : r.hits != null && r.hits !== '' ? r.hits + (r.shots ? '/' + r.shots : '') + ' hits' : (r.pass === true ? 'pass' : r.pass === false ? 'fail' : ''),
    time: r.timeS != null && r.timeS !== '' ? r.timeS + ' s' : '', note: r.note || r.notes || '',
    shooter: (name(r.shooterId) || {}).name || '', gun: (name(r.weaponId) || {}).name || '' }));
  return JSON.stringify({ results, received: Date.parse(U.resultsChanged || U.created) || 1, version: '1.0' });   // the Training Log takes a newer 'received' only
}
/** Shooting Drills asking the Training Log (LinkProvider.java of the Training Log, run on the one file). */
function trainingsOn(arg) {
  const a = parse(arg || '{}') || {};
  const from = String(a.date || a.from || ''), to = String(a.date || a.to || '');
  return arr(U.trainings).filter(t => t && !t.example && !(from && String(t.date || '') < from) && !(to && String(t.date || '') > to)).map(t => {
    const c = {};
    ['id', 'uid', 'date', 'start', 'durationH', 'fire', 'shooterId', 'desc', 'trainerId'].forEach(x => { if (x in t) c[x] = t[x]; });
    if (!('fire' in c)) c.fire = 'live';
    c.weaponIds = arr(t.weapons).map(w => String(w.weaponId || ''));
    c.weapons = arr(t.weapons).map(w => { const x = { weaponId: String(w.weaponId || '') }; if ('rounds' in w) x.rounds = w.rounds; return x; });
    const tr = t.trainerId && arr(U.trainers).find(r => r.id === t.trainerId);
    if (tr) c.trainer = String(tr.name || '');
    return c;
  });
}

/* ---------- the bridge a part sees ---------- */
const pass = ['isNight', 'getSecret', 'setSecret', 'appInfo', 'saveFile', 'openFile', 'shareFile', 'shareText', 'print', 'printSized'];
function bridge(part) {
  const N = {};
  pass.forEach(m => { if (RAW[m]) N[m] = (...a) => RAW[m](...a); });
  if (part === 'dt') N.backupDb = name => { try { return RAW.backupData('thoughts', String(name).replace(/^db-/, 'thoughts-')); } catch (e) { return false; } };
  N.loadDb = () => { const v = view(part); return v ? JSON.stringify(v) : ''; };
  N.saveDb = json => saveView(part, json);
  if (part !== 'dt') N.backupDb = name => { try { return RAW.backupDb(String(name).replace(/^db-/, 'db-' + part + '-')); } catch (e) { return false; } };
  N.loadDbBackup = () => {                               // the previous copy, seen through this part
    if (part === 'dt') {
      const j = parse((() => { try { return RAW.loadDataBackup('thoughts') || ''; } catch (e) { return ''; } })());
      if (!isThoughtsFile(j)) return '';
      const keep = TH; TH = normalizeThoughts(j);
      try { const v = viewThoughts(); return v ? JSON.stringify(v) : ''; } finally { TH = keep; }
    }
    const j = parse(RAW.loadDbBackup() || '');
    if (!j) return '';
    if (!isUnified(j)) return part === 'gundb' && isGunDb(j) ? JSON.stringify(j) : '';
    const keep = U; U = normalize(j);
    try { const v = view(part); return v ? JSON.stringify(v) : ''; } finally { U = keep; }
  };
  if (part === 'gundb') N.linkInbox = roundsInbox;
  if (part === 'tl') {
    N.readInbox = n => n === 'link-sd-inbox.json' ? drillInbox() : '';
    N.appInstalled = () => true;
    N.linkCall = m => JSON.stringify(m === 'status' ? { app: 'gundb', version: '1.0', enabled: false } : { error: 'disabled' });
  }
  if (part === 'sd') {
    N.isInstalled = () => true;
    N.linkCall = (m, arg) => JSON.stringify(m === 'status' ? { app: 'training-log', version: '1.0', schema: U.schemas.tl || 0, enabled: true }
      : m === 'trainings' ? { trainings: trainingsOn(arg) } : { error: 'disabled' });
  }
  return N;
}

/* ---------- bringing in a backup of one of the old apps (Training Log, Shooting Drills) ----------
   Merge, never replace: shooters, guns and trainers are matched (same uid, the Gun Database id a linked entry
   carries, or the same name) and otherwise added; trainings and results are added unless already there (uid).
   Ids that are taken get the next free one, and every reference follows. The part's schema is set back to the
   backup's, so the part's own migrations run over the data at its next start (they only add and convert). */
const PREFIX = { shooters: 'S', weapons: 'W', trainers: 'T', trainings: 'TR', results: 'R' };
const PAD = { trainings: 4, results: 4 };
function nextId(list, prefix, pad = 3) {
  let n = 0; arr(list).forEach(r => { const m = new RegExp('^(?:EX-)?' + prefix + '-(\\d+)$').exec(r && r.id || ''); if (m) n = Math.max(n, +m[1]); });
  return `${prefix}-${String(n + 1).padStart(pad, '0')}`;
}
const low = s => String(s == null ? '' : s).trim().toLowerCase();
function importBackup(j) {
  const kind = isUnified(j) ? 'all' : isThoughts(j) ? 'dt' : isTrainingLog(j) ? 'tl' : isDrills(j) ? 'sd' : isGunDb(j) ? 'gundb' : null;
  if (!kind || kind === 'all' || kind === 'gundb') return { kind };
  if (newer) return { kind, error: 'read-only' };
  if (kind === 'dt') {                                   // favourite quotes: union by quote id, into thoughts.json
    try { RAW.backupData('thoughts', 'thoughts-before-import-' + Date.now() + '.json'); } catch (e) { }
    const have = new Set(TH.favs.map(f => f && f.id));
    const add = arr(j.favs).map(f => typeof f === 'string' ? { id: f, at: '' } : f).filter(f => f && f.id && !have.has(f.id) && have.add(f.id));
    TH.favs = TH.favs.concat(add);
    const s = +j.schema || 1; TH.schema = TH.schema ? Math.min(TH.schema, s) : s;
    TH.history.push({ at: now(), part: 'stoic-ranger', note: 'Imported Daily Thoughts favourites', added: add.length });
    writeThoughts();
    return { kind, stats: { added: { favs: add.length }, matched: {}, skipped: { favs: arr(j.favs).length - add.length } } };
  }
  try { RAW.backupDb('db-before-import-' + kind + '-' + Date.now() + '.json'); } catch (e) { }
  const map = { shooters: {}, weapons: {}, trainers: {} }, stats = { added: {}, matched: {}, skipped: {} };
  const inc = (k, t) => { stats[k][t] = (stats[k][t] || 0) + 1; };
  SHARED.forEach(t => arr(j[t]).forEach(r => {
    if (!r || typeof r !== 'object' || r.example) return;
    const L = U[t];
    let m = (r.uid && L.find(x => x.uid === r.uid))
      || (r.source && r.source.app === 'gundb' && r.source.id && L.find(x => x.id === r.source.id))
      || (r.name && L.find(x => low(x.name) === low(r.name)));
    if (m) {
      Object.keys(r).forEach(k => { if (k !== 'id' && k !== 'source' && (m[k] == null || m[k] === '') && r[k] != null && r[k] !== '') m[k] = r[k]; });
      inc('matched', t);
    } else {
      m = clone(r); delete m.source;
      if (!m.id || L.some(x => x.id === m.id)) m.id = nextId(L, PREFIX[t]);
      if (!m.uid || L.some(x => x.uid === m.uid)) m.uid = uuid();
      L.push(m); inc('added', t);
    }
    if (r.id) map[t][r.id] = m.id;
  }));
  const ref = (t, id) => (id && map[t][id]) || id || '';
  const own = kind === 'tl' ? ['trainings'] : ['results'];
  own.forEach(t => arr(j[t]).forEach(r => {
    if (!r || typeof r !== 'object' || r.example) return;
    if (r.uid && U[t].some(x => x.uid === r.uid)) { inc('skipped', t); return; }
    const x = clone(r);
    if (!x.uid) x.uid = uuid();
    if (!x.id || U[t].some(y => y.id === x.id)) x.id = nextId(U[t], PREFIX[t], PAD[t]);
    if ('shooterId' in x) x.shooterId = ref('shooters', x.shooterId);
    if ('weaponId' in x) x.weaponId = ref('weapons', x.weaponId);
    if ('trainerId' in x) x.trainerId = ref('trainers', x.trainerId);
    if (Array.isArray(x.weapons)) x.weapons.forEach(w => { if (w) w.weaponId = ref('weapons', w.weaponId); });
    // older entries without a uid: the same day, shooter and content is the same entry (no double import)
    const sig = y => [y.date, y.shooterId, y.desc, y.durationH, y.fire, y.drillId, y.time, y.hits, y.weaponId].map(v => v == null ? '' : String(v)).join('|');
    if (!r.uid && U[t].some(y => sig(y) === sig(x))) { inc('skipped', t); return; }
    if (x.training && x.training.uid) {                  // a drill result linked to a training: point at its id here
      const tr = U.trainings.find(y => y.uid === x.training.uid);
      if (tr) x.training.id = tr.id;
    }
    U[t].push(x); inc('added', t);
  }));
  if (kind === 'sd') U.favs = [...new Set(arr(U.favs).concat(arr(j.favs)))];
  if (kind === 'tl' && arr(j.trainers).length && !U.schemas.tl) U.settings.tl = Object.assign({}, j.settings || {}, U.settings.tl || {});
  if (kind === 'sd' && !U.schemas.sd) U.settings.sd = Object.assign({}, j.settings || {}, U.settings.sd || {});
  const s = +j.schema || 1;
  U.schemas[kind] = U.schemas[kind] ? Math.min(U.schemas[kind], s) : s;
  if (kind === 'sd') U.resultsChanged = now();
  U.history.push({ at: now(), part: 'stoic-ranger', note: `Imported ${kind === 'tl' ? 'Training Log' : 'Shooting Drills'} backup`, stats });
  writeRaw();
  return { kind, stats };
}
/** Replace everything with a Stoic Ranger backup (the current files are kept in backups/ first). A 1.0.1 backup
    carries Daily Thoughts under "thoughts"; in a 1.0.0 backup it is still in thoughtFavs / settings.dt. */
function restoreAll(j) {
  if (!isUnified(j) || newer) return false;
  if ((+j.format || 1) > FORMAT) return false;
  if (isThoughtsFile(j.thoughts) && (+j.thoughts.format || 1) > TFORMAT) return false;
  const stamp = Date.now();
  try { RAW.backupDb('db-before-restore-' + stamp + '.json'); } catch (e) { }
  try { RAW.backupData('thoughts', 'thoughts-before-restore-' + stamp + '.json'); } catch (e) { }
  const th = isThoughtsFile(j.thoughts) ? normalizeThoughts(clone(j.thoughts)) : thoughtsFrom(j);
  U = normalize(clone(j)); delete U.backup; delete U.thoughts;
  TH = th;
  const a = writeRaw(), b = writeThoughts();
  return a && b;
}
/** The whole backup: the one database plus Daily Thoughts. thoughtFavs is filled too, so Stoic Ranger 1.0.0 can
    still restore a 1.0.1 backup with the current favourites. */
const backupText = () => JSON.stringify(Object.assign({}, U, { thoughtFavs: TH.favs, thoughts: TH, backup: now() }), null, 1);

/* ---------- file dialogs for the hub (the parts keep their own callbacks) ---------- */
const hubCbs = {};
window.SRNativeCallback = (id, res) => {
  if (hubCbs[id]) { const f = hubCbs[id]; delete hubCbs[id]; f(res); return; }
  const P = PARTS[PART]; const f = P && window[P.prefix + 'NativeCallback']; if (f) f(id, res);
};
const cb = f => { const id = 'sr' + Math.random().toString(36).slice(2); hubCbs[id] = f; return id; };
const b64 = t => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = b => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)));
const backupName = () => `stoic-ranger-backup_${new Date().toISOString().slice(0, 10)}.json`;
const saveBackup = () => new Promise(res => { SR.flush(); const txt = SR.backupText(); RAW.saveFile(backupName(), 'application/json', b64(txt), cb(res)); });
const shareBackup = () => { SR.flush(); RAW.shareFile(backupName(), 'application/json', b64(SR.backupText()), 'Stoic Ranger backup'); };
const openJson = () => new Promise(res => RAW.openFile('application/json,text/plain,application/octet-stream', cb(r => {
  if (!r || !r.ok) return res({ ok: false, msg: r ? r.msg : 'cancelled' });
  let j = null; try { j = JSON.parse(unb64(r.data)); } catch (e) { }
  res(j && typeof j === 'object' ? { ok: true, name: r.msg, json: j } : { ok: false, msg: 'This is not a backup file.' });
})));

/* ---------- public ---------- */
load();
const SR = window.SR = {
  PARTS, part: PARTS[PART] ? PART : 'home', isUnified, isGunDb, isTrainingLog, isDrills, isThoughts,
  get db() { return U; }, get thoughts() { return TH; }, get thoughtsMoved() { return thSplit; },
  get readOnly() { return newer; }, get damaged() { return damaged; }, get converted() { return converted; },
  reload() { load(); },
  save: writeRaw,
  /** The whole database as one backup file (all parts, Daily Thoughts included). */
  backupText,
  saveBackup, shareBackup, openJson, importBackup, restoreAll,
  uuid, clone, now, arr,
};
if (PARTS[PART]) window[PARTS[PART].prefix + 'Native'] = bridge(PART);

/* ---------- the backup block every part's More page shows ---------- */
SR.dataSection = (h = 'h2') => `<${h}>Backup</${h}>
  <p class="note">Stoic Ranger keeps guns, trainings and drill results in one database on this device. A backup holds all of it: save one now and then (cloud drive, e-mail to yourself …). Restoring, and bringing in backups of the old SR_Training Log and SR_Shooting Drills apps, is on the home page under Data.</p>
  <div class="stack"><button class="btn pri" data-sr="save">Save a backup of everything</button><button class="btn" data-sr="share">Share a backup</button><button class="btn" data-sr="data">Restore or bring in data</button></div>`;
SR.wireData = (el, toast) => {
  const q = s => el.querySelector(`[data-sr="${s}"]`);
  if (q('save')) q('save').onclick = async () => { const r = await saveBackup(); if (r && r.ok) toast('Backup saved: ' + r.msg); else if (r && r.msg !== 'cancelled') toast('Not saved: ' + r.msg, true); };
  if (q('share')) q('share').onclick = shareBackup;
  if (q('data')) q('data').onclick = () => { SR.flush(); location.href = (PART === 'home' ? '' : '../') + 'index.html#/data'; };
};

/* ---------- Android hooks (MainActivity calls these) and the way home ---------- */
const T = () => (PARTS[PART] ? window[PARTS[PART].prefix] : null) || {};
const run = f => { try { return f(); } catch (e) { console.error(e); } };
SR.flush = () => run(() => T().flush && T().flush());
SR.onResume = () => {
  const t = T(), dark = run(() => RAW.isNight && RAW.isNight());
  run(() => t.setSysDark && t.setSysDark(!!dark));
  if (SR.part === 'home') { run(() => window.SRHome && SRHome.setSysDark && SRHome.setSysDark(!!dark)); return; }
};
SR.home = () => { SR.flush(); location.href = PART === 'home' ? '#/' : '../index.html'; };
SR.open = (part, hash = '') => { SR.flush(); location.href = (PART === 'home' ? '' : '../') + PARTS[part].dir + '/index.html' + hash; };
/** Android back button: the part walks back first; at its start screen it goes home; home closes the app. */
SR.back = () => {
  if (PART === 'home') return !!run(() => window.SRHome && SRHome.back && SRHome.back());
  if (run(() => T().back && T().back())) return true;
  SR.home(); return true;
};

// "+ Datasheet" on the home page opens the Gun Database's own "Add new" chooser
if (PART === 'gundb') document.addEventListener('DOMContentLoaded', () => {
  if (!/[?&]srAdd=1/.test(location.hash)) return;
  history.replaceState(null, '', location.pathname + location.search + '#/dash');
  setTimeout(() => run(() => window.RB.addChooser()), 60);
});

// Home button in each part's header (the emblem), so every part is one tap from home
if (PARTS[PART]) document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('.appbar'), h1 = document.getElementById('hTitle');
  if (!bar || !h1 || document.getElementById('srHome')) return;
  const b = document.createElement('button');
  b.id = 'srHome'; b.className = 'ib srhome'; b.type = 'button'; b.setAttribute('aria-label', 'Stoic Ranger home');
  b.innerHTML = T().LOGO_SVG || '⌂';
  b.onclick = SR.home;
  bar.insertBefore(b, h1);
  const st = document.createElement('style');
  st.textContent = '.srhome{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:4px;background:none;border:0;color:inherit;flex:none}.srhome svg{width:32px;height:32px}';
  document.head.appendChild(st);
});
})();
