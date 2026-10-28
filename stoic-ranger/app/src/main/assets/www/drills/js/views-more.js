/* Stoic Ranger - Shooting Drills — database, backup / restore, theme, Stoic Ranger apps, about. */
'use strict';
(() => {
const { $, esc } = SD;

const backupName = () => `sr-shooting-drills-backup-${SD.today()}.json`;
const backupText = () => JSON.stringify(SD.db, null, 1);

/** Replace all data with a backup file (the current data is kept as a copy on the phone first). */
/* Stoic Ranger 1.0: restoring and bringing in old backups happens on the home page (one database for all parts). */
SD.restoreBackup = () => { SD.flush(); location.href = '../index.html#/data'; };
SD._oldRestoreBackup = async () => {
  if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
  const f = await SD.openFile('application/json,text/plain,application/octet-stream');
  if (!f.ok) return;
  let j;
  try { j = JSON.parse(new TextDecoder().decode(f.bytes)); } catch (e) { SD.toast('This is not a backup file.', true); return; }
  if (!SD.isOurs(j)) {
    if (j && Array.isArray(j.trainings)) { SD.toast('That is a Training Log backup: use "Import shooters and guns" instead.', true); return; }
    if (j && Array.isArray(j.sheets)) { SD.toast('That is a Gun Database backup: use "Import shooters and guns" instead.', true); return; }
    SD.toast('This is not a Shooting Drills backup.', true); return;
  }
  if (+j.schema > SD.SCHEMA) { SD.toast(`This backup comes from a newer app version (data format ${j.schema}). Update the app first.`, true); return; }
  const m = SD.sheet('Restore backup', `<p>${esc(f.name)}: ${j.results.length} results, ${(j.favs || []).length} favourites, ${(j.shooters || []).length} shooters, ${(j.weapons || []).length} guns.</p>
    <p class="note">This replaces the data on this phone (now ${SD.db.results.length} results). A copy of the current data is saved on the phone first.</p>
    <div class="stack"><button class="btn pri big" id="rGo">Replace data with this backup</button></div>`);
  $('#rGo', m.body).onclick = () => {
    SD.flush(); SD.backupDb(`db-before-restore-${Date.now()}.json`);
    const keep = SD.db.settings;
    SD.db = SD.migrate(j);
    SD.db.settings.theme = keep.theme;
    SD.save(true); m.close(); SD.applyTheme();
    SD.toast(`Backup restored: ${SD.db.results.length} results.`); SD.go('#/home');
  };
};

/** One-off copy of shooters and guns from a Gun Database or Training Log backup file. The databases stay separate;
    the source id is noted on each entry so the apps can be linked later without double entries. */
async function importOther() {
  if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
  const f = await SD.openFile('application/json,text/plain,application/octet-stream');
  if (!f.ok) return;
  let j;
  try { j = JSON.parse(new TextDecoder().decode(f.bytes)); } catch (e) { SD.toast('This is not a backup file.', true); return; }
  const app = j && Array.isArray(j.sheets) && Array.isArray(j.weapons) ? 'gundb' : j && Array.isArray(j.trainings) && Array.isArray(j.weapons) ? 'training-log' : '';
  if (!app) { SD.toast('This is not a Gun Database or Training Log backup.', true); return; }
  const fresh = (t, list) => list.filter(r => !r.example && r.name && !SD.db[t].some(x => (x.source && x.source.app === app && x.source.id === r.id) || x.name.trim().toLowerCase() === r.name.trim().toLowerCase()));
  const sh = fresh('shooters', j.shooters || []), we = fresh('weapons', j.weapons || []);
  const m = SD.sheet('Import shooters and guns', `<p>${esc(f.name)} (${app === 'gundb' ? 'Gun Database' : 'Training Log'})</p>
    <p>New here: <b>${sh.length}</b> shooter${sh.length === 1 ? '' : 's'}${sh.length ? ' (' + esc(sh.map(r => r.name).join(', ')) + ')' : ''}, <b>${we.length}</b> gun${we.length === 1 ? '' : 's'}${we.length ? ' (' + esc(we.map(r => r.name).join(', ')) + ')' : ''}.</p>
    <p class="note">Entries with the same name are skipped. Only shooters and guns are copied; each app keeps its own data.</p>
    <div class="stack"><button class="btn pri big" id="gGo"${sh.length + we.length ? '' : ' disabled'}>Import</button></div>`);
  $('#gGo', m.body).onclick = () => {
    sh.forEach(r => SD.addRecord('shooters', { name: r.name, status: r.status === 'Inactive' ? 'Inactive' : 'Active', notes: r.notes || '', source: { app, id: r.id, uid: r.uid || '' } }));
    we.forEach(r => SD.addRecord('weapons', { name: r.name, type: r.type || '', caliber: r.caliber || '', zeroM: SD.num(r.zeroM), status: ['Sold', 'Retired'].includes(r.status) ? r.status : 'Active', notes: r.notes || '', source: { app, id: r.id, uid: r.uid || '' } }));
    SD.save(true); m.close(); SD.toast(`${sh.length + we.length} entries imported.`); SD.route();
  };
}

SD.views.more = {
  render(el) {
    SD.header('More');
    const s = SD.db.settings, info = SD.appInfo();
    el.innerHTML = `
      <h2>Database</h2>
      <div class="stack"><a class="btn" href="#/db/shooters">Shooters <small class="mono">${SD.db.shooters.length}</small></a><a class="btn" href="#/db/weapons">Guns <small class="mono">${SD.db.weapons.length}</small></a></div>
      ${SR.dataSection()}
      <h2>Appearance</h2>
      <div class="seg">${[['auto', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<a href="javascript:void 0" data-theme="${k}" class="${(s.theme || 'auto') === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <h2>About</h2>
      <p class="note">Stoic Ranger · Shooting Drills ${esc(info.version || '')} · data format ${SD.SCHEMA}${info.android === 'web app' ? ' · web app' : SD.native ? ` · Android ${esc(info.android || '')}` : ''}<br>
      ${SD.DRILLS.length} drills · ${SD.PRINTABLES.length} printables · ${SD.db.results.length} results · ${SD.db.favs.length} favourites<br>
      Drill descriptions written for this app; drills named after a person are credited on the drill page. Printable targets are own designs.<br>
      ${esc(SD.SAFETY_LIVE)} ${esc(SD.SAFETY_DRY)}<br>
      Fonts: Barlow, JetBrains Mono (SIL Open Font License).</p>`;
    SR.wireData(el, SD.toast);
    el.querySelectorAll('[data-theme]').forEach(a => a.onclick = () => { s.theme = a.dataset.theme; SD.save(); SD.applyTheme(); SD.route(); });
  },
};
})();
