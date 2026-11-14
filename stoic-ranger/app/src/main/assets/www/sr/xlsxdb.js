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
const DELETED = '_Deleted';                        // 1.4.0: tombstones shared by all apps (SHARED-DB-CONTRACT.md, section E)
const DEL_COLS = ['App', 'Table', 'ID', 'Source uid', 'Label', 'Deleted at', 'Deleted by'];
const KEEP_DAYS = 365, UNDO_DAYS = 30;
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
  roundsLog: ['Rounds_Log', 'R', [['Date', 'date', 'd'], ['Weapon ID', 'weaponId'], ['Barrel ID', 'barrelId'], ['Rounds', 'rounds', 'i'], ['Note', 'note'], ['ID', 'id'], ['Munition ID', 'munitionId']]],
  targets: ['Targets', 'TG', [['ID', 'id'], ['Name', 'name'], ['Type', 'type'], ['Scoring rings', 'rings', 'i'], ['10-ring or plate diameter mm', 'd10', 'n'], ['Ring width mm', 'w', 'n'],
    ['Inner ten (X) diameter mm', 'xd', 'n'], ['Intended distance m', 'distM', 'n'], ['Card / plate size', 'sizeMm'], ['Source', 'source'], ['Notes', 'notes']]],
  trainers: ['Trainers', 'T', [['ID', 'id'], ['Name', 'name'], ['Contact person', 'contact'], ['Phone', 'phone'], ['E-mail', 'email'], ['Website', 'website'], ['Notes', 'notes']]],
};
/* 1.4.0 (remark #20): one shooter only, so no Shooters sheet and no Shooter column any more. Older files still have
   them: they are read, and dropShooters() turns another shooter's name into "Shot by <name>" in the entry's note. */
const OLD_SHOOTERS = ['Shooters', 'S', [['ID', 'id'], ['Name', 'name'], ['Aliases (as written on sheets)', 'aliases'], ['Added', 'added', 'd'], ['Status', 'status'], ['Notes', 'notes']]];
const SHEET_KEYS = ['no', 'date', 'time', 'purpose', 'discipline', 'position', 'series', 'rounds', 'gun', 'barrel', 'optic', 'caliber', 'ammo', 'bullet', 'v0', 'v0sd',
  'zero', 'dialE', 'dialW', 'range', 'coords', 'elev', 'dist', 'setting', 'temp', 'hum', 'press', 'wind', 'light', 'preset', 'bd', 'd10', 'w', 'remarks'];
const SHEET_COLS = [['ID', 'id'], ['Date', 'date', 'd'], ['Time', 'time', 'h'], ['Sheet no.', 'no'], ['Purpose', 'purpose'],
  ['Discipline', 'discipline'], ['Position', 'position'], ['Series', 'series'], ['Rounds', 'rounds'], ['Gun', 'gun'], ['Weapon ID', 'weaponId'], ['Barrel', 'barrel'], ['Barrel ID', 'barrelId'],
  ['Optic', 'optic'], ['Caliber', 'caliber'], ['Ammunition', 'ammo'], ['Munition ID', 'munitionId'], ['Bullet g', 'bullet'], ['V0 m/s', 'v0'], ['V0 SD m/s', 'v0sd'], ['Zero m', 'zero'],
  ['Dial elevation', 'dialE'], ['Dial windage', 'dialW'], ['Range', 'range'], ['Coordinates', 'coords'], ['Elevation m ASL', 'elev'], ['Distance m', 'dist'], ['Setting', 'setting'],
  ['Temp °C', 'temp'], ['Humidity %', 'hum'], ['Pressure hPa', 'press'], ['Wind', 'wind'], ['Light', 'light'], ['Target', 'preset'], ['Bullet diameter mm', 'bd'],
  ['10-ring diameter mm', 'd10'], ['Ring width mm', 'w'], ['Remarks', 'remarks'], ['Hits', 'hitCount']];
const RESULT_COLS = [['ID', 'id'], ['Date', 'date', 'd'], ['Drill ID', 'drillId'], ['Drill', 'drillName'], ['Weapon ID', 'weaponId'], ['Mode', 'mode'],
  ['Time s', 'timeS', 'n'], ['Hits', 'hits', 'n'], ['Shots', 'shots', 'n'], ['Points', 'points', 'n'], ['Distance m', 'distanceM', 'n'], ['Pass', 'pass', 'b'], ['Training ID', 'trainingId'], ['Notes', 'notes']];
const EVAL = { rifle: 'Gun/ammo', shooter: 'Shooter', rounds: 'Rounds only' };
const TABLES = ['weapons', 'barrels', 'munitions', 'trainers', 'targets', 'roundsLog', 'sheets', 'trainings', 'results'];
const SHEETS = { weapons: 'Weapons', barrels: 'Barrels', munitions: 'Munitions', roundsLog: 'Rounds_Log', targets: 'Targets', trainers: 'Trainers',
  trainings: 'Trainings', results: 'Drill_Results', sheets: 'Datasheets', purposes: 'Purposes', favs: 'Drill_Favourites', shots: 'Shots' };

const keyOf = r => r && (r.uid || r.id) || '';
/** A rounds log entry the app made from a training (Gun Database link): its rounds are in the Trainings sheet already. */
const fromTraining = r => !!(r && ((r.link && r.link.app === 'training-log') || r.trainingId || String(r.uid || '').includes(':')));
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
    const list = t === 'roundsLog' ? own(t).filter(r => !fromTraining(r)) : own(t);   // 1.4.0: training rounds are in Trainings already
    X.utils.book_append_sheet(wb, sheetOf(X, cols.map(c => c[0]).concat('Source uid'), list.map(r => cellsOf(cols, r).concat(r.uid || ''))), sheet);
    if (t === 'targets') {
      X.utils.book_append_sheet(wb, sheetOf(X, ['ID', 'Name', 'Evaluated as', 'Notes'], purposesOf(u).map(p => [p.id || '', p.name || '', EVAL[p.evalAs] || p.evalAs || '', p.notes || ''])), SHEETS.purposes);
      const T = REG.trainers[2];
      X.utils.book_append_sheet(wb, sheetOf(X, T.map(c => c[0]).concat('Source uid'), own('trainers').map(r => cellsOf(T, r).concat(r.uid || ''))), 'Trainers');
    }
  }
  // Trainings: names as on the PC (Weapon 1/Rounds 1 …, at least 4 pairs)
  const tr = own('trainings').slice().sort((a, b) => txt(a.date).localeCompare(txt(b.date)));
  const nW = Math.max(4, ...tr.map(t => arr(t.weapons).length));
  const head = ['ID', 'Date', 'Start', 'Duration h', 'Type', 'Description', 'Trainer / organizer'];
  for (let i = 1; i <= nW; i++) head.push('Weapon ' + i, 'Rounds ' + i);
  head.push('Remarks', 'Source uid');
  X.utils.book_append_sheet(wb, sheetOf(X, head, tr.map(t => {
    const r = [t.id || '', t.date || '', t.start || '', t.durationH ?? '', t.fire === 'dry' ? 'Dry fire' : 'Live fire', t.desc || '', nameOf(u, 'trainers', t.trainerId)];
    for (let i = 0; i < nW; i++) { const w = arr(t.weapons)[i]; r.push(w ? nameOf(u, 'weapons', w.weaponId) || w.name || w.weaponId || '' : '', w && w.rounds != null ? w.rounds : ''); }
    r.push(t.remarks || '', t.uid || '');
    return r;
  })), SHEETS.trainings);
  X.utils.book_append_sheet(wb, sheetOf(X, RESULT_COLS.map(c => c[0]).concat('Source uid'), own('results').map(r => cellsOf(RESULT_COLS,
    Object.assign({}, r, { drillName: names[r.drillId] || r.drillName || '', trainingId: (r.training && r.training.id) || '' })).concat(r.uid || ''))), SHEETS.results);
  // only in the app until now: datasheets (one row each) and their shots, favourite drills
  X.utils.book_append_sheet(wb, sheetOf(X, SHEET_COLS.map(c => c[0]).concat('Source uid'), own('sheets').map(s => cellsOf(SHEET_COLS, Object.assign({}, s, { hitCount: arr(s.hits).length })).concat(s.uid || ''))), SHEETS.sheets);
  const shots = [];
  own('sheets').forEach(s => arr(s.hits).forEach((h, i) => shots.push([s.id || '', s.date || '', i + 1, h && h.x != null ? +h.x : '', h && h.y != null ? +h.y : ''])));
  X.utils.book_append_sheet(wb, sheetOf(X, ['Sheet ID', 'Date', 'Shot', 'X mm', 'Y mm'], shots), SHEETS.shots);
  X.utils.book_append_sheet(wb, sheetOf(X, ['Drill ID', 'Drill'], arr(u.favs).map(id => [id, names[id] || ''])), SHEETS.favs);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
    ['Database', 'Stoic Ranger database: guns, barrels, ammunition, trainers, targets, datasheets, trainings and drill results. The same file for Android, iPhone and Windows.'],
    ['Editing', 'You can edit this file in Excel. Keep the ID and Source uid columns as they are; new rows may leave Source uid empty. To delete an entry, delete it in the app: rows deleted here are kept by the apps.'],
    ['Trainings', 'Trainer and guns by name (as in the sheets above). Type: Live fire or Dry fire; dry-fire Rounds are repetitions, never rounds.'],
    ['Datasheets', 'One row per datasheet; its shots are in Shots (X right, Y up, mm on the target). Shots are kept by the app: change them in the app.'],
    ['Units', 'Metric: mm, m, g, m/s, °C, hPa, mrad.'],
    ['Saved', (info.by || 'Stoic Ranger Shooting') + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Format', 'Stoic Ranger database.xlsx ' + FORMAT]]), 'Info');
  // the full copy for the apps (hidden): fields without a column, shots, settings
  const full = JSON.stringify({ mark: MARK, format: FORMAT, saved: new Date().toISOString(), by: info.by || '', db: dbPart(u) });
  const rows = [[MARK, FORMAT, 'Do not edit: a copy of the whole database for the Stoic Ranger apps. The sheets before this one win over it.']];
  for (let i = 0; i < full.length; i += CHUNK) rows.push([full.slice(i, i + CHUNK)]);
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), HIDDEN);
  // tombstones of every app (section E): ours from the app, the others' as they were read
  const tomb = arr(u.deleted).filter(d => d && d.at);
  X.utils.book_append_sheet(wb, sheetOf(X, DEL_COLS, tomb.map(d => [d.app || 'SR', d.app && d.app !== 'SR' ? d.table || '' : SHEETS[d.t] || d.table || d.t || '', d.id || '', d.uid || '', d.label || '', d.at, d.by || ''])), DELETED);
  // every sheet this app does not own stays as it was (other Stoic Ranger apps: FK_, PF_, GS_, DT_ and their hidden
  // _XX_Data sheets; the user's own sheets), hidden ones stay hidden (shared contract 2026-11-07)
  const hidden = { [HIDDEN]: 1, [DELETED]: 1 };
  if (info.keep && info.keep.length) {
    let old = null;
    try { old = X.read(info.keep, { type: 'array', cellDates: true }); } catch (e) { old = null; }
    if (old) {
      const mine = new Set(wb.SheetNames.concat(OLD_SHOOTERS[0])), vis = {};   // the old Shooters sheet goes (1.4.0)
      ((old.Workbook && old.Workbook.Sheets) || []).forEach(x => { if (x && x.name) vis[x.name] = x.Hidden || 0; });
      old.SheetNames.forEach(n => { if (mine.has(n) || !old.Sheets[n]) return; X.utils.book_append_sheet(wb, old.Sheets[n], n); if (vis[n]) hidden[n] = vis[n]; });
    }
  }
  wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.SheetNames.map(n => ({ name: n, Hidden: hidden[n] || 0 }));
  const out = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
  if (info.keep && info.keep.length) { try { return keepLayout(X, out, info.keep); } catch (e) { return out; } }
  return out;
}

/* 1.4.0 (backlog #25): the workbook is written anew, so what Excel or the PC dashboard put around the data would be
   lost. Taken over from the previous file, for every sheet that was already there: drop-down lists (data validations),
   column widths and frozen header rows, plus the workbook's named ranges the lists may use. Data stays as written. */
function keepLayout(X, fresh, old) {
  const C = X.CFB, A = C.read(fresh, { type: 'array' }), B = C.read(old, { type: 'array' });
  const txtOf = (z, p) => { const i = z.FullPaths.findIndex(f => f.replace(/^Root Entry\//, '') === p); return i < 0 ? null : { i, s: new TextDecoder().decode(z.FileIndex[i].content) }; };
  const put = (z, i, str) => { z.FileIndex[i].content = new TextEncoder().encode(str); };
  const sheetPaths = z => {
    const wb = txtOf(z, 'xl/workbook.xml'), rel = txtOf(z, 'xl/_rels/workbook.xml.rels'); if (!wb || !rel) return {};
    const targets = {}; rel.s.replace(/<Relationship\b[^>]*>/g, t => { const id = (/Id="([^"]+)"/.exec(t) || [])[1], tg = (/Target="([^"]+)"/.exec(t) || [])[1]; if (id && tg) targets[id] = tg.replace(/^\/?(xl\/)?/, 'xl/'); return t; });
    const out = {}; wb.s.replace(/<sheet\b[^>]*>/g, t => { const n = (/name="([^"]+)"/.exec(t) || [])[1], id = (/r:id="([^"]+)"/.exec(t) || [])[1]; if (n && targets[id]) out[n] = targets[id]; return t; });
    return out;
  };
  const pa = sheetPaths(A), pb = sheetPaths(B);
  let changed = false;
  // header rows of both files: a column that moved (1.4.0: the Shooter column went) takes its drop-down along
  let hA = {}, hB = {};
  try {
    const head = wb => { const o = {}; wb.SheetNames.forEach(n => { const a = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, range: 0, defval: '' })[0]; o[n] = arr(a).map(v => String(v)); }); return o; };
    hA = head(X.read(fresh, { type: 'array', sheetRows: 1 })); hB = head(X.read(old, { type: 'array', sheetRows: 1 }));
  } catch (e) { hA = {}; hB = {}; }
  const colN = l => l.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1, colL = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const remapDv = (dv, name) => {
    const ha = hA[name], hb = hB[name];
    if (!ha || !hb || ha.join('\u0001') === hb.join('\u0001')) return dv;
    const map = c => { const h = hb[c]; if (h == null || h === '') return c < hb.length ? -1 : c; const i = ha.indexOf(h); return i; };
    let n = 0;
    const out = dv.replace(/<dataValidation\b[^>]*?(\/>|>[\s\S]*?<\/dataValidation>)/g, el => {
      const sq = (/sqref="([^"]*)"/.exec(el) || [])[1]; if (sq == null) return el;
      if (/<formula1>[^<]*Shooters!/.test(el)) return '';
      const parts = [];
      sq.split(/\s+/).filter(Boolean).forEach(rg => {
        const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(rg); if (!m) { parts.push(rg); return; }
        const c1 = colN(m[1]), c2 = m[3] ? colN(m[3]) : c1, r1 = m[2], r2 = m[4] || m[2];
        for (let c = c1; c <= c2; c++) { const to = map(c); if (to >= 0) parts.push(colL(to) + r1 + (r2 !== r1 || m[3] ? ':' + colL(to) + r2 : '')); }
      });
      if (!parts.length) return '';
      n++;
      return el.replace(/sqref="[^"]*"/, 'sqref="' + parts.join(' ') + '"');
    });
    if (!n) return '';
    return out.replace(/count="\d+"/, 'count="' + n + '"');
  };
  const sameHead = name => !hA[name] || !hB[name] || hA[name].join('\u0001') === hB[name].join('\u0001');
  const grab = (x, tag) => { const m = new RegExp('<' + tag + '\\b[\\s\\S]*?</' + tag + '>|<' + tag + '\\b[^>]*/>').exec(x); return m ? m[0] : ''; };
  Object.keys(pa).forEach(name => {
    if (!pb[name]) return;
    const a = txtOf(A, pa[name]), b = txtOf(B, pb[name]); if (!a || !b) return;
    let x = a.s;
    const dv = remapDv(grab(b.s, 'dataValidations'), name), cols = sameHead(name) ? grab(b.s, 'cols') : '', views = grab(b.s, 'sheetViews');
    if (views) x = grab(x, 'sheetViews') ? x.replace(grab(x, 'sheetViews'), views) : x.replace(/(<sheetFormatPr\b|<cols\b|<sheetData\b)/, views + '$1');
    if (cols) x = grab(x, 'cols') ? x.replace(grab(x, 'cols'), cols) : x.replace(/<sheetData\b/, cols + '<sheetData');
    if (dv && !grab(x, 'dataValidations')) x = x.replace(/(<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<headerFooter\b|<drawing\b|<legacyDrawing\b|<tableParts\b|<extLst\b|<\/worksheet>)/, dv + '$1');
    if (x !== a.s) { put(A, a.i, x); changed = true; }
  });
  // named ranges (not the built-in _xlnm ones) that the drop-down lists may point at
  const wa = txtOf(A, 'xl/workbook.xml'), wbOld = txtOf(B, 'xl/workbook.xml');
  if (wa && wbOld) {
    const names = (grab(wbOld.s, 'definedNames').match(/<definedName\b[\s\S]*?<\/definedName>/g) || []).filter(d => !/name="_xlnm\./.test(d) && /!/.test(d));
    const sheetsNow = Object.keys(pa);
    const ok = names.filter(d => sheetsNow.some(n => d.includes(n + '!') || d.includes("'" + n + "'!")));
    if (ok.length && !/<definedName\b/.test(wa.s)) {
      put(A, wa.i, wa.s.replace(/<\/sheets>/, '</sheets><definedNames>' + ok.map(d => d.replace(/\s*localSheetId="\d+"/, '')).join('') + '</definedNames>')); changed = true;
    }
  }
  if (!changed) return fresh;
  const junk = A.FullPaths.findIndex(f => /Sh33tJ5/.test(f)); if (junk >= 0) { A.FullPaths.splice(junk, 1); A.FileIndex.splice(junk, 1); }
  return new Uint8Array(C.write(A, { fileType: 'zip', type: 'array', compression: true }));
}
/* 1.4.0 (remark #20, Manuel 2026-11-07: "it is only ever the user of the app"): the shooter goes out of the data.
   The user is `me` (a name), else the shooter with the most entries. Entries of another shooter keep everything
   (their rounds stay in the totals) and get "Shot by <name>" in their note, once. Then the shooters table and every
   shooter field go. Returns { me, moved, dropped }; nothing to do = { moved: 0, dropped: 0 }. */
const NOTE_OF = { trainings: 'remarks', results: 'notes', sheets: 'remarks', roundsLog: 'note' };
function dropShooters(db, me) {
  const S = arr(db.shooters);
  const nameOf2 = id => { const r = id && S.find(x => x && x.id === id); return r ? txt(r.name) : ''; };
  const recs = [];
  Object.keys(NOTE_OF).forEach(t => arr(db[t]).forEach(r => { if (r && typeof r === 'object') recs.push([t, r]); }));
  const who = r => nameOf2(r.shooterId) || txt(r.shooter);
  const has = r => ('shooterId' in r) || ('shooter' in r);
  if (!S.length && !recs.some(([, r]) => has(r)) && !('shooters' in db)) return { me: me || '', moved: 0, dropped: 0 };
  let mine = txt(me);
  if (!mine) {
    const n = new Map();
    recs.forEach(([, r]) => { if (r.example) return; const w = who(r); if (w) n.set(low(w), (n.get(low(w)) || 0) + 1); });
    let best = '', top = 0;
    S.filter(x => x && !x.example).map(x => txt(x.name)).concat([...n.keys()]).forEach(w => { const c = n.get(low(w)) || 0; if (w && c > top) { best = w; top = c; } });
    mine = best || txt((S.find(x => x && !x.example) || {}).name);
  }
  let moved = 0, dropped = 0;
  recs.forEach(([t, r]) => {
    if (!has(r)) return;
    const w = who(r), k = NOTE_OF[t];
    if (w && low(w) !== low(mine) && !r.example) {
      const tag = 'Shot by ' + w, cur = txt(r[k]);
      if (!cur.toLowerCase().includes(tag.toLowerCase())) r[k] = cur ? cur + ' · ' + tag : tag;
      moved++;
    }
    delete r.shooterId; delete r.shooter; dropped++;
  });
  if ('shooters' in db) { dropped += S.length; delete db.shooters; }
  return { me: mine, moved, dropped };
}
/** What of the one file goes into database.xlsx: the tables, favourites and the shared settings (not the history). */
function dbPart(u) {
  const o = { app: 'stoic-ranger', format: u.format || 1, schemas: clone(u.schemas || {}), favs: clone(arr(u.favs)), purposes: clone(purposesOf(u)) };
  TABLES.forEach(t => { o[t] = clone(arr(u[t])); });
  return o;
}

/* ---------- read ---------- */
/** database.xlsx bytes → { db: tables like the one file, purposes, favs, hasCopy, sheets: [found] }. Throws if it is no xlsx. */
function read(bytes, me) {
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
  F.shooters = [];                                    // only while reading an older file (see dropShooters)
  if (base) {
    const d = base.db;
    TABLES.concat('shooters').forEach(t => { F[t] = arr(d[t]).filter(r => r && typeof r === 'object').map(clone); });   // base stays as written
    F.favs = arr(d.favs); F.purposes = arr(d.purposes); F.schemas = d.schemas || {};
  }
  const found = [], created = [];
  const noUid = m => { Object.defineProperty(m, 'noUid', { value: true, enumerable: false, writable: true }); return m; };
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
        if (!uid) noUid(m);                                            // made in Excel / the PC: merge() matches it by ID or name
        if (!rec.id && opts.prefix) rec.id = nextId(F[t], opts.prefix, opts.pad);
        created.push([t, m]);
      }
      Object.keys(rec).forEach(k => { m[k] = rec[k]; });
      // an entry without a uid in the app (older Gun Database rows) keeps going by its ID: no new uid here
    });
  };
  for (const [t, [sheet, prefix, cols]] of Object.entries(Object.assign({ shooters: OLD_SHOOTERS }, REG))) overlay(t, sheet, cols, {
    prefix, pad: t === 'roundsLog' ? 4 : 3,
    need: t === 'roundsLog' ? r => !!(r.date || r.rounds) : t === 'barrels' ? r => !!(r.weaponId || r.name) : r => !!(r.name || r.id),
  });
  // tombstones (section E): every app's rows; ours get their table key
  const BY_SHEET = {}; Object.entries(SHEETS).forEach(([k, n]) => { BY_SHEET[n] = k; });
  F.deleted = [];
  const D = rowsOf(DELETED);
  if (D) D.forEach(row => {
    const at = row['Deleted at'] instanceof Date ? row['Deleted at'].toISOString() : txt(row['Deleted at']);
    const app = txt(row.App) || 'SR', table = txt(row.Table), id = txt(row.ID), uid = txt(row['Source uid']);
    if (!at || !table || (!id && !uid)) return;
    const d = { app, table, id, uid, label: txt(row.Label), at, by: txt(row['Deleted by']) };
    if (app === 'SR') { if (!BY_SHEET[table]) return; d.t = BY_SHEET[table]; }
    F.deleted.push(d);
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
    if (!r) { const d = F.deleted.find(x => x.app === 'SR' && x.t === t && x.id && (x.id === s || low(x.label) === low(s))); if (d) return d.id; }   // deleted on purpose: no new entry (1.4.0)
    if (!r) { r = noUid({ id: nextId(L, (REG[t] || OLD_SHOOTERS)[1]), uid: uuid(), name: s, notes: 'Created from database.xlsx' }); L.push(r); created.push([t, r]); }
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
      if (!m) { m = { uid: uid || uuid(), id: id && !F.trainings.some(x => x.id === id) ? id : nextId(F.trainings, 'TR', 4) }; if (!uid) noUid(m); F.trainings.push(m); created.push(['trainings', m]); }
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
  overlay('results', SHEETS.results, RESULT_COLS.concat([['Shooter', 'shooter']]), {
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
  overlay('sheets', SHEETS.sheets, SHEET_COLS.concat([['Shooter', 'shooter'], ['Shooter ID', 'shooterId']]), { prefix: 'SH', pad: 3, need: r => !!(r.date || r.id), fix: rec => { delete rec.hitCount; } });
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
  const shot = dropShooters(F, me);
  return { db: F, shot, hasCopy: !!base, saved: base ? base.saved : '', by: base ? base.by : '', sheets: found, created: created.length };
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
    if (changed) {                                     // 1.4.0: the time of the change itself, not of this sync (tombstones compare it)
      const fu = f.updated || '', au = a.updated || '';
      if (fu || au) r.updated = fu > au ? fu : au; else delete r.updated;
      stats.changed[t] = (stats.changed[t] || 0) + 1;
    }
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
  // 1.3.1: rows without a Source uid (made in Excel or by the PC dashboard) are the app's entries with the same ID
  // (or, failing that, the same name), not new ones: they take that entry's uid and ID. Before this, every sync with
  // such a file added each of them again under the next free ID (Manuel 2026-11-14, shooters three times).
  TABLES.forEach(t => {
    const A = arr(U[t]).filter(a => a && !a.example), used = new Set();
    remap[t] = {};
    arr(file[t]).forEach(f => {
      if (!f || !f.noUid) return;
      const free = a => !used.has(keyOf(a)) && !arr(file[t]).some(x => x !== f && x.uid && x.uid === a.uid);
      const sameName = a => !!(f.name && a.name && low(f.name) === low(a.name));
      let a = (f.id && A.find(x => x.id === f.id && free(x) && (!f.name || !x.name || sameName(x)))) || null;
      if (!a && f.name) a = A.find(x => free(x) && sameName(x)) || null;
      if (!a && t === 'roundsLog') a = A.find(x => free(x) && txt(x.date) === txt(f.date) && x.weaponId === f.weaponId && +x.rounds === +f.rounds) || null;
      if (!a) {                                           // 1.4.0: an entry deleted in the app stays deleted
        const tombs = arr(U.deleted).concat(arr(file.deleted)).filter(d => d && d.t === t && (!d.app || d.app === 'SR'));
        const d = (f.id && tombs.find(x => x.id === f.id && (!f.name || !x.label || low(x.label) === low(f.name)))) || (f.name && tombs.find(x => x.label && low(x.label) === low(f.name))) || null;
        if (d) { f.uid = d.uid || f.uid; if (d.id) f.id = d.id; delete f.updated; }
        return;
      }
      used.add(keyOf(a));
      f.uid = a.uid || f.uid;
      if (!a.uid) { delete f.uid; }                       // the app's entry goes by its ID only
      if (f.id && a.id && f.id !== a.id) { remap[t][f.id] = a.id; }
      f.id = a.id || f.id;
    });
  });
  Object.keys(REFS).forEach(t => {
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
/* ---------- 1.4.0: delete on all devices (SHARED-DB-CONTRACT.md, section E) ---------- */
const delKey = d => [d.app || 'SR', d.app && d.app !== 'SR' ? d.table : d.t, d.uid || d.id].join('|');
/** Both sides' tombstones in one list: one per entry, the newer delete wins; the local copy for Undo is kept;
    tombstones older than a year go. */
function mergeDeleted(a, b) {
  const m = new Map(), limit = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
  arr(a).concat(arr(b)).forEach(d => {
    if (!d || !d.at || d.at < limit) return;
    const k = delKey(d), o = m.get(k);
    if (!o) { m.set(k, Object.assign({}, d)); return; }
    const n = d.at > o.at ? Object.assign({}, o, d) : Object.assign({}, d, o);
    if (o.row && !n.row) n.row = o.row;
    if (o.undone && !n.undone) n.undone = o.undone;
    m.set(k, n);
  });
  return [...m.values()];
}
/** An entry is deleted when a tombstone of ours names it and it was not saved after the delete. */
function isDeleted(d, r) {
  if (!d || (d.app && d.app !== 'SR') || !r) return false;
  const hit = (d.uid && r.uid && d.uid === r.uid) || (d.id && r.id && d.id === r.id && (!d.uid || !r.uid || d.uid === r.uid));
  return !!hit && !(r.updated && r.updated > d.at);
}
/** Takes out of db every entry a tombstone deletes (its copy goes onto the tombstone for Undo). Returns the count. */
function applyDeleted(db) {
  let n = 0;
  arr(db.deleted).forEach(d => {
    if (!d || (d.app && d.app !== 'SR') || !d.t || !Array.isArray(db[d.t])) return;
    db[d.t] = db[d.t].filter(r => { if (r && !r.example && isDeleted(d, r)) { if (!d.row) d.row = JSON.parse(JSON.stringify(r)); n++; return false; } return true; });
  });
  // trainings keep the name of a deleted gun (every device the same way, so database.xlsx shows a name, not an id)
  const gone = new Map(arr(db.deleted).filter(d => d && (!d.app || d.app === 'SR') && d.t === 'weapons' && d.id && !d.undone).map(d => [d.id, d.label || '']));
  if (gone.size) arr(db.trainings).forEach(t => arr(t && t.weapons).forEach(w => {
    if (w && gone.has(w.weaponId) && !w.name && !arr(db.weapons).some(x => x && x.id === w.weaponId)) w.name = gone.get(w.weaponId);
  }));
  return n;
}
/** 1.3.1 one-time clean-up of the entries 1.3.0 added twice or more from files made in Excel (see merge()).
    Only exact copies go: guns, ammunition, barrels, shooters, trainers with the same name and the same data;
    trainings, drill results, datasheets, rounds log rows with the same ID and the same data. References to a copy
    (trainings, sheets, rounds, barrels …) move to the entry that is kept, the first one. Returns {db, removed}. */
function dedupe(db) {
  const U = clone(db), removed = {}, remap = {};
  const SKIP = new Set(['id', 'uid', 'updated', 'added', 'created', 'source', 'example']);
  const refKeys = { weaponId: 'weapons', barrelId: 'barrels', munitionId: 'munitions', shooterId: 'shooters', trainerId: 'trainers' };
  const sig = r => JSON.stringify(Object.keys(r).filter(k => !SKIP.has(k)).sort().map(k => {
    let v = r[k];
    if (refKeys[k] && remap[refKeys[k]] && remap[refKeys[k]][v]) v = remap[refKeys[k]][v];
    if (k === 'weapons' && Array.isArray(v)) v = v.map(w => w && remap.weapons && remap.weapons[w.weaponId] ? Object.assign({}, w, { weaponId: remap.weapons[w.weaponId] }) : w);
    return [k, blank(v) ? '' : v];
  }));
  const pass = (t, byName) => {
    const keep = new Map(); remap[t] = remap[t] || {};
    if (!Array.isArray(U[t])) return;                // no shooters table any more (1.4.0)
    U[t] = arr(U[t]).filter(r => {
      if (!r || typeof r !== 'object' || r.example) return true;
      if (byName ? !r.name : !r.id) return true;
      const k = (byName ? low(r.name) : r.id) + '|' + sig(r);
      const first = keep.get(k);
      if (!first) { keep.set(k, r); return true; }
      if (r.id && first.id && r.id !== first.id) remap[t][r.id] = first.id;
      removed[t] = (removed[t] || 0) + 1;
      return false;
    });
  };
  ['shooters', 'trainers', 'munitions', 'weapons'].forEach(t => pass(t, true));
  const fix = r => {
    if (!r || typeof r !== 'object') return;
    Object.entries(refKeys).forEach(([k, t]) => { if (r[k] && remap[t] && remap[t][r[k]]) r[k] = remap[t][r[k]]; });
    if (Array.isArray(r.weapons)) r.weapons.forEach(w => { if (w && remap.weapons[w.weaponId]) w.weaponId = remap.weapons[w.weaponId]; });
  };
  TABLES.forEach(t => arr(U[t]).forEach(fix));
  pass('barrels', true);
  TABLES.forEach(t => arr(U[t]).forEach(fix));
  ['trainings', 'results', 'sheets', 'roundsLog', 'targets'].forEach(t => pass(t, false));
  return { db: U, removed, total: countOf(removed) };
}

window.SRX = { FORMAT, fromTraining, write, read, merge, dedupe, dropShooters, mergeDeleted, isDeleted, applyDeleted, UNDO_DAYS, dbPart, nextId, countOf, SHEETS, REG, TABLES, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
})();
