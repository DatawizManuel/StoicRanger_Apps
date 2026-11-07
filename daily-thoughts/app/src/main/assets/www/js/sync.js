/* Stoic Ranger - Daily Thoughts — the shared Excel file and Nextcloud sync (0.3.0, shared contract v1,
   00_docs/SHARED-DB-CONTRACT.md).
   Workbook: Daily Thoughts writes only its own sheets and keeps every other sheet as it is, hidden ones included:
   - DT_Favourites: Quote ID | Author | Quote | Saved at | Note (one row per favourite; editable in Excel)
   - _DT_Data (hidden): the settings and the deletions made in the app, as JSON in column A (chunks of 30000 characters)
   Linked apps share database.xlsx; Daily Thoughts on its own uses dailythoughts.xlsx with the same layout.
   Merge (three-way against the last synced state, the base):
   - a favourite on either side is kept: a sync never deletes because something is missing (a row deleted in Excel,
     a damaged file); only a deletion made in the app (a tombstone with its time, kept in _DT_Data so every phone
     learns of it) removes a favourite that was saved before that time. Saving it again later brings it back.
   - notes and settings: the side that changed since the base wins; if only the other side changed, it wins.
   Android: the network work is native (Nextcloud refuses WebDAV from a web page), DTNative.ncDownload/ncUpload; upload
   with If-Match on the ETag, on 412 download, merge and try again (3 tries); a backup copy before each upload.
   iPhone / web: no direct sync (cross-origin WebDAV is blocked); "Update an Excel file" merges with a chosen xlsx. */
'use strict';
(() => {
const S = DT.sync = {};
const N = window.DTNative || null;
S.FAV = 'DT_Favourites'; S.DATA = '_DT_Data';
S.HEAD = ['Quote ID', 'Author', 'Quote', 'Saved at', 'Note'];
const CHUNK = 30000;

S.lib = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = 'lib/xlsx.mini.min.js';
  s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Excel library missing')); document.head.appendChild(s);
});

/* ---------- reading the workbook ---------- */
const str = v => v == null ? '' : String(v).trim();
const excelTime = v => {          // Excel turns an ISO text into a date number when someone edits the cell
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString();
  return str(v);
};
/** {exists, schema, favs:[{id,at,note}], settings, tomb} of a workbook (null = no file yet). */
S.parse = (X, wb) => {
  const r = { exists: !!wb, hasFav: false, hasData: false, schema: 0, favs: [], settings: {}, tomb: {} };
  if (!wb) return r;
  const ws = wb.Sheets[S.FAV];
  if (ws) {
    r.hasFav = true;
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const head = (rows[0] || []).map(h => str(h).toLowerCase());
    const col = n => head.indexOf(n.toLowerCase());
    const ci = col('Quote ID'), ca = col('Saved at'), cn = col('Note');
    const seen = new Set();
    for (const row of rows.slice(1)) {
      const id = str(row[ci < 0 ? 0 : ci]);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      r.favs.push({ id, at: ca < 0 ? '' : excelTime(row[ca]), note: cn < 0 ? '' : str(row[cn]) });
    }
  }
  const wd = wb.Sheets[S.DATA];
  if (wd) {
    const rows = X.utils.sheet_to_json(wd, { header: 1, raw: true, defval: '' });
    const txt = rows.slice(1).map(x => str(x[0])).join('');
    try {
      const j = JSON.parse(txt);
      r.hasData = true;
      r.schema = +j.schema || 1;
      if (j.settings && typeof j.settings === 'object') r.settings = j.settings;
      if (j.tomb && typeof j.tomb === 'object') r.tomb = j.tomb;
      if (!ws && Array.isArray(j.favs)) r.favs = j.favs.filter(f => f && f.id).map(f => ({ id: f.id, at: f.at || '', note: f.note || '' }));
    } catch (e) { /* damaged: rewritten from the merge, the favourites come from DT_Favourites */ }
  }
  return r;
};

/* ---------- merge ---------- */
const favMap = list => { const m = {}; (list || []).forEach(f => { if (f && f.id && !m[f.id]) m[f.id] = f; }); return m; };
const later = (a, b) => (a || '') > (b || '') ? a : b;
const pick = (l, b, r) => (l !== undefined && l !== b) ? l : (r !== undefined ? r : l);
/** base/local/remote: {favs:[{id,at,note}], settings, tomb}. Returns the merged state. */
S.merge = (base, local, remote) => {
  base = base || {}; const B = favMap(base.favs), L = favMap(local.favs), R = favMap(remote.favs);
  const tomb = Object.assign({}, remote.tomb || {});
  for (const [id, t] of Object.entries(local.tomb || {})) tomb[id] = later(tomb[id], t);
  const ids = [...new Set([...(local.favs || []).map(f => f.id), ...(remote.favs || []).map(f => f.id)])];
  const favs = [];
  for (const id of ids) {
    const l = L[id], r = R[id], b = B[id];
    const at = (l && l.at) || (r && r.at) || '';
    const savedAt = later(l && l.at, r && r.at) || '';
    if (tomb[id] && tomb[id] >= savedAt) continue;           // deleted in an app after it was saved
    const note = l && r ? pick(l.note || '', b ? b.note || '' : '', r.note || '') : ((l || r).note || '');
    favs.push({ id, at, note });
  }
  // tombstones of favourites that are back (saved again later) are dropped
  for (const f of favs) if (tomb[f.id]) delete tomb[f.id];
  const settings = {}, bs = base.settings || {}, ls = local.settings || {}, rs = remote.settings || {};
  for (const k of new Set([...Object.keys(ls), ...Object.keys(rs)])) settings[k] = pick(ls[k], bs[k], rs[k]);
  return { favs, settings, tomb };
};
const key = st => JSON.stringify({ f: st.favs.map(f => [f.id, f.at || '', f.note || '']).sort(), s: Object.keys(st.settings || {}).sort().map(k => [k, st.settings[k]]), t: Object.keys(st.tomb || {}).sort().map(k => [k, st.tomb[k]]) });
S.same = (a, b) => key(a) === key(b);

S.local = () => ({
  favs: DT.db.favs.map(f => ({ id: f.id, at: f.at || '', note: f.note || '' })),
  settings: Object.assign({}, DT.db.settings), tomb: Object.assign({}, DT.db.tomb || {}),
});
/** Puts a merged state into DT.db: changes only what differs, keeps unknown fields of each favourite. */
S.applyLocal = out => {
  if (S.same(out, S.local())) return false;
  const have = favMap(DT.db.favs);
  DT.db.favs = out.favs.map(f => Object.assign(have[f.id] || {}, { id: f.id, at: f.at, note: f.note }));
  DT.db.favs.forEach(f => { if (!f.note) delete f.note; });
  Object.assign(DT.db.settings, out.settings);
  DT.db.tomb = out.tomb;
  return true;
};

/* ---------- writing the workbook: own sheets replaced, every other sheet kept ---------- */
S.build = (X, wb, st) => {
  wb = wb || X.utils.book_new();
  const rows = [S.HEAD].concat(st.favs.map(f => {
    const q = DT.quote(f.id), a = q && DT.author(q.a);
    return [f.id, a ? a.name : '', q ? DT.quoteText(q) : '', f.at || '', f.note || ''];
  }));
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 80 }, { wch: 25 }, { wch: 40 }];
  const json = JSON.stringify({ app: DT.APP_ID, schema: DT.SCHEMA, updated: new Date().toISOString(), version: DT.VERSION, settings: st.settings, tomb: st.tomb });
  const data = [['Daily Thoughts data (JSON, written by the app; do not edit)']];
  for (let i = 0; i < json.length; i += CHUNK) data.push([json.slice(i, i + CHUNK)]);
  const wd = X.utils.aoa_to_sheet(data);
  const put = (name, sheet) => { if (wb.SheetNames.includes(name)) wb.Sheets[name] = sheet; else X.utils.book_append_sheet(wb, sheet, name); };
  put(S.FAV, ws); put(S.DATA, wd);
  wb.Workbook = wb.Workbook || {};
  const old = wb.Workbook.Sheets || [];
  wb.Workbook.Sheets = wb.SheetNames.map((n, i) => Object.assign({}, old.find(s => s && s.name === n) || old[i] || {}, { name: n }));
  wb.Workbook.Sheets.forEach(s => { if (s.name === S.DATA) s.Hidden = 1; else if (s.name === S.FAV) s.Hidden = 0; });
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx', compression: true }));
};
S.read = (X, bytes) => X.read(bytes, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true });

/* ---------- storage setting (Android: native, never in db.json or the xlsx) ---------- */
S.storage = () => { try { return N && N.storageGet ? JSON.parse(N.storageGet()) : { mode: 'local' }; } catch (e) { return { mode: 'local' }; } };
S.target = st => [st.url, st.user, st.folder, st.file].join('|');
const meta = () => (DT.db.sync = DT.db.sync && typeof DT.db.sync === 'object' ? DT.db.sync : {});

/* ---------- Nextcloud sync (Android) ---------- */
const nc = (op, ...args) => new Promise(res => {
  const id = 'nc' + Math.random().toString(36).slice(2);
  const prev = window.DTNativeCallback;
  S._cbs = S._cbs || {};
  S._cbs[id] = r => { let d = {}; try { d = JSON.parse(r.data || '{}'); } catch (e) { } res(Object.assign({ status: 0, etag: '', error: r.msg || '' }, d)); };
  if (!S._hooked) {          // chain onto core.js's callback dispatcher
    S._hooked = true;
    window.DTNativeCallback = (cid, r) => { const f = S._cbs[cid]; if (f) { delete S._cbs[cid]; f(r); } else prev && prev(cid, r); };
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
const setMsg = (msg, ok) => {
  const m = meta(); m.msg = msg; if (ok) m.last = new Date().toISOString();
  S.quiet = true; DT.save(true); S.quiet = false;
  const el = document.getElementById('syncStatus'); if (el) el.textContent = S.status();
};
S.enabled = () => !!(N && N.ncDownload) && S.storage().mode === 'nextcloud';

S.run = async (why = '') => {
  if (!S.enabled() || DT.readOnly) return { ok: false };
  if (S.busy) { S.again = true; return { ok: false, busy: true }; }
  S.busy = true;
  const el = document.getElementById('syncStatus'); if (el) el.textContent = 'Syncing …';
  let res = { ok: false };
  try {
    const X = await S.lib();
    const st = S.storage(), m = meta();
    if (m.target !== S.target(st)) { m.target = S.target(st); m.base = null; }   // another file: no common base yet
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      DT.flush();
      const d = await nc('ncDownload');
      if (d.status !== 200 && d.status !== 404) { setMsg(S.why(d)); res = { ok: false, status: d.status }; done = true; break; }
      const wb = d.status === 200 ? S.read(X, DT.b64.toBytes(d.b64)) : null;
      const rem = S.parse(X, wb);
      if (rem.schema > DT.SCHEMA) { setMsg(`The file on Nextcloud comes from a newer Daily Thoughts (data format ${rem.schema}): update the app. Nothing was changed.`); done = true; break; }
      const out = S.merge(m.base, S.local(), rem);
      S.quiet = true; const changedHere = S.applyLocal(out); DT.save(true); S.quiet = false;
      if (changedHere) S.refresh();
      if (!rem.exists || !rem.hasFav || !rem.hasData || !S.same(out, rem)) {
        const bytes = S.build(X, wb, out);
        const u = await nc('ncUpload', DT.b64.fromBytes(bytes), d.status === 200 ? d.etag : '');
        if (u.status === 412) continue;                         // written elsewhere meanwhile: again from the top
        if (!(u.status >= 200 && u.status < 300)) { setMsg(S.why(u)); res = { ok: false, status: u.status }; done = true; break; }
      }
      m.base = out;
      setMsg(`${out.favs.length} favourites in ${st.file}`, true);
      res = { ok: true, favs: out.favs.length }; done = true;
    }
    if (!done) setMsg('The file kept changing on Nextcloud (3 tries). It syncs again later.');
  } catch (e) { console.error(e); setMsg('Not synced: ' + e.message); }
  finally {
    S.busy = false;
    if (S.again) { S.again = false; S.soon(); }
  }
  return res;
};
S.soon = DT.debounce(() => S.run('change'), 2500);
S.refresh = () => { const h = location.hash; if (/^#\/(favourites|more)|^#\/?$|^#\/today/.test(h) && DT.route && !DT._modal) DT.route(); };
S.storageChanged = () => { if (/^#\/more/.test(location.hash) && !DT._modal) DT.route(); S.run('pushed'); };

// after each change the user makes (DT.save), sync a moment later; the sync's own saves are quiet
const save = DT.save;
DT.save = now => { save(now); if (!S.quiet && S.enabled()) S.soon(); };

// on open (start, and back from the background after a minute) ask the linked apps for a newer setting, then sync
S.open = () => {
  if (!N || !N.storageRefresh) return;
  try { N.storageRefresh(); } catch (e) { }
  S.lastOpen = Date.now();
  S.run('open');
};
if (N && N.storageRefresh) setTimeout(S.open, 600);
document.addEventListener('visibilitychange', () => { if (!document.hidden && N && Date.now() - (S.lastOpen || 0) > 60000) S.open(); });

/* ---------- Excel file by hand (iPhone / web, and Android without Nextcloud) ---------- */
S.fileName = () => (S.storage().file) || 'dailythoughts.xlsx';
S.saveNew = async () => {
  DT.flush();
  const X = await S.lib();
  const bytes = S.build(X, null, S.local());
  return DT.saveFile('dailythoughts.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes);
};
/** Open an xlsx (database.xlsx or dailythoughts.xlsx), merge both ways, save it again with every other sheet kept. */
S.updateFile = async () => {
  if (DT.readOnly) { DT.toast('Read-only: update the app first.', true); return; }
  const f = await DT.openFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream');
  if (!f.ok) return;
  const X = await S.lib();
  let wb; try { wb = S.read(X, f.bytes); } catch (e) { DT.toast('This is not an Excel file.', true); return; }
  const rem = S.parse(X, wb);
  if (rem.schema > DT.SCHEMA) { DT.toast(`This file comes from a newer Daily Thoughts (data format ${rem.schema}). Update the app first.`, true); return; }
  DT.flush(); DT.backupDb(`db-before-xlsx-${Date.now()}.json`);
  const before = DT.db.favs.length, m = meta();
  const out = S.merge(m.fileBase && m.fileBase.name === f.name ? m.fileBase.st : null, S.local(), rem);
  S.applyLocal(out); m.fileBase = { name: f.name, st: out }; DT.save(true);
  const bytes = S.build(X, wb, out);
  const r = await DT.saveFile(f.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes);
  const added = DT.db.favs.length - before;
  DT.toast(`${added > 0 ? added + ' favourites from the file added. ' : ''}${r.ok ? 'Saved: ' + r.msg : (r.msg === 'cancelled' ? 'File not saved.' : 'Not saved: ' + r.msg)}`, !r.ok && r.msg !== 'cancelled');
  DT.route();
};
/* ---------- More › Where your data lives ---------- */
const LABEL = { 'at.rangebook.app': 'SR Shooting', 'at.stoicranger.gunsafe': 'SR Gun Safe', 'at.stoicranger.fitness': 'SR Physical Fitness', 'at.stoicranger.fieldkit': 'SR Field Kit' };
S.section = () => {
  const esc = DT.esc;
  const xlsx = `<p class="note">The favourites (with your notes) as an Excel file: sheet <b>DT_Favourites</b>, plus a hidden sheet for the app. <b>Update an Excel file</b> opens database.xlsx (shared with the other Stoic Ranger apps) or dailythoughts.xlsx, merges both ways (nothing is deleted) and saves it again with every other sheet as it was.</p>
    <div class="stack"><button class="btn" id="xUpd">Update an Excel file</button><button class="btn" id="xNew">Save as a new Excel file</button></div>`;
  if (!N || !N.storageGet) return `<h2>Where your data lives</h2>
    <p class="note">On this iPhone / iPad. A web app cannot sync with Nextcloud directly (Nextcloud blocks it), so use the Excel file: open it from the Nextcloud app (Files › Nextcloud), let Daily Thoughts update it, and save it back there.</p>${xlsx}`;
  const st = S.storage(), nc = st.mode === 'nextcloud';
  const peers = (st.peers || []).filter(p => p.installed);
  return `<h2>Where your data lives</h2>
    <div class="seg" id="stMode"><a href="javascript:void 0" data-mode="local" class="${nc ? '' : 'on'}">This phone only</a><a href="javascript:void 0" data-mode="nextcloud" class="${nc ? 'on' : ''}">Synced to Nextcloud</a></div>
    <p class="note" id="stNote">${nc ? 'On this phone, synced to your Nextcloud: works offline, syncs when the app opens, after each change and with Sync now. A copy of the file goes to the backups folder before each sync (newest 30 kept).' : 'Your favourites live only on this phone (the default).'}</p>
    <div class="form" id="stForm"${nc ? '' : ' hidden'}>
      <label>Nextcloud address<input id="stUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://cloud.example.com" value="${esc(st.url || '')}"></label>
      <label>User name<input id="stUser" autocomplete="off" autocapitalize="off" value="${esc(st.user || '')}"></label>
      <label>App password<input id="stPw" type="password" autocomplete="off" placeholder="${st.hasPassword ? 'stored on this phone · type only to change it' : 'Nextcloud › Settings › Security › Create new app password'}"></label>
      <label>Folder<input id="stFolder" autocomplete="off" value="${esc(st.folder || '/Stoic Ranger/')}"></label>
      <label>File<input id="stFile" autocomplete="off" value="${esc(st.file || 'dailythoughts.xlsx')}"></label>
      <p class="note">The app password is stored encrypted on this phone only (Android Keystore), never in a file or a backup. Linked Stoic Ranger apps share database.xlsx.</p>
      <div class="stack"><button class="btn pri" id="stSave">Save and sync</button>${st.url ? '<button class="btn" id="stSync">Sync now</button>' : ''}</div>
      <div class="status" id="syncStatus">${esc(S.status())}</div>
    </div>
    <h3>Linked Stoic Ranger apps</h3>
    <p class="note">Linked apps share one database file and this setting: switching here switches them too (only apps you tick, and only apps from Stoic Ranger).</p>
    <div class="links">${peers.length ? peers.map(p => `<label><input type="checkbox" data-link="${esc(p.pkg)}"${p.linked ? ' checked' : ''}> ${esc(LABEL[p.pkg] || p.name || p.pkg)}</label>`).join('') : '<p class="note">No other Stoic Ranger app is installed.</p>'}</div>
    <h3>Excel file by hand</h3>${xlsx}`;
};
S.wire = el => {
  const $ = s => el.querySelector(s);
  const x1 = $('#xUpd'), x2 = $('#xNew');
  if (x1) x1.onclick = () => S.updateFile().catch(e => DT.toast(e.message, true));
  if (x2) x2.onclick = async () => { try { const r = await S.saveNew(); if (r.ok) DT.toast('Saved: ' + r.msg); else if (r.msg !== 'cancelled') DT.toast('Not saved: ' + r.msg, true); } catch (e) { DT.toast(e.message, true); } };
  if (!N || !N.storageGet) return;
  const form = () => ({ url: $('#stUrl').value.trim(), user: $('#stUser').value.trim(), folder: $('#stFolder').value.trim(), file: $('#stFile').value.trim() });
  const store = (o, pw) => { const r = JSON.parse(N.storageSet(JSON.stringify(o), pw || '')); if (r.error) DT.toast('Not saved: ' + r.error, true); return r; };
  el.querySelectorAll('[data-mode]').forEach(a => a.onclick = () => {
    const mode = a.dataset.mode, st = S.storage();
    if (mode === st.mode) return;
    if (mode === 'local') {
      store(Object.assign(form(), { mode: 'local' }));
      DT.toast('Only on this phone now. Everything stays here; nothing was deleted on Nextcloud.');
    } else {
      // switched on: the fields first, the sync starts with "Save and sync"
      $('#stForm').hidden = false; el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b === a)); return;
    }
    DT.route();
  });
  const save = $('#stSave');
  if (save) save.onclick = async () => {
    const o = Object.assign(form(), { mode: 'nextcloud' }), pw = $('#stPw').value;
    if (!/^https:\/\/[^/\s]+/.test(o.url)) { DT.toast('The address must start with https://', true); return; }
    if (!o.user) { DT.toast('Type your Nextcloud user name.', true); return; }
    if (!pw && !S.storage().hasPassword) { DT.toast('Type an app password (Nextcloud › Settings › Security).', true); return; }
    if (store(o, pw).error) return;
    $('#stPw').value = '';
    const r = await S.run('settings');
    DT.route();
    DT.toast(r.ok ? `Synced: ${r.favs} favourites.` : 'Saved. ' + (meta().msg || ''), !r.ok);
  };
  const sync = $('#stSync');
  if (sync) sync.onclick = async () => { const r = await S.run('now'); DT.toast(r.ok ? `Synced: ${r.favs} favourites.` : (r.busy ? 'A sync is running.' : meta().msg || 'Not synced.'), !r.ok && !r.busy); };
  el.querySelectorAll('[data-link]').forEach(c => c.onchange = () => {
    N.linkSet(c.dataset.link, c.checked);
    DT.toast(c.checked ? `Linked with ${LABEL[c.dataset.link] || c.dataset.link}: it gets this storage setting.` : 'Link removed. Nothing was deleted.');
    DT.route();
  });
};
})();
