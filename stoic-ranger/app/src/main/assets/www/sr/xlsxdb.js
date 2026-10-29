/* Stoic Ranger 1.1 — the shared database file database.xlsx (Manuel 2026-10-29).
   Android, the iPhone/web app and Windows read from and write to the same database.xlsx, and it can also be edited
   in Excel without any app. The sheets and columns are those of the registry workbook on the PC
   (03_registry/database.xlsx, layout 5: Weapons, Barrels, Munitions, Shooters, Rounds_Log, Targets, Purposes,
   Trainers, Trainings, Drill_Results), plus what only the app has: Datasheets, Shots and Drill_Favourites.
   Every row carries its permanent "Source uid", so a row is the same entry on every device.

   A hidden sheet "_StoicRanger" holds a full copy of the database as JSON (fields that have no column, the shots of
   each datasheet …). Reading a file starts from that copy and puts the visible sheets on top, so what was changed
   in Excel wins. A file without the hidden sheet (written by the PC dashboard or by hand) is read from its visible
   sheets alone.

   Syncing is a three-way merge against the state of the last sync (base): a field changed in the file since then
   is taken from the file, everything else stays as in the app. Nothing is ever deleted by a sync: a row deleted in
   Excel stays in the app (delete entries in the app), an entry deleted in the app does not come back. */
'use strict';
(() => {
const FORMAT = 1;
const MARK = 'stoic-ranger-database';
const HIDDEN = '_StoicRanger';
const CHUNK = 30000;                               // Excel holds at most 32767 characters in a cell
const arr = a => Array.isArray(a) ? a : [];
const clone = o => JSON.parse(JSON.stringify(o));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const num = v => { if (v === '' || v == null) return null; const n = +String(v).trim().replace(/\s/g, '').replace(',', '.'); return isFinite(n) ? n : null; };
const txt = v => v == null ? '' : v instanceof Date ? isoDay(v) : String(v).trim();
const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const cellDate = v => v instanceof Date ? isoDay(v) : typeof v === 'number' && v > 20000 && v < 80000 ? isoDay(new Date(Date.UTC(1899, 11, 30) + v * 864e5)) : txt(v);
const cellTime = v => v instanceof Date ? v.toTimeString().slice(0, 5)
  : typeof v === 'number' && v < 1 ? String(Math.floor(v * 24)).padStart(2, '0') + ':' + String(Math.round(v * 1440) % 60).padStart(2, '0') : txt(v);
const low = s => txt(s).toLowerCase();

/* ---------- columns: [xlsx header, key, type] — t text (default), n number, i whole number, d date, h time, b yes/no ---------- */
const REG = {
  weapons: ['Weapons', 'W', [['ID', 'id'], ['Name', 'name'], ['Aliases (as written on sheets)', 'aliases'], ['Make', 'make'], ['Model', 'model'], ['Caliber', 'caliber'],
    ['Barrel length mm', 'barrelLengthMm', 'n'], ['Twist', 'twist'], ['Muzzle thread', 'thread'], ['Optic', 'optic'], ['Mount', 'mount'], ['Accessories', 'accessories'],
    ['Weight bare kg', 'weightKg', 'n'], ['Serial no.', 'serial'], ['Added', 'added', 'd'], ['Status', 'status'], ['Notes', 'notes'], ['Rounds before log', 'roundsBeforeLog', 'i'],
    ['Counted on', 'countedOn', 'd'], ['Sight height mm', 'sightHeightMm', 'n'], ['Zero distance m', 'zeroM', 'n'], ['Scope turrets', 'scopeUnit'], ['Click value', 'clickValue', 'n'], ['Type', 'type']]],
  barrels: ['Barrels', 'B', [['ID', 'id'], ['Weapon ID', 'weaponId'], ['Barrel', 'name'], ['Installed', 'installed', 'd'], ['Removed', 'removed', 'd'], ['Rounds at install', 'roundsAtInstall', 'i'],
    ['Notes', 'notes'], ['Expected life rds', 'lifeRounds', 'i']]],
  munitions: ['Munitions', 'M', [['ID', 'id'], ['Name', 'name'], ['Aliases (as written on sheets)', 'aliases'], ['Type', 'type'], ['Caliber', 'caliber'], ['Manufacturer', 'manufacturer'],
    ['Bullet', 'bullet'], ['Bullet weight g', 'bulletWeightG', 'n'], ['BC G7', 'bcG7', 'n'], ['Manufacturer V0 m/s', 'nominalV0', 'n'], ['Powder', 'powder'], ['Charge g', 'chargeG', 'n'],
    ['Primer', 'primer'], ['Brass', 'brass'], ['CBTO mm', 'cbtoMm', 'n'], ['COAL mm', 'coalMm', 'n'], ['Lot', 'lot'], ['Added', 'added', 'd'], ['Status', 'status'], ['Notes', 'notes'],
    ['BC G1', 'bcG1', 'n'], ['Bullet diameter mm', 'bulletDiaMm', 'n'], ['Bullet length mm', 'bulletLengthMm', 'n'], ['Manufacturer test barrel mm', 'mfrBarrelMm', 'n']]],
  shooters: ['Shooters', 'S', [['ID', 'id'], ['Name', 'name'], ['Aliases (as written on sheets)', 'aliases'], ['Added', 'added', 'd'], ['Status', 'status'], ['Notes', 'notes']]],
  roundsLog: ['Rounds_Log', 'R', [['Date', 'date', 'd'], ['Weapon ID', 'weaponId'], ['Barrel ID', 'barrelId'], ['Rounds', 'rounds', 'i'], ['Note', 'note'], ['ID', 'id']]],
  targets: ['Targets', 'TG', [['ID', 'id'], ['Name', 'name'], ['Type', 'type'], ['Scoring rings', 'rings', 'i'], ['10-ring or plate diameter mm', 'd10', 'n'], ['Ring width mm', 'w', 'n'],
    ['Inner ten (X) diameter mm', 'xd', 'n'], ['Intended distance m', 'distM', 'n'], ['Card / plate size', 'sizeMm'], ['Source', 'source'], ['Notes', 'notes']]],
  trainers: ['Trainers', 'T', [['ID', 'id'], ['Name', 'name'], ['Contact person', 'contact'], ['Phone', 'phone'], ['E-mail', 'email'], ['Website', 'website'], ['Notes', 'notes']]],
};
const SHEET_KEYS = ['no', 'date', 'time', 'shooter', 'purpose', 'discipline', 'position', 'series', 'rounds', 'gun', 'barrel', 'optic', 'caliber', 'ammo', 'bullet', 'v0', 'v0sd',
  'zero', 'dialE', 'dialW', 'range', 'coords', 'elev', 'dist', 'setting', 'temp', 'hum', 'press', 'wind', 'light', 'preset', 'bd', 'd10', 'w', 'remarks'];
const SHEET_COLS = [['ID', 'id'], ['Date', 'date', 'd'], ['Time', 'time', 'h'], ['Sheet no.', 'no'], ['Shooter', 'shooter'], ['Shooter ID', 'shooterId'], ['Purpose', 'purpose'],
  ['Discipline', 'discipline'], ['Position', 'position'], ['Series', 'series'], ['Rounds', 'rounds'], ['Gun', 'gun'], ['Weapon ID', 'weaponId'], ['Barrel', 'barrel'], ['Barrel ID', 'barrelId'],
  ['Optic', 'optic'], ['Caliber', 'caliber'], ['Ammunition', 'ammo'], ['Munition ID', 'munitionId'], ['Bullet g', 'bullet'], ['V0 m/s', 'v0'], ['V0 SD m/s', 'v0sd'], ['Zero m', 'zero'],
  ['Dial elevation', 'dialE'], ['Dial windage', 'dialW'], ['Range', 'range'], ['Coordinates', 'coords'], ['Elevation m ASL', 'elev'], ['Distance m', 'dist'], ['Setting', 'setting'],
  ['Temp °C', 'temp'], ['Humidity %', 'hum'], ['Pressure hPa', 'press'], ['Wind', 'wind'], ['Light', 'light'], ['Target', 'preset'], ['Bullet diameter mm', 'bd'],
  ['10-ring diameter mm', 'd10'], ['Ring width mm', 'w'], ['Remarks', 'remarks'], ['Hits', 'hitCount']];
const RESULT_COLS = [['ID', 'id'], ['Date', 'date', 'd'], ['Drill ID', 'drillId'], ['Drill', 'drillName'], ['Shooter', 'shooter'], ['Weapon ID', 'weaponId'], ['Mode', 'mode'],
  ['Time s', 'timeS', 'n'], ['Hits', 'hits', 'n'], ['Shots', 'shots', 'n'], ['Points', 'points', 'n'], ['Distance m', 'distanceM', 'n'], ['Pass', 'pass', 'b'], ['Training ID', 'trainingId'], ['Notes', 'notes']];
const EVAL = { rifle: 'Gun/ammo', shooter: 'Shooter', rounds: 'Rounds only' };
const TABLES = ['weapons', 'barrels', 'munitions', 'shooters', 'trainers', 'targets', 'roundsLog', 'sheets', 'trainings', 'results'];
const SHEETS = { weapons: 'Weapons', barrels: 'Barrels', munitions: 'Munitions', shooters: 'Shooters', roundsLog: 'Rounds_Log', targets: 'Targets', trainers: 'Trainers',
  trainings: 'Trainings', results: 'Drill_Results', sheets: 'Datasheets', purposes: 'Purposes', favs: 'Drill_Favourites', shots: 'Shots' };

const keyOf = r => r && (r.uid || r.id) || '';
const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const same = (a, b) => (blank(a) && blank(b)) || (typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : String(a) === String(b));
const purposesOf = u => arr(u.settings && u.settings.gundb && u.settings.gundb.purposes);
const nameOf = (u, t, id) => { const r = id && arr(u[t]).find(x => x.id === id); return r ? r.name || '' : ''; };

/* ---------- write ---------- */
function cellsOf(cols, r) { return cols.map(([, k, ty]) => { const v = r[k]; if (v == null) return ''; if (ty === 'b') return v === true ? 'yes' : v === false ? 'no' : ''; return v; }); }
function sheetOf(X, head, rows) {
  const ws = X.utils.aoa_to_sheet([head, ...rows]);
  ws['!cols'] = head.map(h => ({ wch: Math.min(40, Math.max(9, String(h).length + 2)) }));
  ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, rows.length), c: head.length - 1 } }) };
  return ws;
}
/** The whole database (the one file of the app) as database.xlsx bytes. */
function write(u, info = {}) {
  const X = window.XLSX; if (!X) throw new Error('xlsx library missing');
  const wb = X.utils.book_new(), names = window.SR_DRILL_NAMES || {};
  const own = t => arr(u[t]).filter(r => r && typeof r === 'object' && !r.example);
  for (const [t, [sheet, , cols]] of Object.entries(REG)) {
    if (t === 'trainers') continue;                    // keeps the order of the PC workbook: … Purposes, Trainers, Trainings
    X.utils.book_append_sheet(wb, sheetOf(X, cols.map(c => c[0]).concat('Source uid'), own(t).map(r => cellsOf(cols, r).concat(r.uid || ''))), sheet);
    if (t === 'targets') {
      X.utils.book_append_sheet(wb, sheetOf(X, ['ID', 'Name', 'Evaluated as', 'Notes'], purposesOf(u).map(p => [p.id || '', p.name || '', EVAL[p.evalAs] || p.evalAs || '', p.notes || ''])), SHEETS.purposes);
      const T = REG.trainers[2];
      X.utils.book_append_sheet(wb, sheetOf(X, T.map(c => c[0]).concat('Source uid'), own('trainers').map(r => cellsOf(T, r).concat(r.uid || ''))), 'Trainers');
    }
  }
  // Trainings: names as on the PC (Weapon 1/Rounds 1 …, at least 4 pairs)
  const tr = own('trainings').slice().sort((a, b) => txt(a.date).localeCompare(txt(b.date)));
  const nW = Math.max(4, ...tr.map(t => arr(t.weapons).length));
  const head = ['ID', 'Date', 'Start', 'Duration h', 'Type', 'Shooter', 'Description', 'Trainer / organizer'];
  for (let i = 1; i <= nW; i++) head.push('Weapon ' + i, 'Rounds ' + i);
  head.push('Remarks', 'Source uid');
  X.utils.book_append_sheet(wb, sheetOf(X, head, tr.map(t => {
    const r = [t.id || '', t.date || '', t.start || '', t.durationH ?? '', t.fire === 'dry' ? 'Dry fire' : 'Live fire', nameOf(u, 'shooters', t.shooterId), t.desc || '', nameOf(u, 'trainers', t.trainerId)];
    for (let i = 0; i < nW; i++) { const w = arr(t.weapons)[i]; r.push(w ? nameOf(u, 'weapons', w.weaponId) || w.weaponId || '' : '', w && w.rounds != null ? w.rounds : ''); }
    r.push(t.remarks || '', t.uid || '');
    return r;
  })), SHEETS.trainings);
  X.utils.book_append_sheet(wb, sheetOf(X, RESULT_COLS.map(c => c[0]).concat('Source uid'), own('results').map(r => cellsOf(RESULT_COLS,
    Object.assign({}, r, { drillName: names[r.drillId] || r.drillName || '', shooter: nameOf(u, 'shooters', r.shooterId), trainingId: (r.training && r.training.id) || '' })).concat(r.uid || ''))), SHEETS.results);
  // only in the app until now: datasheets (one row each) and their shots, favourite drills
  X.utils.book_append_sheet(wb, sheetOf(X, SHEET_COLS.map(c => c[0]).concat('Source uid'), own('sheets').map(s => cellsOf(SHEET_COLS, Object.assign({}, s, { hitCount: arr(s.hits).length })).concat(s.uid || ''))), SHEETS.sheets);
  const shots = [];
  own('sheets').forEach(s => arr(s.hits).forEach((h, i) => shots.push([s.id || '', s.date || '', i + 1, h && h.x != null ? +h.x : '', h && h.y != null ? +h.y : ''])));
  X.utils.book_append_sheet(wb, sheetOf(X, ['Sheet ID', 'Date', 'Shot', 'X mm', 'Y mm'], shots), SHEETS.shots);
  X.utils.book_append_sheet(wb, sheetOf(X, ['Drill ID', 'Drill'], arr(u.favs).map(id => [id, names[id] || ''])), SHEETS.favs);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
    ['Database', 'Stoic Ranger database: guns, barrels, ammunition, shooters, trainers, targets, datasheets, trainings and drill results. The same file for Android, iPhone and Windows.'],
    ['Editing', 'You can edit this file in Excel. Keep the ID and Source uid columns as they are; new rows may leave Source uid empty. To delete an entry, delete it in the app: rows deleted here are kept by the apps.'],
    ['Trainings', 'Shooter, trainer and guns by name (as in the sheets above). Type: Live fire or Dry fire; dry-fire Rounds are repetitions, never rounds.'],
    ['Datasheets', 'One row per datasheet; its shots are in Shots (X right, Y up, mm on the target). Shots are kept by the app: change them in the app.'],
    ['Units', 'Metric: mm, m, g, m/s, °C, hPa, mrad.'],
    ['Saved', (info.by || 'Stoic Ranger') + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Format', 'Stoic Ranger database.xlsx ' + FORMAT]]), 'Info');
  // the full copy for the apps (hidden): fields without a column, shots, settings
  const full = JSON.stringify({ mark: MARK, format: FORMAT, saved: new Date().toISOString(), by: info.by || '', db: dbPart(u) });
  const rows = [[MARK, FORMAT, 'Do not edit: a copy of the whole database for the Stoic Ranger apps. The sheets before this one win over it.']];
  for (let i = 0; i < full.length; i += CHUNK) rows.push([full.slice(i, i + CHUNK)]);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), HIDDEN);
  wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.SheetNames.map(n => ({ name: n, Hidden: n === HIDDEN ? 1 : 0 }));
  return new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
}
/** What of the one file goes into database.xlsx: the tables, favourites and the shared settings (not the history). */
function dbPart(u) {
  const o = { app: 'stoic-ranger', format: u.format || 1, schemas: clone(u.schemas || {}), favs: clone(arr(u.favs)), purposes: clone(purposesOf(u)) };
  TABLES.forEach(t => { o[t] = clone(arr(u[t])); });
  return o;
}

/* ---------- read ---------- */
/** database.xlsx bytes → { db: tables like the one file, purposes, favs, hasCopy, sheets: [found] }. Throws if it is no xlsx. */
function read(bytes) {
  const X = window.XLSX; if (!X) throw new Error('xlsx library missing');
  const wb = X.read(bytes, { type: 'array', cellDates: true });
  const rowsOf = n => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) : null;
  // 1. the full copy, if this file was written by an app
  let base = null;
  const H = wb.Sheets[HIDDEN];
  if (H) {
    try {
      const a = X.utils.sheet_to_json(H, { header: 1, defval: '', raw: true });
      if (a.length && a[0][0] === MARK) {
        const j = JSON.parse(a.slice(1).map(r => String(r[0] || '')).join(''));
        if (j && j.mark === MARK && j.db) base = j;
      }
    } catch (e) { base = null; }
  }
  const F = { app: 'stoic-ranger', format: 1, schemas: {}, favs: [], purposes: [] };
  TABLES.forEach(t => { F[t] = []; });
  if (base) {
    const d = base.db;
    TABLES.forEach(t => { F[t] = arr(d[t]).filter(r => r && typeof r === 'object').map(clone); });   // base stays as written
    F.favs = arr(d.favs); F.purposes = arr(d.purposes); F.schemas = d.schemas || {};
  }
  const found = [], created = [];
  const findIn = (t, uid, id) => (uid && F[t].find(r => r.uid === uid)) || (id && F[t].find(r => r.id === id)) || null;
  // value of a cell by column type; undefined = column not in this sheet (the field is not touched)
  const val = (row, h, ty) => {
    if (!(h in row)) return undefined;
    const v = row[h];
    if (ty === 'n' || ty === 'i') { const n = num(v instanceof Date ? '' : v); return n == null ? null : ty === 'i' ? Math.round(n) : n; }
    if (ty === 'd') return cellDate(v);
    if (ty === 'h') return cellTime(v);
    if (ty === 'b') { const s = low(v); return /^(yes|y|ja|true|1|pass|passed|x)$/.test(s) ? true : /^(no|n|nein|false|0|fail|failed)$/.test(s) ? false : null; }
    return txt(v);
  };
  const overlay = (t, sheet, cols, opts = {}) => {
    const R = rowsOf(sheet); if (!R) return;
    found.push(sheet);
    R.forEach((row, i) => {
      const uid = txt(row['Source uid']);
      const rec = {};
      cols.forEach(([h, k, ty]) => { const v = val(row, h, ty); if (v !== undefined) rec[k] = v; });
      if (opts.fix) opts.fix(rec, row);
      if (Object.values(rec).every(blank) && !uid) return;            // empty line
      if (opts.need && !opts.need(rec)) return;
      let m = findIn(t, uid, rec.id);
      if (!m) {
        m = { uid: uid || uuid() }; F[t].push(m);                    // a new row (an entry the apps never saw)
        if (!rec.id && opts.prefix) rec.id = nextId(F[t], opts.prefix, opts.pad);
        created.push([t, m]);
      }
      Object.keys(rec).forEach(k => { m[k] = rec[k]; });
      // an entry without a uid in the app (older Gun Database rows) keeps going by its ID: no new uid here
    });
  };
  for (const [t, [sheet, prefix, cols]] of Object.entries(REG)) overlay(t, sheet, cols, {
    prefix, pad: t === 'roundsLog' ? 4 : 3,
    need: t === 'roundsLog' ? r => !!(r.date || r.rounds) : t === 'barrels' ? r => !!(r.weaponId || r.name) : r => !!(r.name || r.id),
  });
  // names → ids (Trainings and Drill_Results write names); a name that is nowhere yet becomes a new entry
  // the names as the app wrote them: a gun renamed in Excel is still found under its old name in Trainings
  const OLD = {};
  ['shooters', 'weapons', 'trainers'].forEach(t => { OLD[t] = new Map(base ? arr(base.db[t]).filter(x => x && x.name).map(x => [low(x.name), x.id]) : []); });
  const idFor = (t, v) => {
    const s = txt(v); if (!s) return '';
    const L = F[t], was = OLD[t] && OLD[t].get(low(s));
    let r = L.find(x => x.id === s) || L.find(x => low(x.name) === low(s)) || L.find(x => txt(x.aliases).split(';').some(a => low(a) && low(a) === low(s)))
      || (was && L.find(x => x.id === was));
    if (!r) { r = { id: nextId(L, REG[t][1]), uid: uuid(), name: s, notes: 'Created from database.xlsx' }; L.push(r); created.push([t, r]); }
    return r.id;
  };
  const P = rowsOf(SHEETS.purposes);
  if (P) {
    found.push(SHEETS.purposes);
    const ev = s => { const l = low(s); return /gun|ammo|rifle|waffe/.test(l) ? 'rifle' : /shooter|schütze/.test(l) ? 'shooter' : /round/.test(l) ? 'rounds' : ''; };
    P.forEach(row => {
      const id = txt(row.ID), name = txt(row.Name); if (!id && !name) return;
      let p = F.purposes.find(x => (id && x.id === id) || (!id && low(x.name) === low(name)));
      if (!p) { p = { id: id || 'own-' + low(name).replace(/[^a-z0-9]+/g, '-') }; F.purposes.push(p); }
      if ('Name' in row) p.name = name;
      if ('Evaluated as' in row) { const e = ev(row['Evaluated as']); if (e) p.evalAs = e; }
      if ('Notes' in row) p.notes = txt(row.Notes);
    });
  }
  const T = rowsOf(SHEETS.trainings);
  if (T) {
    found.push(SHEETS.trainings);
    T.forEach(row => {
      if (!row.Date && !row.Description && !row['Source uid']) return;
      const uid = txt(row['Source uid']), id = txt(row.ID);
      let m = findIn('trainings', uid, id);
      if (!m) { m = { uid: uid || uuid(), id: id && !F.trainings.some(x => x.id === id) ? id : nextId(F.trainings, 'TR', 4) }; F.trainings.push(m); created.push(['trainings', m]); }
      if ('Date' in row) m.date = cellDate(row.Date);
      if ('Start' in row) m.start = cellTime(row.Start);
      if ('Duration h' in row) m.durationH = num(row['Duration h']);
      if ('Type' in row) { const v = low(row.Type); if (v) m.fire = /^dry|trocken/.test(v) ? 'dry' : 'live'; else if (!m.fire) m.fire = 'live'; }
      if ('Shooter' in row) m.shooterId = idFor('shooters', row.Shooter);
      if ('Description' in row) m.desc = txt(row.Description);
      if ('Trainer / organizer' in row) m.trainerId = idFor('trainers', row['Trainer / organizer']);
      if ('Remarks' in row) m.remarks = txt(row.Remarks);
      if ('Weapon 1' in row) {
        const ws = [];
        for (let i = 1; ('Weapon ' + i) in row; i++) {
          const w = txt(row['Weapon ' + i]); if (!w) continue;
          const id2 = idFor('weapons', w), old = arr(m.weapons).find(x => x.weaponId === id2);
          ws.push(Object.assign({}, old || {}, { weaponId: id2, rounds: num(row['Rounds ' + i]) }));
        }
        m.weapons = ws;
      }
    });
  }
  overlay('results', SHEETS.results, RESULT_COLS, {
    prefix: 'R', pad: 4, need: r => !!(r.drillId || r.date),
    fix: (rec, row) => {
      if ('shooter' in rec) { rec.shooterId = idFor('shooters', rec.shooter); delete rec.shooter; }
      delete rec.drillName;
      if ('trainingId' in rec) { const id = rec.trainingId; delete rec.trainingId; rec._trainingId = id; }
    },
  });
  F.results.forEach(r => {                           // a drill result's training by its id in the Trainings sheet
    if (!('_trainingId' in r)) return;
    const id = r._trainingId; delete r._trainingId;
    if (!id) { if (r.training && !r.training.uid) r.training = null; return; }
    if (r.training && r.training.id === id) return;
    const t = F.trainings.find(x => x.id === id);
    r.training = t ? { app: 'training-log', id: t.id, uid: t.uid, date: t.date || r.date || '' } : (r.training || null);
  });
  overlay('sheets', SHEETS.sheets, SHEET_COLS, { prefix: 'SH', pad: 3, need: r => !!(r.date || r.id), fix: rec => { delete rec.hitCount; } });
  // shots: only for datasheets the full copy does not have (typed in Excel, or a file without the copy)
  const S = rowsOf(SHEETS.shots);
  if (S) {
    found.push(SHEETS.shots);
    const by = new Map();
    S.forEach(row => { const id = txt(row['Sheet ID']); if (!id) return; if (!by.has(id)) by.set(id, []); by.get(id).push({ n: num(row.Shot) || 0, x: num(row['X mm']), y: num(row['Y mm']) }); });
    F.sheets.forEach(s => {
      if (arr(s.hits).length || !by.has(s.id)) return;
      s.hits = by.get(s.id).filter(h => h.x != null && h.y != null).sort((a, b) => a.n - b.n).map(h => ({ x: h.x, y: h.y }));
    });
  }
  F.sheets.forEach(s => { SHEET_KEYS.forEach(k => { if (s[k] == null) s[k] = ''; }); if (!Array.isArray(s.hits)) s.hits = []; });
  const Fv = rowsOf(SHEETS.favs);
  if (Fv) { found.push(SHEETS.favs); F.favs = [...new Set(Fv.map(r => txt(r['Drill ID'])).filter(Boolean))]; }
  if (!base && !found.length) throw new Error('This file has none of the Stoic Ranger sheets (Weapons, Trainings, …).');
  return { db: F, hasCopy: !!base, saved: base ? base.saved : '', by: base ? base.by : '', sheets: found, created: created.length };
}
function nextId(list, prefix, pad = 3) {
  let n = 0; arr(list).forEach(r => { const m = new RegExp('^(?:EX-)?' + prefix + '-(\\d+)$').exec(r && r.id || ''); if (m) n = Math.max(n, +m[1]); });
  return `${prefix}-${String(n + 1).padStart(pad, '0')}`;
}

/* ---------- merge ---------- */
const REFS = { weapons: ['weaponId'], shooters: ['shooterId'], trainers: ['trainerId'], munitions: ['munitionId'], barrels: ['barrelId'] };
/** Three-way merge of one table. base: the table at the last sync (null on the first sync). */
function mergeTable(B, A, F, firstSync, stats, t) {
  const bMap = new Map(arr(B).map(r => [keyOf(r), r]));
  const fMap = new Map(arr(F).map(r => [keyOf(r), r]));
  const aKeys = new Set(arr(A).map(keyOf));
  const out = [];
  arr(A).forEach(a => {
    const k = keyOf(a), f = fMap.get(k) || (a.id && !a.uid ? null : arr(F).find(x => !x.uid && x.id && x.id === a.id)) || null;
    if (!f) { out.push(a); return; }                    // not in the file (or deleted there): stays
    const b = bMap.get(k), r = Object.assign({}, a);
    let changed = false;
    Object.keys(f).forEach(key => {
      if (key === 'uid') return;
      const fv = f[key], av = a[key];
      if (same(fv, av)) return;
      const take = firstSync || !b ? blank(av) && !blank(fv) : !same(fv, b[key]);
      if (take) { r[key] = clone(fv); changed = true; }
    });
    if (changed) { r.updated = new Date().toISOString(); stats.changed[t] = (stats.changed[t] || 0) + 1; }
    out.push(r);
  });
  arr(F).forEach(f => {
    const k = keyOf(f);
    if (aKeys.has(k) || out.some(r => r.uid && r.uid === f.uid)) return;
    if (!firstSync && bMap.has(k)) return;              // deleted in the app since the last sync: stays deleted
    out.push(clone(f)); stats.added[t] = (stats.added[t] || 0) + 1;
  });
  return out;
}
/** Merges a file (from read()) into the app's one database. base = dbPart of the last sync, or null. Returns a new db. */
function merge(base, app, file) {
  const first = !base, B = base || {}, U = clone(app);
  const stats = { added: {}, changed: {} };
  // ids that are taken by a different entry in the app: the new entry from the file gets the next free id
  const remap = {};
  Object.keys(REFS).forEach(t => {
    remap[t] = {};
    const A = arr(U[t]);
    arr(file[t]).forEach(f => {
      if (!f.id || A.some(a => keyOf(a) === keyOf(f))) return;
      if (A.some(a => a.id === f.id && keyOf(a) !== keyOf(f)) && !(B[t] && arr(B[t]).some(b => keyOf(b) === keyOf(f)))) {
        const n = nextId(A.concat(arr(file[t])), REG[t][1]); remap[t][f.id] = n; f.id = n;
      }
    });
  });
  const fix = r => {
    Object.entries(REFS).forEach(([t, keys]) => keys.forEach(k => { if (r[k] && remap[t][r[k]]) r[k] = remap[t][r[k]]; }));
    if (Array.isArray(r.weapons)) r.weapons.forEach(w => { if (w && remap.weapons[w.weaponId]) w.weaponId = remap.weapons[w.weaponId]; });
  };
  TABLES.forEach(t => arr(file[t]).forEach(fix));
  TABLES.forEach(t => { U[t] = mergeTable(B[t], arr(U[t]), arr(file[t]), first, stats, t); });
  // favourite drills: added in the file → added; removed in the file since the last sync → removed
  const bf = new Set(arr(B.favs)), ff = new Set(arr(file.favs)), af = arr(U.favs);
  U.favs = first ? [...new Set(af.concat([...ff]))] : af.filter(id => ff.has(id) || !bf.has(id)).concat([...ff].filter(id => !bf.has(id) && !af.includes(id)));
  // purposes (Gun Database settings)
  if (arr(file.purposes).length) {
    U.settings = U.settings || {}; U.settings.gundb = U.settings.gundb || {};
    const ap = arr(U.settings.gundb.purposes).length ? U.settings.gundb.purposes : null;
    U.settings.gundb.purposes = ap ? mergeTable(B.purposes ? arr(B.purposes).map(p => Object.assign({ uid: p.id }, p)) : null, ap.map(p => Object.assign({ uid: p.id }, p)), file.purposes.map(p => Object.assign({ uid: p.id }, p)), first, stats, 'purposes').map(p => { const o = Object.assign({}, p); delete o.uid; delete o.updated; return o; })
      : clone(file.purposes);
  }
  return { db: U, stats };
}
const countOf = s => Object.values(s).reduce((a, n) => a + n, 0);

window.SRX = { FORMAT, write, read, merge, dbPart, nextId, countOf, SHEETS, REG, TABLES, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
})();
