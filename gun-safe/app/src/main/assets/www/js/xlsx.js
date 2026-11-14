/* SR GunSafe — the database file (shared contract 00_docs/SHARED-DB-CONTRACT.md, section A).
   GunSafe writes only its own sheets (prefix GS_) and the hidden full copy _GS_Data. Every other sheet of the file
   (SR Shooting's Weapons, Trainings …, other apps' sheets, hidden ones included) is kept as it is: the existing
   workbook is read first and only GunSafe's sheets are replaced.
   Linked with SR Shooting → the shared database.xlsx. Not linked → gunsafe.xlsx with the same layout.
   Reading starts from the hidden copy and puts the visible GS_ sheets on top, so what was changed in Excel wins.
   A row deleted in Excel stays in the app (delete it in the app). */
'use strict';
window.GSX = (() => {
  const FORMAT = 1, MARK = 'sr-gunsafe-database', HIDDEN = '_GS_Data', CHUNK = 30000;
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const arr = a => Array.isArray(a) ? a : [];
  const clone = o => JSON.parse(JSON.stringify(o));
  const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const txt = v => v == null ? '' : v instanceof Date ? isoDay(v) : String(v).trim();
  const num = v => { if (v === '' || v == null || v instanceof Date) return null; const n = +String(v).trim().replace(/\s/g, '').replace(',', '.'); return isFinite(n) ? n : null; };
  const day = v => v instanceof Date ? isoDay(v) : typeof v === 'number' && v > 20000 && v < 80000 ? isoDay(new Date(Date.UTC(1899, 11, 30) + v * 864e5)) : txt(v);
  const list = v => txt(v).split(/[;,]/).map(s => s.trim()).filter(Boolean);
  const yes = v => /^(yes|y|ja|true|1|x)$/i.test(txt(v));

  /* [xlsx header, key, type]: t text, n number, i whole number, d date, b yes/no, l list (; separated) */
  const SHEETS = {
    owners: ['GS_Owners', 'O', [['ID', 'id'], ['Name', 'name'], ['Notes', 'notes']]],
    guns: ['GS_Guns', 'G', [['ID', 'id'], ['Name', 'name'], ['Type', 'type'], ['Caliber', 'caliber'], ['Make', 'make'], ['Model', 'model'],
      ['Rounds before log', 'roundsBeforeLog', 'i'], ['Status', 'status'], ['Notes', 'notes']]],
    gunInfo: ['GS_Gun_Info', '', [['Gun ID', 'id'], ['Owner IDs', 'owners', 'l'], ['Also takes calibres', 'fits', 'l']]],
    barrels: ['GS_Barrels', 'GB', [['ID', 'id'], ['Gun ID', 'weaponId'], ['Barrel', 'name'], ['Length mm', 'lengthMm', 'n'], ['Twist', 'twist'],
      ['Installed', 'installed', 'd'], ['Removed', 'removed', 'd'], ['Notes', 'notes']]],
    components: ['GS_Components', 'C', [['ID', 'id'], ['Gun ID', 'weaponId'], ['Type', 'type'], ['Name', 'name'], ['Fitted', 'fitted', 'd'], ['Removed', 'removed', 'd']]],
    service: ['GS_Service_Log', 'E', [['ID', 'id'], ['Date', 'date', 'd'], ['Gun ID', 'weaponId'], ['Kind', 'kind'], ['Cleaning done', 'cleaningDone', 'b'],
      ['What was done', 'note'], ['Changes', 'changes', 'l']]],
    munitions: ['GS_Munitions', 'GM', [['ID', 'id'], ['Name', 'name'], ['Caliber', 'caliber'], ['Manufacturer', 'manufacturer'], ['Notes', 'notes']]],
    moves: ['GS_Ammo_Moves', 'A', [['ID', 'id'], ['Date', 'date', 'd'], ['Munition ID', 'munitionId'], ['Kind', 'kind'], ['Rounds', 'qty', 'i'],
      ['Price EUR', 'price', 'n'], ['Shop', 'shop'], ['Purpose', 'purpose']]],
    rounds: ['GS_Rounds_Log', 'R', [['ID', 'id'], ['Date', 'date', 'd'], ['Gun ID', 'weaponId'], ['Munition ID', 'munitionId'], ['Rounds', 'rounds', 'i'], ['Note', 'note']]],
  };
  const TABLES = Object.keys(SHEETS);
  // last change of each entry (UTC ISO), needed to decide against a delete from another device (contract E)
  TABLES.forEach(t => SHEETS[t][2].push(['Updated', 'updated']));
  const DELETED = '_Deleted', DEL_COLS = [['App', 'app'], ['Table', 'table'], ['ID', 'id'], ['Source uid', 'uid'], ['Label', 'label'], ['Deleted at', 'at'], ['Deleted by', 'by']];
  const ours = n => n === HIDDEN || n === DELETED || /^GS_/.test(n);
  const sheetOfTable = t => SHEETS[t][0];
  /** The shared _Deleted list: union by (app, table, uid or id), the newer time stays, older than 365 days dropped. */
  function mergeTombs(a, b) {
    const m = new Map(), cut = new Date(Date.now() - 365 * 864e5).toISOString();
    arr(a).concat(arr(b)).forEach(x => {
      if (!x || !x.app || !x.table || !(x.id || x.uid) || !x.at || String(x.at) < cut) return;
      const k = x.app + '|' + x.table + '|' + (x.uid || x.id), o = m.get(k);
      if (!o || String(x.at) > o.at) m.set(k, { app: txt(x.app), table: txt(x.table), id: txt(x.id), uid: txt(x.uid), label: txt(x.label), at: txt(x.at), by: txt(x.by) });
    });
    return [...m.values()].sort((x, y) => x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
  }
  function tombsIn(wb) {
    const X = window.XLSX, ws = wb.Sheets[DELETED]; if (!ws) return [];
    return X.utils.sheet_to_json(ws, { defval: '', raw: true }).map(r => { const o = {}; DEL_COLS.forEach(([h, k]) => { o[k] = r[h] instanceof Date ? r[h].toISOString() : txt(r[h]); }); return o; });
  }
  /** Is this GunSafe row deleted (on any device)? Gone when its last change is not newer than the delete. */
  const deadIn = tombs => {
    const m = new Map(); arr(tombs).forEach(x => { if (x.app === 'GS') m.set(x.table + '|' + x.id, x.at); });
    return (t, r) => { const at = r && r.id ? m.get(sheetOfTable(t) + '|' + r.id) : null; return !!at && !(String(r.updated || '') > at); };
  };

  function cell(v, ty) {
    if (v == null) return '';
    if (ty === 'b') return v === true ? 'yes' : v === false ? 'no' : '';
    if (ty === 'l') return arr(v).join('; ');
    return v;
  }
  function sheetOf(X, head, rows) {
    const ws = X.utils.aoa_to_sheet([head].concat(rows));
    ws['!cols'] = head.map(h => ({ wch: Math.min(40, Math.max(10, String(h).length + 2)) }));
    return ws;
  }

  /** GunSafe's data → xlsx bytes. existing: bytes of the file as it is now (its other sheets are kept), or null. */
  function write(data, existing, by) {
    const X = window.XLSX; if (!X) throw new Error('xlsx library missing');
    let wb;
    let tombs = arr(data.tombs);
    if (existing && existing.length) {
      wb = X.read(existing, { type: 'array', cellDates: true, cellStyles: true });
      tombs = mergeTombs(tombsIn(wb), tombs);              // other apps' deletes stay in the shared list
      const hidden = {};
      arr(wb.Workbook && wb.Workbook.Sheets).forEach((s, i) => { hidden[wb.SheetNames[i]] = s && s.Hidden; });
      wb.SheetNames.filter(ours).forEach(n => { delete wb.Sheets[n]; });
      wb.SheetNames = wb.SheetNames.filter(n => !ours(n));
      wb.Workbook = wb.Workbook || {};
      wb.Workbook.Sheets = wb.SheetNames.map(n => ({ name: n, Hidden: hidden[n] || 0 }));
    } else wb = X.utils.book_new();
    TABLES.forEach(t => {
      const [name, , cols] = SHEETS[t];
      X.utils.book_append_sheet(wb, sheetOf(X, cols.map(c => c[0]), arr(data[t]).map(r => cols.map(([, k, ty]) => cell(r[k], ty)))), name);
    });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
      ['SR GunSafe', 'Guns with their owners, builds, service and cleaning log, ammunition stock, purchases and take-outs.'],
      ['Editing', 'You can edit the GS_ sheets in Excel. Keep the ID columns as they are; a new row may leave ID empty. To delete an entry, delete it in the app (it is then deleted on all devices): rows deleted only here come back.'],
      ['Guns', 'GS_Guns holds the guns entered in SR GunSafe. Guns from SR Shooting are in its Weapons sheet; GS_Gun_Info adds owners and extra calibres for both (Gun ID).'],
      ['Ammo', 'GS_Ammo_Moves: Purchase rows add rounds (Price EUR = price paid for all of them), Withdrawal rows take rounds out (negative). Rounds fired come from SR Shooting or GS_Rounds_Log.'],
      ['Units', 'Metric: mm, m, g. Prices in EUR.'],
      ['Saved', (by || 'SR GunSafe') + ' ' + new Date().toISOString().slice(0, 16).replace('T', ' ')],
      ['Format', 'SR GunSafe sheets ' + FORMAT]]), 'GS_Info');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([DEL_COLS.map(c => c[0])].concat(mergeTombs(tombs, []).map(x => DEL_COLS.map(([, k]) => x[k] || '')))), DELETED);
    const copy = {}; TABLES.forEach(t => { copy[t] = clone(arr(data[t])); });
    const full = JSON.stringify({ mark: MARK, format: FORMAT, saved: new Date().toISOString(), db: copy });
    const rows = [[MARK, FORMAT, 'Do not edit: a copy of the SR GunSafe data for the app. The GS_ sheets win over it.']];
    for (let i = 0; i < full.length; i += CHUNK) rows.push([full.slice(i, i + CHUNK)]);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), HIDDEN);
    wb.Workbook = wb.Workbook || {};
    const prev = {}; arr(wb.Workbook.Sheets).forEach(s => { if (s && s.name) prev[s.name] = s.Hidden; });
    wb.Workbook.Sheets = wb.SheetNames.map(n => ({ name: n, Hidden: n === HIDDEN || n === DELETED ? 1 : (prev[n] || 0) }));
    return new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
  }

  /** xlsx bytes → { data: tables, hasCopy, found: [sheets] } (null data when the file has no GunSafe sheets yet). */
  function read(bytes) {
    const X = window.XLSX; if (!X) throw new Error('xlsx library missing');
    const wb = X.read(bytes, { type: 'array', cellDates: true });
    const F = {}; TABLES.forEach(t => { F[t] = []; });
    let hasCopy = false;
    const H = wb.Sheets[HIDDEN];
    if (H) {
      try {
        const a = X.utils.sheet_to_json(H, { header: 1, defval: '', raw: true });
        if (a.length && a[0][0] === MARK) {
          const j = JSON.parse(a.slice(1).map(r => String(r[0] || '')).join(''));
          if (j && j.mark === MARK && j.db) { TABLES.forEach(t => { F[t] = arr(j.db[t]).filter(r => r && typeof r === 'object').map(clone); }); hasCopy = true; }
        }
      } catch (e) { hasCopy = false; }
    }
    const found = [];
    TABLES.forEach(t => {
      const [name, prefix, cols] = SHEETS[t], ws = wb.Sheets[name];
      if (!ws) return;
      found.push(name);
      X.utils.sheet_to_json(ws, { defval: '', raw: true }).forEach(row => {
        const rec = {};
        cols.forEach(([h, k, ty]) => {
          if (!(h in row)) return;
          const v = row[h];
          rec[k] = ty === 'n' ? num(v) : ty === 'i' ? (num(v) == null ? null : Math.round(num(v))) : ty === 'd' ? day(v) : ty === 'b' ? yes(v) : ty === 'l' ? list(v) : txt(v);
        });
        if (Object.keys(rec).every(k => rec[k] == null || rec[k] === '' || (Array.isArray(rec[k]) && !rec[k].length))) return;
        // a new row typed in Excel has no ID: it gets one in merge(), which also sees the app's rows, so it is
        // matched to an entry that is already there instead of being added again at every sync
        if (!rec.id && !prefix) return;
        let m = rec.id ? F[t].find(r => r.id === rec.id) : null;
        if (!m) { m = {}; F[t].push(m); }
        Object.keys(rec).forEach(k => { m[k] = rec[k]; });
      });
    });
    return { data: hasCopy || found.length ? F : null, tombs: tombsIn(wb), hasCopy, found, sheetNames: wb.SheetNames.slice() };
  }
  function nextId(rows, p) {
    let n = 0; arr(rows).forEach(r => { const s = String(r && r.id || ''); if (s.startsWith(p) && /^\d+$/.test(s.slice(p.length))) n = Math.max(n, +s.slice(p.length)); });
    return p + (n + 1);
  }

  /* What makes two rows the same entry when IDs can't tell (a row typed in Excel without ID, or the same new ID
     made on two phones before they synced). */
  const KEY = {
    owners: r => [r.name], guns: r => [r.name], munitions: r => [r.name], gunInfo: r => [r.id],
    barrels: r => [r.weaponId, r.name], components: r => [r.weaponId, r.type, r.name],
    service: r => [r.date, r.weaponId, r.kind], moves: r => [r.date, r.munitionId, r.kind, r.qty], rounds: r => [r.date, r.weaponId, r.rounds],
  };
  const keyOf = (t, r) => JSON.stringify(KEY[t](r).map(v => String(v == null ? '' : v).trim().toLowerCase()));
  /* Where an entry's ID is used by other tables (moved along when an entry gets a new ID). */
  const REFS = { guns: [['barrels', 'weaponId'], ['components', 'weaponId'], ['service', 'weaponId'], ['rounds', 'weaponId'], ['gunInfo', 'id']],
    munitions: [['moves', 'munitionId'], ['rounds', 'munitionId']], owners: [['gunInfo', 'owners']] };

  /** Three-way merge per table (key: id) against the base of the last sync (null = first sync).
   *  A field changed in the file since the base is taken from the file; everything else stays as in the app.
   *  Nothing is deleted: rows only in the app stay; rows only in the file come in unless they were deleted in the app
   *  (tombstones). Rows without ID (typed in Excel) are matched to an existing entry by name (or date, gun, rounds …),
   *  else get the next free ID. When the file and the app use the same ID for two different new entries (made on
   *  two phones before a sync), the app's entry gets a new ID and both are kept.
   *  tombs: the merged _Deleted list. A row (here or in the file) whose last change is not newer than its delete is
   *  gone; rows removed that way are returned in "removed" (for Recently deleted). trash: rows deleted here (a row
   *  typed in Excel without ID that matches one of them stays deleted). Returns { data, added, changed, removed }. */
  function merge(base, app, file, tombs, trash) {
    const out = clone(app), dead = deadIn(tombs), gone = new Set(arr(tombs).filter(x => x.app === 'GS').map(x => x.id));
    const binned = arr(trash).map(x => x && x.row && { t: x.table, k: null, row: x.row }).filter(Boolean);
    let added = 0, changed = 0; const removed = [];
    const same = (a, b) => JSON.stringify(a == null ? '' : a) === JSON.stringify(b == null ? '' : b);
    const freeId = (t, p) => { const all = arr(out[t]).concat(arr(file && file[t])).concat([...gone].map(id => ({ id }))); return nextId(all, p); };
    const reId = (t, from, to) => {
      (REFS[t] || []).forEach(([rt, k]) => arr(out[rt]).forEach(r => {
        if (Array.isArray(r[k])) r[k] = r[k].map(x => x === from ? to : x); else if (r[k] === from) r[k] = to;
      }));
    };
    TABLES.forEach(t => {
      const A = arr(out[t]), B = new Map(arr(base && base[t]).map(r => [r.id, r])), fileRows = arr(file && file[t]);
      const prefix = SHEETS[t][1];
      fileRows.forEach(f => {
        if (!f) return;
        if (!f.id) {
          if (!prefix) return;
          const k = keyOf(t, f);
          if (A.some(r => keyOf(t, r) === k)) return;          // already there (an earlier sync wrote it back with its ID)
          if (binned.some(x => x.t === t && keyOf(t, x.row) === k)) return;   // that entry was deleted: stays deleted
          const n = clone(f); n.id = freeId(t, prefix); A.push(n); added++; return;
        }
        if (dead(t, f)) return;                               // deleted on some device and not changed since
        let a = A.find(r => r.id === f.id), b = B.get(f.id);
        if (a && !b && prefix && keyOf(t, a) !== keyOf(t, f)) {
          // same ID, different entries, neither synced before: keep both, the app's one moves to a new ID
          const p = (String(a.id).match(/^[A-Za-z]+/) || [prefix])[0], to = freeId(t, p);
          reId(t, a.id, to); a.id = to; a = null;
        }
        if (!a) {
          if (base && b && !(String(f.updated || '') > String(b.updated || ''))) return;   // dropped here and not changed since
          A.push(clone(f)); added++; return;
        }
        if (String(f.updated || '') > String(a.updated || '')) a.updated = f.updated;
        let ch = false;
        Object.keys(f).forEach(k => {
          if (same(f[k], a[k])) return;
          const take = !base || !b ? (a[k] == null || a[k] === '' || (Array.isArray(a[k]) && !a[k].length)) : !same(f[k], b[k]);
          if (take) { a[k] = clone(f[k]); ch = true; }
        });
        if (ch) changed++;
      });
      // entries deleted on another device (tombstone newer than their last change) leave this one too
      out[t] = A.filter(r => { if (!dead(t, r)) return true; removed.push({ table: t, row: r }); return false; });
    });
    return { data: out, added, changed, removed };
  }
  const tablesOf = d => { const o = {}; TABLES.forEach(t => { o[t] = clone(arr(d[t])); }); return o; };
  /** Same content? Empty fields (missing, null, '', []) and the order of fields don't count, so a sync with no
   *  real change uploads nothing. */
  const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const normRow = r => { const o = {}; Object.keys(r || {}).sort().forEach(k => { if (!empty(r[k])) o[k] = r[k]; }); return o; };
  const sameData = (a, b) => TABLES.every(t => JSON.stringify(arr(a && a[t]).map(normRow)) === JSON.stringify(arr(b && b[t]).map(normRow)));
  return { FORMAT, MIME, SHEETS, TABLES, write, read, merge, mergeTombs, tablesOf, sameData, sheetOfTable, ours };
})();
