/* SR GunSafe — storage: only on this phone, or on this phone and synced to the user's Nextcloud
   (shared contract 00_docs/SHARED-DB-CONTRACT.md, sections B and C).

   The phone always keeps its own copy (db.json) and works offline. With Nextcloud on, the app syncs when it opens,
   a few seconds after each change, and with "Sync now":
     1. download the file (ETag). Not there yet → upload ours (only if it still does not exist).
     2. read its GS_ sheets, three-way merge with the app (base = state of the last sync), save on the phone.
     3. back up the downloaded file to <folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx (newest 30 kept), then upload with
        If-Match: ETag. 412 = someone else saved meanwhile → start again (max 3 times).
   Linked apps share one file (database.xlsx) and one storage setting: switching here pushes the setting to the
   linked apps (their link providers); on start the app adopts a newer setting from them.
   The app password is handed to the native side once and never comes back to the page. */
'use strict';
window.GSSync = (() => {
  const N = window.GSNative || null;
  const cbs = {}; let cbN = 0;
  window.GSNativeCallback = (id, o) => { const f = cbs[id]; delete cbs[id]; if (f) f(o || {}); };
  const native = (fn, ...args) => new Promise(res => { const id = 'c' + (++cbN); cbs[id] = res; N[fn](...args, id); });
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const SR_PKG = 'at.rangebook.app';
  let busy = false, timer = null, last = { at: '', ok: true, msg: '' };
  const listeners = [];
  const tell = () => listeners.forEach(f => { try { f(state()); } catch (e) { } });

  /* ---------- the setting ---------- */
  function setting() {
    let s = null;
    if (N && N.storageGet) { try { s = JSON.parse(N.storageGet()); } catch (e) { s = null; } }
    else s = GSStore.aux('storage-web');
    return Object.assign({ mode: 'local', url: '', user: '', folder: '/Stoic Ranger/', file: '', changed: '', pwSet: false }, s || {});
  }
  const linkedPkgs = () => (GSModel.linked() ? [SR_PKG] : []).join(',');
  /** Which file: the shared database.xlsx when linked with SR Shooting, else gunsafe.xlsx. */
  const fileName = () => GSModel.linked() ? 'database.xlsx' : 'gunsafe.xlsx';
  const on = () => { const s = setting(); return s.mode === 'nextcloud' && s.url && s.user && s.pwSet; };

  /** Saves a new setting (from Settings › Storage) and pushes it to the linked apps. password only when typed. */
  function save(patch) {
    const cur = setting();
    const next = Object.assign({}, cur, patch, { file: fileName() });
    delete next.pwSet; delete next.changed; delete next.adopted;
    let out;
    if (N && N.storageSet) out = JSON.parse(N.storageSet(JSON.stringify(next)));
    else { next.changed = new Date().toISOString(); next.pwSet = cur.pwSet || !!next.password; delete next.password; GSStore.aux('storage-web', next); out = next; }
    if (N && N.storagePush && linkedPkgs()) { try { N.storagePush(linkedPkgs()); } catch (e) { } }
    if (out.mode === 'local') { last = { at: '', ok: true, msg: '' }; GSStore.aux('sync-base', null); }
    tell();
    return out;
  }
  /** On start: take a newer setting from the linked apps (one database, one setting for all linked apps). */
  function pull() {
    if (!(N && N.storagePull) || !linkedPkgs()) return setting();
    try { const s = JSON.parse(N.storagePull(linkedPkgs())); if (s.adopted) tell(); return s; } catch (e) { return setting(); }
  }

  /* ---------- sync ---------- */
  const folderOf = s => (s.folder || '/Stoic Ranger/').replace(/^\/+/, '').replace(/\/?$/, '/');
  async function backupRemote(s, bytes) {
    const folder = folderOf(s) + 'backups/', name = fileName().replace(/\.xlsx$/, '') + '-' + GSStore.stamp().replace('T', '-').slice(0, 15) + '.xlsx';
    await native('nc', 'mkdirs', folder, '', '');
    const r = await native('nc', 'putNew', folder + name, b64(bytes), '');
    // keep the newest 30 backups of this file
    const l = await native('nc', 'list', folder, '', '');
    if (l.ok && Array.isArray(l.names)) {
      const mine = l.names.filter(n => n.startsWith(fileName().replace(/\.xlsx$/, '') + '-') && n.endsWith('.xlsx')).sort();
      for (let i = 0; i < mine.length - 30; i++) await native('nc', 'delete', folder + mine[i], '', '');
    }
    return r.ok || r.status === 412;      // 412: the same backup name already exists (same second)
  }
  /** One sync. Returns {ok, msg, added, changed}. */
  async function sync(why) {
    if (!N || !N.nc) return { ok: false, msg: 'Nextcloud sync works in the Android app.' };
    if (!on()) return { ok: false, msg: 'Nextcloud is not set up.' };
    if (GSStore.readOnly) return { ok: false, msg: 'The data is read-only (saved by a newer version): nothing is synced.' };
    if (busy) return { ok: false, msg: 'A sync is already running.' };
    busy = true; tell();
    const s = setting(), path = folderOf(s) + fileName();
    let res = { ok: false, msg: '' };
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const g = await native('nc', 'get', path, '', '');
        if (g.status === 404) {
          const mk = await native('nc', 'mkdirs', folderOf(s), '', '');
          if (!mk.ok) { res = { ok: false, msg: mk.msg || 'Could not make the folder on Nextcloud' }; break; }
          const bytes = GSX.write(GSStore.data, null, 'SR GunSafe');
          const p = await native('nc', 'putNew', path, b64(bytes), '');
          if (p.status === 412) continue;                       // someone made it meanwhile: start again
          if (!p.ok) { res = { ok: false, msg: p.msg }; break; }
          GSStore.aux('sync-base', GSX.tablesOf(GSStore.data));
          res = { ok: true, msg: 'Uploaded ' + fileName() + ' to Nextcloud', added: 0, changed: 0 }; break;
        }
        if (!g.ok) { res = { ok: false, msg: g.msg || ('Nextcloud answered ' + g.status) }; break; }
        const remote = unb64(g.data || '');
        let file = null;
        try { file = GSX.read(remote).data; } catch (e) { res = { ok: false, msg: 'The file on Nextcloud is not a readable xlsx; it was left unchanged.' }; break; }
        const base = GSStore.aux('sync-base');
        let added = 0, changed = 0;
        if (file) {
          if (!base) GSStore.backup('before-first-sync-' + GSStore.stamp() + '.json');
          const m = GSX.merge(base, GSX.tablesOf(GSStore.data), file, GSStore.data.deleted);
          added = m.added; changed = m.changed;
          if (added || changed) { const d = GSStore.data; GSX.TABLES.forEach(t => { d[t] = m.data[t]; }); GSStore.changed('sync'); GSStore.flush(); }
        }
        const bytes = GSX.write(GSStore.data, remote, 'SR GunSafe');
        const sameAsRemote = file && JSON.stringify(GSX.tablesOf(file)) === JSON.stringify(GSX.tablesOf(GSStore.data));
        if (!sameAsRemote) {
          if (!(await backupRemote(s, remote))) { res = { ok: false, msg: 'Could not save the backup copy on Nextcloud, so nothing was uploaded.' }; break; }
          const p = await native('nc', 'put', path, b64(bytes), g.etag || '');
          if (p.status === 412) continue;                       // changed meanwhile: download and merge again
          if (!p.ok) { res = { ok: false, msg: p.msg }; break; }
        }
        GSStore.aux('sync-base', GSX.tablesOf(GSStore.data));
        res = { ok: true, msg: added || changed ? `Synced: ${added} new and ${changed} changed from Nextcloud` : 'Synced', added, changed }; break;
      }
      if (!res.msg) res = { ok: false, msg: 'The file kept changing on Nextcloud; try again in a moment.' };
    } catch (e) { res = { ok: false, msg: String(e && e.message || e) }; }
    busy = false;
    last = { at: new Date().toISOString(), ok: res.ok, msg: res.msg };
    GSStore.aux('sync-last', last);
    tell();
    return res;
  }
  /** After a change: sync a few seconds later (several quick changes → one sync). */
  function soon() { if (!on()) return; clearTimeout(timer); timer = setTimeout(() => sync('change'), 4000); }
  /** Connection test: list the folder (makes it if missing). */
  async function test() {
    if (!N || !N.nc) return { ok: false, msg: 'Nextcloud sync works in the Android app.' };
    const s = setting();
    const mk = await native('nc', 'mkdirs', folderOf(s), '', '');
    if (!mk.ok) return { ok: false, msg: mk.msg || 'No connection' };
    const l = await native('nc', 'list', folderOf(s), '', '');
    return l.ok ? { ok: true, msg: 'Connection works. ' + (l.names && l.names.includes(fileName()) ? fileName() + ' is there.' : fileName() + ' will be created at the first sync.') } : { ok: false, msg: l.msg };
  }
  function state() { const s = setting(); return { setting: s, on: on(), busy, last: last.at ? last : (GSStore.aux('sync-last') || last), file: fileName(), native: !!(N && N.nc) }; }
  GSStore.onChange(why => { if (why !== 'sync' && why !== 'replace' && why !== 'link') soon(); });
  return { setting, save, pull, sync, soon, test, state, fileName, onState(f) { listeners.push(f); }, b64, unb64, native };
})();
