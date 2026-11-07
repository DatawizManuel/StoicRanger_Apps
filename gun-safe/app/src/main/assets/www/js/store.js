/* SR GunSafe — the one data file. On Android files/db.json (window.GSNative: atomic write, previous copy kept as
   db.bak.json, backups/ before a format change, an import or a first sync). In a browser localStorage (tests, PC).

   db.json = { app: "sr-gunsafe", format: 1, created, updated, data: { …tables } }
   Tables (all arrays of rows with a permanent "id"; see js/xlsx.js for the matching GS_ sheets):
     owners      {id, name, notes}                                   own list (Manuel 2026-11-07), not SR Shooters
     guns        {id, name, type, caliber, make, model, roundsBeforeLog, status, notes}   guns entered here (ids G…)
     gunInfo     {id = gun id, owners: [owner ids], fits: [extra calibres]}   for own AND SR Shooting guns
     barrels     {id, weaponId, name, lengthMm, twist, installed, removed, notes}         of own guns (ids GB…)
     components  {id, weaponId, type, name, fitted, removed}
     service     {id, date, weaponId, kind: Service|Cleaning, cleaningDone, note, changes: [text], seq}
     munitions   {id, name, caliber, manufacturer, notes}            ammunition entered here (ids GM…)
     moves       {id, date, munitionId, kind: Purchase|Withdrawal, qty (+/-), price, shop, purpose}
     rounds      {id, date, weaponId, munitionId, rounds, note, seq}  rounds fired logged here (not linked)
   Plus: settings {theme}, link {sr: "ask"|"allowed"|"no", dismissed}, srCache {weapons, barrels, munitions, rounds, at}
   (last copy read from SR Shooting), deleted [ids] (tombstones: a sync never brings them back).
   Unknown keys are kept as they are, so a newer app's data survives an older one.

   Standing rule (Manuel): device data is never lost. A file from a newer app version opens read-only and is never
   written; a damaged file falls back to the previous copy and is backed up first; migrations add/convert only. */
'use strict';
window.GSStore = (() => {
  const FORMAT = 1, APP = 'sr-gunsafe', LS = 'sr-gunsafe-db';
  const TABLES = ['owners', 'guns', 'gunInfo', 'barrels', 'components', 'service', 'munitions', 'moves', 'rounds'];
  const N = window.GSNative || null;
  const now = () => new Date().toISOString();
  const parse = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (e) { return null; } };
  const raw = () => { if (N) return N.loadDb() || ''; try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } };
  const rawBak = () => { if (N && N.loadDbBackup) return N.loadDbBackup() || ''; try { return localStorage.getItem(LS + '.bak') || ''; } catch (e) { return ''; } };
  const stamp = () => now().replace(/[-:]/g, '').replace(/\..*/, '');
  let db, readOnly = false, firstRun = false, notice = '', timer = null;
  const listeners = [];

  function empty() { const t = now(); return { app: APP, format: FORMAT, created: t, updated: t, data: {} }; }
  function fill(d) {
    TABLES.forEach(t => { if (!Array.isArray(d[t])) d[t] = []; });
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    if (!d.link || typeof d.link !== 'object') d.link = { sr: 'ask' };
    if (!Array.isArray(d.deleted)) d.deleted = [];
    return d;
  }
  function load() {
    const t = raw();
    if (!t) { firstRun = true; db = empty(); fill(db.data); return; }
    let j = parse(t);
    if (!j || j.app !== APP) {
      backup('damaged-' + stamp() + '.json');
      const b = parse(rawBak());
      if (b && b.app === APP) { j = b; notice = 'The data file was damaged. The previous copy was loaded; the damaged file is kept in backups.'; }
      else { db = empty(); fill(db.data); readOnly = true; notice = 'The data file could not be read. It is kept unchanged; nothing is saved until the app is updated or the file is fixed.'; return; }
    }
    if ((j.format || 0) > FORMAT) { readOnly = true; notice = 'This data was saved by a newer version of SR GunSafe. Nothing is changed or saved until you update the app.'; }
    if (!j.data || typeof j.data !== 'object') j.data = {};
    if ((j.format || 0) < FORMAT && !readOnly) {      // future migrations: add/convert only, after a backup
      backup('before-format-' + FORMAT + '-' + stamp() + '.json');
      j.format = FORMAT;
    }
    fill(j.data);
    db = j;
  }
  function backup(name) {
    if (N && N.backupDb) return N.backupDb(name);
    try { const t = localStorage.getItem(LS); if (t) localStorage.setItem(LS + '.backup.' + name, t); return true; } catch (e) { return false; }
  }
  function write() {
    timer = null;
    if (readOnly) return false;
    db.updated = now();
    const t = JSON.stringify(db);
    if (N) return N.saveDb(t);
    try { const old = localStorage.getItem(LS); if (old) localStorage.setItem(LS + '.bak', old); localStorage.setItem(LS, t); return true; } catch (e) { return false; }
  }
  function aux(name, v) {
    if (v === undefined) {
      const t = N && N.loadAux ? N.loadAux(name) : (() => { try { return localStorage.getItem(LS + '.aux.' + name) || ''; } catch (e) { return ''; } })();
      return t ? parse(t) : null;
    }
    const s = JSON.stringify(v);
    if (N && N.saveAux) return N.saveAux(name, s);
    try { localStorage.setItem(LS + '.aux.' + name, s); return true; } catch (e) { return false; }
  }
  load();
  let seqN = Date.now();
  const nid = (rows, p) => p + (rows.reduce((m, x) => { const s = String(x.id || ''); return s.startsWith(p) && /^\d+$/.test(s.slice(p.length)) ? Math.max(m, +s.slice(p.length)) : m; }, 0) + 1);
  return {
    TABLES, FORMAT,
    get data() { return db.data; },
    /** Call after every change: saves (debounced) and tells the listeners (sync after changes). */
    changed(why) { if (readOnly) return; if (!timer) timer = setTimeout(write, 250); listeners.forEach(f => { try { f(why); } catch (e) { } }); },
    onChange(f) { listeners.push(f); },
    flush() { if (timer) { clearTimeout(timer); write(); } },
    backup, aux, stamp,
    nid(table, prefix) { return nid(db.data[table], prefix); },
    seq() { return ++seqN; },
    /** Replace all tables (import / sync result); a backup copy is made first. */
    replaceData(d, why) { if (readOnly) return false; backup((why || 'replace') + '-' + stamp() + '.json'); db.data = fill(d); write(); listeners.forEach(f => { try { f('replace'); } catch (e) { } }); return true; },
    get readOnly() { return readOnly; }, get firstRun() { return firstRun; }, get notice() { return notice; },
    _db: () => db,
  };
})();
