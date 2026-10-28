/* Stoic Ranger - Training Log — backup / restore, import from the Gun Database, theme, example data, about. */
'use strict';
(() => {
const { $, esc } = TL;

const backupName = () => `sr-training-log-backup-${TL.today()}.json`;
const backupText = () => JSON.stringify(TL.db, null, 1);

/** Replace all data with a backup file (the current data is kept as a copy on the phone first). */
/* Stoic Ranger 1.0: restoring and bringing in old backups happens on the home page (one database for all parts). */
TL.restoreBackup = () => { TL.flush(); location.href = '../index.html#/data'; };
TL._oldRestoreBackup = async () => {
  if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
  const f = await TL.openFile('application/json,text/plain,application/octet-stream');
  if (!f.ok) return;
  let j;
  try { j = JSON.parse(new TextDecoder().decode(f.bytes)); } catch (e) { TL.toast('This is not a backup file.', true); return; }
  if (!TL.isOurs(j)) {
    if (j && Array.isArray(j.sheets)) { TL.toast('That is a Gun Database backup: use "Import shooters and guns" instead.', true); return; }
    TL.toast('This is not a Training Log backup.', true); return;
  }
  if (+j.schema > TL.SCHEMA) { TL.toast(`This backup comes from a newer app version (data format ${j.schema}). Update the app first.`, true); return; }
  const m = TL.sheet('Restore backup', `<p>${esc(f.name)}: ${j.trainings.length} trainings, ${(j.shooters || []).length} shooters, ${(j.weapons || []).length} guns, ${(j.trainers || []).length} trainers.</p>
    <p class="note">This replaces the data on this phone (now ${TL.db.trainings.length} trainings). A copy of the current data is saved on the phone first.</p>
    <div class="stack"><button class="btn pri big" id="rGo">Replace data with this backup</button></div>`);
  $('#rGo', m.body).onclick = () => {
    TL.flush(); TL.backupDb(`db-before-restore-${Date.now()}.json`);
    const keep = TL.db.settings;
    TL.db = TL.migrate(j);
    TL.db.settings.theme = keep.theme;
    TL.save(true); m.close(); TL.applyTheme();
    TL.toast(`Backup restored: ${TL.db.trainings.length} trainings.`); TL.go('#/dash');
  };
};

/** One-off import of shooters and guns from a Stoic Ranger - Gun Database backup file the user picks.
    The databases stay separate; the source id is noted on each entry for linking later. */
async function importGunDb() {
  if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
  const f = await TL.openFile('application/json,text/plain,application/octet-stream');
  if (!f.ok) return;
  let j;
  try { j = JSON.parse(new TextDecoder().decode(f.bytes)); } catch (e) { TL.toast('This is not a backup file.', true); return; }
  if (!j || !Array.isArray(j.weapons) || !Array.isArray(j.sheets)) { TL.toast('This is not a Stoic Ranger - Gun Database backup.', true); return; }
  const fresh = (t, list) => list.filter(r => !r.example && r.name && !TL.db[t].some(x => (x.source && x.source.id === r.id && x.source.app === 'gundb') || x.name.trim().toLowerCase() === r.name.trim().toLowerCase()));
  const sh = fresh('shooters', j.shooters || []), we = fresh('weapons', j.weapons || []);
  const m = TL.sheet('Import from Gun Database', `<p>${esc(f.name)}</p>
    <p>New here: <b>${sh.length}</b> shooter${sh.length === 1 ? '' : 's'}${sh.length ? ' (' + esc(sh.map(r => r.name).join(', ')) + ')' : ''}, <b>${we.length}</b> weapon${we.length === 1 ? '' : 's'}${we.length ? ' (' + esc(we.map(r => r.name).join(', ')) + ')' : ''}.</p>
    <p class="note">Entries with the same name are skipped. Only shooters and guns are copied; both apps keep their own data.</p>
    <div class="stack"><button class="btn pri big" id="gGo"${sh.length + we.length ? '' : ' disabled'}>Import</button></div>`);
  $('#gGo', m.body).onclick = () => {
    sh.forEach(r => TL.addRecord('shooters', { name: r.name, status: r.status === 'Inactive' ? 'Inactive' : 'Active', notes: r.notes || '', source: { app: 'gundb', id: r.id } }));
    we.forEach(r => TL.addRecord('weapons', { name: r.name, type: 'Rifle', caliber: r.caliber || '', make: r.make || '', model: r.model || '', serial: r.serial || '', status: ['Sold', 'Retired'].includes(r.status) ? r.status : 'Active', notes: r.notes || '', source: { app: 'gundb', id: r.id } }));
    TL.save(true); m.close(); TL.toast(`${sh.length + we.length} entries imported.`); TL.route();
  };
}

TL.views.more = {
  render(el) {
    TL.header('More');
    const s = TL.db.settings, info = TL.appInfo();
    el.innerHTML = `
      ${SR.dataSection()}
      <h2>database.xlsx</h2>
      <p class="note">Same sheets and columns as the registry workbook and the dashboard (Shooters, Weapons, Trainers, Trainings), so the data can go back and forth. Import adds and updates, it never deletes.</p>
      <div class="stack">
        <button class="btn" id="mXlsxOut">Export database.xlsx</button>
        <button class="btn" id="mXlsxIn">Import database.xlsx</button>
      </div>
      <h2>Appearance</h2>
      <div class="seg">${[['auto', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<a href="javascript:void 0" data-theme="${k}" class="${(s.theme || 'auto') === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      ${TL.hasExamples() ? '<h2>Example data</h2><div class="stack"><button class="btn" id="mExClear">Remove example data</button></div>' : ''}
      <h2>About</h2>
      <p class="note">Stoic Ranger · Training Log ${esc(info.version || '')} · data format ${TL.SCHEMA}${info.android === 'web app' ? ' · web app' : TL.native ? ` · Android ${esc(info.android || '')}` : ''}<br>
      ${TL.db.trainings.length} trainings · ${TL.db.shooters.length} shooters · ${TL.db.weapons.length} guns · ${TL.db.trainers.length} trainers<br>
      Fonts: Barlow, JetBrains Mono (SIL Open Font License). SheetJS Community Edition (Apache License 2.0).</p>`;
    SR.wireData(el, TL.toast);
    $('#mXlsxOut', el).onclick = async () => { TL.flush(); const r = await TL.saveFile(`sr-training-log_database_${TL.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', TL.exportXlsx()); if (r.ok) TL.toast('Saved: ' + r.msg); else if (r.msg !== 'cancelled') TL.toast('Not saved: ' + r.msg, true); };
    $('#mXlsxIn', el).onclick = TL.importXlsx;
    el.querySelectorAll('[data-theme]').forEach(a => a.onclick = () => { s.theme = a.dataset.theme; TL.save(); TL.applyTheme(); TL.route(); });
    const ex1 = $('#mExClear', el); if (ex1) TL.armed(ex1, () => { TL.clearExamples(); TL.toast('Example data removed.'); TL.route(); });
  },
};
})();
