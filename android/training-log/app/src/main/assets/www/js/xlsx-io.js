/* Stoic Ranger - Training Log — database.xlsx export / import, same sheets and columns as the registry workbook
   (03_registry/database.xlsx) and the dashboard: Shooters, Weapons, Trainers, Trainings. IDs and uids are kept, so
   data can go back and forth. Import merges: known IDs (or, for trainings, the same uid) are updated with the
   non-empty cells, new rows are added, nothing on the phone is deleted. */
'use strict';
(() => {
const { $, esc, num } = TL;
// [xlsx header, key, type]   t = text, n = number, d = date
const COLS = {
  shooters: ['Shooters', [['ID', 'id'], ['Name', 'name'], ['Aliases (as written on sheets)', 'aliases'], ['Added', 'added', 'd'], ['Status', 'status'], ['Notes', 'notes']]],
  weapons: ['Weapons', [['ID', 'id'], ['Name', 'name'], ['Type', 'type'], ['Make', 'make'], ['Model', 'model'], ['Caliber', 'caliber'], ['Zero distance m', 'zeroM', 'n'],
    ['Serial no.', 'serial'], ['Status', 'status'], ['Notes', 'notes']]],
  trainers: ['Trainers', [['ID', 'id'], ['Name', 'name'], ['Contact person', 'contact'], ['Phone', 'phone'], ['E-mail', 'email'], ['Website', 'website'], ['Notes', 'notes']]],
};
const cellDate = v => v instanceof Date ? new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : String(v ?? '').trim();
/** Type column: "Dry fire" / "dry" → dry, anything else filled → live; no column or empty cell keeps the training's type (new: live). */
const fireOf = (row, ex) => {
  const v = String(row.Type ?? '').trim().toLowerCase();
  return { fire: v ? (/^dry|trocken/.test(v) ? 'dry' : 'live') : (ex && ex.fire === 'dry' ? 'dry' : 'live') };
};
const cellTime = v => v instanceof Date ? v.toTimeString().slice(0, 5)
  : typeof v === 'number' && v < 1 ? String(Math.floor(v * 24)).padStart(2, '0') + ':' + String(Math.round(v * 1440) % 60).padStart(2, '0') : String(v ?? '').trim();

TL.exportXlsx = () => {
  const X = window.XLSX, wb = X.utils.book_new();
  const own = t => TL.db[t].filter(r => !r.example);
  for (const [t, [sheet, cols]] of Object.entries(COLS)) {
    const ws = X.utils.aoa_to_sheet([cols.map(c => c[0]), ...own(t).map(r => cols.map(([, k]) => r[k] ?? ''))]);
    ws['!cols'] = cols.map(c => ({ wch: Math.max(10, c[0].length + 2) }));
    X.utils.book_append_sheet(wb, ws, sheet);
  }
  const tr = own('trainings').slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const nW = Math.max(4, ...tr.map(t => t.weapons.length));          // Weapon 1..N / Rounds 1..N, at least 4
  const head = ['ID', 'Date', 'Start', 'Duration h', 'Type', 'Shooter', 'Description', 'Trainer / organizer'];
  for (let i = 1; i <= nW; i++) head.push('Weapon ' + i, 'Rounds ' + i);
  head.push('Remarks', 'Source uid');
  const rows = tr.map(t => {
    const r = [t.id, t.date, t.start || '', t.durationH ?? '', TL.FIRE[t.fire] || TL.FIRE.live, TL.nameOf('shooters', t.shooterId), t.desc || '', TL.nameOf('trainers', t.trainerId)];
    for (let i = 0; i < nW; i++) { const w = t.weapons[i]; r.push(w ? TL.nameOf('weapons', w.weaponId) : '', w && w.rounds != null ? w.rounds : ''); }
    r.push(t.remarks || '', t.uid);
    return r;
  });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head, ...rows]), 'Trainings');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Database', 'Exported from Stoic Ranger - Training Log ' + new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Trainings', 'Shooter, trainer and weapons by name (matched to the sheets above); Source uid = permanent id of the training in the app.'],
    ['Type', 'Live fire or Dry fire. Dry fire: the Rounds columns hold dry-fire reps and never count as rounds.']]), 'Info');
  return new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
};

/** Reads the workbook; returns a plan {counts, apply()} so the user can confirm first. */
TL.planXlsx = bytes => {
  const X = window.XLSX, wb = X.read(bytes, { type: 'array', cellDates: true });
  const rows = s => wb.Sheets[s] ? X.utils.sheet_to_json(wb.Sheets[s], { defval: '', raw: true }) : null;
  const counts = {}, ops = [];
  let any = false;
  for (const [t, [sheet, cols]] of Object.entries(COLS)) {
    const R = rows(sheet); if (!R) continue; any = true;
    const c = counts[t] = { add: 0, upd: 0 };
    R.forEach(row => {
      const rec = {};
      cols.forEach(([h, k, ty]) => { if (!(h in row) || row[h] === '' || row[h] == null) return; rec[k] = ty === 'n' ? num(row[h]) : ty === 'd' ? cellDate(row[h]) : String(row[h]).trim(); });
      if (!rec.id || !rec.name) return;
      const ex = TL.byId(TL.db[t], rec.id);
      if (ex && TL.isLinked(ex)) TL.lockedKeys(t, ex).forEach(k => delete rec[k]);   // the Gun Database manages these
      ex ? c.upd++ : c.add++;
      ops.push(() => { if (ex) { Object.assign(ex, rec, { updated: new Date().toISOString() }); delete ex.example; } else TL.db[t].push(Object.assign({ uid: TL.uuid(), created: new Date().toISOString() }, rec)); });
    });
  }
  const T = rows('Trainings');
  if (T) {
    any = true;
    const c = counts.trainings = { add: 0, upd: 0, created: 0 };
    const find = (t, v) => {               // by ID or by name; unknown names become new entries
      const s = String(v ?? '').trim(); if (!s) return '';
      const L = TL.db[t], r = L.find(x => x.id === s) || L.find(x => String(x.name).trim().toLowerCase() === s.toLowerCase());
      if (r) return r.id;
      const n = { id: TL.nextId(L, TL.TABLES[t].prefix), uid: TL.uuid(), name: s, created: new Date().toISOString(), notes: 'Created by database.xlsx import' };
      L.push(n); c.created++; return n.id;
    };
    T.forEach(row => {
      if (!row.Date && !row.Description) return;
      const uid = String(row['Source uid'] || '').trim(), id = String(row.ID || '').trim();
      const ex = (uid && TL.db.trainings.find(t => t.uid === uid)) || (id && TL.training(id)) || null;
      ex ? c.upd++ : c.add++;
      ops.push(() => {
        const ws = [];
        for (let i = 1; ('Weapon ' + i) in row; i++) { const w = String(row['Weapon ' + i] ?? '').trim(); if (w) ws.push({ weaponId: find('weapons', w), rounds: num(row['Rounds ' + i]) }); }
        const v = { date: cellDate(row.Date), start: cellTime(row.Start), durationH: num(row['Duration h']), shooterId: find('shooters', row.Shooter),
          desc: String(row.Description ?? '').trim(), ...fireOf(row, ex), trainerId: find('trainers', row['Trainer / organizer']), weapons: ws, remarks: String(row.Remarks ?? '').trim() };
        const now = new Date().toISOString();
        if (ex) { Object.assign(ex, v, { updated: now }); delete ex.example; }
        else TL.db.trainings.push(Object.assign({ id: id && !TL.training(id) ? id : TL.nextId(TL.db.trainings, 'TR', 4), uid: uid || TL.uuid(), created: now, updated: now }, v));
      });
    });
  }
  return { any, counts, apply() { ops.forEach(f => f()); TL.normalize(TL.db); TL.save(true); TL.linkSync && TL.linkSync(); } };
};

TL.importXlsx = async () => {
  if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
  const f = await TL.openFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream');
  if (!f.ok) return;
  let plan;
  try { plan = TL.planXlsx(f.bytes); } catch (e) { TL.toast('This file could not be read as .xlsx.', true); return; }
  if (!plan.any) { TL.toast('No Shooters, Weapons, Trainers or Trainings sheet found.', true); return; }
  const C = plan.counts, line = (t, l) => C[t] ? `<li>${l}: ${C[t].add} new, ${C[t].upd} updated</li>` : '';
  const m = TL.sheet('Import database.xlsx', `<p>${esc(f.name)}</p><ul>${line('shooters', 'Shooters')}${line('weapons', 'Guns')}${line('trainers', 'Trainers')}${line('trainings', 'Trainings')}</ul>
    <p class="note">Known IDs are updated with the filled cells, new rows are added, nothing on this phone is deleted. Names in the Trainings sheet that are not in the database yet are added as new entries. A copy of the current data is saved on the phone first.</p>
    <div class="stack"><button class="btn pri big" id="xGo">Import</button></div>`);
  $('#xGo', m.body).onclick = () => {
    TL.flush(); TL.backupDb(`db-before-xlsx-${Date.now()}.json`);
    plan.apply(); m.close();
    TL.toast('database.xlsx imported.'); TL.go('#/dash');
  };
};
})();
