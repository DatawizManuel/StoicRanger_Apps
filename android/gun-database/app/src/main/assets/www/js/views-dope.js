/* Stoic Ranger — Analyse › Dope cards: gun + ammunition → distance table from the point-mass solver (ballistics.js).
   Inputs come from the database and the sheets and are recalculated on every visit, so new sheets update the card:
   MV = measured V0 of this gun with this ammo (else of the ammo, else the maker's), atmosphere = recent sheets
   (else ICAO standard), truing = dialed elevation + group centre at distance from the sheets (min. 3 sets of 10). */
'use strict';
(() => {
const { $, $$, esc, fx, num } = RB;
const MOA = 3.43774677;

/** Everything the card needs for one gun + ammo, from the database and the sheets. */
RB.dopeInputs = (weaponId, munitionId) => {
  const w = RB.weapon(weaponId) || {}, m = RB.munition(munitionId) || {};
  const D = RB.build(), all = D.sessions.filter(s => s.weaponId === weaponId && s.munitionId === munitionId);
  const notes = [];
  // muzzle velocity
  const vs = all.filter(s => s.v0), vNeed = RB.enough(vs.map(s => Math.max(1, s.rounds || s.hits || 1)));
  const N = vs.reduce((a, s) => a + Math.max(1, s.rounds || s.hits || 1), 0);
  let v0 = null, v0src = '';
  if (vNeed.ok && N) { v0 = vs.reduce((a, s) => a + Math.max(1, s.rounds || s.hits || 1) * s.v0, 0) / N; v0src = `measured with this gun · ${N} shots on ${vs.length} sheets`; }
  else { const am = D.munitions.find(x => x.id === munitionId);
    if (am && am.v0 != null) { v0 = am.v0; v0src = `measured with this ammo (all guns) · ${am.v0Shots} shots`; if (vs.length) notes.push('V0 of this gun: ' + vNeed.msg); }
    else if (num(m.nominalV0)) { v0 = num(m.nominalV0); v0src = 'manufacturer' + (num(m.mfrBarrelMm) ? ` (test barrel ${RB.U.fmt('len', num(m.mfrBarrelMm), 0)})` : ''); notes.push('No measured V0 yet: ' + vNeed.msg.replace('Not enough data to evaluate – ', '')); } }
  // drag
  const g7 = num(m.bcG7), g1 = num(m.bcG1);
  // atmosphere: mean of the last 5 sheets of this combo that have weather, else ICAO
  const wx = [...all].filter(s => s.temp != null || s.press != null).slice(-5);
  const avg = k => { const v = wx.map(s => s[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const atm = { temp: avg('temp') ?? 15, press: avg('press'), hum: avg('hum') ?? 50, alt: avg('elev') ?? 0 };
  const atmSrc = wx.length ? `mean of the last ${wx.length} sheet${wx.length > 1 ? 's' : ''} with this gun and ammo` : 'ICAO standard (15 °C, 1013 hPa at sea level)';
  if (atm.press == null) atm.press = +(1013.25 * Math.pow(1 - 2.25577e-5 * atm.alt, 5.25588)).toFixed(1);
  // truing points: dialed elevation corrected by the group centre, at a distance beyond the zero
  const zeroM = num(w.zeroM) || 100;
  const obs = all.filter(s => s.dist && s.dist >= zeroM * 1.5 && s.hits >= 2 && s.my != null).map(s => {
    const sh = RB.sheetById(s.id) || {}, dial = num(sh.dialE); if (dial == null) return null;
    return { id: s.id, date: s.date, no: s.no, dist: s.dist, hits: s.hits, obs: dial - s.my / s.dist, atm: { temp: s.temp ?? atm.temp, press: s.press ?? atm.press, hum: s.hum ?? atm.hum, alt: s.elev ?? atm.alt } };
  }).filter(Boolean);
  const trueNeed = RB.enough(obs.map(o => o.hits));
  return { w, m, v0, v0src, g7, g1, atm, atmSrc, obs, trueNeed, notes, sightMm: num(w.sightHeightMm), zeroM, massG: num(m.bulletWeightG),
    scopeUnit: w.scopeUnit || '', click: num(w.clickValue), sheets: all.length };
};

/** Fit an MV factor (0.92–1.08) so predicted elevations match the observed ones; returns { f, before, after, rows }. */
RB.trueMv = (base, obs) => {
  const pred = (f, o) => RB.elevAt(Object.assign({}, base, { v0: base.v0 * f, air: RB.air(o.atm), windMs: 0 }), o.dist);
  const sse = f => obs.reduce((a, o) => { const p = pred(f, o); return a + (p == null ? 1e3 : (p - o.obs) ** 2 * o.hits); }, 0);
  let a = 0.92, b = 1.08; const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = sse(c), fd = sse(d);
  for (let i = 0; i < 24; i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = sse(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = sse(d); } }
  const f = (a + b) / 2, n = obs.reduce((t, o) => t + o.hits, 0);
  const rms = f2 => Math.sqrt(sse(f2) / n);
  return { f, before: rms(1), after: rms(f), rows: obs.map(o => ({ ...o, p0: pred(1, o), p1: pred(f, o) })) };
};

const store = () => RB.db.settings.dope || (RB.db.settings.dope = { weaponId: '', munitionId: '', step: '', max: '', ang: '', trued: true });

function compute(I, ov, S) {
  const imp = RB.U.imperial(), ang = S.ang || I.scopeUnit || (imp ? 'MOA' : 'mrad');
  const model = ov.model || (I.g7 ? 'G7' : 'G1'), bc = num(ov.bc) ?? (model === 'G7' ? I.g7 : I.g1);
  const v0 = num(ov.v0) ?? I.v0;
  const missing = [!v0 && 'muzzle velocity', !bc && `BC ${model}`, !I.massG && 'bullet weight'].filter(Boolean);
  if (missing.length) return { missing, ang };
  const air = RB.air({ temp: num(ov.temp) ?? I.atm.temp, press: num(ov.press) ?? I.atm.press, hum: num(ov.hum) ?? I.atm.hum, alt: num(ov.alt) ?? I.atm.alt });
  const stepU = num(S.step) || (imp ? 50 : 50), maxU = num(S.max) || (imp ? 1000 : 1000), f = imp ? 0.9144 : 1;
  const base = { v0, bc, model, sightMm: num(ov.sight) ?? I.sightMm ?? 38, zeroM: num(ov.zero) ?? I.zeroM, massG: I.massG, air, stepM: stepU * f, maxM: maxU * f, windMs: imp ? 0.44704 : 1 };
  let tr = null, used = base;
  if (I.trueNeed.ok && I.obs.length && num(ov.v0) == null) { tr = RB.trueMv(base, I.obs); if (S.trued !== false && Math.abs(tr.f - 1) > 0.001 && tr.after < tr.before) used = Object.assign({}, base, { v0: base.v0 * tr.f }); }
  return { ang, model, bc, base, used, tr, res: RB.dope(used), air, stepU, maxU, f };
}

const angOut = (mrad, ang) => ang === 'MOA' ? mrad * MOA : mrad;
const angD = ang => ang === 'MOA' ? 2 : 2;

/** Table HTML for screen and paper. size: 'screen' | 'A6' | 'A5' | 'A4' */
function tableHTML(C, I, size) {
  const U = RB.U, ang = C.ang, click = I.click && I.scopeUnit === ang ? I.click : null, small = size === 'A6';
  const cols = [['Dist ' + U.label('dist'), r => fx(r.x / C.f, 0)], ['Elev ' + ang, r => { const v = Math.abs(angOut(r.elevMrad, ang)).toFixed(angD(ang)); return +v === 0 ? v : (r.elevMrad >= 0 ? 'U ' : 'D ') + v; }]];
  if (click) cols.push(['Clicks', r => Math.round(angOut(r.elevMrad, ang) / click)]);
  cols.push([`Wind ${U.imperial() ? '1 mph' : '1 m/s'}`, r => Math.abs(angOut(r.windMrad, ang)).toFixed(angD(ang))]);
  cols.push(['Drop ' + U.label('drop'), r => U.num('drop', r.dropM * 100)]);
  cols.push(['V ' + U.label('vel'), r => U.num('vel', r.v)]);
  if (!small) { cols.push(['E ' + U.label('energy'), r => U.num('energy', r.e)]); cols.push(['TOF s', r => r.t.toFixed(2)]); }
  const rows = C.res.rows.filter(r => r.x > 0);
  return `<table class="dope"><thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.mach < 1 ? 'sub' : r.mach < 1.2 ? 'trans' : ''}${Math.abs(r.x - C.used.zeroM) < 1e-6 ? ' zero' : ''}">${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function facts(C, I) {
  const U = RB.U;
  return [`MV ${U.fmt('vel', C.used.v0)}${C.used !== C.base ? ' (trued)' : ''}`, `BC ${C.model} ${fx(C.bc, 3)}`, `${U.fmt('mass', I.massG)}`, `sight ${U.fmt('len', C.used.sightMm, U.imperial() ? 2 : 0)}`, `zero ${U.fmt('dist', C.used.zeroM)}`,
    `${U.fmt('temp', C.air.T - 273.15)}`, `${U.fmt('press', C.air.p)}`, `${fx(num(I._hum) ?? I.atm.hum, 0)} % RH`, `ρ ${fx(C.air.rho, 3)} kg/m³`].join(' · ');
}

const PAPER = {
  A6: { page: 'A6', pad: '5mm', fs: '7pt', h1: '10pt', logo: '9mm' },
  A5: { page: 'A5', pad: '8mm', fs: '8.5pt', h1: '13pt', logo: '13mm' },
  A4: { page: 'A4', pad: '12mm', fs: '10pt', h1: '17pt', logo: '18mm' },
};
/** One card per page; cards: [{ C, I }] */
RB.dopePrintHTML = (cards, size) => {
  const P = PAPER[size];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dope card</title><style>${RB.FONTS_CSS}
@page{size:${P.page};margin:0}html,body{margin:0;background:#fff;color:#111}
body{padding:${P.pad};font:${P.fs}/1.25 "Barlow Semi Condensed","Arial Narrow",sans-serif}
.hd{display:flex;align-items:center;gap:2.5mm;border-bottom:.5mm solid #111;padding-bottom:1.5mm;margin-bottom:1.5mm}
.hd svg{width:${P.logo};height:${P.logo};color:#111;flex:none}
h1{font:700 ${P.h1}/1.05 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.03em;margin:0}
.sub{color:#4a4a4a}.facts{color:#4a4a4a;margin:0 0 1.5mm}
table{width:100%;border-collapse:collapse;font-family:"JetBrains Mono",monospace}th{font:600 .82em "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.04em;text-align:right;border-bottom:.3mm solid #111;padding:.4mm 1mm}
td{text-align:right;padding:.35mm 1mm;border-bottom:.15mm solid #d6d6cd}th:first-child,td:first-child{text-align:left;font-weight:700}
tr.zero td{background:#ecece4}tr.trans td{color:#9a6a00}tr.sub td{color:#a3201a}
.pg{break-after:page;page-break-after:always}.pg:last-child{break-after:auto;page-break-after:auto}
.ft{margin-top:1.5mm;color:#4a4a4a;font-size:.85em;display:flex;justify-content:space-between;gap:2mm}</style></head><body>
${cards.map(({ C, I }) => `<section class="pg"><div class="hd">${RB.logo('')}<div><h1>${esc(I.w.name || 'Gun')} · ${esc(I.m.name || 'Ammo')}</h1><div class="sub">Dope card · ${esc(RB.fmtDate(RB.today()))} · elevation and wind hold in ${C.ang}${C.ang === 'MOA' ? '' : ''}</div></div></div>
<div class="facts">${esc(facts(C, I))}</div>
${tableHTML(C, I, size)}
<div class="ft"><span>Wind: hold into the wind, full value (90°). Shaded row: zero. Amber: transonic (Mach &lt; 1.2). Red: subsonic.</span><span>Stoic Ranger - Gun Database</span></div></section>`).join('')}
</body></html>`;
};

/** Gun + ammo combinations in a dashboard-style selection {shooter, weapon, munition}: the pairs shot on its sheets,
    or the chosen gun × chosen ammo when both are set. */
RB.dopeCombos = f => {
  const { sessions } = RB.selectData(f), seen = new Map();
  if (f.weapon && f.munition && RB.weapon(f.weapon) && RB.munition(f.munition)) seen.set(f.weapon + '|' + f.munition, [f.weapon, f.munition]);
  sessions.forEach(s => { if (s.weaponId && s.munitionId) seen.set(s.weaponId + '|' + s.munitionId, [s.weaponId, s.munitionId]); });
  return [...seen.values()];
};
/** Cards for a selection; returns { cards: [{C, I}], skipped: ['gun · ammo: missing …'] } */
RB.dopeCards = f => {
  const S = store(), cards = [], skipped = [];
  RB.dopeCombos(f).forEach(([w, m]) => {
    const I = RB.dopeInputs(w, m), C = compute(I, {}, Object.assign({}, S, { ang: S.ang && S.weaponId === w ? S.ang : '' }));
    if (C.missing) skipped.push(`${I.w.name} · ${I.m.name}: missing ${C.missing.join(', ')}`); else cards.push({ C, I });
  });
  return { cards, skipped };
};

RB.dopeView = (el, q) => {
  RB.header('Dope card', { back: true });
  const S = store(), U = RB.U;
  if (q && q.from === 'dash') { const F = RB.db.settings.dashFilter || {}; if (RB.weapon(F.weapon)) S.weaponId = F.weapon; if (RB.munition(F.munition)) S.munitionId = F.munition; }
  const weapons = RB.db.weapons.filter(w => w.status !== 'Sold'), D = RB.build();
  if (!weapons.length || !RB.db.munitions.length) { el.innerHTML = `<div class="empty">Add a gun and an ammunition in the database first.</div><div class="row"><a class="btn pri" href="#/db/weapons/new">Add a gun</a><a class="btn" href="#/db/munitions/new">Add ammunition</a></div>`; return; }
  if (!RB.weapon(S.weaponId)) S.weaponId = (weapons.find(w => !w.example) || weapons[0]).id;
  const used = new Set(D.sessions.filter(s => s.weaponId === S.weaponId).map(s => s.munitionId));
  const ammo = [...RB.db.munitions].sort((a, b) => used.has(b.id) - used.has(a.id));
  if (!RB.munition(S.munitionId)) S.munitionId = ammo[0].id;
  const I = RB.dopeInputs(S.weaponId, S.munitionId), ov = RB._dopeOv && RB._dopeOv.key === S.weaponId + '|' + S.munitionId ? RB._dopeOv : (RB._dopeOv = { key: S.weaponId + '|' + S.munitionId });
  I._hum = ov.hum;
  const C = compute(I, ov, S);
  const fld = (k, label, kind, val, ph) => `<label class="s2"><span>${esc(label)}${kind ? ' ' + U.label(kind) : ''}</span><input data-o="${k}" data-u="${kind || ''}" type="number" step="any" inputmode="decimal" value="${ov[k] != null ? esc(kind ? U.inp(kind, ov[k]) : ov[k]) : ''}" placeholder="${esc(ph ?? '')}"></label>`;
  const angSel = C.ang;
  const sel = (id, label, opts, v) => `<label><span>${label}</span><select id="${id}">${opts.map(([k, n]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  el.innerHTML = `
    <div class="filters">
      ${sel('dpW', 'Gun', weapons.map(w => [w.id, w.name]), S.weaponId)}
      ${sel('dpM', 'Ammunition', ammo.map(m => [m.id, m.name + (used.has(m.id) ? '' : ' (not shot with this gun)')]), S.munitionId)}
    </div>
    <div class="card"><div class="fg">
      <label class="s2"><span>Angle unit</span><select id="dpA">${['mrad', 'MOA'].map(a => `<option ${angSel === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="s2"><span>Step ${U.label('dist')}</span><input id="dpS" type="number" inputmode="numeric" value="${esc(S.step || '')}" placeholder="50"></label>
      <label class="s2"><span>Up to ${U.label('dist')}</span><input id="dpX" type="number" inputmode="numeric" value="${esc(S.max || '')}" placeholder="1000"></label>
    </div></div>
    ${C.missing ? `<div class="need">Missing for a dope card: ${esc(C.missing.join(', '))}. Add ${C.missing.includes('muzzle velocity') ? 'the manufacturer V0 or Xero velocities on sheets, ' : ''}${C.missing.some(x => x.startsWith('BC')) ? 'BC G1 or G7, ' : ''}${C.missing.includes('bullet weight') ? 'the bullet weight ' : ''}in <a href="#/db/munitions/${encodeURIComponent(S.munitionId)}">the ammunition entry</a> (or type values below).</div>` : `
    <div class="card"><h3>${esc(I.w.name || '')} · ${esc(I.m.name || '')}</h3>
      <p class="note">${esc(facts(C, I))}</p>
      <div class="tw">${tableHTML(C, I, 'screen')}</div>
      <p class="note">Elevation: dial up (U) from your zero. Wind: hold into the wind per ${U.imperial() ? '1 mph' : '1 m/s'} full-value crosswind. ${C.res.transonicM != null ? `Transonic from about ${U.fmt('dist', C.res.transonicM)}${C.res.subsonicM != null ? `, subsonic from ${U.fmt('dist', C.res.subsonicM)}` : ''}; expect more spread there.` : 'Stays supersonic over the whole table.'} No spin drift or Coriolis.</p>
      <div class="row"><button class="btn pri" data-pr="A6">Print A6</button><button class="btn" data-pr="A5">Print A5</button><button class="btn" data-pr="A4">Print A4</button></div></div>`}
    <div class="card"><h3>Where the numbers come from</h3><div class="kv3">
      <div><div class="l">Muzzle velocity</div><div class="v sm">${C.base ? U.fmt('vel', C.base.v0) : '–'}</div><div class="note">${esc(num(ov.v0) != null ? 'typed below' : I.v0src || 'none yet')}</div></div>
      <div><div class="l">Drag</div><div class="v sm">${C.bc ? `${C.model} ${fx(C.bc, 3)}` : '–'}</div><div class="note">${I.g7 && I.g1 ? 'G7 and G1 in the DB' : I.g7 ? 'G7 from the DB' : I.g1 ? 'G1 from the DB' : 'no BC in the DB'}</div></div>
      <div><div class="l">Atmosphere</div><div class="v sm">${C.air ? U.fmt('temp', C.air.T - 273.15) + ' · ' + U.fmt('press', C.air.p) : '–'}</div><div class="note">${esc(I.atmSrc)}</div></div></div>
      ${I.notes.map(n => `<p class="need">${esc(n)}</p>`).join('')}
      ${C.tr ? `<h3>Truing with your sheets</h3><p class="note">${C.tr.rows.length} sheets with distance, dialed elevation and hits. RMS error ${fx(angOut(C.tr.before, C.ang), 2)} ${C.ang} with the plain MV, ${fx(angOut(C.tr.after, C.ang), 2)} ${C.ang} with MV × ${fx(C.tr.f, 3)} (${U.fmt('vel', C.base.v0 * C.tr.f)}).</p>
        <label class="inl"><input type="checkbox" id="dpT" ${S.trued !== false ? 'checked' : ''}> Use the trued MV</label>
        <div class="tw"><table class="tbl"><thead><tr><th class="t">Sheet</th><th>${U.label('dist')}</th><th>Needed</th><th>Calc.</th><th>Trued</th></tr></thead><tbody>${C.tr.rows.map(r => `<tr><td class="t">${esc(RB.fmtDate(r.date))} ${esc(r.no || '')}</td><td>${U.num('dist', r.dist)}</td><td>${fx(angOut(r.obs, C.ang), 2)}</td><td>${r.p0 != null ? fx(angOut(r.p0, C.ang), 2) : '–'}</td><td>${r.p1 != null ? fx(angOut(r.p1, C.ang), 2) : '–'}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="need">Truing: ${I.obs.length ? I.trueNeed.msg : `no sheets yet with distance beyond ${U.fmt('dist', I.zeroM * 1.5)}, dialed elevation and hits.`}</p>`}</div>
    <details class="card"><summary><b>Change inputs for this card</b></summary><p class="note">Empty = value from the database and sheets. Changes here are only for this card; edit the gun or ammo entry to keep them.</p><div class="fg">
      ${fld('v0', 'MV', 'vel', null, C.base ? U.num('vel', C.base.v0) : '')}
      <label class="s2"><span>Drag model</span><select data-o="model"><option value="">${I.g7 ? 'G7' : 'G1'} (auto)</option><option ${ov.model === 'G7' ? 'selected' : ''}>G7</option><option ${ov.model === 'G1' ? 'selected' : ''}>G1</option></select></label>
      ${fld('bc', 'BC', '', null, C.bc ? fx(C.bc, 3) : '')}
      ${fld('sight', 'Sight height', 'len', null, U.num('len', I.sightMm ?? 38))}
      ${fld('zero', 'Zero', 'dist', null, U.num('dist', I.zeroM))}
      ${fld('temp', 'Temperature', 'temp', null, U.num('temp', I.atm.temp))}
      ${fld('press', 'Pressure', 'press', null, U.num('press', I.atm.press))}
      ${fld('hum', 'Humidity %', '', null, fx(I.atm.hum, 0))}
      ${fld('alt', 'Altitude', 'alt', null, U.num('alt', I.atm.alt))}
    </div><div class="row"><button class="btn" id="dpReset">Back to database values</button></div></details>`;
  const re = () => RB.dopeView(el, q);
  $('#dpW').onchange = e => { S.weaponId = e.target.value; RB.save(); re(); };
  $('#dpM').onchange = e => { S.munitionId = e.target.value; RB.save(); re(); };
  $('#dpA').onchange = e => { S.ang = e.target.value; RB.save(); re(); };
  $('#dpS').onchange = e => { S.step = e.target.value; RB.save(); re(); };
  $('#dpX').onchange = e => { S.max = e.target.value; RB.save(); re(); };
  const t = $('#dpT'); if (t) t.onchange = () => { S.trued = t.checked; RB.save(); re(); };
  $$('[data-o]', el).forEach(i => i.onchange = () => { const k = i.dataset.o, u = i.dataset.u; ov[k] = i.value === '' ? null : (u ? RB.U.to(u, i.value) : (k === 'model' ? i.value : num(i.value))); re(); });
  $('#dpReset').onclick = () => { RB._dopeOv = null; re(); };
  $$('[data-pr]', el).forEach(b => b.onclick = () => RB.print(RB.dopePrintHTML([{ C, I }], b.dataset.pr), `dopecard_${(I.w.name || '').replace(/[^\w-]+/g, '-')}_${(I.m.name || '').replace(/[^\w-]+/g, '-')}_${b.dataset.pr}`, b.dataset.pr));
};
})();
