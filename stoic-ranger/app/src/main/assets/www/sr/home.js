/* Stoic Ranger 1.0 — home page: today's wisdom, the three parts with their key figures, quick "new" buttons,
   and Data (backup of everything, restore, bringing in the old apps' backups, theme, about). */
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
    favs: arr(d.favs).length, thoughts: arr(d.thoughtFavs).length, last,
  };
}

/* ---------- home ---------- */
function home(el) {
  const f = figures();
  const wisdom = window.SRWisdom && SRWisdom.card ? SRWisdom.card() : '';
  el.innerHTML = `
    ${SR.readOnly ? '<div class="banner warn">This data was saved by a newer version of Stoic Ranger. Nothing is changed or saved until you update the app.</div>' : ''}
    ${wisdom}
    <div class="srnew">
      <a class="btn pri" href="training/index.html#/training/new">+ Training</a>
      <a class="btn pri" href="gun/index.html#/dash?srAdd=1">+ Datasheet</a>
      <a class="btn pri" href="drills/index.html#/result/new">+ Drill result</a>
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
    <a class="choice srpart dt" href="thoughts/index.html"><div class="ic">❦</div><div><h3>Daily Thoughts</h3>
      <p>A thought for each day from the Stoics and the thinkers around them</p>
      <p class="mono">${f.thoughts} favourite quote${f.thoughts === 1 ? '' : 's'}</p></div></a>
    <h2>${year} at a glance</h2>
    <div class="tiles">
      <div class="tile"><div class="l">Trainings</div><div class="v">${f.trainings}</div><div class="s">${f.trainings - f.dry} live · ${f.dry} dry</div></div>
      <div class="tile"><div class="l">Hours</div><div class="v">${fmt1(f.hours)}</div><div class="s">training time</div></div>
      <div class="tile"><div class="l">Live rounds</div><div class="v">${fmtInt(f.rounds)}</div><div class="s">from trainings</div></div>
      <div class="tile"><div class="l">Datasheets</div><div class="v">${f.sheetsYear}</div><div class="s">${f.sheets} in total</div></div>
      <div class="tile"><div class="l">Drill results</div><div class="v">${f.resultsYear}</div><div class="s">${f.results} in total</div></div>
      <div class="tile"><div class="l">Active guns</div><div class="v">${f.guns}</div><div class="s">${f.barrels} barrels</div></div>
    </div>
    <p class="note">The full overviews are in each part: Gun Database › Dashboard and Training Log › Dashboard.</p>`;
  if (window.SRWisdom && SRWisdom.wire) SRWisdom.wire(el);
}

/* ---------- data ---------- */
const describe = j => SR.isUnified(j) ? 'Stoic Ranger backup' : SR.isTrainingLog(j) ? 'SR_Training Log backup' : SR.isDrills(j) ? 'SR_Shooting Drills backup' : SR.isThoughts(j) ? 'SR_Daily Thoughts backup' : SR.isGunDb(j) ? 'SR_Database (Gun Database) backup' : '';
const count = (j, t) => arr(j[t]).filter(r => r && !r.example).length;
async function bringIn() {
  const f = await SR.openJson();
  if (!f.ok) { if (f.msg !== 'cancelled') toast(f.msg, true); return; }
  const j = f.json, kind = describe(j);
  if (!kind) { toast('This is not a Stoic Ranger backup.', true); return; }
  if (SR.isGunDb(j)) {
    const m = sheet('Gun Database backup', `<p>${esc(f.name)}: ${count(j, 'weapons')} guns, ${count(j, 'sheets')} datasheets.</p>
      <p class="note">Gun Database backups are merged in the Gun Database part: More › Import.</p>
      <div class="stack"><a class="btn pri" href="gun/index.html#/more">Open Gun Database › More</a></div>`);
    return m;
  }
  if (SR.isUnified(j)) {
    const m = sheet('Restore Stoic Ranger backup', `<p>${esc(f.name)}${j.backup ? ' · saved ' + esc(fmtDate(String(j.backup).slice(0, 10))) : ''}: ${count(j, 'weapons')} guns, ${count(j, 'sheets')} datasheets, ${count(j, 'trainings')} trainings, ${count(j, 'results')} drill results.</p>
      <p class="note">This replaces everything on this device (now ${count(SR.db, 'weapons')} guns, ${count(SR.db, 'trainings')} trainings, ${count(SR.db, 'results')} drill results). A copy of the current data is kept on the device first.</p>
      <div class="stack"><button class="btn warn big" id="rGo">Replace all data with this backup</button></div>`);
    armed($('#rGo', m.body), () => { if (SR.restoreAll(j)) { m.close(); toast('Backup restored.'); route(); } else toast('Could not restore: the backup is from a newer version, or saving failed.', true); });
    return;
  }
  if (SR.isThoughts(j)) {
    const m = sheet('Bring in ' + kind, `<p>${esc(f.name)}: ${arr(j.favs).length} favourite quotes.</p>
      <p class="note">Added to your favourite quotes, nothing is deleted; quotes that are already favourites stay as they are.</p>
      <div class="stack"><button class="btn pri big" id="iGo">Bring in</button></div>`);
    $('#iGo', m.body).onclick = () => {
      const r = SR.importBackup(j);
      m.close();
      if (r.error) { toast('Read-only: update the app first.', true); return; }
      toast(`Brought in: ${(r.stats.added || {}).favs || 0} favourite quotes.`);
      route();
    };
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
    <div class="card"><h3>Backup</h3>
      <p class="note">Guns, datasheets, trainings, drill results and favourite quotes live in one database on this device. A backup holds all of it: save one now and then (cloud drive, e-mail to yourself …); it is also how you move to a new phone.</p>
      <div class="stack"><button class="btn pri" data-sr="save">Save a backup of everything</button><button class="btn" data-sr="share">Share a backup</button></div></div>
    <div class="card"><h3>Restore or bring in</h3>
      <p class="note">Pick a backup file: a <b>Stoic Ranger</b> backup restores everything; a backup of the old <b>SR_Training Log</b>, <b>SR_Shooting Drills</b> or <b>SR_Daily Thoughts</b> app is merged into your data (that is how their data moves into this app).</p>
      <div class="stack"><button class="btn" id="dIn">Choose a backup file</button></div></div>
    <div class="card"><h3>Appearance</h3>
      <div class="seg">${[['auto', 'Follow phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<a href="javascript:void 0" data-theme="${k}" class="${(d.settings.common.theme || 'auto') === k ? 'on' : ''}">${l}</a>`).join('')}</div></div>
    <div class="card"><h3>About</h3>
      <p><b>Stoic Ranger</b> ${esc(info.version || '')}${info.android && info.android !== 'web app' ? ' · Android ' + esc(info.android) : info.android ? ' · web app' : ''}</p>
      <p class="note">One app, one database: Gun Database, Training Log, Shooting Drills and Daily Thoughts (until version 0.x separate apps). ${count(d, 'weapons')} guns · ${count(d, 'shooters')} shooters · ${count(d, 'trainers')} trainers · ${count(d, 'sheets')} datasheets · ${count(d, 'trainings')} trainings · ${count(d, 'results')} drill results · ${arr(d.thoughtFavs).length} favourite quotes.</p>
      <p class="note">No account, no tracking: all entries stay on this device unless you export or share them.</p>
      <div class="row"><button class="btn warn" id="dWipe">Delete all data on this device</button></div></div>`;
  SR.wireData(el, toast);
  $('#dIn', el).onclick = bringIn;
  el.querySelectorAll('[data-theme]').forEach(a => a.onclick = () => { d.settings.common.theme = a.dataset.theme; SR.save(); applyTheme(); route(); });
  armed($('#dWipe', el), () => {
    try { window.SRNative.backupDb('db-before-delete-' + Date.now() + '.json'); } catch (e) { }
    const theme = d.settings.common.theme;
    SR.restoreAll({ app: 'stoic-ranger', format: 1, created: SR.now(), schemas: {}, settings: { common: { theme } }, history: [] });
    toast('All data deleted (a copy is kept on the device).'); location.hash = '#/';
  });
}

/* ---------- router ---------- */
function route() {
  const el = $('#view'), page = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  window.scrollTo(0, 0);
  $('#hTitle').textContent = page === 'data' ? 'Data' : 'Stoic Ranger';
  if (page === 'data') data(el); else home(el);
}
document.addEventListener('DOMContentLoaded', () => {
  $('#hHome').innerHTML = window.SR_EMBLEM || '';
  $('#hHome').onclick = () => { location.hash = '#/'; };
  $('#hData').onclick = () => { location.hash = location.hash === '#/data' ? '#/' : '#/data'; };
  try { if (window.SRNative && SRNative.isNight) H.setSysDark(SRNative.isNight()); } catch (e) { }
  applyTheme();
  route();
  if (SR.converted) setTimeout(() => toast('Welcome to Stoic Ranger 1.0: your SR_Database data has moved in (a copy of the old file is kept).'), 300);
  else if (SR.damaged) setTimeout(() => toast('The data file was damaged: the previous saved copy was used.', true), 300);
});
window.addEventListener('hashchange', route);
// the day changes while the app stays open: today's thought follows
let day = window.SRWisdom ? SRWisdom.day() : 0;
document.addEventListener('visibilitychange', () => { if (!document.hidden && window.SRWisdom && SRWisdom.day() !== day) { day = SRWisdom.day(); if (!/data/.test(location.hash)) route(); } });
})();
