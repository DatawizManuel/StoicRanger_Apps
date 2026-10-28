/* Stoic Ranger - Training Log — dashboard: filters (shooter, year, gun, trainer, live / dry fire), totals split
   live / dry, rounds per gun, training time over time, the last five remarks, the filtered trainings and the
   printable record sheet. */
'use strict';
(() => {
const { $, $$, esc, fh, fmtInt, fmtDate } = TL;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
TL.filterSelects = f => `
  <div class="filters f4">
    <label><span>Shooter</span><select data-f="shooter">${opt('', 'All', f.shooter)}${TL.sorted('shooters').map(s => opt(s.id, s.name, f.shooter)).join('')}</select></label>
    <label><span>Year</span><select data-f="year">${opt('', 'All', f.year)}${TL.years().map(y => opt(y, y, f.year)).join('')}</select></label>
    <label><span>Gun</span><select data-f="weapon">${opt('', 'All', f.weapon)}${TL.sorted('weapons').map(w => opt(w.id, w.name, f.weapon)).join('')}</select></label>
    <label><span>Trainer</span><select data-f="trainer">${opt('', 'All', f.trainer)}${TL.sorted('trainers').map(t => opt(t.id, t.name, f.trainer)).join('')}</select></label>
  </div>
  <div class="seg fireseg">${[['', 'Live + dry'], ['live', 'Live fire'], ['dry', 'Dry fire']].map(([k, l]) => `<a href="javascript:void 0" data-fire="${k}" class="${(f.fire || '') === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;

/** One training as a list card. */
TL.trainingItem = (t, f = {}) => {
  const ws = t.weapons.map(w => `${esc(TL.nameOf('weapons', w.weaponId))}${w.rounds ? ' · ' + fmtInt(w.rounds) : ''}`).join(', ');
  const dry = TL.isDry(t);
  const r = f.weapon ? (t.weapons.find(w => w.weaponId === f.weapon) || {}).rounds || 0 : dry ? TL.reps(t) : TL.rounds(t);
  return `<a class="item" href="#/training/${encodeURIComponent(t.id)}">
    <div class="main">
      <div><span class="date">${fmtDate(t.date)}${t.start ? ' · ' + esc(t.start) : ''}</span>${dry ? '<span class="pill dry">Dry fire</span>' : ''}${t.example ? '<span class="pill example">Example</span>' : ''}</div>
      <div class="desc">${esc(t.desc || '(no description)')}</div>
      <div class="kvs">${f.shooter ? '' : `<span><em>Shooter</em>${esc(TL.nameOf('shooters', t.shooterId))}</span>`}${t.trainerId ? `<span><em>Trainer</em>${esc(TL.nameOf('trainers', t.trainerId))}</span>` : ''}${ws ? `<span><em>Guns</em>${ws}</span>` : ''}</div>
    </div>
    <div class="side"><div class="big">${fh(t.durationH) || '–'}<small class="u"> h</small></div><div class="u">${dry ? (r ? fmtInt(r) + ' reps' : 'dry') : fmtInt(r) + ' rds'}</div></div>
  </a>`;
};

function timeBars(list, f) {
  let keys, label, val = {}, dry = {};
  if (f.year) { keys = MONTHS.map((m, i) => f.year + '-' + String(i + 1).padStart(2, '0')); label = k => MONTHS[+k.slice(5) - 1]; }
  else {
    const ys = TL.years().slice().reverse(); if (!ys.length) return '';
    const lo = +ys[0], hi = +ys[ys.length - 1]; keys = []; for (let y = Math.max(lo, hi - 9); y <= hi; y++) keys.push(String(y)); label = k => k;
  }
  list.forEach(t => {
    const k = (t.date || '').slice(0, f.year ? 7 : 4), h = TL.num(t.durationH) || 0;
    val[k] = (val[k] || 0) + h; if (TL.isDry(t)) dry[k] = (dry[k] || 0) + h;
  });
  const max = Math.max(1, ...keys.map(k => val[k] || 0));
  const both = list.some(TL.isDry) && list.some(t => !TL.isDry(t));
  // stacked: live fire at the bottom, dry fire on top, in its own colour
  return `<div class="card"><h3>Training time per ${f.year ? 'month' : 'year'} <small class="note">h</small></h3>
    <div class="bars">${keys.map(k => { const v = val[k] || 0, d = dry[k] || 0; return `<div><b>${v ? fh(v) : ''}</b><i style="height:${v / max * 100}%"><u style="height:${v ? (v - d) / v * 100 : 0}%"></u><u class="dry" style="height:${v ? d / v * 100 : 0}%"></u></i></div>`; }).join('')}</div>
    <div class="blabels">${keys.map(k => `<span>${label(k)}</span>`).join('')}</div>
    ${both || list.some(TL.isDry) ? '<div class="legend"><span><i class="k-live"></i>Live fire</span><span><i class="k-dry"></i>Dry fire</span></div>' : ''}</div>`;
}

/** The five newest remarks of the filtered trainings (max. 2 lines each); a tap opens the training. */
function lastRemarks(list, f) {
  const L = list.filter(t => (t.remarks || '').trim()).slice(0, 5);   // list is newest first (date, start time)
  if (!L.length) return '';
  return `<div class="card"><h3>Last ${L.length === 1 ? 'remark' : L.length + ' remarks'}</h3><div class="rmks">${L.map(t => `<a class="rmk${TL.isDry(t) ? ' dry' : ''}" href="#/training/${encodeURIComponent(t.id)}">
    <div class="rh">${fmtDate(t.date)}${t.start ? ' · ' + esc(t.start) : ''}${f.shooter ? '' : ' · ' + esc(TL.nameOf('shooters', t.shooterId))} · ${esc(t.desc || '')}</div>
    <p>${esc(t.remarks.trim())}</p></a>`).join('')}</div></div>`;
}

/** Rounds per gun: bars all start on the left (same track width), the count has its own column. */
function roundsTable(s) {
  if (!s.perWeapon.length) return '';
  const max = Math.max(1, ...s.perWeapon.map(p => p.rounds));
  const anyDry = s.perWeapon.some(p => p.dry);
  return `<div class="card"><h3>Rounds per gun</h3><div class="tw"><table class="tbl">
    <thead><tr><th class="t">Gun</th><th>${anyDry ? 'Live/dry' : 'Trainings'}</th><th class="t">Rounds</th></tr></thead>
    <tbody>${s.perWeapon.map(p => { const w = TL.weapon(p.weaponId); return `<tr><td class="t">${esc(w ? w.name : '(deleted)')}${w && w.caliber ? ` <small class="note">${esc(w.caliber)}</small>` : ''}</td>
      <td>${anyDry ? `${p.live}/${p.dry}` : p.trainings}</td>
      <td class="rb"><div class="rbw"><span class="track"><span class="bar" style="width:${p.rounds / max * 100}%"></span></span><span class="n">${fmtInt(p.rounds)}</span></div></td></tr>`; }).join('')}
    <tr><td class="t"><b>Total</b></td><td></td><td class="rb"><div class="rbw"><span class="track" style="background:none"></span><span class="n"><b>${fmtInt(s.rounds)}</b></span></div></td></tr></tbody></table></div>
    ${anyDry ? `<p class="note" style="margin:6px 0 0">Live/dry = number of trainings. Rounds are live fire only; dry fire is not counted${s.reps ? ` (${fmtInt(s.reps)} dry-fire reps logged)` : ''}.</p>` : ''}</div>`;
}

/** A tile with one figure, or live and dry side by side when both kinds are in the selection. */
const split = (live, dry, fmt, unit = '') => `<div class="v2"><span>${fmt(live) || 0}${unit ? `<small> ${unit}</small>` : ''}<em>live</em></span><span class="dry">${fmt(dry) || 0}${unit ? `<small> ${unit}</small>` : ''}<em>dry</em></span></div>`;

TL.views.dash = {
  render(el) {
    TL.header('Training Log', { actions: `<button class="ib" id="dPrint" aria-label="Print record sheet" title="Print record sheet"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg></button>` });
    const f = TL.db.settings.dashFilter;
    // a filter pointing at a deleted entry (or a year without trainings) is dropped
    if (f.shooter && !TL.shooter(f.shooter)) f.shooter = '';
    if (f.weapon && !TL.weapon(f.weapon)) f.weapon = '';
    if (f.trainer && !TL.trainer(f.trainer)) f.trainer = '';
    if (f.year && !TL.years().includes(f.year)) f.year = '';
    if (f.fire && !TL.FIRE[f.fire]) f.fire = '';
    const list = TL.filtered(f), s = TL.summary(list, f);
    const active = Object.values(f).some(Boolean);
    el.innerHTML = `
      <div class="brandbar">${TL.logo('dlogo')}<div><div class="bt">Stoic Ranger</div><div class="bs">Training Log</div></div></div>
      ${TL.filterSelects(f)}
      <div class="fbar"><p class="fnote">${active ? `${s.n} of ${TL.db.trainings.length} trainings` : `All ${s.n} trainings`}</p>
        <div class="row tight">${active ? '<button class="btn sm" id="dClear">Clear filters</button>' : ''}<button class="btn sm pri" id="dPrint2">Print sheet</button></div></div>
      <div class="tiles">
        <div class="tile"><div class="l">Trainings</div>${f.fire ? `<div class="v">${s.n}</div>` : split(s.nLive, s.nDry, String)}<div class="s">${f.fire ? '' : s.n + ' in total · '}${s.trainers} trainer${s.trainers === 1 ? '' : 's'}</div></div>
        <div class="tile"><div class="l">Training time</div>${f.fire ? `<div class="v">${fh(s.hours) || 0}<small> h</small></div>` : split(s.hoursLive, s.hoursDry, fh, 'h')}<div class="s">${f.fire ? (s.n ? 'Ø ' + fh(s.hours / s.n) + ' h per training' : '–') : (fh(s.hours) || 0) + ' h in total'}</div></div>
        <div class="tile"><div class="l">Rounds${f.weapon ? ' (this gun)' : ''}</div><div class="v">${fmtInt(s.rounds) || 0}</div><div class="s">${f.fire === 'dry' ? 'dry fire: no rounds' : `live fire · ${s.perWeapon.length} gun${s.perWeapon.length === 1 ? '' : 's'}`}</div></div>
        <div class="tile"><div class="l">Last training</div><div class="v" style="font-size:22px">${s.last ? fmtDate(s.last) : '–'}</div><div class="s">${s.last ? esc((list[0].desc || '').slice(0, 40)) : ''}</div></div>
      </div>
      ${roundsTable(s)}
      ${list.length ? timeBars(list, f) : ''}
      ${lastRemarks(list, f)}
      <h2>Trainings</h2>
      ${list.length ? `<div class="list">${list.slice(0, 30).map(t => TL.trainingItem(t, f)).join('')}</div>${list.length > 30 ? `<p class="note">${list.length - 30} more under <a href="#/trainings">Trainings</a> and on the printed sheet.</p>` : ''}`
        : `<div class="empty">${TL.db.trainings.length ? 'No training matches these filters.' : 'No trainings yet. Tap <b>New</b> below to enter your first one.'}</div>`}`;
    $$('[data-f]', el).forEach(sel => sel.onchange = () => { f[sel.dataset.f] = sel.value; TL.save(); TL.route(); });
    $$('[data-fire]', el).forEach(a => a.onclick = () => { f.fire = a.dataset.fire; TL.save(); TL.route(); });
    const clr = $('#dClear', el); if (clr) clr.onclick = () => { Object.keys(f).forEach(k => f[k] = ''); TL.save(); TL.route(); };
    const pr = () => TL.printDialog(f);
    $('#dPrint').onclick = pr; $('#dPrint2', el).onclick = pr;
  },
};
})();
