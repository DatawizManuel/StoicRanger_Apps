/* SR Physical Fitness — Excel file (own file, not shared with Stoic Ranger): export and import between devices.
   One sheet per table, same fields as the app database, readable and editable in Excel without the app.
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
  X.FILE = () => `sr-physical-fitness-${PF.todayIso()}.xlsx`;
  const mobName = id => { const m = (window.MOB || []).find(x => x.id === id); return m && EX[m.ex] ? EX[m.ex].n : ''; };

  X.build = (db = PF.db) => {
    const wb = XLSX.utils.book_new();
    const add = (name, rows, hidden) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = (rows[0] || []).map((h, i) => ({ wch: Math.min(40, Math.max(8, ...rows.slice(0, 200).map(r => String(r[i] ?? '').length))) })); XLSX.utils.book_append_sheet(wb, ws, name); if (hidden) { wb.Workbook = wb.Workbook || { Sheets: [] }; } };
    add('README', [['SR Physical Fitness – data file'], [''], ['Every sheet is one table of the app. Each row has a permanent id: keep it when you edit a row.'],
      ['Add a row: leave id empty, the app gives it one on import. Delete a row: delete it in the app (or put its table and id on the Deleted sheet).'],
      ['Dates are YYYY-MM-DD. Weights in kg, distances in km or m, durations in minutes or seconds as the column says.'],
      ['Columns "exercise" and "drill" are only there to read; the app uses the ids next to them.'],
      ['Import this file in the app under Setup → Data. Importing merges: nothing on the phone is deleted unless it is on the Deleted sheet.'],
      [''], ['Exported', new Date().toLocaleString('en-GB')], ['App version', PF.appInfo().version || PF.VERSION], ['Data format', PF.SCHEMA]]);
    const s = db.settings;
    add('Settings', [['key', 'value'], ['sessions', s.sessions], ['minutes', s.minutes], ['days', s.days.join(', ')], ['kettlebells_kg', s.eq.kb.join(', ')], ['dumbbells_kg', s.eq.db.join(', ')],
      ['sandbags_kg', s.eq.sb.join(', ')], ['bands', s.eq.bands.join(', ')], ['pullup_bar', s.eq.bar ? 'yes' : 'no'], ['mini_band', s.eq.mini ? 'yes' : 'no'], ['bench', s.eq.bench ? 'yes' : 'no'],
      ['gripper', s.eq.gripper ? 'yes' : 'no'], ['wrist_roller', s.eq.roller ? 'yes' : 'no'], ['theme', s.theme || 'auto'], ['changed', s.at || '']]);
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
    add('_PF', [['key', 'value'], ['app', PF.APP_ID], ['schema', PF.SCHEMA], ['exported', PF.now()]]);
    wb.Workbook = { Sheets: wb.SheetNames.map(n => ({ name: n, Hidden: n === '_PF' ? 1 : 0 })) };
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  };
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
    const sheet = n => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) : null;
    const meta = {}; (sheet('_PF') || []).forEach(r => meta[r.key] = r.value);
    const out = { meta, tables: {}, errors: [], settings: null };
    if (meta.app && meta.app !== PF.APP_ID) throw new Error('This is not an SR Physical Fitness file.');
    if (!meta.app && !wb.Sheets.Sets && !wb.Sheets.Plans) throw new Error('This file has no SR Physical Fitness sheets.');
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
      const S = db.settings, yes = v => /^(yes|y|true|1|ja|x)$/i.test(String(v).trim());
      if (+s.sessions) S.sessions = PF.clamp(+s.sessions, 2, 6); if (+s.minutes) S.minutes = +s.minutes;
      if (s.days) S.days = listN(s.days).filter(d => PF.DAYS.includes(d));
      if ('kettlebells_kg' in s) S.eq.kb = listN(s.kettlebells_kg).map(Number).filter(n => n > 0);
      if ('dumbbells_kg' in s) S.eq.db = listN(s.dumbbells_kg).map(Number).filter(n => n > 0);
      if ('sandbags_kg' in s) S.eq.sb = listN(s.sandbags_kg).map(Number).filter(n => n > 0);
      if ('bands' in s) S.eq.bands = listN(s.bands);
      for (const [k, e] of [['pullup_bar', 'bar'], ['mini_band', 'mini'], ['bench', 'bench'], ['gripper', 'gripper'], ['wrist_roller', 'roller']]) if (k in s) S.eq[e] = yes(s[k]);
      if (s.theme) S.theme = String(s.theme); S.at = s.changed || S.at; c.settings = true;
    }
    PF.normalize(db);
    return c;
  };
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
