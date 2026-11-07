/* SR Physical Fitness — Excel file: export, import and the Nextcloud file. Layout per the shared Stoic Ranger
   database contract (00_docs/SHARED-DB-CONTRACT.md): every sheet of this app starts with PF_, plus one hidden
   sheet _PF_Data with a full JSON copy. The app writes only its own sheets and keeps every other sheet of the
   workbook unchanged, so the same file can later hold other Stoic Ranger apps too. Unlinked file name: fitness.xlsx.
   One sheet per table, same fields as the app database, readable and editable in Excel without the app.
   Files from 0.1.x (sheets without prefix, hidden _PF) are still read.
   Import merges by id: a row changed later wins (an Excel edit counts as newer when the row is unchanged on the
   phone); rows deleted on either side stay deleted (Deleted sheet); nothing on the phone is lost. */
'use strict';
(function () {
  const X = PF.xls = {};
  const COLS = {
    Assessments: ['id', 'date', 'swingKg', 'gobletKg', 'pressKg', 'pullup', 'pushup', 'situp', 'hang', 'toe', 'squat', 'reachR', 'reachL', 'note', 'at'],
    Plans: ['id', 'block', 'start', 'status', 'prev', 'assessment', 'created', 'cfgHist', 'base', 'swaps', 'at'],
    Sessions: ['id', 'plan', 'week', 'sess', 'date', 'done', 'note', 'at'],
    Sets: ['id', 'date', 'plan', 'week', 'sess', 'slot', 'ex', 'exercise', 'set', 'reps', 'kg', 'sec', 'm', 'done', 'at'],
    Activities: ['id', 'date', 'type', 'name', 'min', 'km', 'm', 'elev', 'kg', 'hr', 'rpe', 'note', 'at'],
    Mobility: ['id', 'date', 'item', 'drill', 'at'],
    Deleted: ['table', 'id', 'at']
  };
  const TABLE = { Assessments: 'assessments', Plans: 'plans', Sessions: 'sessions', Sets: 'sets', Activities: 'activities', Mobility: 'mobility' };
  const JSONCOL = ['cfgHist', 'base', 'swaps'];
  const HELPER = ['exercise', 'drill'];                 // shown for reading, ignored on import
  const NUM = ['block', 'week', 'sess', 'set', 'reps', 'kg', 'sec', 'm', 'min', 'km', 'elev', 'hr', 'rpe', 'swingKg', 'gobletKg', 'pressKg', 'pullup', 'pushup', 'situp', 'hang', 'toe', 'reachR', 'reachL'];
  const BOOL = ['done'];
  X.FILE = () => `fitness-${PF.todayIso()}.xlsx`;
  X.SYNC_FILE = 'fitness.xlsx';
  const PRE = 'PF_', HIDDEN = '_PF_Data', CHUNK = 30000;
  const OLD = ['README', 'Settings', 'Exercises', '_PF'].concat(Object.keys(COLS));   // 0.1.x sheet names (own file only)
  X.mine = n => n.startsWith(PRE) || n === HIDDEN;
  const mobName = id => { const m = (window.MOB || []).find(x => x.id === id); return m && EX[m.ex] ? EX[m.ex].n : ''; };

  /** workbook bytes with this app's sheets; `existing` (bytes of the current file) keeps every other sheet as it is */
  X.build = (db = PF.db, existing = null) => {
    let wb = XLSX.utils.book_new(), keepHidden = {};
    if (existing && existing.length) {
      wb = XLSX.read(existing, { type: 'array', cellStyles: true, bookVBA: true });
      const oldOwn = !!wb.Sheets._PF;                                  // a 0.1.x file of this app alone
      (wb.Workbook && wb.Workbook.Sheets || []).forEach(x => { if (x.Hidden) keepHidden[x.name] = x.Hidden; });
      for (const n of wb.SheetNames.slice()) if (X.mine(n) || oldOwn && OLD.includes(n)) { delete wb.Sheets[n]; wb.SheetNames.splice(wb.SheetNames.indexOf(n), 1); }
    }
    const add = (name, rows) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = (rows[0] || []).map((h, i) => ({ wch: Math.min(40, Math.max(8, ...rows.slice(0, 200).map(r => String(r[i] ?? '').length))) })); XLSX.utils.book_append_sheet(wb, ws, PRE + name); };
    add('README', [['SR Physical Fitness – data file'], [''], ['Every sheet is one table of the app. Each row has a permanent id: keep it when you edit a row.'],
      ['Add a row: leave id empty, the app gives it one on import. Delete a row: delete it in the app (or put its table and id on the Deleted sheet).'],
      ['Dates are YYYY-MM-DD. Weights in kg, distances in km or m, durations in minutes or seconds as the column says.'],
      ['Columns "exercise" and "drill" are only there to read; the app uses the ids next to them.'],
      ['Import this file in the app under Setup → Data. Importing merges: nothing on the phone is deleted unless it is on the PF_Deleted sheet.'],
      ['All sheets of SR Physical Fitness start with PF_. Other sheets in this file belong to other Stoic Ranger apps and are left as they are.'],
      [''], ['Exported', new Date().toLocaleString('en-GB')], ['App version', PF.appInfo().version || PF.VERSION], ['Data format', PF.SCHEMA]]);
    const s = db.settings;
    add('Settings', [['key', 'value'], ['sessions', s.sessions], ['minutes', s.minutes], ['days', s.days.join(', ')], ['kettlebells_kg', s.eq.kb.join(', ')], ['dumbbells_kg', s.eq.db.join(', ')],
      ['sandbags_kg', s.eq.sb.join(', ')], ['bands', s.eq.bands.join(', ')], ['pullup_bar', s.eq.bar ? 'yes' : 'no'], ['mini_band', s.eq.mini ? 'yes' : 'no'], ['bench', s.eq.bench ? 'yes' : 'no'],
      ['gripper', s.eq.gripper ? 'yes' : 'no'], ['wrist_roller', s.eq.roller ? 'yes' : 'no'], ['not_targeted', (s.skip || []).join(', ')], ['theme', s.theme || 'auto'], ['changed', s.at || '']]);
    for (const [sheet, cols] of Object.entries(COLS)) {
      const t = TABLE[sheet]; const list = sheet === 'Deleted' ? db.deleted : db[t];
      const rows = [cols].concat(list.map(r => cols.map(c => {
        if (c === 'exercise') return EX[r.ex] ? EX[r.ex].n : '';
        if (c === 'drill') return mobName(r.item);
        const v = r[c]; if (JSONCOL.includes(c)) return JSON.stringify(v ?? null);
        if (BOOL.includes(c)) return v ? 'yes' : 'no';
        return v ?? '';
      })));
      add(sheet, rows);
    }
    add('Exercises', [['id', 'name', 'group', 'pattern', 'equipment', 'level', 'main muscles', 'supporting muscles', 'dose']].concat(EXLIST.map(e => [e.id, e.n, EX_GROUPS[e.g], EX_PATTERNS[e.pat], e.equip.join(', '), e.lvl, e.prim.join(', '), e.sec.join(', '), e.dose])));
    const full = JSON.stringify({ app: PF.APP_ID, schema: PF.SCHEMA, saved: PF.now(), by: 'SR Physical Fitness ' + (PF.appInfo().version || PF.VERSION), db: X.dataPart(db) });
    const hrows = [[PF.APP_ID, PF.SCHEMA, 'Do not edit: a copy of the SR Physical Fitness data for the apps. The PF_ sheets win over it.']];
    for (let i = 0; i < full.length; i += CHUNK) hrows.push([full.slice(i, i + CHUNK)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hrows), HIDDEN);
    wb.Workbook = Object.assign(wb.Workbook || {}, { Sheets: wb.SheetNames.map(n => ({ name: n, Hidden: n === HIDDEN ? 1 : keepHidden[n] || 0 })) });
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  };
  /** what goes into the file: settings (without the storage setting), tables and tombstones; not ui/history */
  X.dataPart = db => { const o = { settings: PF.clone(db.settings), deleted: PF.clone(db.deleted) }; delete o.settings.nc; for (const t of PF.TABLES) o[t] = PF.clone(db[t]); return o; };
  const bytes = () => new Uint8Array(X.build());
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  X.export = async () => { const r = await PF.saveFile(X.FILE(), MIME, bytes()); if (r && r.ok) PF.toast('Saved: ' + (r.msg || X.FILE())); else if (r && r.msg !== 'cancelled') PF.toast('Could not save: ' + (r.msg || ''), true); };
  X.share = () => PF.shareFile(X.FILE(), MIME, bytes(), 'SR Physical Fitness data');

  /* ---------- import ---------- */
  const isoOf = v => {
    if (v instanceof Date) return PF.iso(new Date(v.getTime() + 12 * 36e5));
    if (typeof v === 'number' && v > 20000 && v < 80000) return PF.iso(new Date(Math.round((v - 25569) * 864e5) + 12 * 36e5));
    const s = String(v ?? '').trim(); const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s.slice(0, 10);
  };
  const conv = (c, v) => {
    if (v === '' || v == null) return c === 'note' || c === 'name' ? '' : null;
    if (c === 'date' || c === 'start' || c === 'created') return isoOf(v);
    if (c === 'at') return v instanceof Date ? v.toISOString() : String(v);
    if (NUM.includes(c)) { const n = typeof v === 'number' ? v : +String(v).replace(',', '.'); return isNaN(n) ? null : n; }
    if (BOOL.includes(c)) return v === true || /^(yes|y|true|1|ja|x|✓)$/i.test(String(v).trim());
    if (JSONCOL.includes(c)) return JSON.parse(String(v));
    if (c === 'squat') return String(v).trim();
    return typeof v === 'string' ? v : String(v);
  };
  /** parse a workbook (Uint8Array) → {meta, settings, tables, errors} */
  X.parse = u8 => {
    const wb = XLSX.read(u8, { type: 'array', cellDates: true });
    const legacy = !wb.Sheets[PRE + 'Sets'] && !wb.Sheets[PRE + 'Plans'] && !wb.Sheets[HIDDEN];     // 0.1.x file
    const nm = n => legacy ? n : PRE + n;
    const sheet = n => wb.Sheets[nm(n)] ? XLSX.utils.sheet_to_json(wb.Sheets[nm(n)], { defval: '', raw: true }) : null;
    const meta = {};
    if (legacy) (wb.Sheets._PF ? XLSX.utils.sheet_to_json(wb.Sheets._PF, { defval: '', raw: true }) : []).forEach(r => meta[r.key] = r.value);
    const out = { meta, tables: {}, errors: [], settings: null, full: null };
    if (wb.Sheets[HIDDEN]) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[HIDDEN], { header: 1, defval: '', raw: true });
      meta.app = String(rows[0] && rows[0][0] || ''); meta.schema = rows[0] && rows[0][1];
      try { out.full = JSON.parse(rows.slice(1).map(r => String(r[0] ?? '')).join('')); } catch (e) { out.full = null; }
    }
    if (meta.app && meta.app !== PF.APP_ID) throw new Error('This is not an SR Physical Fitness file.');
    if (!meta.app && !(legacy ? wb.Sheets.Sets || wb.Sheets.Plans : wb.Sheets[PRE + 'Sets'] || wb.Sheets[PRE + 'Plans'])) throw new Error('This file has no SR Physical Fitness sheets.');
    if (+meta.schema > PF.SCHEMA) { out.newer = true; return out; }
    for (const [sh, cols] of Object.entries(COLS)) {
      const rows = sheet(sh); if (!rows) continue; const list = [];
      rows.forEach((r, i) => {
        if (cols.every(c => r[c] === '' || r[c] == null)) return;
        const o = {};
        try { for (const c of cols) if (!HELPER.includes(c) && c in r) o[c] = conv(c, r[c]); }
        catch (e) { out.errors.push(`${sh} row ${i + 2}: ${e.message}`); return; }
        list.push(o);
      });
      out.tables[sh] = list;
    }
    const st = sheet('Settings');
    if (st) { const m = {}; st.forEach(r => m[String(r.key).trim()] = r.value); out.settings = m; }
    return out;
  };
  const listN = v => String(v ?? '').split(/[,;]\s*/).map(x => x.trim()).filter(Boolean);
  X.norm = v => v == null || v === '' || v === false ? '' : JSON.stringify(v);
  /** merge parsed data into db; returns counts */
  X.merge = (db, data) => {
    const now = PF.now(); const c = { added: 0, updated: 0, deleted: 0 };
    const tomb = new Map(); for (const d of db.deleted) tomb.set(d.table + '|' + d.id, d.at);
    for (const d of (data.tables.Deleted || [])) {
      if (!d.table || !d.id) continue; const key = d.table + '|' + d.id; const at = d.at || now;
      const list = db[d.table]; if (!Array.isArray(list)) continue;
      const i = list.findIndex(r => r.id === d.id);
      if (i >= 0 && (list[i].at || '') <= at) { list.splice(i, 1); c.deleted++; }
      if (!tomb.has(key) || tomb.get(key) < at) { db.deleted = db.deleted.filter(x => !(x.table === d.table && x.id === d.id)); db.deleted.push({ table: d.table, id: d.id, at }); tomb.set(key, at); }
    }
    for (const [sh, t] of Object.entries(TABLE)) {
      for (const f of (data.tables[sh] || [])) {
        if (!f.id) { f.id = PF.uid(t[0]); f.at = now; }
        if (!f.at) f.at = now;
        const ta = tomb.get(t + '|' + f.id); if (ta && ta >= f.at) continue;
        const l = db[t].find(r => r.id === f.id);
        if (!l) { db[t].push(f); c.added++; continue; }
        if (f.at < (l.at || '')) continue;                         // the phone has a newer version of this row
        const changed = Object.keys(f).some(k => k !== 'at' && X.norm(f[k]) !== X.norm(l[k]));
        if (changed) { Object.assign(l, f); if (f.at === l.at) l.at = now; c.updated++; }
      }
    }
    const s = data.settings;
    if (s && (String(s.changed || '') > String(db.settings.at || '') || !db.plans.length && !db.sets.length)) {
      Object.assign(db.settings, X.settingsFrom(s, db.settings)); c.settings = true;
    }
    PF.normalize(db);
    return c;
  };
  /** PF_Settings rows {key: value} → settings fields (only the keys the sheet has) */
  X.settingsFrom = (s, cur) => {
    const S = { eq: PF.clone((cur || PF.DEFAULT_SETTINGS()).eq) }, yes = v => /^(yes|y|true|1|ja|x)$/i.test(String(v).trim());
    {
      if (+s.sessions) S.sessions = PF.clamp(+s.sessions, 2, 6); if (+s.minutes) S.minutes = +s.minutes;
      if (s.days) S.days = listN(s.days).filter(d => PF.DAYS.includes(d));
      if ('kettlebells_kg' in s) S.eq.kb = listN(s.kettlebells_kg).map(Number).filter(n => n > 0);
      if ('dumbbells_kg' in s) S.eq.db = listN(s.dumbbells_kg).map(Number).filter(n => n > 0);
      if ('sandbags_kg' in s) S.eq.sb = listN(s.sandbags_kg).map(Number).filter(n => n > 0);
      if ('bands' in s) S.eq.bands = listN(s.bands);
      for (const [k, e] of [['pullup_bar', 'bar'], ['mini_band', 'mini'], ['bench', 'bench'], ['gripper', 'gripper'], ['wrist_roller', 'roller']]) if (k in s) S.eq[e] = yes(s[k]);
      if ('not_targeted' in s) S.skip = listN(s.not_targeted).map(x => { x = x.toLowerCase(); const g = PF.plan.MGROUPS.find(g => g.k === x || g.n.toLowerCase() === x); return g && g.k; }).filter(Boolean);
      if (s.theme) S.theme = String(s.theme); if (s.changed) S.at = String(s.changed);
    }
    return S;
  };
  X.COLS = COLS; X.TABLE = TABLE; X.HELPER = HELPER;
  X.import = async () => {
    if (!PF.guard()) return;
    const f = await PF.openFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); if (!f.ok) return;
    let data; try { data = X.parse(f.bytes); } catch (e) { return PF.toast('Could not read the file: ' + e.message, true); }
    if (data.newer) return PF.toast('This file was made by a newer app version. Please update the app first.', true);
    const ok = await PF.confirm('Import this file?', `${PF.esc(f.name)}: ${Object.entries(data.tables).map(([k, v]) => `${v.length} ${k.toLowerCase()}`).join(', ')}. It is merged with the data on this phone. A copy of the current data is kept first.`, 'Import');
    if (!ok) return;
    PF.flush(); PF.backupDb(`db-before-import-${PF.todayIso()}-${Date.now()}.json`);
    const c = X.merge(PF.db, data); PF.save(true);
    PF.ui = {}; PF.applyTheme(); PF.rerender();
    PF.toast(`Imported: ${c.added} new, ${c.updated} updated, ${c.deleted} deleted${data.errors.length ? `, ${data.errors.length} rows skipped` : ''}`, !!data.errors.length);
  };
})();
