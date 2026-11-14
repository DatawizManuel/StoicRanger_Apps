/* Stoic Ranger Shooting — home page: the three parts with their key figures, quick "new" buttons, the overviews
   (sr/overview.js, 1.2.0), and Data (the shared
   database.xlsx, backup of everything, restore, bringing in the old apps' backups, theme, about).
   1.1.0: no quotes any more (Daily Thoughts is its own app again, Manuel 2026-10-29). */
'use strict';
(() => {
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = v => { const n = +String(v == null ? '' : v).replace(',', '.'); return isFinite(n) ? n : 0; };
const fmtInt = n => Math.round(n).toLocaleString('de-AT');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('de-AT');
const fmtDate = d => d ? d.split('-').reverse().join('.') : '';
const arr = SR.arr;
const year = String(new Date().getFullYear());

const H = window.SRHome = {};
let modal = null;
const toast = (msg, err) => {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(H._tt); H._tt = setTimeout(() => t.classList.remove('on'), err ? 5000 : 2600);
};
const sheet = (title, body) => {
  const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog');
  m.innerHTML = `<div class="mcard"><div class="mhead"><h3>${esc(title)}</h3><button class="ib" data-close aria-label="Close">✕</button></div><div class="mbody">${body}</div></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); modal = null; };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  modal = close;
  return { body: $('.mbody', m), close };
};
const armed = (btn, fn) => {
  const label = btn.innerHTML; let t;
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (btn.dataset.armed) { clearTimeout(t); delete btn.dataset.armed; btn.innerHTML = label; fn(); return; }
    btn.dataset.armed = 1; btn.textContent = 'Tap again to confirm';
    t = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = label; }, 3000);
  });
};
H.toast = toast;
H.back = () => { if (modal) { modal(); return true; } if (location.hash && location.hash !== '#/') { location.hash = '#/'; return true; } return false; };

/* ---------- theme (shared by all parts) ---------- */
H.setSysDark = on => { document.documentElement.dataset.sys = on ? 'dark' : 'light'; };
function applyTheme() {
  const t = SR.db.settings.common.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}

/* ---------- figures ---------- */
function figures() {
  const d = SR.db;
  const tr = arr(d.trainings).filter(t => !t.example);
  const thisYear = tr.filter(t => String(t.date || '').startsWith(year));
  const live = thisYear.filter(t => t.fire !== 'dry');
  const rounds = t => arr(t.weapons).reduce((a, w) => a + num(w.rounds), 0);
  const res = arr(d.results);
  const last = tr.map(t => t.date || '').sort().pop() || '';
  return {
    guns: arr(d.weapons).filter(w => !w.status || w.status === 'Active').length,
    barrels: arr(d.barrels).length, sheets: arr(d.sheets).length,
    sheetsYear: arr(d.sheets).filter(s => String(s.date || '').startsWith(year)).length,
    trainings: thisYear.length, dry: thisYear.length - live.length,
    hours: thisYear.reduce((a, t) => a + num(t.durationH), 0),
    rounds: live.reduce((a, t) => a + rounds(t), 0),
    results: res.length, resultsYear: res.filter(r => String(r.date || '').startsWith(year)).length,
    favs: arr(d.favs).length, last,
  };
}

/* ---------- home ---------- */
function home(el) {
  const f = figures();
  el.innerHTML = `
    ${SR.readOnly ? '<div class="banner warn">This data was saved by a newer version of Stoic Ranger Shooting. Nothing is changed or saved until you update the app.</div>' : ''}
    ${storageLine()}
    <div class="srnew">
      <a class="btn pri" href="training/index.html#/training/new">+ Training</a>
      <a class="btn pri" href="gun/index.html#/dash?srAdd=1">+ Datasheet</a>
      <a class="btn pri" href="drills/index.html#/result/new">+ Drill result</a>
      <a class="btn pri" href="gun/index.html#/db/roundsLog/new">+ Rounds</a>
    </div>
    <a class="choice srpart" href="gun/index.html"><div class="ic">⌖</div><div><h3>Gun Database</h3>
      <p>Guns, barrels, ammunition, datasheets, analyse, dope cards</p>
      <p class="mono">${f.guns} gun${f.guns === 1 ? '' : 's'} · ${f.barrels} barrel${f.barrels === 1 ? '' : 's'} · ${f.sheets} datasheet${f.sheets === 1 ? '' : 's'}</p></div></a>
    <a class="choice srpart tl" href="training/index.html"><div class="ic">✎</div><div><h3>Training Log</h3>
      <p>Trainings (live and dry fire), trainers, record sheet</p>
      <p class="mono">${year}: ${f.trainings} training${f.trainings === 1 ? '' : 's'} · ${fmt1(f.hours)} h${f.last ? ' · last ' + fmtDate(f.last) : ''}</p></div></a>
    <a class="choice srpart sd" href="drills/index.html"><div class="ic">⏱</div><div><h3>Shooting Drills</h3>
      <p>Drill library, results, printable targets</p>
      <p class="mono">${f.results} result${f.results === 1 ? '' : 's'} · ${f.favs} favourite${f.favs === 1 ? '' : 's'}</p></div></a>
    <h2>${year} at a glance</h2>
    <div class="tiles">
      <div class="tile"><div class="l">Trainings</div><div class="v">${f.trainings}</div><div class="s">${f.trainings - f.dry} live · ${f.dry} dry</div></div>
      <div class="tile"><div class="l">Hours</div><div class="v">${fmt1(f.hours)}</div><div class="s">training time</div></div>
      <div class="tile"><div class="l">Live rounds</div><div class="v">${fmtInt(f.rounds)}</div><div class="s">from trainings</div></div>
      <div class="tile"><div class="l">Datasheets</div><div class="v">${f.sheetsYear}</div><div class="s">${f.sheets} in total</div></div>
      <div class="tile"><div class="l">Drill results</div><div class="v">${f.resultsYear}</div><div class="s">${f.results} in total</div></div>
      <div class="tile"><div class="l">Active guns</div><div class="v">${f.guns}</div><div class="s">${f.barrels} barrels</div></div>
    </div>
    ${xlsxLine()}
    ${window.SROverview ? SROverview.html() : ''}`;
  if (window.SROverview) SROverview.wire(el, () => home(el), toast);
}
/** One line under the figures: where the shared database.xlsx stands. */
function xlsxLine() {
  if (!SR.xlsx.canLink()) return '';
  const i = SR.xlsx.info(), s = SR.xlsx.state();
  if (!i.linked) return `<p class="note"><a href="#/data">Link a database.xlsx</a> to share this database with your other devices and Excel.</p>`;
  return `<p class="note">Shared database: <b>${esc(i.name || 'database.xlsx')}</b>${s.lastOut || s.lastIn ? ' · synced ' + esc(when(s.lastOut > (s.lastIn || '') ? s.lastOut : s.lastIn)) : ''}${s.dirty ? ' · changes go out when you leave this page' : ''}</p>`;
}
const when = iso => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('de-AT') + ' ' + d.toTimeString().slice(0, 5); };

/* ---------- data ---------- */
const describe = j => SR.isUnified(j) ? 'Stoic Ranger Shooting backup' : SR.isTrainingLog(j) ? 'SR_Training Log backup' : SR.isDrills(j) ? 'SR_Shooting Drills backup' : SR.isThoughts(j) ? 'SR_Daily Thoughts backup' : SR.isGunDb(j) ? 'SR_Database (Gun Database) backup' : '';
const count = (j, t) => arr(j[t]).filter(r => r && !r.example).length;
async function bringIn() {
  const f = await SR.openJson();
  if (!f.ok) { if (f.msg !== 'cancelled') toast(f.msg, true); return; }
  const j = f.json, kind = describe(j);
  if (!kind) { toast('This is not a Stoic Ranger Shooting backup.', true); return; }
  if (SR.isGunDb(j)) {
    const m = sheet('Gun Database backup', `<p>${esc(f.name)}: ${count(j, 'weapons')} guns, ${count(j, 'sheets')} datasheets.</p>
      <p class="note">Gun Database backups are merged in the Gun Database part: More › Import.</p>
      <div class="stack"><a class="btn pri" href="gun/index.html#/more">Open Gun Database › More</a></div>`);
    return m;
  }
  if (SR.isUnified(j)) {
    const m = sheet('Restore Stoic Ranger Shooting backup', `<p>${esc(f.name)}${j.backup ? ' · saved ' + esc(fmtDate(String(j.backup).slice(0, 10))) : ''}: ${count(j, 'weapons')} guns, ${count(j, 'sheets')} datasheets, ${count(j, 'trainings')} trainings, ${count(j, 'results')} drill results.</p>
      <p class="note">This replaces everything on this device (now ${count(SR.db, 'weapons')} guns, ${count(SR.db, 'trainings')} trainings, ${count(SR.db, 'results')} drill results). A copy of the current data is kept on the device first.</p>
      <div class="stack"><button class="btn warn big" id="rGo">Replace all data with this backup</button></div>`);
    armed($('#rGo', m.body), () => { if (SR.restoreAll(j)) { m.close(); toast('Backup restored.'); route(); } else toast('Could not restore: the backup is from a newer version, or saving failed.', true); });
    return;
  }
  if (SR.isThoughts(j)) {
    sheet(kind, `<p>${esc(f.name)}: ${arr(j.favs).length} favourite quotes.</p>
      <p class="note">Daily Thoughts is its own app again. Open this file in the Daily Thoughts app (More › Bring in favourites): it adds the quotes to your favourites there.</p>`);
    return;
  }
  const tl = SR.isTrainingLog(j);
  const m = sheet('Bring in ' + kind, `<p>${esc(f.name)}: ${tl ? `${count(j, 'trainings')} trainings, ${count(j, 'trainers')} trainers` : `${count(j, 'results')} drill results, ${arr(j.favs).length} favourites`}, ${count(j, 'shooters')} shooters, ${count(j, 'weapons')} guns.</p>
    <p class="note">Merged into your data, nothing is deleted: shooters and guns with the same name (or already linked) are used once, everything else is added. Bringing in the same backup twice adds nothing new. A copy of the current data is kept on the device first.</p>
    <div class="stack"><button class="btn pri big" id="iGo">Bring in</button></div>`);
  $('#iGo', m.body).onclick = () => {
    const r = SR.importBackup(j);
    m.close();
    if (r.error) { toast('Read-only: update the app first.', true); return; }
    const a = r.stats.added, mt = r.stats.matched, sk = r.stats.skipped;
    const own = tl ? 'trainings' : 'results';
    toast(`Brought in: ${a[own] || 0} ${tl ? 'trainings' : 'drill results'}${sk[own] ? ` (${sk[own]} were already here)` : ''}, ${a.shooters || 0} new shooters, ${a.weapons || 0} new guns${mt.weapons || mt.shooters ? `, ${(mt.weapons || 0) + (mt.shooters || 0)} matched` : ''}.`);
    route();
  };
}
function data(el) {
  const d = SR.db, info = (() => { try { return JSON.parse(window.SRNative.appInfo()); } catch (e) { return {}; } })();
  el.innerHTML = `
    ${storageCard()}
    ${xlsxCard()}
    <div class="card"><h3>Backup</h3>
      <p class="note">Guns, datasheets, trainings and drill results live in one database on this device. A backup holds all of it: save one now and then (cloud drive, e-mail to yourself …); it is also how you move to a new phone.</p>
      <div class="stack"><button class="btn pri" data-sr="save">Save a backup of everything</button><button class="btn" data-sr="share">Share a backup</button></div></div>
    <div class="card"><h3>Restore or bring in</h3>
      <p class="note">Pick a backup file: a <b>Stoic Ranger Shooting</b> backup restores everything; a backup of the old <b>SR_Training Log</b> or <b>SR_Shooting Drills</b> app is merged into your data (that is how their data moves into this app).</p>
      <div class="stack"><button class="btn" id="dIn">Choose a backup file</button></div></div>
    ${SR.hasThoughtFavs() ? `<div class="card"><h3>Daily Thoughts</h3>
      <p class="note">Daily Thoughts is its own app again. Your ${arr(SR.thoughts.favs).length} favourite quotes are still kept on this device: save them as a file and bring it into the Daily Thoughts app (More › Bring in favourites).</p>
      <div class="stack"><button class="btn" id="dThoughts">Save favourite quotes for the Daily Thoughts app</button></div></div>` : ''}
    <div class="card"><h3>Appearance</h3>
      <div class="seg">${[['auto', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<a href="javascript:void 0" data-theme="${k}" class="${(d.settings.common.theme || 'auto') === k ? 'on' : ''}">${l}</a>`).join('')}</div></div>
    <div class="card"><h3>About</h3>
      <p><b>Stoic Ranger Shooting</b> ${esc(info.version || '')}${info.android && info.android !== 'web app' ? ' · Android ' + esc(info.android) : info.android ? ' · web app' : info.windows ? ' · Windows' : ''}</p>
      <p class="note">One app: Gun Database, Training Log and Shooting Drills share one database (until version 0.x separate apps). The same app runs on Android, iPhone and Windows and reads and writes the same database.xlsx. ${count(d, 'weapons')} guns · ${count(d, 'shooters')} shooters · ${count(d, 'trainers')} trainers · ${count(d, 'sheets')} datasheets · ${count(d, 'trainings')} trainings · ${count(d, 'results')} drill results.</p>
      <p class="note">No account, no tracking: all entries stay on this device unless you export or share them.</p>
      <div class="row"><button class="btn warn" id="dWipe">Delete all data on this device</button></div></div>`;
  SR.wireData(el, toast);
  wireStorage(el);
  wireXlsx(el);
  $('#dIn', el).onclick = bringIn;
  if ($('#dThoughts', el)) $('#dThoughts', el).onclick = async () => { const r = await SR.saveThoughtsFile(); if (r.ok) toast('Saved: ' + r.msg); else if (r.msg !== 'cancelled') toast('Not saved: ' + r.msg, true); };
  el.querySelectorAll('[data-theme]').forEach(a => a.onclick = () => { d.settings.common.theme = a.dataset.theme; SR.save(); applyTheme(); route(); });
  armed($('#dWipe', el), () => {
    try { window.SRNative.backupDb('db-before-delete-' + Date.now() + '.json'); } catch (e) { }
    const theme = d.settings.common.theme;
    SR.restoreAll({ app: 'stoic-ranger', format: 1, created: SR.now(), schemas: {}, settings: { common: { theme } }, history: [] });
    toast('All data deleted (a copy is kept on the device).'); location.hash = '#/';
  });
}

/* ---------- the shared database.xlsx ---------- */
const statsText = s => {
  const a = SR.arr(Object.entries(s.added || {})).filter(([, n]) => n), c = Object.values(s.changed || {}).reduce((x, n) => x + n, 0);
  const lab = { weapons: 'guns', barrels: 'barrels', munitions: 'ammunition', shooters: 'shooters', trainers: 'trainers', targets: 'targets', roundsLog: 'rounds log entries', sheets: 'datasheets', trainings: 'trainings', results: 'drill results', purposes: 'purposes' };
  const parts = a.map(([t, n]) => `${n} ${lab[t] || t}`);
  return (parts.length ? 'new: ' + parts.join(', ') : 'nothing new') + (c ? `; ${c} changed` : '');
};
/* ---------- where the data lives (1.3.0, remarks #13 and #15) ---------- */
const ncOn = () => { const st = SR.storage.available() && SR.storage.state(); return !!(st && st.mode === 'nextcloud'); };
/** 1.3.1 (Manuel 2026-11-14: the cloud setting was not to be found): where the data is, on the home page, one tap to Settings. */
function storageLine() {
  let t = '';
  try {
    if (SR.storage.available() && SR.storage.state().mode === 'nextcloud') {
      const s = SR.xlsx.state(), last = s.lastOut || s.lastIn ? when(s.lastOut > (s.lastIn || '') ? s.lastOut : s.lastIn) : '';
      t = `Synced to Nextcloud${last ? ' · last sync ' + esc(last) : ''}`;
    } else t = SR.xlsx.linked() ? 'On this device, kept in step with database.xlsx' : (SR.storage.available() ? 'On this device only (Nextcloud sync: Settings)' : 'On this device only');
  } catch (e) { t = 'On this device only'; }
  return `<a class="srstore" href="#/data"><span>Your data: ${t}</span><b>Settings ›</b></a>`;
}
function storageCard() {
  if (!SR.storage.available()) return `<div class="card"><h3>Where your data is stored</h3>
    <p class="note">On this device. Syncing with Nextcloud is in the Android and Windows apps: the iPhone web app cannot reach Nextcloud itself (Nextcloud does not let other websites in). On iPhone, use <b>Save database.xlsx</b> below and choose the Nextcloud app as the place, and <b>Open database.xlsx</b> to bring a newer file back (merged, nothing here is deleted).</p></div>`;
  const st = SR.storage.state(), on = st.mode === 'nextcloud', s = SR.xlsx.state();
  const last = s.lastOut || s.lastIn ? when(s.lastOut > (s.lastIn || '') ? s.lastOut : s.lastIn) : '';
  const v = k => esc(st[k] || '');
  return `<div class="card" id="stCard"><h3>Where your data is stored</h3>
    <div class="seg" id="stMode"><a href="javascript:void 0" data-m="local" class="${on ? '' : 'on'}">${st.windows ? 'On this PC only' : 'On this phone only'}</a><a href="javascript:void 0" data-m="nextcloud" class="${on ? 'on' : ''}">Synced to my Nextcloud</a></div>
    ${on ? `<p>Synced with <b>${v('url')}</b>, folder <b>${v('folder')}</b>${last ? ` · last sync ${esc(last)}` : ''}</p>
      <p class="note">This ${st.windows ? 'PC' : 'phone'} keeps its own copy and works offline. database.xlsx is synced when the app opens, when you leave a part or the app, and with Sync now. Changes made elsewhere are merged, never overwritten, and a copy goes to <b>${v('folder')}backups</b> before every upload (the newest 30 are kept).</p>
      <div class="stack"><button class="btn pri" id="stSync">Sync now</button><button class="btn" id="stLocal">Stop syncing (keep the data ${st.windows ? 'on this PC' : 'on this phone'})</button></div>` : ''}
    <div id="stForm" ${on ? 'hidden' : 'hidden'}>
      <label class="fld"><span>Nextcloud address</span><input id="stUrl" type="url" inputmode="url" placeholder="https://cloud.example.com" value="${v('url')}"></label>
      <label class="fld"><span>User name</span><input id="stUser" autocapitalize="off" autocomplete="username" value="${v('user')}"></label>
      <label class="fld"><span>App password</span><input id="stPw" type="password" autocomplete="new-password" placeholder="${st.hasPassword ? 'stored (leave empty to keep it)' : 'Nextcloud › Settings › Security › App passwords'}"></label>
      <label class="fld"><span>Folder</span><input id="stFolder" value="${v('folder') || '/Stoic Ranger/'}"></label>
      <p class="note">Use an app password, not your normal one (Nextcloud › Settings › Security). It stays encrypted on this ${st.windows ? 'PC' : 'phone'} only. The first sync merges what is on Nextcloud with the data here: nothing is lost on either side.</p>
      <div class="stack"><button class="btn pri" id="stGo">Connect and sync</button></div></div>
    ${st.windows ? `<p class="note">If the Nextcloud desktop app already syncs a folder on this PC, you can also simply use the database.xlsx in that folder (below).</p>`
      : `<p class="note">Stoic Ranger apps you linked on this phone (e.g. SR GunSafe, after you allowed the link there) use the same database file and this same setting: switching here switches them too, and the other way round.</p>`}
  </div>`;
}
function wireStorage(el) {
  if (!SR.storage.available()) return;
  const q = s => $(s, el), form = q('#stForm');
  el.querySelectorAll('#stMode [data-m]').forEach(a => a.onclick = () => {
    if (a.dataset.m === 'nextcloud') { form.hidden = false; el.querySelectorAll('#stMode a').forEach(x => x.classList.toggle('on', x === a)); q('#stUrl').focus(); }
    else if (ncOn()) q('#stLocal').click(); else { form.hidden = true; el.querySelectorAll('#stMode a').forEach(x => x.classList.toggle('on', x === a)); }
  });
  q('#stGo').onclick = () => {
    q('#stGo').disabled = true; q('#stGo').textContent = 'Connecting …';
    setTimeout(() => {
      SR.flush();
      const r = SR.storage.connect({ url: q('#stUrl').value, user: q('#stUser').value, folder: q('#stFolder').value }, q('#stPw').value);
      if (r.ok) { toast('Connected: database.xlsx is now synced with your Nextcloud' + (r.merged && r.merged.stats ? ' (' + statsText(r.merged.stats) + ')' : '') + '.'); route(); }
      else { toast(r.msg || 'Not connected.', true); q('#stGo').disabled = false; q('#stGo').textContent = 'Connect and sync'; if (r.saved) route(); }
    }, 30);
  };
  if (q('#stSync')) q('#stSync').onclick = () => { q('#stSync').disabled = true; setTimeout(() => { SR.flush(); const a = SR.xlsx.syncIn(), b = SR.xlsx.syncOut(); const e = (a && a.error) || (b && b.error); if (e) toast(e, true); else toast('Synced' + (a && a.stats ? ' (' + statsText(a.stats) + ')' : '') + '.'); route(); }, 30); };
  if (q('#stLocal')) armed(q('#stLocal'), () => { SR.storage.local(); toast('Not syncing any more. Everything stays on this device; nothing was deleted on Nextcloud.'); route(); });
}
function xlsxCard() {
  if (ncOn()) return `<div class="card"><h3>database.xlsx by hand</h3>
    <p class="note">Your database.xlsx is synced with Nextcloud (above). You can still save a copy or bring a file in by hand.</p>
    <div class="stack"><button class="btn" id="xSave">Save database.xlsx</button><button class="btn" id="xIn">Open database.xlsx</button></div></div>`;
  const can = SR.xlsx.canLink(), i = can ? SR.xlsx.info() : {}, s = SR.xlsx.state();
  const linked = can && i.linked;
  return `<div class="card"><h3>Shared database (database.xlsx)</h3>
    <p class="note">Android, iPhone and Windows use the same <b>database.xlsx</b>, and you can edit it in Excel. Its sheets are those of the database on the PC (Weapons, Barrels, Munitions, Shooters, Trainers, Trainings, Drill_Results …) plus Datasheets and Shots. Nothing is deleted when files meet: rows deleted in Excel stay in the app (delete entries in the app).</p>
    ${can ? (linked ? `<p>Linked: <b>${esc(i.name || 'database.xlsx')}</b>${s.lastOut || s.lastIn ? ` · last sync ${esc(when(s.lastOut > (s.lastIn || '') ? s.lastOut : s.lastIn))}` : ''}</p>
      <p class="note">Changes in the file come in when the app starts or comes back; your changes go out when you leave a part or the app.</p>
      <div class="stack"><button class="btn pri" id="xSync">Sync now</button><button class="btn" id="xUnlink">Unlink this file</button></div>`
      : `<p class="note">Link a file and this device keeps it in step: create a new database.xlsx (in a folder you choose, e.g. your cloud drive) or use the one you already have (e.g. the one on your PC). An existing file is never overwritten: its entries are merged with the ones on this device first.</p>
      <div class="stack"><button class="btn pri" id="xNew">Create a new database.xlsx</button><button class="btn" id="xOpen">Use an existing database.xlsx</button></div>`)
    : `<p class="note">On iPhone the file is saved and opened by hand: <b>Save database.xlsx</b> puts the whole database into a file (Files, iCloud Drive, e-mail …); <b>Open database.xlsx</b> brings a file in (merged, nothing on this device is deleted).</p>`}
    <div class="stack"><button class="btn" id="xSave">Save database.xlsx</button><button class="btn" id="xIn">Open database.xlsx</button></div></div>`;
}
function wireXlsx(el) {
  const q = s => $(s, el);
  const done = (r, okMsg) => { if (r && (r.ok || r.stats)) { toast(okMsg + (r.stats ? ' (' + statsText(r.stats) + ')' : '')); route(); } else if (r && r.msg !== 'cancelled') toast((r.msg || r.error || 'Failed') + '', true); };
  if (q('#xNew')) q('#xNew').onclick = async () => done(await SR.xlsx.link('create'), 'database.xlsx linked');
  if (q('#xOpen')) q('#xOpen').onclick = async () => { const r = await SR.xlsx.link('open'); done(r && r.merged && r.merged.stats ? Object.assign({}, r, { stats: r.merged.stats }) : r, 'database.xlsx linked'); };
  if (q('#xSync')) q('#xSync').onclick = () => { SR.flush(); const a = SR.xlsx.syncIn(), b = SR.xlsx.syncOut(); const e = (a && a.error) || (b && b.error); if (e) toast(e, true); else { toast('Synced' + (a && a.stats ? ' (' + statsText(a.stats) + ')' : '') + '.'); route(); } };
  if (q('#xUnlink')) armed(q('#xUnlink'), () => { SR.xlsx.unlink(); toast('Unlinked. The file and the data on this device stay as they are.'); route(); });
  q('#xSave').onclick = async () => { const r = await SR.xlsx.save(); if (r.ok) toast('Saved: ' + r.msg); else if (r.msg !== 'cancelled') toast('Not saved: ' + r.msg, true); };
  q('#xIn').onclick = async () => { const r = await SR.xlsx.open(); if (r.ok) { toast('Brought in ' + (r.name || 'database.xlsx') + ': ' + statsText(r.stats)); route(); } else if (r.msg !== 'cancelled') toast(r.msg, true); };
}

/* ---------- router ---------- */
function route() {
  const el = $('#view'), page = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  window.scrollTo(0, 0);
  $('#hTitle').textContent = page === 'data' ? 'Settings' : 'Stoic Ranger Shooting';
  $('#hData').innerHTML = page === 'data' ? 'Done' : '<span aria-hidden="true">⚙</span> Settings';
  if (page === 'data') data(el); else home(el);
}
document.addEventListener('DOMContentLoaded', () => {
  $('#hHome').innerHTML = window.SR_EMBLEM || '';
  $('#hHome').onclick = () => { location.hash = '#/'; };
  $('#hData').onclick = () => { location.hash = location.hash === '#/data' ? '#/' : '#/data'; };
  try { if (window.SRNative && SRNative.isNight) H.setSysDark(SRNative.isNight()); } catch (e) { }
  applyTheme();
  route();
  if (SR.converted) setTimeout(() => toast('Welcome to Stoic Ranger Shooting: your SR_Database data has moved in (a copy of the old file is kept).'), 300);
  else if (SR.damaged) setTimeout(() => toast('The data file was damaged: the previous saved copy was used.', true), 300);
  else xlsxNotice();
});
window.addEventListener('hashchange', route);
/** Changes that came in from the linked database.xlsx (at start, or when the app comes back). */
function xlsxNotice() {
  const r = SR.xlsxResult;
  if (!r) return;
  if (r.error) setTimeout(() => toast(r.error, true), 300);
  else if (r.stats && SR.xlsx && (Object.keys(r.stats.added).length || Object.keys(r.stats.changed).length)) setTimeout(() => toast('From database.xlsx: ' + statsText(r.stats)), 300);
}
})();
