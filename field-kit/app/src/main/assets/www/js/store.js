/* SR Field Kit — the one data file. On Android it is files/db.json (window.FKNative: atomic write, previous copy
   kept as db.bak.json, backups/ before a format change). In a browser it is localStorage (for tests and the PC).

   db.json = { app: "sr-field-kit", format: 1, created, updated, data: { <key>: <value>, … } }
   Keys used by 0.1.0: sr-breath (seconds per day), sr-custom (custom pattern), sr-pos (last position),
   sr-points (saved points), sr-ball (Drop & wind inputs, metric), settings (units, theme), link (Stoic Ranger
   link state). 0.2.0: sync-base (state of the last Nextcloud sync), sync-state (last sync, message),
   sr-points-deleted (uids deleted on this phone, so a sync does not bring them back). Unknown keys are kept as they are, so a newer app's data survives an older one.

   Standing rule (Manuel): device data is never lost. A file from a newer app version (format > FORMAT) opens
   read-only and is never written; a damaged file falls back to the previous copy, and is backed up first. */
'use strict';
window.FKStore = (() => {
  const FORMAT = 1, APP = 'sr-field-kit', LS = 'sr-field-kit-db';
  const N = window.FKNative || null;
  const now = () => new Date().toISOString();
  const parse = t => { try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (e) { return null; } };
  const raw = () => { if (N) return N.loadDb() || ''; try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } };
  const rawBak = () => { if (N && N.loadDbBackup) return N.loadDbBackup() || ''; try { return localStorage.getItem(LS + '.bak') || ''; } catch (e) { return ''; } };
  const stamp = () => now().replace(/[-:]/g, '').replace(/\..*/, '');
  let db, readOnly = false, firstRun = false, notice = '', timer = null;

  function empty() { const t = now(); return { app: APP, format: FORMAT, created: t, updated: t, data: {} }; }
  function load() {
    const t = raw();
    if (!t) { firstRun = true; db = empty(); return; }
    let j = parse(t);
    if (!j || j.app !== APP) {
      // damaged or foreign: keep a copy, then use the previous version if there is one
      if (N && N.backupDb) N.backupDb('damaged-' + stamp() + '.json');
      const b = parse(rawBak());
      if (b && b.app === APP) { j = b; notice = 'The data file was damaged. The previous copy was loaded; the damaged file is kept in backups.'; }
      else { db = empty(); readOnly = true; notice = 'The data file could not be read. It is kept unchanged; nothing is saved until the app is updated or the file is fixed.'; return; }
    }
    if ((j.format || 0) > FORMAT) { readOnly = true; notice = 'This data was saved by a newer version of SR Field Kit. Nothing is changed or saved until you update the app.'; }
    if (!j.data || typeof j.data !== 'object') j.data = {};
    if ((j.format || 0) < FORMAT && !readOnly) {      // future migrations: add/convert only, after a backup
      if (N && N.backupDb) N.backupDb('before-format-' + FORMAT + '-' + stamp() + '.json');
      j.format = FORMAT;
    }
    db = j;
  }
  function write() {
    timer = null;
    if (readOnly) return false;
    db.updated = now();
    const t = JSON.stringify(db);
    if (N) return N.saveDb(t);
    try { const old = localStorage.getItem(LS); if (old) localStorage.setItem(LS + '.bak', old); localStorage.setItem(LS, t); return true; } catch (e) { return false; }
  }
  load();
  const clone = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
  return {
    get(k, d) { return Object.prototype.hasOwnProperty.call(db.data, k) ? clone(db.data[k]) : d; },
    set(k, v) { if (readOnly) return; db.data[k] = clone(v); if (!timer) timer = setTimeout(write, 300); try { if (this.onChange) this.onChange(k); } catch (e) { } },
    /** Set without telling onChange (used by the Nextcloud sync when it applies merged data). */
    put(k, v) { if (readOnly) return; db.data[k] = clone(v); if (!timer) timer = setTimeout(write, 300); },
    flush() { if (timer) { clearTimeout(timer); write(); } },
    /** "Delete all my data": a backup copy is kept first (backups/), then the data is emptied. */
    clear() { if (readOnly) return false; if (N && N.backupDb) N.backupDb('before-delete-' + stamp() + '.json'); db.data = {}; return write(); },
    get readOnly() { return readOnly; }, get firstRun() { return firstRun; }, get notice() { return notice; },
    FORMAT, _db: () => db,
  };
})();
