/* SR Physical Fitness — optional Nextcloud sync (0.2.0, shared Stoic Ranger contract v1, 00_docs/SHARED-DB-CONTRACT.md).
   - The phone always keeps its own copy (works offline). Default: data only on this phone.
   - "Synced to Nextcloud": the workbook <folder>/fitness.xlsx (database.xlsx when linked with other Stoic Ranger apps)
     is downloaded, merged three-way against the state of the last sync (the base), and uploaded with If-Match on its
     ETag; on 412 (changed elsewhere meanwhile) download, merge and try again, 3 tries. Before each upload the native
     side copies the old file to <folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx (newest 30 kept).
   - Physical Fitness writes only its own sheets (PF_…, hidden _PF_Data, see xlsx-db.js); every other sheet stays.
   - Merge: a row changed on one side since the base wins; changed on both sides: the later change wins. A sync never
     deletes because a row is missing (a row deleted in Excel, a damaged file); only a deletion made in an app (a
     tombstone, PF_Deleted) removes a row that was not changed after it. A copy of the phone's data is kept before
     a sync changes anything here.
   - Sync on start, back from the background, a moment after each change, and with Sync now.
   The network work and the storage setting are native (MainActivity, Storage.java: the app password is encrypted with
   the Android Keystore and never comes back to this page). */
'use strict';
(function () {
  const S = PF.sync = {};
  const N = window.PFNative || null;
  const X = PF.xls;

  /* ---------- state = what the file holds: settings, tables, tombstones (fields that have a column) ---------- */
  const FIELDS = {};
  for (const [sh, t] of Object.entries(X.TABLE)) FIELDS[t] = X.COLS[sh].filter(c => !X.HELPER.includes(c) && c !== 'at');
  const SETTINGS = ['sessions', 'minutes', 'days', 'eq', 'skip', 'theme'];
  const pickRow = (t, r) => { const o = { id: r.id, at: r.at || '' }; for (const c of FIELDS[t]) o[c] = r[c] == null ? null : r[c]; return o; };
  S.local = (db = PF.db) => {
    const st = { settings: {}, deleted: (db.deleted || []).map(d => ({ table: d.table, id: d.id, at: d.at || '' })) };
    for (const k of SETTINGS.concat(['at'])) st.settings[k] = PF.clone(db.settings[k] ?? null);
    for (const t of PF.TABLES) st[t] = db[t].map(r => pickRow(t, r));
    return st;
  };
  /** parsed workbook (X.parse) → state; rows typed in Excel without id get one, without time get now */
  S.remote = data => {
    const now = PF.now(); const st = { settings: {}, deleted: [] };
    if (data.settings) { const s = X.settingsFrom(data.settings, PF.db.settings); for (const k of SETTINGS.concat(['at'])) if (s[k] !== undefined) st.settings[k] = s[k]; if ('eq' in st.settings && !Object.keys(data.settings).some(k => /_kg$|bands|bar|band|bench|gripper|roller/.test(k))) delete st.settings.eq; }
    for (const [sh, t] of Object.entries(X.TABLE)) st[t] = (data.tables[sh] || []).map(r => { if (!r.id) r.id = PF.uid(t[0]); if (!r.at) r.at = now; return pickRow(t, r); });
    st.deleted = (data.tables.Deleted || []).filter(d => d.table && d.id).map(d => ({ table: d.table, id: d.id, at: d.at || now }));
    return st;
  };
  const N_ = X.norm;
  const sameRow = (t, a, b) => !!a && !!b && FIELDS[t].every(c => N_(a[c]) === N_(b[c]));
  const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const later = (a, b) => (a || '') > (b || '') ? a : b;

  /** three-way merge of states; base null = first sync of this file (nothing counts as deleted) */
  S.merge = (base, L, R) => {
    base = base || {}; const now = PF.now(); const out = { settings: {}, deleted: [] };
    const tomb = new Map();
    for (const d of (L.deleted || []).concat(R.deleted || [])) { const k = d.table + '|' + d.id; if (!tomb.has(k) || tomb.get(k).at < d.at) tomb.set(k, { table: d.table, id: d.id, at: d.at }); }
    out.deleted = [...tomb.values()];
    for (const t of PF.TABLES) {
      const map = l => { const m = new Map(); (l || []).forEach(r => { if (r && r.id && !m.has(r.id)) m.set(r.id, r); }); return m; };
      const B = map(base[t]), Lm = map(L[t]), Rm = map(R[t]);
      const ids = [...new Set([...Lm.keys(), ...Rm.keys()])]; const list = [];
      for (const id of ids) {
        const l = Lm.get(id), r = Rm.get(id), b = B.get(id); let o;
        if (l && r) {
          const lc = !sameRow(t, l, b), rc = !sameRow(t, r, b);
          if (sameRow(t, l, r)) o = (r.at || '') > (l.at || '') ? r : l;
          else if (!rc) o = l;
          else if (!lc) o = Object.assign({}, r, { at: (r.at || '') > (l.at || '') ? r.at : now });     // edited elsewhere (Excel keeps the old time)
          else o = (r.at || '') > (l.at || '') ? r : l;                                                 // both changed: the later change
        } else o = l || r;                                                                              // never deleted because it is missing
        const d = tomb.get(t + '|' + id);
        if (d && d.at >= (o.at || '')) continue;
        list.push(o);
      }
      out[t] = list;
    }
    const bs = base.settings || {}, ls = L.settings || {}, rs = R.settings || {};
    for (const k of SETTINGS) {
      if (!(k in rs)) { out.settings[k] = ls[k]; continue; }
      out.settings[k] = !sameVal(ls[k], bs[k]) || sameVal(rs[k], bs[k]) ? ls[k] : rs[k];
    }
    out.settings.at = later(ls.at, rs.at) || '';
    return out;
  };
  const key = st => JSON.stringify([SETTINGS.map(k => st.settings[k] ?? null), PF.TABLES.map(t => (st[t] || []).map(r => [r.id].concat(FIELDS[t].map(c => N_(r[c])))).sort()),
    (st.deleted || []).map(d => d.table + '|' + d.id + '|' + d.at).sort()]);
  S.same = (a, b) => key(a) === key(b);

  /** puts a merged state into PF.db: only rows that differ change; fields without a column are kept */
  S.applyLocal = st => {
    if (S.same(st, S.local())) return false;
    for (const t of PF.TABLES) {
      const have = new Map(PF.db[t].map(r => [r.id, r]));
      PF.db[t] = st[t].map(r => { const h = have.get(r.id); if (h && sameRow(t, h, r) && h.at === r.at) return h; return Object.assign(h || {}, r); });
    }
    PF.db.deleted = st.deleted.map(d => Object.assign({}, d));
    for (const k of SETTINGS) if (st.settings[k] !== undefined && st.settings[k] !== null) PF.db.settings[k] = PF.clone(st.settings[k]);
    if (st.settings.at) PF.db.settings.at = st.settings.at;
    PF.normalize(PF.db);
    return true;
  };

  /* ---------- storage setting (native, never in db.json or the file) ---------- */
  S.storage = () => { try { return N && N.storageGet ? JSON.parse(N.storageGet()) : { mode: 'local' }; } catch (e) { return { mode: 'local' }; } };
  S.target = st => [st.url, st.user, st.folder, st.file].join('|');
  const meta = () => (PF.db.sync = PF.db.sync && typeof PF.db.sync === 'object' ? PF.db.sync : {});
  S.enabled = () => !!(N && N.ncDownload) && S.storage().mode === 'nextcloud';

  /* ---------- native calls ---------- */
  const nc = (op, ...args) => new Promise(res => {
    const id = 'nc' + Math.random().toString(36).slice(2);
    S._cbs = S._cbs || {};
    S._cbs[id] = r => { let d = {}; try { d = JSON.parse(r.data || '{}'); } catch (e) { } res(Object.assign({ status: 0, etag: '', error: r.msg || '' }, d)); };
    if (!S._hooked) {          // chain onto core.js's callback dispatcher
      S._hooked = true; const prev = window.PFNativeCallback;
      window.PFNativeCallback = (cid, r) => { const f = S._cbs[cid]; if (f) { delete S._cbs[cid]; f(r); } else prev && prev(cid, r); };
    }
    N[op](...args, id);
  });
  S.why = r => {
    if (r.status === 0) return /not set up|https/.test(r.error) ? r.error : 'No connection (offline?). It syncs again when the app opens or with Sync now.';
    if (r.status === 401) return 'Nextcloud refused the login: check the user name and the app password.';
    if (r.status === 403) return 'No right to write in that folder.';
    if (r.status === 404) return 'Address or folder not found: check the address.';
    if (r.status === 507) return 'Nextcloud is full.';
    return `Nextcloud answered ${r.status}${r.error ? ' (' + r.error + ')' : ''}.`;
  };
  S.status = () => { const m = meta(); return m.last ? `Last sync ${new Date(m.last).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '.')}${m.msg ? ' · ' + m.msg : ''}` : (m.msg || 'Not synced yet.'); };
  const quietSave = () => { S.quiet = true; PF.save(true); S.quiet = false; };
  const setMsg = (msg, ok) => {
    const m = meta(); m.msg = msg; if (ok) m.last = new Date().toISOString();
    quietSave();
    const el = document.getElementById('syncStatus'); if (el) el.textContent = S.status();
  };

  /* ---------- one sync ---------- */
  S.run = async () => {
    if (!S.enabled() || PF.readOnly) return { ok: false };
    if (S.busy) { S.again = true; return { ok: false, busy: true }; }
    S.busy = true;
    const el = document.getElementById('syncStatus'); if (el) el.textContent = 'Syncing …';
    let res = { ok: false };
    try {
      const st = S.storage(), m = meta();
      if (m.target !== S.target(st)) { m.target = S.target(st); m.base = null; }   // another file: no common base yet
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        PF.flush();
        const d = await nc('ncDownload');
        if (d.status !== 200 && d.status !== 404) { setMsg(S.why(d)); res = { ok: false, status: d.status }; done = true; break; }
        const bytes = d.status === 200 ? PF.b64.toBytes(d.b64) : null;
        let data = null;
        if (bytes) {
          try { data = X.parse(bytes); }
          catch (e) {
            if (/not an SR Physical Fitness/.test(e.message)) { setMsg('That file belongs to another app. Nothing was changed.'); done = true; break; }
            data = { tables: {}, settings: null, missing: true };      // a workbook without our sheets yet (another app's database.xlsx)
          }
          if (data.newer) { setMsg('The file on Nextcloud comes from a newer SR Physical Fitness: update the app. Nothing was changed.'); done = true; break; }
        }
        const rem = data ? S.remote(data) : null;
        const out = rem ? S.merge(m.base, S.local(), rem) : S.local();
        if (!S.same(out, S.local())) { PF.flush(); PF.backupDb(`db-before-sync-${PF.todayIso()}-${Date.now()}.json`); }
        const changedHere = S.applyLocal(out); quietSave();
        if (changedHere) S.refresh();
        if (!rem || data.missing || !data.full || !S.same(out, rem)) {
          const up = new Uint8Array(X.build(PF.db, bytes));
          const u = await nc('ncUpload', PF.b64.fromBytes(up), d.status === 200 ? d.etag : '');
          if (u.status === 412) continue;                         // written elsewhere meanwhile: again from the top
          if (!(u.status >= 200 && u.status < 300)) { setMsg(S.why(u)); res = { ok: false, status: u.status }; done = true; break; }
        }
        m.base = S.local();
        setMsg(`${PF.db.sets.length} sets, ${PF.db.activities.length} activities in ${st.file}`, true);
        res = { ok: true, changed: changedHere }; done = true;
      }
      if (!done) setMsg('The file kept changing on Nextcloud (3 tries). It syncs again later.');
    } catch (e) { console.error(e); setMsg('Not synced: ' + e.message); }
    finally { S.busy = false; if (S.again) { S.again = false; S.soon(); } }
    return res;
  };
  S.soon = PF.debounce(() => S.run(), 2500);
  S.refresh = () => { if (!PF._sheet && PF.rerender) PF.rerender(); };
  S.storageChanged = () => { if (/^#setup/.test(location.hash) && !PF._sheet) PF.rerender(); S.run(); };

  // a moment after each change the user makes (PF.save), sync; the sync's own saves are quiet
  const save = PF.save;
  PF.save = now => { save(now); if (!S.quiet && S.enabled()) S.soon(); };

  // on open (start, and back from the background after a minute): ask linked apps for a newer setting, then sync
  S.open = () => {
    if (!N || !N.storageRefresh) return;
    try { N.storageRefresh(); } catch (e) { }
    S.lastOpen = Date.now();
    S.run();
  };
  if (N && N.storageRefresh) setTimeout(S.open, 800);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && N && Date.now() - (S.lastOpen || 0) > 60000) S.open(); });

  /* ---------- Setup › Where your data lives ---------- */
  const LABEL = { 'at.rangebook.app': 'SR Shooting', 'at.stoicranger.gunsafe': 'SR Gun Safe', 'at.stoicranger.dailythoughts': 'SR Daily Thoughts', 'at.stoicranger.fieldkit': 'SR Field Kit' };
  S.section = () => {
    const esc = PF.esc;
    if (!N || !N.storageGet) return `<div class="card stack"><h3>Where your data lives</h3><div class="small muted">On this device. Nextcloud sync works in the Android app; here, use the Excel file below.</div></div>`;
    const st = S.storage(), nc = st.mode === 'nextcloud' || PF.ui.stOpen;
    const peers = (st.peers || []).filter(p => p.installed);
    return `<div class="card stack"><h3>Where your data lives</h3>
      <div class="seg" role="group" aria-label="Where your data lives"><button type="button" data-stmode="local" class="${nc ? '' : 'on'}">This phone only</button><button type="button" data-stmode="nextcloud" class="${nc ? 'on' : ''}">Synced to Nextcloud</button></div>
      <div class="small muted">${nc ? 'On this phone, synced to your Nextcloud: works offline, syncs when the app opens, after each change and with Sync now. Before each upload the old file is copied to the backups folder (newest 30 kept). Changes made elsewhere (PC, Excel, another phone) are merged, never overwritten.' : 'Your data lives only on this phone (the default).'}</div>
      ${nc ? `<div class="field"><label for="stUrl">Nextcloud address</label><input class="inp" id="stUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://cloud.example.com" value="${esc(st.url || '')}"></div>
      <div class="field"><label for="stUser">User name</label><input class="inp" id="stUser" autocomplete="off" autocapitalize="off" value="${esc(st.user || '')}"></div>
      <div class="field"><label for="stPw">App password</label><input class="inp" id="stPw" type="password" autocomplete="off" placeholder="${st.hasPassword ? 'stored on this phone · type only to change it' : 'Nextcloud › Settings › Security › new app password'}"></div>
      <div class="field"><label for="stFolder">Folder</label><input class="inp" id="stFolder" autocomplete="off" value="${esc(st.folder || '/Stoic Ranger/')}"></div>
      <div class="field"><label for="stFile">File</label><input class="inp" id="stFile" autocomplete="off" value="${esc(st.file || 'fitness.xlsx')}"></div>
      <div class="small muted">The app password is stored encrypted on this phone only (Android Keystore), never in a file or a backup. Physical Fitness writes only its own sheets (PF_…); other sheets in the file stay as they are.</div>
      <div class="row wrap"><button type="button" class="btn primary" data-stsave="1">Save and sync</button>${st.url && st.mode === 'nextcloud' ? '<button type="button" class="btn" data-stsync="1">Sync now</button>' : ''}</div>
      <div class="small" id="syncStatus">${esc(S.status())}</div>` : ''}
      <h3 style="margin-top:6px">Linked Stoic Ranger apps</h3>
      <div class="small muted">Linked apps share one database file (database.xlsx) and this setting: switching here switches them too. Only apps you tick, and only Stoic Ranger apps.</div>
      ${peers.length ? peers.map(p => `<div class="toggle"><span>${esc(LABEL[p.pkg] || p.name || p.pkg)}</span>${PF.w.sw(p.linked, 'link="' + esc(p.pkg) + '" data-x', LABEL[p.pkg] || p.pkg)}</div>`).join('') : '<div class="small muted">No other Stoic Ranger app is installed.</div>'}</div>`;
  };
  const form = () => { const v = id => (document.getElementById(id) || {}).value || ''; return { url: v('stUrl').trim(), user: v('stUser').trim(), folder: v('stFolder').trim(), file: v('stFile').trim() }; };
  const store = (o, pw) => { const r = JSON.parse(N.storageSet(JSON.stringify(o), pw || '')); if (r.error) PF.toast('Not saved: ' + r.error, true); return r; };
  PF.on.stmode = mode => {
    if (!N || !N.storageSet) return;
    const st = S.storage();
    if (mode === 'local') {
      PF.ui.stOpen = false;
      if (st.mode !== 'local') { store(Object.assign({ url: st.url, user: st.user, folder: st.folder, file: st.file }, { mode: 'local' })); PF.toast('Only on this phone now. Everything stays here; nothing was deleted on Nextcloud.'); }
    } else PF.ui.stOpen = true;                              // the fields first; the sync starts with "Save and sync"
    PF.rerender();
  };
  PF.on.stsave = async () => {
    if (!PF.guard()) return;
    const o = Object.assign(form(), { mode: 'nextcloud' }), pw = (document.getElementById('stPw') || {}).value || '';
    if (!/^https:\/\/[^/\s]+/.test(o.url)) return PF.toast('The address must start with https://', true);
    if (!o.user) return PF.toast('Type your Nextcloud user name.', true);
    if (!pw && !S.storage().hasPassword) return PF.toast('Type an app password (Nextcloud › Settings › Security).', true);
    if (store(o, pw).error) return;
    PF.ui.stOpen = false;
    const r = await S.run();
    PF.rerender();
    PF.toast(r.ok ? 'Synced with Nextcloud.' : 'Saved. ' + (meta().msg || ''), !r.ok);
  };
  PF.on.stsync = async () => { const r = await S.run(); PF.toast(r.ok ? 'Synced with Nextcloud.' : (r.busy ? 'A sync is running.' : meta().msg || 'Not synced.'), !r.ok && !r.busy); };
  PF.on.link = (pkg, el, e) => {
    if (!N || !N.linkSet) return;
    const st = S.storage(); const p = (st.peers || []).find(x => x.pkg === pkg); const on = !(p && p.linked);
    N.linkSet(pkg, on);
    PF.toast(on ? `Linked with ${LABEL[pkg] || pkg}: it gets this storage setting.` : 'Link removed. Nothing was deleted.');
    PF.rerender();
  };
})();
