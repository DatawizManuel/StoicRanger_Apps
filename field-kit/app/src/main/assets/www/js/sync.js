/* SR Field Kit 0.2.0 — optional Nextcloud sync (Manuel 2026-11-07), following 00_docs/SHARED-DB-CONTRACT.md v1.

   Where the data lives: "local" (on this phone only, the default) or "nextcloud" (on this phone, synced to the
   user's own Nextcloud over WebDAV). The phone always keeps its own copy (db.json) and works offline.

   The file: fieldkit.xlsx when Field Kit is on its own, database.xlsx when linked with Stoic Ranger (one file for all
   linked apps). Field Kit writes ONLY its own sheets (FK_Points, FK_Breathing, FK_DropWind, FK_Settings and the hidden
   _FK_Data JSON copy) and keeps every other sheet of the workbook unchanged, hidden ones included.

   Each sync: download (with its ETag) → three-way merge against the state of the last sync (sync-base) → back up the
   downloaded file to <folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx (newest 30 kept) → upload with If-Match; on 412
   (someone else saved in between) start again, at most 3 times. A sync never deletes: points deleted on this phone are
   remembered (sr-points-deleted) so they do not come back; rows deleted in Excel stay in the app.
   Sync runs on start, about 15 s after a change, when the app comes back to the front, and with "Sync now".

   Linked apps share one storage setting (contract C): on start Field Kit asks Stoic Ranger (only with the user's link
   consent) and adopts a newer setting; when the user changes it here, it is pushed to Stoic Ranger.
   The app password is handled only by the Java side (Android Keystore); the page never sees it after it is typed. */
'use strict';
(function () {
  const store = window.FKStore, N = window.FKNative || null;
  const X = () => window.XLSX;
  const SR_PKG = 'at.rangebook.app';
  const MARK = 'sr-field-kit-data', FORMAT = 1, HIDDEN = '_FK_Data', CHUNK = 30000, KEEP_BACKUPS = 30;
  const OWN = ['FK_Points', 'FK_Breathing', 'FK_DropWind', 'FK_Settings', HIDDEN];
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const arr = a => Array.isArray(a) ? a : [];
  const obj = o => o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const num = v => { if (v === '' || v == null) return null; const n = +String(v).trim().replace(',', '.'); return isFinite(n) ? n : null; };
  const uid = () => 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const BALL = ['pre', 'bModel', 'bBC', 'bMV', 'bMass', 'bSH', 'bZero', 'bWind', 'bClock', 'bAlt', 'bTemp', 'bMax', 'bStep', 'bMove'];
  const BALL_LABEL = { pre: 'Load', bModel: 'Drag model', bBC: 'BC', bMV: 'Muzzle velocity m/s', bMass: 'Bullet g', bSH: 'Sight height cm', bZero: 'Zero m',
    bWind: 'Wind km/h', bClock: 'Wind from (clock value)', bAlt: 'Altitude m', bTemp: 'Temperature °C', bMax: 'Out to m', bStep: 'Step m', bMove: 'Target speed km/h' };

  /* ---------- the synced part of db.json ---------- */
  function appPart() {
    const pts = arr(store.get('sr-points', [])), s = obj(store.get('settings', {}));
    let fixed = false;
    pts.forEach(p => { if (p && !p.uid) { p.uid = uid(); fixed = true; } });
    if (fixed) store.put('sr-points', pts);
    return { points: pts, breath: obj(store.get('sr-breath', {})), custom: store.get('sr-custom', null), ball: store.get('sr-ball', null),
      settings: { units: s.units || 'metric', theme: s.theme || '' } };
  }
  function applyPart(P) {
    store.put('sr-points', P.points);
    store.put('sr-breath', P.breath);
    if (P.custom) store.put('sr-custom', P.custom);
    if (P.ball) store.put('sr-ball', P.ball);
    const s = obj(store.get('settings', {})); s.units = P.settings.units; s.theme = P.settings.theme; store.put('settings', s);
  }

  /* ---------- workbook: read Field Kit's part, write it back keeping every other sheet ---------- */
  function rows(wb, name) { const ws = wb.Sheets[name]; return ws ? X().utils.sheet_to_json(ws, { defval: '' }) : null; }
  function readPart(wb) {
    let P = null;
    const H = wb.Sheets[HIDDEN];
    if (H) {
      const aoa = X().utils.sheet_to_json(H, { header: 1, defval: '' });
      if (aoa[0] && aoa[0][0] === MARK) { try { P = JSON.parse(aoa.slice(1).map(r => r[0]).join('')).data; } catch (e) { P = null; } }
    }
    const pts = rows(wb, 'FK_Points'), br = rows(wb, 'FK_Breathing'), dw = rows(wb, 'FK_DropWind'), st = rows(wb, 'FK_Settings');
    if (!P && !pts && !br && !dw && !st) return null;           // no Field Kit data in this file yet
    P = P || { points: [], breath: {}, custom: null, ball: null, settings: { units: 'metric', theme: '' } };
    P.points = arr(P.points); P.breath = obj(P.breath); P.settings = obj(P.settings);
    // the visible sheets win over the hidden copy: that is what someone changed in Excel
    if (pts) {
      const byUid = new Map(P.points.map(p => [p.uid, p])), out = [];
      pts.forEach(r => {
        const lat = num(r['Latitude']), lon = num(r['Longitude']); if (lat == null || lon == null) return;
        const u = String(r['Source uid'] || '').trim() || uid();
        out.push(Object.assign({}, byUid.get(u) || {}, { uid: u, name: String(r['Name'] || '').trim() || 'Point', lat, lon }));
      });
      P.points = out;
    }
    if (br) { const b = {}; br.forEach(r => { const d = String(r['Date'] || '').trim(), s = num(r['Seconds']); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && s != null) b[d] = Math.round(s); }); P.breath = b; }
    if (dw) {
      const b = Object.assign({}, obj(P.ball));
      dw.forEach(r => { const k = String(r['Key'] || '').trim(); if (BALL.includes(k)) { const v = r['Value']; b[k] = ['pre', 'bModel', 'bClock', 'bMax', 'bStep'].includes(k) ? String(v) : num(v); } });
      P.ball = b;
    }
    if (st) {
      st.forEach(r => {
        const k = String(r['Key'] || '').trim(), v = String(r['Value'] ?? '').trim();
        if (k === 'units') P.settings.units = v === 'imperial' || v === 'imp' ? 'imp' : 'metric';
        if (k === 'theme') P.settings.theme = ['light', 'dark'].includes(v) ? v : '';
        const m = /^breathing custom (in|h1|out|h2)$/.exec(k); if (m) { P.custom = Object.assign({ in: 4, h1: 2, out: 6, h2: 0 }, obj(P.custom)); const n = num(v); if (n != null) P.custom[m[1]] = n; }
      });
    }
    return P;
  }
  function sheet(head, data) {
    const ws = X().utils.aoa_to_sheet([head, ...data]);
    ws['!cols'] = head.map(h => ({ wch: Math.min(40, Math.max(10, String(h).length + 2)) }));
    return ws;
  }
  function mgrsOf(p) { try { return window.FKmgrs ? window.FKmgrs(p.lat, p.lon) : ''; } catch (e) { return ''; } }
  /** wb: the downloaded workbook (or null for a new file). Replaces Field Kit's sheets only. → xlsx bytes */
  function writeWb(wb, P) {
    const XL = X();
    if (!wb) wb = XL.utils.book_new();
    const hidden = {};
    (wb.Workbook && wb.Workbook.Sheets || []).forEach(s => { if (s && s.name) hidden[s.name] = s.Hidden || 0; });
    OWN.forEach(n => { if (wb.Sheets[n]) { delete wb.Sheets[n]; wb.SheetNames = wb.SheetNames.filter(x => x !== n); } });
    XL.utils.book_append_sheet(wb, sheet(['Name', 'Latitude', 'Longitude', 'MGRS', 'Source uid'], P.points.map(p => [p.name || '', p.lat, p.lon, mgrsOf(p), p.uid || ''])), 'FK_Points');
    XL.utils.book_append_sheet(wb, sheet(['Date', 'Seconds', 'Minutes'], Object.keys(P.breath).sort().map(d => [d, P.breath[d], Math.round(P.breath[d] / 6) / 10])), 'FK_Breathing');
    XL.utils.book_append_sheet(wb, sheet(['Key', 'Field', 'Value'], BALL.filter(k => P.ball && P.ball[k] != null).map(k => [k, BALL_LABEL[k], P.ball[k]])), 'FK_DropWind');
    const st = [['units', P.settings.units === 'imp' ? 'imperial' : 'metric'], ['theme', P.settings.theme || 'phone']];
    if (P.custom) ['in', 'h1', 'out', 'h2'].forEach(k => st.push(['breathing custom ' + k, P.custom[k]]));
    st.push(['note', 'SR Field Kit: saved points, breathing minutes, Drop & wind values (metric) and settings. Edit in Excel if you like; keep the Key and Source uid columns. Delete points in the app.']);
    st.push(['saved', new Date().toISOString().slice(0, 16).replace('T', ' ')]);
    XL.utils.book_append_sheet(wb, sheet(['Key', 'Value'], st), 'FK_Settings');
    const full = JSON.stringify({ mark: MARK, format: FORMAT, saved: new Date().toISOString(), data: P });
    const aoa = [[MARK, FORMAT, 'Do not edit: SR Field Kit\'s copy of its data. The FK_ sheets win over it.']];
    for (let i = 0; i < full.length; i += CHUNK) aoa.push([full.slice(i, i + CHUNK)]);
    XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), HIDDEN);
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Sheets = wb.SheetNames.map(n => ({ name: n, Hidden: n === HIDDEN ? 1 : (hidden[n] || 0) }));
    return new Uint8Array(XL.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
  }

  /* ---------- three-way merge (base = Field Kit's part at the last sync) ---------- */
  function mergeFields(b, a, f) {          // objects field by field; a conflict keeps the phone's value
    const out = Object.assign({}, obj(a));
    Object.keys(obj(f)).forEach(k => { if (same(f[k], obj(a)[k])) return; if (!b || same(obj(a)[k], obj(b)[k])) out[k] = clone(f[k]); });
    return out;
  }
  function merge(base, app, file) {
    if (!file) return { part: clone(app), changed: false };
    const B = base || null, out = { settings: {}, breath: {} };
    // points by uid: deleted on the phone → stays deleted (tombstones), deleted in Excel → stays on the phone
    const dead = new Set(arr(store.get('sr-points-deleted', [])));
    if (B) arr(B.points).forEach(p => { if (p.uid && !app.points.some(q => q.uid === p.uid)) dead.add(p.uid); });
    const bMap = new Map(arr(B && B.points).map(p => [p.uid, p]));
    const fMap = new Map(arr(file.points).map(p => [p.uid, p]));
    out.points = app.points.map(a => fMap.has(a.uid) ? mergeFields(bMap.get(a.uid), a, fMap.get(a.uid)) : a);
    arr(file.points).forEach(f => { if (!dead.has(f.uid) && !out.points.some(p => p.uid === f.uid)) out.points.push(clone(f)); });
    store.put('sr-points-deleted', [...dead].slice(-500));
    // breathing seconds per day: changed on one side → that side; changed on both → the larger
    const days = new Set([...Object.keys(app.breath), ...Object.keys(obj(file.breath))]);
    days.forEach(d => {
      const a = app.breath[d], f = obj(file.breath)[d], b = B ? obj(B.breath)[d] : undefined;
      if (f == null) out.breath[d] = a; else if (a == null) out.breath[d] = f;
      else if (!B || (a !== b && f !== b)) out.breath[d] = Math.max(a, f);
      else out.breath[d] = a !== b ? a : f;
    });
    out.custom = app.custom || file.custom ? mergeFields(B && B.custom, app.custom || {}, file.custom || {}) : null;
    out.ball = app.ball || file.ball ? mergeFields(B && B.ball, app.ball || {}, file.ball || {}) : null;
    out.settings = mergeFields(B && B.settings, app.settings, file.settings);
    return { part: out, changed: !same(out, app) };
  }

  /* ---------- WebDAV through the Java side ---------- */
  const cbs = {};
  const prevCb = window.FKNativeCallback;
  window.FKNativeCallback = (id, res) => { if (cbs[id]) { const f = cbs[id]; delete cbs[id]; f(res); return; } if (prevCb) prevCb(id, res); };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s || ''), c => c.charCodeAt(0));
  function dav(method, path, body, ifMatch, depth) {
    return new Promise(res => {
      const id = 'nc' + Math.random().toString(36).slice(2);
      cbs[id] = res;
      N.ncRequest(method, path, body ? b64(body) : '', ifMatch || '', depth || '', id);
    });
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const why = r => r.status === 401 ? 'Nextcloud refused the login: check user name and app password.'
    : r.status === 404 ? 'The folder was not found on Nextcloud.' : r.status === 0 ? 'No connection to Nextcloud (' + (r.error || 'offline') + ').'
      : 'Nextcloud answered ' + r.status + '.';

  async function pruneBackups(folder, file) {
    const r = await dav('PROPFIND', folder + 'backups/', new TextEncoder().encode('<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>'), '', '1');
    if (r.status !== 207) return;
    const xml = new TextDecoder().decode(unb64(r.body));
    const base = file.replace(/\.xlsx$/, '');
    const names = [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/gi)].map(m => decodeURIComponent(m[1].split('/').filter(Boolean).pop() || ''))
      .filter(n => new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{8}-\\d{6}(-\\d)?\\.xlsx$').test(n)).sort();
    for (const n of names.slice(0, Math.max(0, names.length - KEEP_BACKUPS))) await dav('DELETE', folder + 'backups/' + n);
  }

  let running = null, timer = null, madeFolders = '';
  const cfg = () => (N && N.syncGet) ? JSON.parse(N.syncGet()) : { mode: 'local' };
  const state = () => Object.assign({ last: '', ok: true, msg: '' }, obj(store.get('sync-state', {})));
  function setState(s) { store.put('sync-state', Object.assign(state(), s)); store.flush(); if (window.__syncRender) window.__syncRender(); }

  async function syncOnce() {
    const C = cfg();
    if (C.mode !== 'nextcloud' || !N || !N.ncRequest) return { skipped: true };
    if (store.readOnly) { setState({ ok: false, msg: 'Not synced: the data on this phone is read-only (newer app version).' }); return { ok: false }; }
    if (!X()) return { ok: false };
    const folder = C.folder || '/Stoic Ranger/', file = C.file || 'fieldkit.xlsx', path = folder + file;
    if (madeFolders !== folder) {
      // MKCOL each level of the folder (405 = exists already), then backups/
      const parts = folder.split('/').filter(Boolean); let p = '/';
      for (const seg of parts) { p += seg + '/'; const r = await dav('MKCOL', p); if (r.status === 401) { setState({ ok: false, msg: why(r) }); return { ok: false }; } }
      await dav('MKCOL', folder + 'backups/');
      madeFolders = folder;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const g = await dav('GET', path);
      if (g.status !== 200 && g.status !== 404) { setState({ ok: false, msg: why(g) }); return { ok: false }; }
      let wb = null, filePart = null;
      const bytes = g.status === 200 ? unb64(g.body) : null;
      if (bytes) {
        try { wb = X().read(bytes, { type: 'array' }); } catch (e) { setState({ ok: false, msg: file + ' on Nextcloud could not be read; it was left unchanged.' }); return { ok: false }; }
        filePart = readPart(wb);
      }
      const app = appPart(), m = merge(store.get('sync-base', null), app, filePart);
      const out = writeWb(wb, m.part);
      if (bytes) {
        // backups/<file>-YYYYMMDD-HHMMSS.xlsx; a second backup in the same second gets -2, -3 …
        const bn = folder + 'backups/' + file.replace(/\.xlsx$/, '') + '-' + stamp();
        let b = await dav('PUT', bn + '.xlsx', bytes, '*new*');
        for (let k = 2; b.status === 412 && k <= 9; k++) b = await dav('PUT', bn + '-' + k + '.xlsx', bytes, '*new*');
        if (b.status >= 300) { setState({ ok: false, msg: 'Backup on Nextcloud failed (' + why(b) + '); nothing was uploaded.' }); return { ok: false }; }
      }
      const put = await dav('PUT', path, out, g.status === 200 ? g.etag : '*new*');
      if (put.status === 412) continue;                       // saved elsewhere in between: download, merge again
      if (put.status >= 300 || put.status === 0) { setState({ ok: false, msg: why(put) }); return { ok: false }; }
      if (m.changed) applyPart(m.part);
      store.put('sync-base', m.part);
      setState({ ok: true, last: new Date().toISOString(), msg: '' });
      if (bytes) pruneBackups(folder, file);
      return { ok: true, changed: m.changed };
    }
    setState({ ok: false, msg: 'Another device kept saving ' + file + ' at the same time. Try "Sync now" again.' });
    return { ok: false };
  }
  /** Runs one sync (queued if one is running). Reloads the page when data came in from Nextcloud. */
  function sync(why) {
    if (running) return running.then(() => sync(why));
    running = syncOnce().catch(e => { setState({ ok: false, msg: 'Sync failed: ' + e.message }); return { ok: false }; })
      .then(r => { running = null; if (r && r.changed) { store.flush(); setTimeout(() => location.reload(), 300); } return r; });
    return running;
  }
  const SYNCED = ['sr-points', 'sr-breath', 'sr-custom', 'sr-ball', 'settings'];
  store.onChange = k => { if (!SYNCED.includes(k) || cfg().mode !== 'nextcloud') return; clearTimeout(timer); timer = setTimeout(() => sync('change'), 15000); };

  /* ---------- linked apps share the storage setting (contract C) ---------- */
  const linked = () => !!obj(store.get('link', {})).linked;
  function adoptLinked() {
    if (!N || !N.linkCall || !linked()) return null;
    let o; try { o = JSON.parse(N.linkCall(SR_PKG, 'storage', '')); } catch (e) { return null; }
    if (!o || o.error) return o;
    const mine = cfg();
    if ((o.changed || '') > (mine.changed || '')) { N.linkAdoptStorage(SR_PKG); return Object.assign(o, { adopted: true }); }
    return o;
  }
  function pushLinked() {
    if (!N || !N.linkCall || !linked()) return null;
    try { return JSON.parse(N.linkCall(SR_PKG, 'setStorage', '')); } catch (e) { return null; }
  }

  window.FKSync = { sync, cfg, state, merge, readPart, writeWb, appPart, adoptLinked, pushLinked, linked, OWN };
  window.addEventListener('load', () => {
    try { adoptLinked(); } catch (e) { }
    try {   // linked with Stoic Ranger since the last start: move to the shared database.xlsx (contract A)
      const c = cfg();
      if (linked() && c.mode === 'nextcloud' && c.file !== 'database.xlsx') { N.syncSet(JSON.stringify(Object.assign({}, c, { file: 'database.xlsx' })), null, ''); pushLinked(); }
    } catch (e) { }
    if (cfg().mode === 'nextcloud') setTimeout(() => sync('start'), 1500);
  });
})();
