/* Stoic Ranger — settings, Claude key, backup, database.xlsx and archive import/export, about. */
'use strict';
(() => {
const { $, $$, esc, fx, num } = RB;
const TABLE_KEYS = ['weapons', 'barrels', 'munitions', 'shooters', 'trainers', 'targets', 'roundsLog'];

/* ---------- database.xlsx (same sheets and headers as 03_registry/database.xlsx) ---------- */
const AUTO = {
  weapons: [['Rounds total (auto)', (r, D) => (D.weapons.find(x => x.id === r.id) || {}).total], ['Last session (auto)', (r, D) => (D.weapons.find(x => x.id === r.id) || {}).last || '']],
  barrels: [['Rounds total (auto)', (r, D) => (D.barrels.find(x => x.id === r.id) || {}).total], ['Last session (auto)', (r, D) => (D.barrels.find(x => x.id === r.id) || {}).last || '']],
  munitions: [['Measured V0 m/s (auto, Xero C1 Pro)', (r, D) => rnd((D.munitions.find(x => x.id === r.id) || {}).v0, 1)],
    ['Measured − manufacturer V0 m/s (auto)', (r, D) => { const v = (D.munitions.find(x => x.id === r.id) || {}).v0, n = RB.num(r.nominalV0); return v != null && n ? rnd(v - n, 1) : ''; }], ['V0 SD m/s (auto)', (r, D) => rnd((D.munitions.find(x => x.id === r.id) || {}).v0sd, 1)],
    ['V0 shots (auto)', (r, D) => (D.munitions.find(x => x.id === r.id) || {}).v0Shots || 0], ['V0 sheets (auto)', (r, D) => (D.munitions.find(x => x.id === r.id) || {}).v0Sheets || 0]],
};
const rnd = (v, d) => v == null ? '' : Math.round(v * 10 ** d) / 10 ** d;

RB.exportXlsx = async () => {
  const X = window.XLSX, D = RB.build(), wb = X.utils.book_new();
  for (const t of TABLE_KEYS) {
    const T = RB.TABLES[t], head = T.fields.map(f => f[1]).concat((AUTO[t] || []).map(a => a[0]));
    const rows = RB.db[t].map(r => T.fields.map(([k, , type]) => { const v = r[k]; return v == null ? '' : v; }).concat((AUTO[t] || []).map(a => a[1](r, D))));
    const ws = X.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map(h => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
    X.utils.book_append_sheet(wb, ws, T.sheet);
  }
  // datasheets, one row per sheet, plus every shot
  const sh = [['Sheet ID', 'Date', 'Time', 'Sheet no.', 'Shooter', 'Purpose', 'Weapon', 'Barrel', 'Ammunition', 'Distance m', 'Rounds', 'Hits', 'Score', 'Avg ring', 'ES mm', 'ES mrad', 'Mean radius mm', 'MR mrad', 'MPI X mm', 'MPI Y mm', 'V0 m/s', 'V0 SD m/s', 'Temp °C', 'Pressure hPa', 'Range', 'Remarks']];
  D.sessions.forEach(s => { const r = RB.sheetById(s.id) || {}; sh.push([s.id, s.date, s.time, s.no, s.shooter, s.purpose, s.rifle, s.barrel, s.ammo, s.dist ?? '', s.rounds ?? '', s.hits, s.score ?? '', rnd(s.avgRing, 2), rnd(s.es, 1), rnd(s.esM, 3), rnd(s.mr, 1), rnd(s.mrM, 3), rnd(s.mx, 1), rnd(s.my, 1), s.v0 ?? '', s.v0sd ?? '', s.temp ?? '', s.press ?? '', s.range, r.remarks || '']); });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sh), 'Datasheets');
  const shots = [['Sheet ID', 'Date', 'Shot', 'X mm', 'Y mm', 'Ring', 'X mrad', 'Y mrad', 'Ammunition', 'Purpose']];
  D.shots.forEach(t => shots.push([t.sheetId, t.date, t.shot, t.x, t.y, t.ring, t.dist ? rnd(t.x / t.dist, 3) : '', t.dist ? rnd(t.y / t.dist, 3) : '', t.ammo, t.purpose]));
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(shots), 'Shots');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Database', 'Exported from Stoic Ranger - Gun Database ' + new Date().toISOString().slice(0, 16).replace('T', ' ')], ['Units', 'Metric: mm, m, g, m/s, mrad.'], ['Auto columns', 'Columns marked (auto) are calculated by the app from the datasheets.']]), 'Info');
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  return RB.saveFile(`database_${RB.today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(out));
};

/** Merge registry tables from a database.xlsx: rows with a known ID are updated, new IDs are added. */
RB.importXlsx = bytes => {
  const X = window.XLSX, wb = X.read(bytes, { type: 'array', cellDates: true });
  const rep = [];
  for (const t of TABLE_KEYS) {
    const T = RB.TABLES[t], ws = wb.Sheets[T.sheet]; if (!ws) continue;
    const rows = X.utils.sheet_to_json(ws, { defval: '', raw: true });
    let add = 0, upd = 0;
    rows.forEach((row, i) => {
      const rec = {};
      for (const [k, label, type, o = {}] of T.fields) {
        let v = row[label]; if (v === undefined && o.alias) v = row[o.alias]; if (v === undefined) continue;
        if (v instanceof Date) v = new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
        if (type === 'num' || type === 'int') v = v === '' ? null : num(v);
        else v = v == null ? '' : String(v).trim();
        rec[k] = v;
      }
      if (t === 'roundsLog' && !rec.id) rec.id = 'R-x' + (i + 1);
      if (!rec.id || (t !== 'roundsLog' && !rec.name)) return;
      const ex = RB.byId(RB.db[t], rec.id);
      if (ex) { Object.assign(ex, rec); upd++; } else { RB.db[t].push(rec); add++; }
    });
    if (t === 'roundsLog') RB.db.roundsLog.forEach(r => { if (/^R-x/.test(r.id)) r.id = RB.nextId(RB.db.roundsLog, 'R'); });
    if (add || upd) rep.push(`${T.title}: ${add} new, ${upd} updated`);
  }
  return rep;
};

/** 02_archive datasheet records (.json, one record or a list). Names are linked to the database where they match. */
RB.importRecords = list => {
  let add = 0, upd = 0; const un = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object' || !('hits' in r || 'date' in r)) continue;
    const s = RB.blankSheet();
    RB.SHEET_KEYS.forEach(k => { if (r[k] != null) s[k] = String(r[k]); });
    s.hits = (r.hits || []).map(h => ({ x: +h.x || 0, y: +h.y || 0 }));
    if (Array.isArray(r.velocities)) s.vel = r.velocities;
    s.source = r.source || { kind: 'import' };
    const same = RB.db.sheets.find(x => x.date === s.date && (x.no || '') === (s.no || '') && (x.time || '') === (s.time || ''));
    RB.autoLink(s);
    if (!s.weaponId && s.gun) un.add('weapon “' + s.gun + '”'); if (!s.munitionId && s.ammo) un.add('ammo “' + s.ammo + '”'); if (!s.shooterId && s.shooter) un.add('shooter “' + s.shooter + '”');
    if (same) { Object.assign(same, s, { id: same.id }); upd++; } else { s.id = RB.uid('SH'); RB.db.sheets.push(s); add++; }
  }
  return { add, upd, unmatched: [...un] };
};

/** One button: picks a file and decides by its content (backup, xlsx, or datasheet records). */
RB.importAny = async () => {
  const f = await RB.openFile('application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,text/plain');
  if (!f.ok) return;
  try {
    if (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b) {            // zip = xlsx
      const rep = RB.importXlsx(f.bytes); RB.save(true);
      RB.toast(rep.length ? 'Imported. ' + rep.join(' · ') : 'Nothing to import found in that workbook.', !rep.length);
    } else {
      const j = JSON.parse(new TextDecoder().decode(f.bytes));
      if (j && (SR.isUnified(j) || SR.isTrainingLog(j) || SR.isDrills(j))) { RB.toast('That is a Stoic Ranger, Training Log or Drills backup: bring it in on the home page under Data.', true); return; }
      if (j && !Array.isArray(j) && [...TABLE_KEYS, 'sheets'].some(k => Array.isArray(j[k]))) return backupDialog(j);   // app backup or dashboard "Export Data for App" (any subset of tables)
      const r = RB.importRecords(Array.isArray(j) ? j : [j]); RB.save(true);
      RB.toast(`${r.add} sheet(s) added, ${r.upd} updated.` + (r.unmatched.length ? ' Not in database: ' + r.unmatched.join(', ') + '.' : ''));
    }
    RB.go('#/dash');
  } catch (e) { RB.toast('Import failed: ' + e.message, true); }
};

function backupDialog(j) {
  if (+j.schema > RB.SCHEMA) { RB.toast('This backup comes from a newer app version. Update the app first.', true); return; }
  j = RB.migrate(j);                                        // old backups are brought up to the current format first
  const n = k => (j[k] || []).length;
  const m = RB.sheet('Import backup', `<p>This file has ${n('weapons')} guns, ${n('barrels')} barrels, ${n('munitions')} ammunition entries, ${n('shooters')} shooters, ${n('trainers')} trainers, ${n('roundsLog')} rounds-log entries and ${n('sheets')} datasheets.</p>
    <div class="stack"><button class="btn pri" id="bMerge">Merge into my data</button></div>
    <p class="note">Merge keeps your entries and adds or updates entries with the same ID.</p>`);
  $('#bMerge', m.body).onclick = () => {
    for (const t of [...TABLE_KEYS, 'sheets']) (j[t] || []).forEach(r => { const ex = RB.byId(RB.db[t], r.id); if (ex) Object.assign(ex, r); else RB.db[t].push(r); });
    RB.save(true); m.close(); RB.toast('Backup merged.'); RB.go('#/dash');
  };
}

RB.views.more = {
  render(el) {
    RB.header('More');
    const info = RB.appInfo(), S = RB.db.settings, key = RB.secret.get('anthropicKey');
    el.innerHTML = `
      <a class="choice sm" href="#/download"><div class="ic">⤓</div><div><h3>Download</h3><p>Printable analysis (all or by shooter, gun, ammunition), every datasheet as A4, blank sheets.</p></div></a>
      <div class="card">${SR.dataSection('h3')}</div>
      <div class="card"><h3>Import &amp; exchange</h3>
        <div class="stack">
          <button class="btn" id="mImport">Import a Gun Database backup, database.xlsx or datasheet records</button>
          <button class="btn" id="mXlsx">Export database.xlsx</button>
          <button class="btn" id="mArchive">Export all datasheets (.json)</button>
        </div>
        <p class="note">Import merges: it adds entries and updates those with the same ID, it never deletes. database.xlsx uses the same sheets and columns as the registry on your PC.</p></div>

      <div class="card"><h3>Claude (photo reading, online search)</h3>
        <p class="note">Reading handwriting from a sheet photo, auto-detecting holes and the online search when adding targets, guns and ammunition use Claude with your own Anthropic API key. The on-phone hole finder and manual marking work without it. Photos and searches are only sent when you tap the button.</p>
        <div class="fg">
          <label class="s6"><span>Anthropic API key</span><input id="mKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${key ? '••••••••' + esc(key.slice(-4)) : ''}"></label>
          <label class="s6"><span>Model</span><select id="mModel">${[['claude-opus-5-5', 'Claude Opus 5.5 (best reading)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (cheaper)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (cheapest)']].map(([v, l]) => `<option value="${v}" ${S.claudeModel === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="row"><button class="btn" id="mKeySave">Save key</button><button class="btn" id="mTest">Test connection</button>${key ? '<button class="btn warn" id="mKeyDel">Remove key</button>' : ''}</div>
        <div class="msg" id="mMsg"></div></div>

      <div class="card"><h3>Settings</h3><div class="fg">
        <label class="s3"><span>Default target</span><select id="mPreset">${Object.entries(RB.PRESETS).filter(([k]) => k !== 'custom').map(([k, p]) => `<option value="${k}" ${S.preset === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="s3"><span>Units</span><select id="mUnits">${[['metric', 'Metric (m, mrad, m/s, °C)'], ['imperial', 'Imperial (yd, MOA, fps, °F)']].map(([v, l]) => `<option value="${v}" ${(S.units || 'metric') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="s3"><span>Sheet no. prefix</span><input id="mPrefix" value="${esc(S.sheetPrefix || 'ST')}"></label>
        <label class="s3"><span>Theme</span><select id="mTheme">${[['auto', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${S.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div></div>

      <div class="card"><h3>Purposes of a dataset</h3>
        <p class="note">Each purpose decides what its sheets are evaluated for. <b>Gun and ammo</b>: barrel wear and ammo precision. <b>Shooter</b>: the shooter's progress. <b>Rounds only</b>: counted towards the barrel, nothing else.</p>
        <div id="mPurp"></div>
        <div class="row"><input id="mPNew" placeholder="New purpose, e.g. Night shooting" style="flex:1;min-width:0"><button class="btn" id="mPAdd">Add</button></div></div>

      ${RB.hasExamples() ? `<div class="card"><h3>Example data</h3><p class="note">Example entries are still in the database (from an imported file). Your own entries are not touched.</p><div class="row"><button class="btn warn" id="mExDel">Remove all example data now</button></div></div>` : ''}

      <div class="card"><h3>About</h3>
        <p><b>Stoic Ranger</b> · Gun Database ${esc(info.version || '')} · ${info.android === 'web app' ? 'web app' : 'Android ' + esc(info.android || '')} · ${esc(info.device || '')}</p>
        <p class="note">Training log for long-range and precision shooting (rifles and pistols). Units: ${S.units === 'imperial' ? 'imperial (stored metric)' : 'metric'}. Data: ${RB.db.weapons.length} guns, ${RB.db.barrels.length} barrels, ${RB.db.munitions.length} ammunition, ${RB.db.shooters.length} shooters, ${RB.db.sheets.length} datasheets, ${RB.db.roundsLog.length} rounds-log entries.</p>
        <details><summary>Privacy</summary><p class="note">The app has no account and no tracking. All entries stay on the phone. When you use Claude photo reading, that photo and the request go to Anthropic with your own API key; nothing else leaves the phone unless you export or share it.</p></details>
        <details><summary>Open-source licences</summary><p class="note">Barlow Condensed, Barlow Semi Condensed (Jeremy Tribby) and JetBrains Mono: SIL Open Font License 1.1. SheetJS Community Edition: Apache License 2.0. Hole-finding, statistics, charts and the ballistic solver: own code. G1/G7 drag tables: standard reference data (BRL / JBM, as published in py-ballisticcalc).</p></details>
        </div>`;

    SR.wireData(el, RB.toast);
    $('#mImport').onclick = () => RB.importAny();
    $('#mXlsx').onclick = async () => { try { const r = await RB.exportXlsx(); if (r.ok) RB.toast('Saved ' + r.msg); } catch (e) { RB.toast('Export failed: ' + e.message, true); } };
    $('#mArchive').onclick = () => RB.saveFile(`datasheets_${RB.today()}.json`, 'application/json', JSON.stringify(RB.db.sheets.map(RB.toArchive), null, 1));
    const mm = $('#mMsg');
    $('#mKey').onfocus = e => { if (e.target.value.startsWith('••')) e.target.value = ''; };
    $('#mKeySave').onclick = () => { const v = $('#mKey').value.trim(); if (!v || v.startsWith('••')) { mm.textContent = 'Paste the key first.'; return; } RB.secret.set('anthropicKey', v); mm.textContent = 'Key saved on this phone.'; RB.views.more.render(el); };
    const kd = $('#mKeyDel'); if (kd) RB.armed(kd, () => { RB.secret.set('anthropicKey', ''); RB.views.more.render(el); });
    $('#mModel').onchange = e => { S.claudeModel = e.target.value; RB.save(); };
    $('#mTest').onclick = async () => { mm.classList.remove('err'); mm.textContent = 'Testing …'; try { const r = await RB.claude.test(); mm.textContent = 'Claude answered: ' + (r.shape || 'ok'); } catch (e) { mm.classList.add('err'); mm.textContent = e.message; } };
    $('#mPreset').onchange = e => { S.preset = e.target.value; RB.save(); };
    $('#mUnits').onchange = e => { S.units = e.target.value; RB.save(); RB.toast(S.units === 'imperial' ? 'Imperial: yd, MOA, fps, mph, °F, inHg, in, gr. Data stays stored metric.' : 'Metric units.'); RB.views.more.render(el); };
    $('#mPrefix').onchange = e => { S.sheetPrefix = e.target.value.trim().replace(/[^\w]/g, '') || 'ST'; RB.save(); };
    $('#mTheme').onchange = e => { S.theme = e.target.value; RB.applyTheme(); RB.save(); };
    const ed = $('#mExDel'); if (ed) RB.armed(ed, () => { RB.clearExamples(); RB.toast('Example data removed.'); RB.views.more.render(el); });
    purposes();
    $('#mPAdd').onclick = () => {
      const name = $('#mPNew').value.trim(); if (!name) return;
      const P = S.purposes || (S.purposes = RB.purposes().map(p => Object.assign({}, p)));
      if (P.some(p => p.name.toLowerCase() === name.toLowerCase())) { RB.toast('That purpose exists already.', true); return; }
      P.push({ id: RB.uid('p'), name, evalAs: 'shooter', own: true }); RB.save(); $('#mPNew').value = ''; purposes();
    };
    function purposes() {
      const P = S.purposes || (S.purposes = RB.purposes().map(p => Object.assign({}, p)));
      const used = id => RB.db.sheets.filter(x => x.purpose === id).length;
      $('#mPurp').innerHTML = P.map((p, i) => `<div class="prow"><input data-pn="${i}" value="${esc(p.name)}" aria-label="Name"><select data-pe="${i}" aria-label="Evaluated as">${Object.entries(RB.EVAL_AS).map(([k, l]) => `<option value="${k}" ${p.evalAs === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${used(p.id) ? `<small>${used(p.id)}</small>` : `<button class="ib" data-pd="${i}" aria-label="Delete">✕</button>`}</div>`).join('');
      $$('[data-pn]').forEach(i => i.onchange = () => { const v = i.value.trim(); if (v) { P[+i.dataset.pn].name = v; RB.save(); } });
      $$('[data-pe]').forEach(i => i.onchange = () => { P[+i.dataset.pe].evalAs = i.value; RB.save(); });
      $$('[data-pd]').forEach(b => b.onclick = () => { P.splice(+b.dataset.pd, 1); RB.save(); purposes(); });
    }
  },
};
})();
