/* Stoic Ranger Shooting — home page overviews (1.2.0, remarks #8 and #9, Manuel 2026-10-29 / 2026-11-01).
   What the PC dashboard shows, on every platform (Android, iPhone web app, Windows): guns, training and drills with
   filters (year, shooter, gun), the dope cards that can be made from the datasheets, and the paper datasheet
   (save the blank PDF, bring a filled-in sheet back). Read-only: it never changes the database.
   The filter is a view setting of this device: kept in localStorage, never in the database (so it never sends a
   changed database.xlsx round just for a tab). */
'use strict';
(() => {
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = v => { const n = +String(v == null ? '' : v).replace(',', '.'); return isFinite(n) ? n : 0; };
const fmtInt = n => Math.round(n).toLocaleString('de-AT');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('de-AT');
const fmtDate = d => d ? d.split('-').reverse().join('.') : '';
const arr = a => Array.isArray(a) ? a : [];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const TABS = [['guns', 'Guns'], ['training', 'Training'], ['drills', 'Drills'], ['dope', 'Dope cards']];

const O = window.SROverview = {};

/* ---------- filter ---------- */
const FKEY = 'sr.home.overview';
let FIL = null;
function filter() {
  if (FIL) return FIL;
  let s = {}; try { s = JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch (e) { }
  return FIL = Object.assign({ tab: 'guns', year: String(new Date().getFullYear()), shooter: '', weapon: '' }, s);
}
const inYear = (d, y) => !y || String(d || '').startsWith(y);
const real = t => arr(SR.db[t]).filter(r => r && !r.example);
const byId = t => new Map(arr(SR.db[t]).map(r => [r.id, r]));
const roundsOf = t => arr(t.weapons).reduce((a, w) => a + num(w.rounds), 0);
const sheetRounds = s => num(s.rounds) || arr(s.hits).length;
function data(F) {
  const shooterOk = r => !F.shooter || r.shooterId === F.shooter;
  const trainings = real('trainings').filter(t => inYear(t.date, F.year) && shooterOk(t) && (!F.weapon || arr(t.weapons).some(w => w.weaponId === F.weapon)));
  const sheets = real('sheets').filter(s => inYear(s.date, F.year) && shooterOk(s) && (!F.weapon || s.weaponId === F.weapon));
  const results = real('results').filter(r => inYear(r.date, F.year) && shooterOk(r) && (!F.weapon || r.weaponId === F.weapon));
  return { trainings, sheets, results };
}
function years() {
  const ys = new Set([String(new Date().getFullYear())]);
  ['trainings', 'sheets', 'results'].forEach(t => real(t).forEach(r => { const y = String(r.date || '').slice(0, 4); if (/^\d{4}$/.test(y)) ys.add(y); }));
  return [...ys].sort().reverse();
}
const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;

/* ---------- small SVG bar chart (theme colours, no library) ---------- */
function bars(items, unit) {
  const max = Math.max(1, ...items.map(i => i.v));
  const W = 320, H = 120, bw = W / Math.max(1, items.length);
  return `<svg class="ovbars" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="${esc(unit)}">
    ${items.map((i, k) => { const h = Math.round(i.v / max * H); return `<rect x="${(k * bw + 2).toFixed(1)}" y="${H - h}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${h}"><title>${esc(i.l)}: ${esc(fmt1(i.v))} ${esc(unit)}</title></rect>
      <text x="${(k * bw + bw / 2).toFixed(1)}" y="${H + 13}" text-anchor="middle">${esc(i.s || i.l)}</text>`; }).join('')}</svg>`;
}
function hbars(items, unit) {
  const max = Math.max(1, ...items.map(i => i.v));
  return `<div class="ovh">${items.map(i => `<div class="r"><span class="l">${esc(i.l)}</span><span class="b"><i style="width:${(i.v / max * 100).toFixed(1)}%"></i></span><span class="v">${esc(i.f || fmtInt(i.v))}${unit ? ' ' + esc(unit) : ''}</span></div>`).join('')}</div>`;
}
const table = (head, rows) => rows.length ? `<div class="ovt"><table><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="t"'}>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' class="t"'}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
const none = t => `<p class="note">${esc(t)}</p>`;

/* ---------- tabs ---------- */
function guns(D, F) {
  const W = byId('weapons'), M = byId('munitions');
  const per = new Map();
  const at = id => per.get(id) || (per.set(id, { tr: 0, sh: 0, rounds: 0, last: '', v: [] }), per.get(id));
  D.trainings.filter(t => t.fire !== 'dry').forEach(t => arr(t.weapons).forEach(w => { if (!w.weaponId) return; const g = at(w.weaponId); g.tr++; g.rounds += num(w.rounds); if ((t.date || '') > g.last) g.last = t.date; }));
  D.sheets.forEach(s => { if (!s.weaponId) return; const g = at(s.weaponId); g.sh++; if ((s.date || '') > g.last) g.last = s.date; if (num(s.v0) > 0) g.v.push([num(s.v0), Math.max(1, sheetRounds(s)), s.munitionId]); });
  const rows = [...per.entries()].filter(([id]) => !F.weapon || id === F.weapon).map(([id, g]) => ({ id, name: (W.get(id) || {}).name || id, ...g })).sort((a, b) => b.rounds - a.rounds);
  if (!rows.length) return none('No trainings or datasheets with a gun for this selection.');
  const v0 = g => { const n = g.v.reduce((a, x) => a + x[1], 0); return n ? fmtInt(g.v.reduce((a, x) => a + x[0] * x[1], 0) / n) + ' m/s' : '–'; };
  // ammunition used on the datasheets of the selection
  const ammo = new Map();
  D.sheets.forEach(s => { if (!s.munitionId) return; const a = ammo.get(s.munitionId) || { n: 0, rounds: 0 }; a.n++; a.rounds += sheetRounds(s); ammo.set(s.munitionId, a); });
  return `<h3>Rounds per gun</h3>${hbars(rows.map(g => ({ l: g.name, v: g.rounds })), 'rds')}
    ${table(['Gun', 'Trainings', 'Sheets', 'Rounds', 'V0', 'Last'], rows.map(g => [esc(g.name), g.tr, g.sh, fmtInt(g.rounds), v0(g), esc(fmtDate(g.last))]))}
    ${ammo.size ? `<h3>Ammunition on datasheets</h3>${table(['Ammunition', 'Sheets', 'Rounds'], [...ammo.entries()].sort((a, b) => b[1].rounds - a[1].rounds).map(([id, a]) => [esc((M.get(id) || {}).name || id), a.n, fmtInt(a.rounds)]))}` : ''}
    <div class="row"><a class="btn sm" href="gun/index.html#/dash">Gun Database › Dashboard</a><a class="btn sm" href="gun/index.html#/analyse">Analyse</a></div>`;
}
function training(D, F) {
  const t = D.trainings;
  if (!t.length) return none('No trainings for this selection.');
  const live = t.filter(x => x.fire !== 'dry'), hours = t.reduce((a, x) => a + num(x.durationH), 0);
  const S = byId('shooters'), Tr = byId('trainers');
  const month = Array.from({ length: 12 }, (_, i) => ({ l: MONTHS[i], s: MONTHS[i], v: 0 }));
  t.forEach(x => { const m = +String(x.date || '').slice(5, 7); if (m >= 1 && m <= 12) month[m - 1].v += num(x.durationH); });
  const last = [...t].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8);
  return `<div class="tiles"><div class="tile"><div class="l">Trainings</div><div class="v">${t.length}</div><div class="s">${live.length} live · ${t.length - live.length} dry</div></div>
      <div class="tile"><div class="l">Hours</div><div class="v">${fmt1(hours)}</div><div class="s">training time</div></div>
      <div class="tile"><div class="l">Live rounds</div><div class="v">${fmtInt(live.reduce((a, x) => a + roundsOf(x), 0))}</div><div class="s">from trainings</div></div></div>
    ${F.year ? `<h3>Training hours per month</h3>${bars(month, 'h')}` : ''}
    <h3>Last trainings</h3>
    ${table(['Date', 'Shooter', 'Fire', 'h', 'Rounds', 'Trainer'], last.map(x => [esc(fmtDate(x.date)), esc((S.get(x.shooterId) || {}).name || ''), x.fire === 'dry' ? 'dry' : 'live', fmt1(num(x.durationH)), x.fire === 'dry' ? '–' : fmtInt(roundsOf(x)), esc((Tr.get(x.trainerId) || {}).name || '')]))}
    <div class="row"><a class="btn sm" href="training/index.html#/dash">Training Log › Dashboard</a></div>`;
}
function drills(D, F) {
  const r = D.results;
  if (!r.length) return none('No drill results for this selection.');
  const names = window.SR_DRILL_NAMES || {};
  const month = Array.from({ length: 12 }, (_, i) => ({ l: MONTHS[i], s: MONTHS[i], v: 0 }));
  r.forEach(x => { const m = +String(x.date || '').slice(5, 7); if (m >= 1 && m <= 12) month[m - 1].v++; });
  const per = new Map();
  r.forEach(x => { const k = x.drillId || x.drillName || '?'; const p = per.get(k) || { n: 0, pass: 0, fail: 0, best: null, pts: null, last: '' }; p.n++;
    if (x.pass === true) p.pass++; if (x.pass === false) p.fail++;
    const t = num(x.timeS); if (x.timeS != null && x.timeS !== '' && t > 0 && x.pass !== false && (p.best == null || t < p.best)) p.best = t;
    const pt = x.points != null && x.points !== '' ? num(x.points) : (x.hits != null && x.hits !== '' ? num(x.hits) : null); if (pt != null && (p.pts == null || pt > p.pts)) p.pts = pt;
    if ((x.date || '') > p.last) p.last = x.date; per.set(k, p); });
  const rows = [...per.entries()].sort((a, b) => b[1].n - a[1].n);
  return `${F.year ? `<h3>Runs per month</h3>${bars(month, 'runs')}` : ''}
    <h3>Runs per drill</h3>${hbars(rows.slice(0, 12).map(([k, p]) => ({ l: names[k] || k, v: p.n })), '')}
    ${table(['Drill', 'Runs', 'Passed', 'Best time', 'Best score', 'Last'], rows.map(([k, p]) => [esc(names[k] || k), p.n, p.pass + p.fail ? `${p.pass}/${p.pass + p.fail}` : '–', p.best != null ? fmt1(p.best) + ' s' : '–', p.pts != null ? fmtInt(p.pts) : '–', esc(fmtDate(p.last))]))}
    <div class="row"><a class="btn sm" href="drills/index.html">Shooting Drills</a></div>`;
}
function dope(D) {
  const W = byId('weapons'), M = byId('munitions'), seen = new Map();
  D.sheets.forEach(s => { if (s.weaponId && s.munitionId && W.get(s.weaponId) && M.get(s.munitionId)) { const k = s.weaponId + '|' + s.munitionId; const x = seen.get(k) || { w: s.weaponId, m: s.munitionId, n: 0, last: '' }; x.n++; if ((s.date || '') > x.last) x.last = s.date; seen.set(k, x); } });
  const list = [...seen.values()].sort((a, b) => String(b.last).localeCompare(String(a.last)));
  const missing = x => { const m = M.get(x.m), w = W.get(x.w); return [!(num(m.bcG1) > 0 || num(m.bcG7) > 0) && 'BC', !(num(m.bulletWeightG) > 0) && 'bullet weight', !(num(w.zeroM) > 0) && 'zero'].filter(Boolean); };
  return `<p class="note">One dope card per gun and ammunition you shot on your datasheets: elevation and wind holds by distance, from your measured muzzle velocity. Open one to set the conditions and print it (A4, A5 or A6).</p>
    ${list.length ? `<div class="list">${list.map(x => { const ms = missing(x); return `<a class="item" href="gun/index.html#/analyse/dope?w=${encodeURIComponent(x.w)}&m=${encodeURIComponent(x.m)}"><div class="main"><div class="t">${esc(W.get(x.w).name)} · ${esc(M.get(x.m).name)}</div>
      <div class="kvs"><span>${x.n} sheet${x.n === 1 ? '' : 's'}</span><span>last ${esc(fmtDate(x.last))}</span>${ms.length ? `<span class="warn">missing ${esc(ms.join(', '))}</span>` : ''}</div></div><span class="chev">›</span></a>`; }).join('')}</div>` : none('No datasheets with a gun and an ammunition for this selection yet.')}
    <div class="row"><a class="btn sm" href="gun/index.html#/analyse/dope">Open dope cards</a><a class="btn sm" href="gun/index.html#/download">Print all dope cards</a></div>`;
}

/* ---------- the paper datasheet (#9) ---------- */
function paper() {
  return `<div class="card"><h3>Paper datasheet</h3>
    <p class="note">Print the empty long-range training datasheet, fill it in by hand at the range, then bring it back: photograph it and the app reads it in (with Claude, or you place the hits yourself and type the fields).</p>
    <div class="row"><button class="btn" id="ovBlank">Save empty datasheet (PDF)</button><a class="btn" href="gun/index.html#/download">Print empty sheets</a><a class="btn pri" href="gun/index.html#/analyse/scan">Bring in a filled-in sheet</a></div></div>`;
}
async function saveBlank(toast) {
  try {
    const b = new Uint8Array(await (await fetch('sr/printables/datasheet-blank.pdf')).arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    const r = await SR.saveAs('training-datasheet-blank.pdf', 'application/pdf', btoa(s));
    if (r && r.ok) toast('Saved: ' + r.msg); else if (r && r.msg !== 'cancelled') toast('Not saved: ' + r.msg, true);
  } catch (e) { toast('The empty datasheet could not be read: ' + e.message, true); }
}

/* ---------- public ---------- */
O.html = () => {
  const F = filter(), D = data(F);
  const sh = real('shooters'), ws = real('weapons');
  const body = F.tab === 'training' ? training(D, F) : F.tab === 'drills' ? drills(D, F) : F.tab === 'dope' ? dope(D) : guns(D, F);
  return `<h2>Overview</h2>
    <div class="seg scroll" id="ovTabs">${TABS.map(([k, l]) => `<a href="javascript:void 0" data-ov="${k}" class="${F.tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="ovf">
      <label><span>Year</span><select id="ovYear">${opt('', 'All years', F.year)}${years().map(y => opt(y, y, F.year)).join('')}</select></label>
      <label><span>Shooter</span><select id="ovShooter">${opt('', 'All shooters', F.shooter)}${sh.map(s => opt(s.id, s.name || s.id, F.shooter)).join('')}</select></label>
      <label><span>Gun</span><select id="ovWeapon">${opt('', 'All guns', F.weapon)}${ws.map(w => opt(w.id, w.name || w.id, F.weapon)).join('')}</select></label>
    </div>
    <div id="ovBody">${body}</div>
    ${paper()}`;
};
/** Wire the overview inside el; redraw() redraws the home page. The filter is a view setting, saved quietly. */
O.wire = (el, redraw, toast) => {
  const F = filter();
  const keep = () => { try { localStorage.setItem(FKEY, JSON.stringify(F)); } catch (e) { } redraw(); };
  el.querySelectorAll('[data-ov]').forEach(a => a.onclick = () => { F.tab = a.dataset.ov; keep(); });
  [['ovYear', 'year'], ['ovShooter', 'shooter'], ['ovWeapon', 'weapon']].forEach(([id, k]) => { const s = $('#' + id, el); if (s) s.onchange = () => { F[k] = s.value; keep(); }; });
  const b = $('#ovBlank', el); if (b) b.onclick = () => saveBlank(toast);
};
})();
