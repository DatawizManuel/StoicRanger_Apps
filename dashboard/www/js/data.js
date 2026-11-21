/* SR Dashboard — reads database.xlsx (never writes it) and works out the figures for every page.
   Sheets and columns are those of the shared contract (00_docs/SHARED-DB-CONTRACT.md) and of each app's writer:
   SR Shooting (Weapons, Barrels, Munitions, Trainings, Rounds_Log, Datasheets, Shots, Drill_Results, Trainers),
   SR GunSafe (GS_…), SR Field Kit (FK_…), SR Physical Fitness (PF_…), SR Daily Thoughts (DT_Favourites), and the shared
   hidden _Deleted list. Columns are found by their header (case does not matter), so an older or hand-made file with
   fewer columns still reads; a missing sheet only means that app has no data in the file. */
'use strict';
window.SRD = (() => {
  const arr = a => Array.isArray(a) ? a : [];
  const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const txt = v => v == null ? '' : v instanceof Date ? isoDay(v) : String(v).trim();
  const num = v => { if (v === '' || v == null || v instanceof Date) return null; const n = +String(v).trim().replace(/\s/g, '').replace(',', '.'); return isFinite(n) ? n : null; };
  const day = v => {
    if (v instanceof Date) return isoDay(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 864e5)).toISOString().slice(0, 10);
    const s = txt(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0];
    const e = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s); if (e) return `${e[3]}-${e[2].padStart(2, '0')}-${e[1].padStart(2, '0')}`;
    return '';
  };
  const iso = v => v instanceof Date ? v.toISOString() : txt(v);
  const yes = v => v === true || /^(yes|y|ja|true|1|x|pass|passed)$/i.test(txt(v));
  const list = v => txt(v).split(/[;,]/).map(s => s.trim()).filter(Boolean);
  const low = s => String(s || '').trim().toLowerCase();
  const todayIso = () => isoDay(new Date());

  /* ---------- the workbook ---------- */
  const APP_OF = n => /^GS_|^_GS_/.test(n) ? 'gs' : /^FK_|^_FK_/.test(n) ? 'fk' : /^PF_|^_PF_/.test(n) ? 'pf' : /^DT_|^_DT_/.test(n) ? 'dt' : n === '_Deleted' ? 'shared'
    : ['Weapons', 'Barrels', 'Munitions', 'Trainers', 'Targets', 'Purposes', 'Rounds_Log', 'Datasheets', 'Shots', 'Trainings', 'Drill_Results', 'Drill_Favourites', '_StoicRanger', 'Shooters', 'Info'].includes(n) ? 'sh' : 'other';

  /** bytes (ArrayBuffer / Uint8Array) → workbook summary + every app's tables. Throws when the bytes are no xlsx. */
  function read(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const zip = u8.length > 30 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
    let end = false; for (let i = u8.length - 22; zip && i >= Math.max(0, u8.length - 66000); i--) if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 5 && u8[i + 3] === 6) { end = true; break; }
    if (!zip) throw new Error('This file is not an Excel workbook (.xlsx).');
    if (!end) throw new Error('The file is incomplete (maybe it is being saved or synced right now). It is read again when it changes.');
    const X = window.XLSX, wb = X.read(u8, { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) throw new Error('The workbook has no sheets.');
    const hidden = new Set(arr(wb.Workbook && wb.Workbook.Sheets).filter(s => s.Hidden).map(s => s.name));
    const rows = n => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }).map(r => { const o = {}; for (const k in r) o[low(k)] = r[k]; return o; }) : [];
    const sheets = wb.SheetNames.map(n => {
      const ref = wb.Sheets[n] && wb.Sheets[n]['!ref'], r = ref ? X.utils.decode_range(ref) : null;
      return { name: n, rows: r ? Math.max(0, r.e.r) : 0, hidden: hidden.has(n), app: APP_OF(n) };
    });
    const has = n => wb.SheetNames.includes(n);
    const g = (r, ...ks) => { for (const k of ks) { const v = r[low(k)]; if (v !== '' && v != null) return v; } return ''; };
    const tombs = rows('_Deleted').map(r => ({ app: txt(g(r, 'App')), table: txt(g(r, 'Table')), id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), label: txt(g(r, 'Label')), at: iso(g(r, 'Deleted at')), by: txt(g(r, 'Deleted by')) }));
    /** contract E: a row is gone when a tombstone of its app/sheet matches and the row was not changed after it */
    const dead = (app, sheet) => {
      const m = new Map(); tombs.forEach(t => { if (t.app === app && t.table === sheet) { if (t.uid) m.set('u|' + t.uid, t.at); if (t.id) m.set('i|' + t.id, t.at); } });
      return r => { const at = (r.uid && m.get('u|' + r.uid)) || (r.id && m.get('i|' + r.id)); return !!at && !(String(r.updated || '') > at); };
    };
    const keep = (app, sheet, list) => { const d = dead(app, sheet); return list.filter(r => !d(r)); };

    /* SR Shooting */
    const weapons = keep('SR', 'Weapons', rows('Weapons').map(r => ({ id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), name: txt(g(r, 'Name')), aliases: list(g(r, 'Aliases (as written on sheets)')),
      make: txt(g(r, 'Make')), model: txt(g(r, 'Model')), caliber: txt(g(r, 'Caliber')), type: txt(g(r, 'Type')), barrelMm: num(g(r, 'Barrel length mm')), optic: txt(g(r, 'Optic')),
      weightKg: num(g(r, 'Weight bare kg')), before: num(g(r, 'Rounds before log')) || 0, status: txt(g(r, 'Status')), src: 'sr' })).filter(w => w.id || w.name));
    const barrels = keep('SR', 'Barrels', rows('Barrels').map(r => ({ id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), weaponId: txt(g(r, 'Weapon ID')), name: txt(g(r, 'Barrel')),
      installed: day(g(r, 'Installed')), removed: day(g(r, 'Removed')), atInstall: num(g(r, 'Rounds at install')) || 0, life: num(g(r, 'Expected life rds')) })).filter(b => b.id && b.weaponId));
    const munitions = keep('SR', 'Munitions', rows('Munitions').map(r => ({ id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), name: txt(g(r, 'Name')), caliber: txt(g(r, 'Caliber')),
      manufacturer: txt(g(r, 'Manufacturer')), bulletG: num(g(r, 'Bullet weight g')), v0: num(g(r, 'Manufacturer V0 m/s')), src: 'sr' })).filter(m => m.id));
    const byName = new Map(); weapons.forEach(w => { [w.name, w.id].concat(w.aliases).forEach(n => { if (n) byName.set(low(n), w.id); }); });
    const gunId = s => byName.get(low(s)) || '';
    const trainings = keep('SR', 'Trainings', rows('Trainings').map(r => {
      const guns = [];
      for (let i = 1; i <= 20; i++) { const n = txt(g(r, 'Weapon ' + i)), rd = num(g(r, 'Rounds ' + i)); if (n || rd) guns.push({ w: gunId(n), name: n, r: rd || 0 }); }
      return { id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), date: day(g(r, 'Date')), start: startOf(g(r, 'Start')), h: num(g(r, 'Duration h')) || 0,
        dry: /dry/i.test(txt(g(r, 'Type'))), desc: txt(g(r, 'Description')), trainer: txt(g(r, 'Trainer / organizer')), remarks: txt(g(r, 'Remarks')), guns };
    }).filter(t => t.date));
    const roundsLog = keep('SR', 'Rounds_Log', rows('Rounds_Log').map(r => ({ id: txt(g(r, 'ID')), date: day(g(r, 'Date')), weaponId: txt(g(r, 'Weapon ID')), barrelId: txt(g(r, 'Barrel ID')),
      rounds: num(g(r, 'Rounds')) || 0, munitionId: txt(g(r, 'Munition ID')), note: txt(g(r, 'Note')) })).filter(r => r.date && r.rounds));
    const shots = new Map(); rows('Shots').forEach(r => { const k = txt(g(r, 'Sheet ID')), x = num(g(r, 'X mm')), y = num(g(r, 'Y mm')); if (k && x != null && y != null) { if (!shots.has(k)) shots.set(k, []); shots.get(k).push([x, y]); } });
    const datasheets = keep('SR', 'Datasheets', rows('Datasheets').map(r => {
      const id = txt(g(r, 'ID')), h = shots.get(id) || [], dist = num(g(r, 'Distance m'));
      let es = null, mr = null;
      if (h.length >= 2) { es = 0; for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) es = Math.max(es, Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]));
        const cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length; mr = h.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / h.length; }
      return { id, uid: txt(g(r, 'Source uid')), date: day(g(r, 'Date')), purpose: txt(g(r, 'Purpose')), weaponId: txt(g(r, 'Weapon ID')) || gunId(g(r, 'Gun')), gun: txt(g(r, 'Gun')),
        barrelId: txt(g(r, 'Barrel ID')), ammo: txt(g(r, 'Ammunition')), munitionId: txt(g(r, 'Munition ID')), dist, v0: num(g(r, 'V0 m/s')),
        rounds: num(g(r, 'Rounds')) || num(g(r, 'Hits')) || h.length || 0, hits: h.length || num(g(r, 'Hits')) || 0, esMm: es, mrMm: mr };
    }).filter(s => s.date));
    const results = keep('SR', 'Drill_Results', rows('Drill_Results').map(r => ({ id: txt(g(r, 'ID')), uid: txt(g(r, 'Source uid')), date: day(g(r, 'Date')), drill: txt(g(r, 'Drill')) || txt(g(r, 'Drill ID')),
      drillId: txt(g(r, 'Drill ID')), weaponId: txt(g(r, 'Weapon ID')), time: num(g(r, 'Time s')), hits: num(g(r, 'Hits')), shots: num(g(r, 'Shots')), points: num(g(r, 'Points')),
      pass: txt(g(r, 'Pass')) === '' ? null : yes(g(r, 'Pass')), notes: txt(g(r, 'Notes')) })).filter(r => r.date));

    /* SR GunSafe */
    const gsGuns = keep('GS', 'GS_Guns', rows('GS_Guns').map(r => ({ id: txt(g(r, 'ID')), name: txt(g(r, 'Name')), type: txt(g(r, 'Type')), caliber: txt(g(r, 'Caliber')), make: txt(g(r, 'Make')),
      model: txt(g(r, 'Model')), before: num(g(r, 'Rounds before log')) || 0, status: txt(g(r, 'Status')), updated: txt(g(r, 'Updated')), aliases: [], src: 'gs' })).filter(x => x.id));
    const owners = keep('GS', 'GS_Owners', rows('GS_Owners').map(r => ({ id: txt(g(r, 'ID')), name: txt(g(r, 'Name')), updated: txt(g(r, 'Updated')) })).filter(x => x.id));
    const gunInfo = rows('GS_Gun_Info').map(r => ({ id: txt(g(r, 'Gun ID')), owners: list(g(r, 'Owner IDs')), fits: list(g(r, 'Also takes calibres')) })).filter(x => x.id);
    const gsBarrels = keep('GS', 'GS_Barrels', rows('GS_Barrels').map(r => ({ id: txt(g(r, 'ID')), weaponId: txt(g(r, 'Gun ID')), name: txt(g(r, 'Barrel')), installed: day(g(r, 'Installed')),
      removed: day(g(r, 'Removed')), atInstall: 0, life: null, updated: txt(g(r, 'Updated')) })).filter(x => x.id));
    const service = keep('GS', 'GS_Service_Log', rows('GS_Service_Log').map(r => ({ id: txt(g(r, 'ID')), date: day(g(r, 'Date')), weaponId: txt(g(r, 'Gun ID')), kind: txt(g(r, 'Kind')) || 'Service',
      clean: yes(g(r, 'Cleaning done')), note: txt(g(r, 'What was done')), changes: list(g(r, 'Changes')), updated: txt(g(r, 'Updated')) })).filter(x => x.date));
    const gsMun = keep('GS', 'GS_Munitions', rows('GS_Munitions').map(r => ({ id: txt(g(r, 'ID')), name: txt(g(r, 'Name')), caliber: txt(g(r, 'Caliber')), manufacturer: txt(g(r, 'Manufacturer')), updated: txt(g(r, 'Updated')), src: 'gs' })).filter(x => x.id));
    const moves = keep('GS', 'GS_Ammo_Moves', rows('GS_Ammo_Moves').map(r => ({ id: txt(g(r, 'ID')), date: day(g(r, 'Date')), munitionId: txt(g(r, 'Munition ID')), kind: txt(g(r, 'Kind')),
      qty: num(g(r, 'Rounds')) || 0, price: num(g(r, 'Price EUR')), shop: txt(g(r, 'Shop')), purpose: txt(g(r, 'Purpose')), updated: txt(g(r, 'Updated')) })).filter(x => x.date && x.munitionId));
    const gsRounds = keep('GS', 'GS_Rounds_Log', rows('GS_Rounds_Log').map(r => ({ id: txt(g(r, 'ID')), date: day(g(r, 'Date')), weaponId: txt(g(r, 'Gun ID')), munitionId: txt(g(r, 'Munition ID')),
      rounds: num(g(r, 'Rounds')) || 0, note: txt(g(r, 'Note')), updated: txt(g(r, 'Updated')) })).filter(x => x.date && x.rounds));

    /* SR Field Kit */
    const points = rows('FK_Points').map(r => ({ name: txt(g(r, 'Name')), lat: num(g(r, 'Latitude')), lon: num(g(r, 'Longitude')), mgrs: txt(g(r, 'MGRS')) })).filter(p => p.name || p.lat != null);
    const breath = rows('FK_Breathing').map(r => ({ date: day(g(r, 'Date')), sec: num(g(r, 'Seconds')) != null ? num(g(r, 'Seconds')) : (num(g(r, 'Minutes')) || 0) * 60 })).filter(b => b.date && b.sec > 0);
    const ball = {}; rows('FK_DropWind').forEach(r => { const k = txt(g(r, 'Key')); if (k) ball[k] = g(r, 'Value'); });

    /* SR Physical Fitness (lower-case headers as the app writes them) */
    const pfSet = {}; rows('PF_Settings').forEach(r => { const k = txt(g(r, 'key')); if (k) pfSet[k] = g(r, 'value'); });
    const pf = {
      settings: pfSet,
      plans: keep('PF', 'PF_Plans', rows('PF_Plans').map(r => ({ id: txt(g(r, 'id')), block: num(g(r, 'block')) || 1, start: day(g(r, 'start')), status: txt(g(r, 'status')), updated: txt(g(r, 'at')) })).filter(p => p.id)),
      sessions: keep('PF', 'PF_Sessions', rows('PF_Sessions').map(r => ({ id: txt(g(r, 'id')), plan: txt(g(r, 'plan')), week: num(g(r, 'week')), sess: num(g(r, 'sess')), date: day(g(r, 'date')), done: yes(g(r, 'done')), note: txt(g(r, 'note')), updated: txt(g(r, 'at')) })).filter(s => s.id)),
      sets: keep('PF', 'PF_Sets', rows('PF_Sets').map(r => ({ id: txt(g(r, 'id')), date: day(g(r, 'date')), ex: txt(g(r, 'ex')), exercise: txt(g(r, 'exercise')) || txt(g(r, 'ex')), set: num(g(r, 'set')),
        reps: num(g(r, 'reps')), kg: num(g(r, 'kg')), sec: num(g(r, 'sec')), m: num(g(r, 'm')), done: txt(g(r, 'done')) === '' ? true : yes(g(r, 'done')), updated: txt(g(r, 'at')) })).filter(s => s.date)),
      activities: keep('PF', 'PF_Activities', rows('PF_Activities').map(r => ({ id: txt(g(r, 'id')), date: day(g(r, 'date')), type: txt(g(r, 'type')), name: txt(g(r, 'name')), min: num(g(r, 'min')), km: num(g(r, 'km')),
        elev: num(g(r, 'elev')), kg: num(g(r, 'kg')), updated: txt(g(r, 'at')) })).filter(a => a.date)),
      mobility: keep('PF', 'PF_Mobility', rows('PF_Mobility').map(r => ({ id: txt(g(r, 'id')), date: day(g(r, 'date')), updated: txt(g(r, 'at')) })).filter(a => a.date)),
      drinks: keep('PF', 'PF_Drinks', rows('PF_Drinks').map(r => ({ id: txt(g(r, 'id')), date: day(g(r, 'date')), time: txt(g(r, 'time')), ml: num(g(r, 'ml')) || 0, updated: txt(g(r, 'at')) })).filter(a => a.date && a.ml)),
      weight: keep('PF', 'PF_Weight', rows('PF_Weight').map(r => ({ id: txt(g(r, 'id')), date: day(g(r, 'date')), kg: num(g(r, 'kg')), updated: txt(g(r, 'at')) })).filter(a => a.date && a.kg)).sort((a, b) => a.date.localeCompare(b.date)),
      assessments: rows('PF_Assessments').length,
    };

    /* SR Daily Thoughts */
    const favs = keep('DT', 'DT_Favourites', rows('DT_Favourites').map(r => ({ id: txt(g(r, 'Quote ID')), author: txt(g(r, 'Author')), text: txt(g(r, 'Quote')), at: iso(g(r, 'Saved at')), note: txt(g(r, 'Note')) })).filter(f => f.id));

    const present = {
      sh: ['Weapons', 'Trainings', 'Drill_Results', 'Datasheets', 'Rounds_Log'].some(has),
      gs: wb.SheetNames.some(n => /^GS_/.test(n)), fk: wb.SheetNames.some(n => /^FK_/.test(n)),
      pf: wb.SheetNames.some(n => /^PF_/.test(n)), dt: wb.SheetNames.some(n => /^DT_/.test(n)),
    };
    return { sheets, tombs, present,
      sr: { weapons, barrels, munitions, trainings, roundsLog, datasheets, results },
      gs: { guns: gsGuns, owners, gunInfo, barrels: gsBarrels, service, munitions: gsMun, moves, rounds: gsRounds },
      fk: { points, breath, ball }, pf, dt: { favs } };
  }
  function startOf(v) { if (v instanceof Date) return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0'); if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } return txt(v).slice(0, 5); }

  /* ---------- figures ---------- */
  const barrelLifeFor = cal => {   // same as SR Shooting (gun/js/core.js RB.barrelLifeFor)
    const c = String(cal || '');
    if (/6[.,]5\s*(cm|creedmoor)/i.test(c)) return 2750;
    if (/6[.,]5\s*prc|6[.,]5.?284|6\s?mm\s*(cm|creedmoor)|\.243/i.test(c)) return 2000;
    if (/\.300|7\s?mm\s*(rem|prc)|\.338/i.test(c)) return 2000;
    if (/\.308|7[.,]62\s*x\s*51/i.test(c)) return 5000;
    if (/\.223|5[.,]56/i.test(c)) return 10000;
    if (/\.22\s*lr/i.test(c)) return 50000;
    if (/9\s?mm|9x19|\.45|\.40|10\s?mm/i.test(c)) return 50000;
    if (/gauge|ga\b|12\/|20\/|cal\.?\s*12/i.test(c)) return 100000;
    return 3000;
  };

  /** Everything the pages show, from the tables of read(). */
  function figures(D) {
    const today = todayIso();
    const guns = D.sr.weapons.concat(D.gs.guns.filter(g => !D.sr.weapons.some(w => w.id === g.id)));
    const gun = id => guns.find(g => g.id === id);
    const info = id => D.gs.gunInfo.find(i => i.id === id) || { owners: [], fits: [] };
    const ownerName = id => (D.gs.owners.find(o => o.id === id) || {}).name || '';
    const fits = g => [g.caliber].concat(info(g.id).fits).filter(Boolean).map(low);
    // every rounds-fired event: trainings (live fire), rounds log, datasheets (SR) and GunSafe's own rounds log
    const ev = [];
    D.sr.trainings.forEach(t => { if (!t.dry) t.guns.forEach(x => { if (x.w && x.r) ev.push({ date: t.date, w: x.w, r: x.r, src: 'training', ref: t }); }); });
    D.sr.roundsLog.forEach(r => ev.push({ date: r.date, w: r.weaponId, r: r.rounds, b: r.barrelId, m: r.munitionId, src: 'log' }));
    D.sr.datasheets.forEach(s => { if (s.weaponId && s.rounds) ev.push({ date: s.date, w: s.weaponId, r: s.rounds, b: s.barrelId, m: s.munitionId, src: 'sheet' }); });
    D.gs.rounds.forEach(r => ev.push({ date: r.date, w: r.weaponId, r: r.rounds, m: r.munitionId, src: 'gs' }));
    const barrelsOf = id => { const g = gun(id); return (g && g.src === 'gs' ? D.gs.barrels : D.sr.barrels).filter(b => b.weaponId === id); };
    const barrelAt = (id, date) => {   // same rule as SR Shooting RB.barrelAt
      const bs = barrelsOf(id), c = bs.filter(b => (!b.installed || !date || b.installed <= date) && (!b.removed || !date || b.removed > date));
      c.sort((a, b) => (a.installed || '').localeCompare(b.installed || ''));
      return c.length ? c[c.length - 1] : (bs.filter(b => !b.removed)[0] || null);
    };
    const lastClean = id => D.gs.service.filter(s => s.weaponId === id && s.clean).map(s => s.date).sort().pop() || '';
    const gunFig = id => {
      const g = gun(id) || {}, es = ev.filter(e => e.w === id), lc = lastClean(id);
      const shot = es.map(e => e.date).sort();
      return { total: (g.before || 0) + es.reduce((a, e) => a + e.r, 0), since: es.filter(e => !lc || e.date > lc || (e.date === lc && e.src === 'gs')).reduce((a, e) => a + e.r, 0),
        lastClean: lc, lastShot: shot.length ? shot[shot.length - 1] : '', owners: info(id).owners.map(ownerName).filter(Boolean) };
    };
    const barrelFig = b => {
      const g = gun(b.weaponId) || {};
      const used = (b.atInstall || 0) + ev.filter(e => e.w === b.weaponId && (e.b ? e.b === b.id : (barrelAt(b.weaponId, e.date) || {}).id === b.id)).reduce((a, e) => a + e.r, 0);
      const life = b.life || barrelLifeFor(g.caliber);
      return { used, life, frac: life ? used / life : 0, fitted: !b.removed };
    };
    // ammunition (SR GunSafe rule: the stock starts with the first move; GunSafe's own rounds always count)
    const muns = D.sr.munitions.concat(D.gs.munitions.filter(m => !D.sr.munitions.some(s => s.id === m.id)));
    const munFig = mid => {
      const mv = D.gs.moves.filter(m => m.munitionId === mid), buys = mv.filter(m => /purchase|buy|kauf/i.test(m.kind));
      const bought = buys.reduce((a, m) => a + m.qty, 0), spent = buys.reduce((a, m) => a + (m.price || 0), 0);
      const out = mv.filter(m => !/purchase|buy|kauf/i.test(m.kind)).reduce((a, m) => a + (m.qty > 0 ? -m.qty : m.qty), 0);
      const start = mv.reduce((d, m) => !d || m.date < d ? m.date : d, '');
      const fired = ev.filter(e => e.m === mid && (e.src === 'gs' || (start && e.date >= start))).reduce((a, e) => a + e.r, 0);
      const last = buys.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
      return { stock: bought + out - fired, bought, spent, perRd: last && last.qty && last.price ? last.price / last.qty : (bought ? spent / bought : 0), last, buys: buys.slice().sort((a, b) => a.date.localeCompare(b.date)), moves: mv.length };
    };
    const ammo = muns.map(m => Object.assign({}, m, munFig(m.id))).filter(m => m.moves);
    const ammoFor = id => { const g = gun(id); return g ? ammo.filter(a => fits(g).includes(low(a.caliber))) : []; };

    // Physical Fitness
    const P = D.pf, sNum = k => num(P.settings[k]);
    const plan = P.plans.filter(p => /active|current/i.test(p.status)).sort((a, b) => b.start.localeCompare(a.start))[0]
      || P.plans.filter(p => p.start && p.start <= today).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
    const pWeek = plan && plan.start ? Math.floor((new Date(today) - new Date(plan.start)) / 6048e5) + 1 : null;
    const perWeek = sNum('sessions') || 3, minutes = sNum('minutes') || null;
    const doneDates = P.sessions.filter(s => s.done && s.date).map(s => s.date);
    const monday = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10); };
    const weeks = []; { let m = monday(today); for (let i = 0; i < 8; i++) { weeks.unshift(m); const x = new Date(m + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 7); m = x.toISOString().slice(0, 10); } }
    const perWeekDone = weeks.map(w => doneDates.filter(d => monday(d) === w).length);
    const lastW = P.weight[P.weight.length - 1] || null;
    const drinkGoal = sNum('drink_goal_ml') || (lastW ? Math.round(lastW.kg * 35 / 250) * 250 : 2500);
    const drinksToday = P.drinks.filter(d => d.date === today).reduce((a, d) => a + d.ml, 0);
    const lastSetDay = P.sets.filter(s => s.done).map(s => s.date).sort().pop() || '';
    const lastSets = []; P.sets.filter(s => s.date === lastSetDay && s.done).forEach(s => { let e = lastSets.find(x => x.ex === s.exercise); if (!e) lastSets.push(e = { ex: s.exercise, sets: 0, reps: [], kg: null, sec: null }); e.sets++; if (s.reps) e.reps.push(s.reps); if (s.kg) e.kg = Math.max(e.kg || 0, s.kg); if (s.sec) e.sec = s.sec; });
    const mob = new Set(P.mobility.map(m => m.date)); let streak = 0;
    { const d = new Date(today + 'T12:00:00Z'); if (!mob.has(today)) d.setUTCDate(d.getUTCDate() - 1); while (mob.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); } }

    // Field Kit drop card
    let dope = null; const B = D.fk.ball, bn = k => num(B[k]);
    if (window.RB && RB.dope && bn('bMV') && bn('bBC')) {
      try {
        const max = Math.min(1500, bn('bMax') || 800), step = Math.max(25, bn('bStep') || 100);
        const air = RB.air({ temp: bn('bTemp') ?? 15, alt: bn('bAlt') || 0 });
        const windMs = (bn('bWind') || 0) / 3.6 * Math.abs(Math.sin((bn('bClock') ?? 3) * Math.PI / 6));
        const d = RB.dope({ v0: bn('bMV'), bc: bn('bBC'), model: txt(B.bModel) || 'G1', sightMm: (bn('bSH') || 4.5) * 10, zeroM: bn('bZero') || 100, air, maxM: max, stepM: step, windMs, massG: bn('bMass') || 10 });
        dope = { load: txt(B.pre), model: txt(B.bModel) || 'G1', bc: bn('bBC'), v0: bn('bMV'), massG: bn('bMass'), sightCm: bn('bSH'), zero: bn('bZero') || 100, wind: bn('bWind') || 0, clock: bn('bClock') ?? 3,
          temp: bn('bTemp') ?? 15, alt: bn('bAlt') || 0, rows: d.rows.filter(r => r.x > 0).slice(0, 16).map(r => ({ x: Math.round(r.x), elev: r.elevMrad, wind: r.windMrad, v: r.v })), subsonicM: d.subsonicM };
      } catch (e) { dope = null; }
    }

    // Daily Thoughts: the same thought of the day as the phone (DT.quoteOfDay)
    let quote = null;
    if (window.SRQ) {
      const Q = {}; SRQ.QUOTES.forEach(q => Q[q[0]] = q);
      const dn = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5), L = SRQ.DAY_ORDER.length;
      const q = Q[SRQ.DAY_ORDER[((dn % L) + L) % L]];
      if (q) quote = { id: q[0], author: SRQ.AUTHORS[q[1]] || q[1], text: q[2], ref: q[3] };
      D.dt.favs.forEach(f => { const x = Q[f.id]; if (x) { if (!f.text) f.text = x[2]; if (!f.author) f.author = SRQ.AUTHORS[x[1]] || x[1]; } });
    }

    return { today, guns, gun, gunFig, barrelsOf, barrelFig, ev, ammo, ammoFor, lastClean,
      pf: { plan, week: pWeek, weeks: 12, perWeek, minutes, perWeekDone, weekStarts: weeks, drinkGoal, drinksToday, lastSetDay, lastSets, streak, lastW, doneDates },
      dope, quote };
  }

  return { read, figures, todayIso, barrelLifeFor, util: { txt, num, day } };
})();
