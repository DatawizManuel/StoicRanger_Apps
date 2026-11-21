/* SR Dashboard — pages. One overview across SR Shooting, SR GunSafe, SR Field Kit, SR Physical Fitness and
   SR Daily Thoughts, read from database.xlsx (js/data.js). The dashboard never writes the file.
   Native part (Windows): window.SRDN from preload.js. Without it (a plain browser, tests) a file can be opened by hand. */
'use strict';
(() => {
const N = window.SRDN || null;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WDN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayMs = 864e5, dt = s => new Date(s + 'T12:00:00Z');
const isoOf = d => d.toISOString().slice(0, 10);
const fmtN = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-GB').replace(/,/g, ' ');
const fmtD = s => { if (!s) return '–'; const d = dt(s); return String(d.getUTCDate()).padStart(2, '0') + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const fmtDs = s => { if (!s) return '–'; const d = dt(s); return String(d.getUTCDate()).padStart(2, '0') + ' ' + MON[d.getUTCMonth()]; };
const longDay = s => dt(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ---------- settings (config.json on Windows, browser storage otherwise) ---------- */
const DEF = { theme: 'system', units: 'metric', apps: { sh: true, gs: true, fk: true, pf: true, dt: true }, start: 'overview', period: 'year', laneRange: 'h', laneStep: 'day' };
let P = JSON.parse(JSON.stringify(DEF));
try { Object.assign(P, N ? N.getCfg() : JSON.parse(localStorage.getItem('srdash') || '{}')); P.apps = Object.assign({}, DEF.apps, P.apps); } catch (e) { }
const savePrefs = () => { const o = { theme: P.theme, units: P.units, apps: P.apps, start: P.start, period: P.period, laneRange: P.laneRange, laneStep: P.laneStep }; try { if (N) N.setCfg(o); else localStorage.setItem('srdash', JSON.stringify(o)); } catch (e) { } };
const ST = { page: P.start || 'overview', sort: { k: 'date', d: -1 }, q: '', D: null, F: null, err: '', file: null, readAt: null };

/* ---------- units (stored metric; imperial is display only) ---------- */
const imp = () => P.units === 'imperial';
const kg = v => v == null ? '–' : imp() ? (v * 2.20462).toFixed(1) + ' lb' : (+v).toFixed(1) + ' kg';
const kgD = v => (v > 0 ? '+' : '') + (imp() ? (v * 2.20462).toFixed(1) + ' lb' : v.toFixed(1) + ' kg');
const km = v => v == null ? '–' : imp() ? (v * 0.621371).toFixed(1) + ' mi' : (+v).toFixed(1) + ' km';
const mDist = v => v == null ? '–' : imp() ? Math.round(v * 1.09361) + ' yd' : Math.round(v) + ' m';
const L = v => imp() ? Math.round(v / 29.5735) + ' fl oz' : (v / 1000).toFixed(2) + ' l';
const mm = v => v == null ? '–' : imp() ? (v / 25.4).toFixed(2) + ' in' : Math.round(v) + ' mm';
const mps = v => v == null ? '–' : imp() ? Math.round(v * 3.28084) + ' ft/s' : Math.round(v) + ' m/s';

/* ---------- periods ---------- */
const today = () => SRD.todayIso();
function periodStart(p) {
  const t = today(), d = dt(t);
  if (p === 'week') return isoOf(new Date(d - ((d.getUTCDay() + 6) % 7) * dayMs));
  if (p === 'month') return t.slice(0, 8) + '01';
  if (p === 'year') return t.slice(0, 4) + '-01-01';
  if (p === '12m') return isoOf(new Date(d - 365 * dayMs));
  return '0000-01-01';
}
const PERIOD_LABEL = { week: 'this week', month: 'this month', year: 'this year', '12m': 'last 12 months', all: 'all time' };
const inP = date => date >= periodStart(P.period) && date <= today();

const APPS = [
  { k: 'sh', page: 'shooting', name: 'SR Shooting', short: 'Shooting', c: 'var(--c-sh)' },
  { k: 'gs', page: 'gunsafe', name: 'SR GunSafe', short: 'GunSafe', c: 'var(--c-gs)' },
  { k: 'fk', page: 'fieldkit', name: 'SR Field Kit', short: 'Field Kit', c: 'var(--c-fk)' },
  { k: 'pf', page: 'fitness', name: 'SR Physical Fitness', short: 'Physical Fitness', c: 'var(--c-pf)' },
  { k: 'dt', page: 'thoughts', name: 'SR Daily Thoughts', short: 'Daily Thoughts', c: 'var(--c-dt)' },
];
const PAL = ['var(--c-sh)', 'var(--c-dr)', '#b08d3c', 'var(--c-pf)', '#a86a3c', '#8a8f7a', 'var(--c-gs)', 'var(--c-fk)', '#6f5a8a', '#3d7a8a'];
const gunCol = id => { const i = ST.F ? ST.F.guns.findIndex(g => g.id === id) : 0; return PAL[(i < 0 ? 0 : i) % PAL.length]; };
const gunName = id => { const g = ST.F && ST.F.gun(id); return g ? g.name : id || '?'; };
const empty = (app, what) => `<div class="empty"><b>No ${what} from ${app} in this file yet.</b><span>They show here once ${app} has written its sheets into database.xlsx (link the app to the shared file on the phone, or sync it).</span></div>`;

/* ---------- charts ---------- */
function chartMonthly() {
  const F = ST.F, end = dt(today()), months = [];
  for (let i = 11; i >= 0; i--) months.push(isoOf(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1))).slice(0, 7));
  const evs = F.ev.filter(e => e.date.slice(0, 7) >= months[0]);
  const guns = F.guns.map(g => g.id).filter(id => evs.some(e => e.w === id));
  if (!guns.length) return '<div class="empty"><b>No rounds in the last 12 months.</b></div>';
  const data = months.map(m => { const o = {}; guns.forEach(id => o[id] = evs.filter(e => e.w === id && e.date.slice(0, 7) === m).reduce((a, e) => a + e.r, 0)); return o; });
  const max = Math.max(1, ...data.map(o => Object.values(o).reduce((a, b) => a + b, 0)));
  const stepV = [50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => max / s <= 5) || 10000, top = Math.ceil(max / stepV) * stepV;
  const Wd = 640, H = 220, l = 44, r = 8, tp = 12, bt = 26, cw = (Wd - l - r) / 12, bw = cw * .62, y = v => tp + (H - tp - bt) * (1 - v / top);
  let s = `<svg viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="Rounds fired per month, last 12 months">`;
  for (let v = 0; v <= top; v += stepV) s += `<line class="grid-l" x1="${l}" x2="${Wd - r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtN(v)}</text>`;
  data.forEach((o, i) => {
    let acc = 0; const x = l + i * cw + (cw - bw) / 2;
    guns.forEach(id => { const v = o[id]; if (!v) return; s += `<rect x="${x}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${gunCol(id)}"><title>${esc(gunName(id))}: ${v} rounds</title></rect>`; acc += v; });
    if (acc) s += `<text x="${x + bw / 2}" y="${y(acc) - 4}" text-anchor="middle" style="fill:var(--fg)">${fmtN(acc)}</text>`;
    const mo = +months[i].slice(5) - 1;
    s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${MON[mo]}${mo === 0 ? " '" + months[i].slice(2, 4) : ''}</text>`;
  });
  return s + `</svg><div class="legend">${guns.map(id => `<span class="chip" style="--c:${gunCol(id)}"><i></i>${esc(gunName(id))}</span>`).join('')}</div>`;
}
/* the days with entries of each app (Activity across apps, Latest entries) */
function appDays() {
  const D = ST.D, s = k => new Set(), out = { sh: s(), gs: s(), fk: s(), pf: s(), dt: s() };
  D.sr.trainings.forEach(t => out.sh.add(t.date)); D.sr.results.forEach(r => out.sh.add(r.date)); D.sr.datasheets.forEach(r => out.sh.add(r.date)); D.sr.roundsLog.forEach(r => out.sh.add(r.date));
  D.gs.service.forEach(r => out.gs.add(r.date)); D.gs.moves.forEach(r => out.gs.add(r.date)); D.gs.rounds.forEach(r => out.gs.add(r.date));
  D.fk.breath.forEach(r => out.fk.add(r.date));
  ST.F.pf.doneDates.forEach(d => out.pf.add(d)); D.pf.activities.forEach(r => out.pf.add(r.date)); D.pf.mobility.forEach(r => out.pf.add(r.date)); D.pf.weight.forEach(r => out.pf.add(r.date));
  D.dt.favs.forEach(f => f.at && out.dt.add(f.at.slice(0, 10)));
  return out;
}
const LANE_RANGES = { week: ['Week', 7], month: ['Month', 30], q: ['3 months', 91], h: ['6 months', 182], year: ['Year', 365] };
const LANE_STEPS = { day: 'Days', week: 'Weeks', month: 'Months' };
const laneStepOk = (r, st) => st === 'day' || (st === 'week' && LANE_RANGES[r][1] >= 30) || (st === 'month' && LANE_RANGES[r][1] >= 91);
function laneControls() {
  const st = laneStepOk(P.laneRange, P.laneStep) ? P.laneStep : 'day';
  return `<div class="seg" role="group" aria-label="Activity range">${Object.entries(LANE_RANGES).map(([k, v]) => `<button data-lrange="${k}" aria-pressed="${P.laneRange === k}">${v[0]}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Activity steps">${Object.entries(LANE_STEPS).map(([k, v]) => `<button data-lstep="${k}" aria-pressed="${st === k}" ${laneStepOk(P.laneRange, k) ? '' : 'disabled style="opacity:.35;cursor:default"'}>${v}</button>`).join('')}</div>`;
}
function chartLanes() {
  if (!LANE_RANGES[P.laneRange]) P.laneRange = 'h';
  const days = LANE_RANGES[P.laneRange][1], step = laneStepOk(P.laneRange, P.laneStep) ? P.laneStep : 'day';
  const start = new Date(dt(today()) - (days - 1) * dayMs), iso = i => isoOf(new Date(+start + i * dayMs)), AD = appDays();
  const lanes = APPS.filter(a => P.apps[a.k]).map(a => ({ name: a.short.replace('Physical ', ''), c: a.c, has: i => AD[a.k].has(iso(i)) }));
  const bins = [];
  if (step === 'day') for (let i = 0; i < days; i++) bins.push([i, i]);
  else { let from = 0; for (let i = 1; i <= days; i++) { const d = i < days ? iso(i) : null; if (!d || (step === 'week' ? dt(d).getUTCDay() === 1 : d.slice(8) === '01')) { bins.push([from, i - 1]); from = i; } } }
  const Wd = 1000, lh = 24, l = 90, H = lanes.length * lh + 28, inner = Wd - l - 4, x = i => l + inner * i / days;
  let s = `<svg viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="Entries per app">`;
  lanes.forEach((ln, j) => {
    const yy = j * lh + 4;
    s += `<text x="0" y="${yy + 15}" style="fill:var(--fg)">${ln.name}</text><rect x="${l}" y="${yy + 3}" width="${inner}" height="${lh - 8}" fill="var(--raised)"/>`;
    bins.forEach(([a, b]) => {
      let n = 0; for (let i = a; i <= b; i++) if (ln.has(i)) n++;
      if (!n) return;
      const w = x(b + 1) - x(a), len = b - a + 1, op = step === 'day' ? 1 : Math.max(.3, Math.min(1, n / (step === 'week' ? 4 : 14)));
      const tip = step === 'day' ? fmtD(iso(a)) : `${fmtDs(iso(a))} – ${fmtD(iso(b))}: ${n} of ${len} days`;
      s += `<rect x="${(x(a) + .4).toFixed(1)}" y="${yy + 3}" width="${Math.max(2, w - .8).toFixed(1)}" height="${lh - 8}" fill="${ln.c}" fill-opacity="${op.toFixed(2)}"><title>${ln.name} · ${tip}</title></rect>`;
      if (step !== 'day' && w > 22) s += `<text x="${(x(a) + w / 2).toFixed(1)}" y="${yy + 15}" text-anchor="middle" style="fill:${op > .55 ? '#fff' : 'var(--fg)'};font-size:10px">${n}</text>`;
    });
  });
  for (let i = 0; i < days; i++) {
    const d = iso(i), dd = dt(d), wd = (dd.getUTCDay() + 6) % 7; let lab = null;
    if (days <= 7) lab = `${WDN[wd]} ${dd.getUTCDate()}`; else if (days <= 30) { if (wd === 0) lab = `${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}`; }
    else if (d.slice(8) === '01') lab = MON[dd.getUTCMonth()] + (dd.getUTCMonth() === 0 ? " '" + d.slice(2, 4) : '');
    if (lab) s += `<line class="grid-l" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="2" y2="${H - 20}"/><text x="${(x(i) + 3).toFixed(1)}" y="${H - 6}">${lab}</text>`;
  }
  return s + '</svg>' + (step === 'day' ? '' : `<div class="small muted">Each block is one ${step}; darker = more days with entries (the number shows when the block is wide enough; hover for details).</div>`);
}
function sparkWeight(w = 300, h = 90) {
  const W = ST.D.pf.weight.filter(x => x.date >= isoOf(new Date(dt(today()) - 180 * dayMs)));
  if (W.length < 2) return W.length ? `<div class="num" style="font-size:20px">${kg(W[0].kg)}</div>` : '<div class="muted small">No weight entries in the last 6 months.</div>';
  const v = W.map(x => x.kg), mn = Math.floor(Math.min(...v) - .5), mx = Math.ceil(Math.max(...v) + .5);
  const x0 = dt(W[0].date), span = Math.max(dayMs, dt(today()) - x0), l = 36, b = 18;
  const X = d => l + (w - l - 6) * ((dt(d) - x0) / span), Y = k => 6 + (h - 6 - b) * (1 - (k - mn) / (mx - mn));
  const pts = W.map(p => `${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`), last = W[W.length - 1];
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Body weight trend">`;
  [mn, (mn + mx) / 2, mx].forEach(k => s += `<line class="grid-l" x1="${l}" x2="${w - 4}" y1="${Y(k)}" y2="${Y(k)}"/><text x="${l - 5}" y="${Y(k) + 4}" text-anchor="end">${imp() ? (k * 2.20462).toFixed(0) : (k % 1 ? k.toFixed(1) : k)}</text>`);
  s += `<polygon points="${l},${h - b} ${pts.join(' ')} ${X(last.date).toFixed(1)},${h - b}" fill="var(--c-pf)" opacity=".14"/><polyline points="${pts.join(' ')}" fill="none" stroke="var(--c-pf)" stroke-width="2"/>`;
  s += `<circle cx="${X(last.date)}" cy="${Y(last.kg)}" r="4" fill="var(--c-pf)"/><text x="${l}" y="${h - 3}">${fmtDs(W[0].date)}</text><text x="${w - 4}" y="${h - 3}" text-anchor="end">${fmtDs(last.date)}</text></svg>`;
  return s;
}
function bars(rows, max, c) {
  return rows.map(([lab, v, t]) => `<div style="display:grid;grid-template-columns:minmax(90px,170px) minmax(0,1fr) 70px;gap:10px;align-items:center;font-size:14px">
    <span>${lab}</span><div class="bar" style="--c:${c}"><span style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></span></div><span class="num" style="text-align:right">${t}</span></div>`).join('');
}
function ringSvg(frac, c) {
  const r = 34, C = 2 * Math.PI * r;
  return `<svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label="${Math.round(frac * 100)} percent"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--raised)" stroke-width="9"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${c}" stroke-width="9" stroke-dasharray="${(C * Math.min(1, frac)).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 42 42)"/>
    <text x="42" y="47" text-anchor="middle" style="fill:var(--fg);font-size:15px;font-weight:600">${Math.round(frac * 100)}%</text></svg>`;
}

/* ---------- pages ---------- */
const head = (c, eyebrow, title, right) => `<div class="pagehead" style="--c:${c}"><div class="t"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1></div>${right || ''}</div>`;
const periodSeg = () => `<div class="seg" role="group" aria-label="Period">${Object.entries({ week: 'Week', month: 'Month', year: 'Year', '12m': '12 months', all: 'All' }).map(([k, v]) => `<button data-period="${k}" aria-pressed="${P.period === k}">${v}</button>`).join('')}</div>`;
const roundsOfTr = t => t.dry ? 0 : t.guns.reduce((a, g) => a + g.r, 0);

function pageOverview() {
  const D = ST.D, F = ST.F, on = k => P.apps[k];
  const evP = F.ev.filter(e => inP(e.date)), rP = evP.reduce((a, e) => a + e.r, 0), trP = D.sr.trainings.filter(t => inP(t.date)), hP = trP.reduce((a, t) => a + t.h, 0);
  const lastTr = D.sr.trainings.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
  const stock = F.ammo.reduce((a, x) => a + Math.max(0, x.stock), 0), value = F.ammo.reduce((a, x) => a + Math.max(0, x.stock) * x.perRd, 0);
  const lastSvc = D.gs.service.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
  const br7 = D.fk.breath.filter(b => b.date > isoOf(new Date(dt(today()) - 7 * dayMs))).reduce((a, b) => a + b.sec, 0) / 60;
  const pf = F.pf, wk = pf.perWeekDone[pf.perWeekDone.length - 1], W = D.pf.weight, w30 = W.find(p => p.date >= isoOf(new Date(dt(today()) - 30 * dayMs)));
  const tiles = {
    sh: D.present.sh ? `<span class="big num">${fmtN(rP)} <small>rounds ${PERIOD_LABEL[P.period]}</small></span><span class="lines"><span><b>${trP.length}</b> trainings · <b>${hP}</b> h</span>${lastTr ? `<span>Last: <b>${fmtDs(lastTr.date)}</b> ${esc(lastTr.desc)}</span>` : ''}</span>` : '<span class="lines">No SR Shooting sheets in this file.</span>',
    gs: D.present.gs ? `<span class="big num">${fmtN(stock)} <small>rounds in stock</small></span><span class="lines"><span>Worth <b>€ ${fmtN(value)}</b> · <b>${F.guns.length}</b> guns</span>${lastSvc ? `<span>Last service: <b>${fmtDs(lastSvc.date)}</b> ${esc(gunName(lastSvc.weaponId))}</span>` : ''}</span>` : '<span class="lines">No SR GunSafe sheets in this file.</span>',
    fk: D.present.fk ? `<span class="big num">${Math.round(br7)} <small>min breathing, 7 days</small></span><span class="lines"><span><b>${D.fk.points.length}</b> saved points${F.dope ? ' · <b>1</b> drop profile' : ''}</span>${F.dope ? `<span>${esc(F.dope.load || 'Drop & wind')}, zero ${mDist(F.dope.zero)}</span>` : ''}</span>` : '<span class="lines">No SR Field Kit sheets in this file.</span>',
    pf: D.present.pf ? `<span class="big num">${wk}/${pf.perWeek} <small>sessions this week</small></span><span class="lines">${pf.plan ? `<span>Block ${pf.plan.block}, week <b>${Math.min(pf.week, pf.weeks)}/${pf.weeks}</b></span>` : ''}${pf.lastW ? `<span>Weight <b>${kg(pf.lastW.kg)}</b>${w30 && w30 !== pf.lastW ? ` (${kgD(pf.lastW.kg - w30.kg)} in 30 d)` : ''}</span>` : ''}</span>` : '<span class="lines">No SR Physical Fitness sheets in this file.</span>',
    dt: F.quote ? `<span class="lines" style="color:var(--fg);font-size:14.5px;line-height:1.35">“${esc(F.quote.text)}”</span><span class="lines"><span><b>${esc(F.quote.author)}</b> · ${D.dt.favs.length} favourites</span></span>` : '<span class="lines">–</span>',
  };
  const feed = [];
  D.sr.trainings.forEach(t => feed.push({ d: t.date, app: 'sh', t: `<b>${esc(t.desc || 'Training')}</b>${t.dry ? ' · dry fire' : ''} · ${t.guns.map(g => esc(g.w ? gunName(g.w) : g.name) + ' ' + g.r).join(', ')}` }));
  D.sr.results.forEach(r => feed.push({ d: r.date, app: 'sh', t: `<b>Drill</b> ${esc(r.drill)}${r.time != null ? ' · ' + r.time.toFixed(2) + ' s' : ''}` }));
  D.gs.service.forEach(s => feed.push({ d: s.date, app: 'gs', t: `<b>${esc(s.kind)}</b> ${esc(gunName(s.weaponId))}${s.note ? ' · ' + esc(s.note) : ''}` }));
  D.gs.moves.filter(m => /purchase/i.test(m.kind)).forEach(m => feed.push({ d: m.date, app: 'gs', t: `<b>Purchase</b> ${fmtN(m.qty)} × ${esc((F.ammo.find(a => a.id === m.munitionId) || {}).name || m.munitionId)}${m.price ? ', € ' + fmtN(m.price) : ''}` }));
  D.pf.activities.forEach(a => feed.push({ d: a.date, app: 'pf', t: `<b>${esc(a.name || a.type)}</b>${a.km ? ' ' + km(a.km) : ''}${a.min ? ', ' + Math.floor(a.min / 60) + ' h ' + Math.round(a.min % 60) + ' min' : ''}${a.kg ? ', ' + kg(a.kg) + ' pack' : ''}` }));
  D.pf.sessions.filter(s => s.done && s.date).forEach(s => feed.push({ d: s.date, app: 'pf', t: `<b>Session ${s.sess || ''} of week ${s.week || ''}</b> done` }));
  D.fk.breath.forEach(b => feed.push({ d: b.date, app: 'fk', t: `<b>Breathing</b> ${Math.round(b.sec / 60)} min` }));
  D.dt.favs.forEach(f => f.at && feed.push({ d: f.at.slice(0, 10), app: 'dt', t: `<b>Favourite saved</b> · ${esc(f.author || f.id)}` }));
  const fd = feed.filter(f => on(f.app) && f.d <= today()).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
  const col = k => APPS.find(a => a.k === k).c;
  const gunsRows = F.guns.map(w => { const f = F.gunFig(w.id), st = F.ammoFor(w.id).reduce((a, x) => a + Math.max(0, x.stock), 0);
    return `<tr class="click" data-gun="${esc(w.id)}"><td><span class="chip" style="--c:${gunCol(w.id)}"><i></i></span> <button class="link" data-gun="${esc(w.id)}">${esc(w.name)}</button><div class="small muted">${esc(w.caliber)}${w.type ? ' · ' + esc(w.type) : ''}</div></td>
      <td class="num r">${fmtN(f.total)}</td><td class="num r">${D.present.gs ? fmtN(f.since) : '–'}</td><td class="num r">${D.present.gs ? fmtN(st) : '–'}</td><td class="small">${f.lastShot ? fmtDs(f.lastShot) : '<span class="muted">none</span>'}</td></tr>`; }).join('');
  return head('var(--fg)', longDay(today()), 'Overview', periodSeg()) + `
  <div class="tiles">${APPS.filter(a => on(a.k)).map(a => `<button class="tile" data-go="${a.page}" style="--c:${a.c}"><span class="app">${a.name}</span>${tiles[a.k]}</button>`).join('')}</div>
  <div class="grid g-wide">
    ${on('sh') || on('gs') ? `<section class="panel"><header><h3>Rounds per month</h3><span class="muted small">last 12 months, by gun</span></header>${chartMonthly()}</section>` : ''}
    <section class="panel"><header><h3>Latest entries</h3><span class="muted small">all apps</span></header>
      ${fd.length ? `<div class="feed">${fd.map(f => `<div class="it" style="--c:${col(f.app)}"><span class="d">${fmtDs(f.d)}</span><i></i><span class="small">${f.t}</span></div>`).join('')}</div>` : '<div class="muted small">Nothing yet.</div>'}</section>
  </div>
  <section class="panel"><header><h3>Activity across apps</h3><span class="muted small">days with entries</span>${laneControls()}</header>${chartLanes()}</section>
  ${(on('sh') || on('gs')) && F.guns.length ? `<section class="panel"><header><h3>Guns</h3><span class="muted small">SR Shooting rounds + SR GunSafe service and ammo. Click a gun for its card.</span></header>
    <div class="tw"><table><thead><tr><th>Gun</th><th class="r">Rounds total</th><th class="r">Since cleaning</th><th class="r">Ammo that fits</th><th>Last shot</th></tr></thead><tbody>${gunsRows}</tbody></table></div></section>` : ''}`;
}

function pageShooting() {
  const D = ST.D, F = ST.F;
  if (!D.present.sh) return head('var(--c-sh)', 'SR Shooting', 'Shooting') + empty('SR Shooting', 'guns or trainings');
  const evP = F.ev.filter(e => inP(e.date)), rP = evP.reduce((a, e) => a + e.r, 0), trP = D.sr.trainings.filter(t => inP(t.date)), hP = trP.reduce((a, t) => a + t.h, 0);
  const trR = trP.reduce((a, t) => a + roundsOfTr(t), 0);
  const byGun = F.guns.map(w => [w.id, evP.filter(e => e.w === w.id).reduce((a, e) => a + e.r, 0)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...byGun.map(x => x[1]));
  const byTr = {}; trP.forEach(t => { const k = t.trainer || 'Own training'; byTr[k] = (byTr[k] || 0) + 1; });
  const resP = D.sr.results.slice().sort((a, b) => b.date.localeCompare(a.date));
  const best = {}; D.sr.results.forEach(r => { if (r.time != null && r.pass !== false) { const k = r.drill + '|' + r.weaponId; best[k] = Math.min(best[k] ?? 1e9, r.time); } });
  let rows = D.sr.trainings.filter(t => !ST.q || (t.desc + ' ' + t.trainer + ' ' + t.remarks + ' ' + t.guns.map(g => g.w ? gunName(g.w) : g.name).join(' ')).toLowerCase().includes(ST.q.toLowerCase()));
  const key = { date: t => t.date, desc: t => t.desc.toLowerCase(), h: t => t.h, r: t => roundsOfTr(t) }[ST.sort.k] || (t => t.date);
  rows = rows.slice().sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * ST.sort.d);
  const arrow = k => ST.sort.k === k ? (ST.sort.d > 0 ? ' ▲' : ' ▼') : '';
  const fitted = D.sr.barrels.filter(b => !b.removed);
  return head('var(--c-sh)', 'SR Shooting · Training, Drills, Gun Database', 'Shooting', periodSeg()) + `
  <div class="stats">
    <div class="stat" style="--c:var(--c-sh)"><span class="l">Rounds</span><span class="v">${fmtN(rP)}</span><span class="d">${PERIOD_LABEL[P.period]}</span></div>
    <div class="stat" style="--c:var(--c-sh)"><span class="l">Trainings</span><span class="v">${trP.length}</span><span class="d">${hP} h on the range</span></div>
    <div class="stat" style="--c:var(--c-sh)"><span class="l">Rounds per hour</span><span class="v">${hP ? Math.round(trR / hP) : '–'}</span><span class="d">in trainings</span></div>
    <div class="stat" style="--c:var(--c-dr)"><span class="l">Drills</span><span class="v">${D.sr.results.filter(r => inP(r.date)).length}</span><span class="d">${D.sr.results.filter(r => inP(r.date) && r.pass).length} passed</span></div>
    <div class="stat" style="--c:var(--c-sh)"><span class="l">All-time rounds</span><span class="v">${fmtN(F.guns.reduce((a, w) => a + F.gunFig(w.id).total, 0))}</span><span class="d">incl. before the log</span></div>
  </div>
  <div class="grid g2">
    <section class="panel"><header><h3>Rounds by gun</h3><span class="muted small">${PERIOD_LABEL[P.period]}</span></header>
      ${byGun.length ? bars(byGun.map(([id, v]) => [`<button class="link" data-gun="${esc(id)}">${esc(gunName(id))}</button>`, v, fmtN(v)]), max, 'var(--c-sh)') : '<p class="muted">No rounds in this period. Pick a longer period above.</p>'}
      <div class="small muted">Trainings with: ${Object.entries(byTr).map(([k, v]) => `${esc(k)} ${v}×`).join(' · ') || '–'}</div></section>
    <section class="panel"><header><h3>Barrel life</h3><span class="muted small">fitted barrels</span></header>
      ${fitted.length ? fitted.map(b => { const f = ST.F.barrelFig(b);
        return `<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span><button class="link" data-gun="${esc(b.weaponId)}">${esc(gunName(b.weaponId))}</button> · ${esc(b.name)}</span><span class="num small">${fmtN(f.used)} / ${fmtN(f.life)}</span></div>
        <div class="bar" style="--c:${f.frac > .8 ? 'var(--bad)' : f.frac > .6 ? 'var(--warn)' : 'var(--c-sh)'}"><span style="width:${Math.min(100, f.frac * 100).toFixed(1)}%"></span></div></div>`; }).join('') : '<p class="muted small">No barrels in the file.</p>'}
      <div class="small muted">Expected life from Barrels › Expected life rds, else the usual value for the calibre (as in SR Shooting).</div></section>
  </div>
  <div class="grid g2">
    <section class="panel"><header><h3 style="color:var(--c-dr)">Drill results</h3><span class="muted small">newest first</span></header>
      ${resP.length ? `<div class="tw" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>Date</th><th>Drill</th><th>Gun</th><th class="r">Time s</th><th class="r">Hits</th><th>Result</th></tr></thead><tbody>
      ${resP.slice(0, 50).map(r => `<tr><td class="num">${fmtDs(r.date)}</td><td>${esc(r.drill)}</td><td>${esc(r.weaponId ? gunName(r.weaponId) : '')}</td><td class="num r">${r.time != null ? r.time.toFixed(2) : '–'}</td><td class="num r">${r.hits != null ? r.hits + (r.shots ? '/' + r.shots : '') : '–'}</td>
        <td>${r.pass === true ? '<span class="pill ok">Pass</span>' : r.pass === false ? '<span class="pill warn">Not passed</span>' : ''}${r.time != null && best[r.drill + '|' + r.weaponId] === r.time && r.pass !== false ? ' <span class="pill n">best</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">No drill results yet.</p>'}</section>
    <section class="panel"><header><h3>Groups (datasheets)</h3><span class="muted small">extreme spread from the shots</span></header>
      ${D.sr.datasheets.length ? `<div class="tw" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>Date</th><th>Gun · ammo</th><th class="r">Distance</th><th class="r">Group</th><th class="r">V0</th></tr></thead><tbody>
      ${D.sr.datasheets.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map(s => `<tr><td class="num">${fmtDs(s.date)}</td><td>${esc(s.weaponId ? gunName(s.weaponId) : s.gun)}<div class="small muted">${esc(s.ammo)}</div></td><td class="num r">${mDist(s.dist)}</td>
        <td class="num r">${s.esMm != null ? (s.dist ? (s.esMm / s.dist).toFixed(2) + ' mrad<div class="small muted">' + mm(s.esMm) + '</div>' : mm(s.esMm)) : '–'}</td><td class="num r">${mps(s.v0)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">No datasheets yet.</p>'}</section>
  </div>
  <section class="panel"><header><h3>Trainings</h3><span class="muted small">${rows.length} of ${D.sr.trainings.length}</span><input type="search" id="q" placeholder="Search description, trainer, gun" value="${esc(ST.q)}" aria-label="Search trainings"></header>
    ${D.sr.trainings.length ? `<div class="tw" style="max-height:480px;overflow-y:auto"><table><thead><tr>
      <th class="sortable" data-sort="date">Date${arrow('date')}</th><th class="sortable" data-sort="desc">Description${arrow('desc')}</th><th>Trainer / organizer</th><th>Guns</th><th class="r sortable" data-sort="h">Hours${arrow('h')}</th><th class="r sortable" data-sort="r">Rounds${arrow('r')}</th></tr></thead><tbody>
    ${rows.map(t => `<tr><td class="num">${fmtD(t.date)}</td><td>${esc(t.desc)}${t.dry ? ' <span class="pill n">dry fire</span>' : ''}${t.remarks ? `<div class="small muted">${esc(t.remarks)}</div>` : ''}</td><td class="small">${esc(t.trainer) || '<span class="muted">–</span>'}</td>
      <td class="small">${t.guns.map(g => g.w ? `<button class="link" data-gun="${esc(g.w)}">${esc(gunName(g.w))}</button> ${g.r}` : `${esc(g.name)} ${g.r}`).join(' · ')}</td><td class="num r">${t.h || '–'}</td><td class="num r">${t.dry ? '–' : roundsOfTr(t)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">No trainings yet.</p>'}</section>`;
}

function pageGunSafe() {
  const D = ST.D, F = ST.F;
  if (!D.present.gs) return head('var(--c-gs)', 'SR GunSafe', 'GunSafe') + empty('SR GunSafe', 'service entries or ammunition');
  const stock = F.ammo.reduce((a, x) => a + Math.max(0, x.stock), 0), value = F.ammo.reduce((a, x) => a + Math.max(0, x.stock) * x.perRd, 0);
  const cal = {}; F.ammo.forEach(a => { const k = a.caliber || '?'; cal[k] = (cal[k] || 0) + Math.max(0, a.stock); });
  const spent = D.gs.moves.filter(m => /purchase/i.test(m.kind) && inP(m.date)).reduce((a, m) => a + (m.price || 0), 0);
  const priced = F.ammo.filter(a => a.buys.filter(b => b.price && b.qty).length >= 2).sort((a, b) => b.buys.length - a.buys.length)[0];
  let price = '<p class="muted small">Shows once one ammunition has two purchases with a price.</p>';
  if (priced) {
    const b = priced.buys.filter(x => x.price && x.qty), v = b.map(x => x.price / x.qty), mn = Math.min(...v) * .95, mx = Math.max(...v) * 1.05, Wd = 300, H = 110, l = 40;
    const X = i => l + (Wd - l - 20) * i / (b.length - 1), Y = p => 8 + (H - 30) * (1 - (p - mn) / (mx - mn || 1));
    price = `<svg viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="Price per round over time">${[mn, (mn + mx) / 2, mx].map(p => `<line class="grid-l" x1="${l}" x2="${Wd - 10}" y1="${Y(p)}" y2="${Y(p)}"/><text x="${l - 5}" y="${Y(p) + 4}" text-anchor="end">${p.toFixed(2)}</text>`).join('')}
      <polyline points="${v.map((p, i) => X(i) + ',' + Y(p)).join(' ')}" fill="none" stroke="var(--c-gs)" stroke-width="2"/>${v.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p)}" r="4" fill="var(--c-gs)"><title>€ ${p.toFixed(3)}</title></circle><text x="${X(i)}" y="${H - 6}" text-anchor="middle">${fmtDs(b[i].date)}</text>`).join('')}</svg>
      <div class="small muted">${esc(priced.name)}: € per round = price ÷ rounds of each purchase.</div>`;
  }
  const owners = [...new Set(D.gs.owners.map(o => o.name))];
  return head('var(--c-gs)', 'SR GunSafe · Service log, ammo stock', 'GunSafe', periodSeg()) + `
  <div class="stats">
    <div class="stat" style="--c:var(--c-gs)"><span class="l">Guns</span><span class="v">${F.guns.length}</span><span class="d">${owners.length ? 'owners: ' + esc(owners.join(', ')) : 'no owners entered'}</span></div>
    <div class="stat" style="--c:var(--c-gs)"><span class="l">Ammo in stock</span><span class="v">${fmtN(stock)}</span><span class="d">${F.ammo.length} kinds</span></div>
    <div class="stat" style="--c:var(--c-gs)"><span class="l">Stock value</span><span class="v">€ ${fmtN(value)}</span><span class="d">at last price paid</span></div>
    <div class="stat" style="--c:var(--c-gs)"><span class="l">Spent on ammo</span><span class="v">€ ${fmtN(spent)}</span><span class="d">${PERIOD_LABEL[P.period]}</span></div>
  </div>
  <section class="panel"><header><h3>Guns and service</h3></header>
    <div class="tw"><table><thead><tr><th>Gun</th><th>Owner(s)</th><th class="r">Rounds total</th><th class="r">Since cleaning</th><th>Last cleaning</th><th>Last service entry</th></tr></thead><tbody>
    ${F.guns.map(w => { const f = F.gunFig(w.id), s = D.gs.service.filter(x => x.weaponId === w.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      return `<tr class="click" data-gun="${esc(w.id)}"><td><button class="link" data-gun="${esc(w.id)}">${esc(w.name)}</button><div class="small muted">${esc(w.caliber)}</div></td><td class="small">${esc(f.owners.join(', ')) || '<span class="muted">–</span>'}</td>
        <td class="num r">${fmtN(f.total)}</td><td class="num r">${fmtN(f.since)}</td><td class="num small">${f.lastClean ? fmtD(f.lastClean) : '–'}</td><td class="small">${s ? `${fmtDs(s.date)} · ${esc(s.kind)}${s.note ? ': ' + esc(s.note) : ''}` : '<span class="muted">none</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="small muted">Since cleaning: rounds after the last service entry with “Cleaning done” (SR Shooting trainings on the cleaning day count as before, as in GunSafe). No reminders.</div></section>
  <div class="grid g2">
    <section class="panel"><header><h3>Stock by calibre</h3></header>${Object.keys(cal).length ? bars(Object.entries(cal).sort((a, b) => b[1] - a[1]).map(([c, v]) => [esc(c), v, fmtN(v)]), Math.max(1, ...Object.values(cal)), 'var(--c-gs)') : '<p class="muted small">No ammunition moves yet.</p>'}
      <div class="small muted">Per gun: ${F.guns.map(w => `${esc(w.name)} ${fmtN(F.ammoFor(w.id).reduce((a, x) => a + Math.max(0, x.stock), 0))}`).join(' · ')}</div></section>
    <section class="panel"><header><h3>Price per round</h3></header>${price}</section>
  </div>
  <section class="panel"><header><h3>Ammunition</h3></header>
    ${F.ammo.length ? `<div class="tw"><table><thead><tr><th>Ammunition</th><th>Calibre</th><th class="r">In stock</th><th class="r">Bought</th><th class="r">€ / round</th><th>Last purchase</th></tr></thead><tbody>
    ${F.ammo.map(a => `<tr><td>${esc(a.name)}</td><td class="small">${esc(a.caliber)}</td><td class="num r">${fmtN(a.stock)}</td><td class="num r">${fmtN(a.bought)}</td><td class="num r">${a.perRd ? a.perRd.toFixed(2) : '–'}</td>
      <td class="small">${a.last ? `${fmtD(a.last.date)} · ${fmtN(a.last.qty)} rds${a.last.price ? ' · € ' + fmtN(a.last.price) : ''}${a.last.shop ? ' · ' + esc(a.last.shop) : ''}` : '–'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">No ammunition moves yet.</p>'}</section>`;
}

function pageFieldKit() {
  const D = ST.D, F = ST.F;
  if (!D.present.fk) return head('var(--c-fk)', 'SR Field Kit', 'Field Kit') + empty('SR Field Kit', 'points, breathing or drop data');
  const days = []; for (let i = 13; i >= 0; i--) days.push(isoOf(new Date(dt(today()) - i * dayMs)));
  const per = days.map(d => D.fk.breath.filter(b => b.date === d).reduce((a, b) => a + b.sec, 0) / 60), mx = Math.max(1, ...per);
  const dp = F.dope, sel = dp ? dp.rows.filter(r => r.x % 100 === 0 || dp.rows.length <= 8).slice(0, 12) : [];
  return head('var(--c-fk)', 'SR Field Kit · Drop & wind, points, breathing', 'Field Kit') + `
  <div class="grid g2">
    <section class="panel"><header><h3>Drop card</h3><span class="muted small">from Drop & wind</span></header>
      ${dp ? `<div class="small">${esc(dp.load || 'Load')} · ${dp.model} BC ${dp.bc} · V0 ${mps(dp.v0)} · zero ${mDist(dp.zero)} · sight height ${mm((dp.sightCm || 0) * 10)}</div>
        <div class="tw"><table><thead><tr><th>Distance</th>${sel.map(r => `<th class="r">${mDist(r.x)}</th>`).join('')}</tr></thead><tbody>
          <tr><td class="small">Elevation mrad</td>${sel.map(r => `<td class="num r">${r.elev.toFixed(1)}</td>`).join('')}</tr>
          <tr><td class="small">Wind mrad</td>${sel.map(r => `<td class="num r">${r.wind.toFixed(1)}</td>`).join('')}</tr></tbody></table></div>
        <div class="small muted">Elevation: dial up. Wind: ${dp.wind} km/h from ${dp.clock} o'clock, hold into the wind. ${dp.temp} °C, ${dp.alt} m altitude. Same solver as the app.${dp.subsonicM ? ' Subsonic from ' + mDist(dp.subsonicM) + '.' : ''}</div>`
      : '<p class="muted small">No Drop & wind data saved in Field Kit yet.</p>'}</section>
    <section class="panel"><header><h3>Breathing</h3><span class="muted small">minutes per day, last 14 days</span></header>
      <svg viewBox="0 0 300 110" width="100%" role="img" aria-label="Breathing minutes per day">${per.map((v, i) => { const h = v / mx * 76; return v ? `<rect x="${12 + i * 20}" y="${88 - h}" width="14" height="${h}" fill="var(--c-fk)"><title>${fmtDs(days[i])}: ${Math.round(v)} min</title></rect><text x="${19 + i * 20}" y="${84 - h}" text-anchor="middle">${Math.round(v)}</text>` : ''; }).join('')}
        <line class="grid-l" x1="8" x2="292" y1="88" y2="88"/><text x="12" y="104">${fmtDs(days[0])}</text><text x="292" y="104" text-anchor="end">today</text></svg>
      <div class="small muted">${Math.round(per.reduce((a, b) => a + b, 0))} min in 14 days on ${per.filter(Boolean).length} days · ${Math.round(D.fk.breath.reduce((a, b) => a + b.sec, 0) / 60)} min in all.</div></section>
  </div>
  <section class="panel"><header><h3>Saved points</h3></header>
    ${D.fk.points.length ? `<div class="tw"><table><thead><tr><th>Name</th><th class="r">Latitude</th><th class="r">Longitude</th><th>MGRS</th></tr></thead><tbody>
    ${D.fk.points.map(p => `<tr><td>${esc(p.name)}</td><td class="num r">${p.lat != null ? p.lat.toFixed(5) : '–'}</td><td class="num r">${p.lon != null ? p.lon.toFixed(5) : '–'}</td><td class="num">${esc(p.mgrs)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No saved points.</p>'}
    <div class="small muted">Maps and routes stay in the Map Manager.</div></section>`;
}

function pageFitness() {
  const D = ST.D, F = ST.F, pf = F.pf;
  if (!D.present.pf) return head('var(--c-pf)', 'SR Physical Fitness', 'Physical Fitness') + empty('SR Physical Fitness', 'sessions or body data');
  const done8 = pf.perWeekDone.reduce((a, b) => a + b, 0), plan8 = pf.perWeek * pf.perWeekDone.length, W = D.pf.weight, w0 = W.find(x => x.date >= isoOf(new Date(dt(today()) - 90 * dayMs)));
  const bh = 26, maxS = Math.max(pf.perWeek, ...pf.perWeekDone), sc = 78 / maxS;
  return head('var(--c-pf)', 'SR Physical Fitness · Plan, sessions, body', 'Physical Fitness') + `
  <div class="stats">
    <div class="stat" style="--c:var(--c-pf)"><span class="l">${pf.plan ? 'Block ' + pf.plan.block : 'Plan'}</span><span class="v">${pf.plan ? 'Week ' + Math.min(pf.week, pf.weeks) + '/' + pf.weeks : '–'}</span><span class="d">${pf.perWeek} sessions${pf.minutes ? ' × ' + pf.minutes + ' min' : ''} per week</span></div>
    <div class="stat" style="--c:var(--c-pf)"><span class="l">Sessions, 8 weeks</span><span class="v">${done8}/${plan8}</span><span class="d">${plan8 ? Math.round(done8 / plan8 * 100) : 0} % done</span></div>
    <div class="stat" style="--c:var(--c-pf)"><span class="l">Weight</span><span class="v">${pf.lastW ? kg(pf.lastW.kg) : '–'}</span><span class="d">${pf.lastW && w0 && w0 !== pf.lastW ? kgD(pf.lastW.kg - w0.kg) + ' in 3 months' : pf.lastW ? fmtD(pf.lastW.date) : 'no entries'}</span></div>
    <div class="stat" style="--c:var(--c-pf)"><span class="l">Mobility streak</span><span class="v">${pf.streak} day${pf.streak === 1 ? '' : 's'}</span><span class="d">daily mobility block</span></div>
  </div>
  <div class="grid g3">
    <section class="panel"><header><h3>Sessions per week</h3></header>
      <svg viewBox="0 0 260 120" width="100%" role="img" aria-label="Sessions per week, last 8 weeks">
        <line class="grid-l" x1="20" x2="256" y1="${100 - pf.perWeek * sc}" y2="${100 - pf.perWeek * sc}" stroke-dasharray="4 3"/><text x="16" y="${104 - pf.perWeek * sc}" text-anchor="end">${pf.perWeek}</text>
        ${pf.perWeekDone.map((v, i) => `<rect x="${28 + i * 28}" y="${100 - v * sc}" width="18" height="${v * sc}" fill="var(--c-pf)" opacity="${i === 7 ? .5 : 1}"><title>Week of ${fmtDs(pf.weekStarts[i])}: ${v} sessions</title></rect><text x="${37 + i * 28}" y="114" text-anchor="middle">${fmtDs(pf.weekStarts[i]).slice(0, 2)}</text>`).join('')}
        <line class="grid-l" x1="20" x2="256" y1="100" y2="100"/></svg>
      <div class="small muted">Weeks from Monday (the date under each bar). Light bar: this week so far. Dashed line: your sessions per week.</div></section>
    <section class="panel"><header><h3>Weight</h3><span class="muted small">last 6 months</span></header>${sparkWeight()}</section>
    <section class="panel"><header><h3>Drinks today</h3></header>
      <div class="ring">${ringSvg(pf.drinksToday / pf.drinkGoal, 'var(--c-pf)')}<div><div class="num" style="font-size:20px;font-weight:600">${L(pf.drinksToday)}</div><div class="small muted">of ${L(pf.drinkGoal)} goal</div></div></div>
      <div class="small muted">From PF_Drinks: what the phone had written into the file when it last synced.</div></section>
  </div>
  <div class="grid g2">
    <section class="panel"><header><h3>Last session</h3><span class="muted small">${pf.lastSetDay ? fmtD(pf.lastSetDay) : ''}</span></header>
      ${pf.lastSets.length ? `<div class="tw"><table><thead><tr><th>Exercise</th><th>Load</th><th class="r">Sets × reps</th></tr></thead><tbody>${pf.lastSets.map(s => `<tr><td>${esc(s.ex)}</td><td class="num">${s.kg ? kg(s.kg) : 'body weight'}</td>
        <td class="num r">${s.sets} × ${s.reps.length ? (new Set(s.reps).size === 1 ? s.reps[0] : s.reps.join('/')) : s.sec ? s.sec + ' s' : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No sets logged yet.</p>'}</section>
    <section class="panel"><header><h3>Other activities</h3></header>
      ${D.pf.activities.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Activity</th><th class="r">Distance</th><th class="r">Time</th><th class="r">Pack</th></tr></thead><tbody>${D.pf.activities.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map(a => `<tr><td class="num">${fmtDs(a.date)}</td><td>${esc(a.name || a.type)}</td>
        <td class="num r">${a.km ? km(a.km) : '–'}</td><td class="num r">${a.min ? Math.floor(a.min / 60) + ':' + String(Math.round(a.min % 60)).padStart(2, '0') + ' h' : '–'}</td><td class="num r">${a.kg ? kg(a.kg) : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No activities logged yet.</p>'}</section>
  </div>`;
}

function pageThoughts() {
  const D = ST.D, F = ST.F, q = F.quote;
  return head('var(--c-dt)', 'SR Daily Thoughts', 'Daily Thoughts') + `
  <section class="panel"><header><h3>Thought of the day</h3><span class="muted small">${fmtD(today())}</span></header>
    ${q ? `<blockquote class="quote" style="margin:0">“${esc(q.text)}”<cite>${esc(q.author)} · ${esc(q.ref)}</cite></blockquote>` : '–'}
    <div class="small muted">The same quote the phone shows today (same quotes and day order as SR Daily Thoughts 0.3.1).</div></section>
  <section class="panel"><header><h3>Favourites</h3><span class="muted small">${D.dt.favs.length}</span></header>
    ${D.dt.favs.length ? `<div class="tw"><table><thead><tr><th>Saved</th><th>Author</th><th>Quote</th></tr></thead><tbody>${D.dt.favs.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map(f => `<tr><td class="num">${f.at ? fmtDs(f.at.slice(0, 10)) : '–'}</td><td>${esc(f.author)}</td><td>${esc(f.text)}${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : D.present.dt ? '<p class="muted small">No favourites saved yet.</p>' : empty('SR Daily Thoughts', 'favourites')}</section>`;
}

function pageData() {
  const D = ST.D, f = ST.file || {};
  const C = { sh: 'var(--c-sh)', gs: 'var(--c-gs)', fk: 'var(--c-fk)', pf: 'var(--c-pf)', dt: 'var(--c-dt)', shared: 'var(--muted)', other: 'var(--muted)' };
  const groups = APPS.map(a => ({ k: a.k, name: a.name })).concat([{ k: 'shared', name: 'Shared' }, { k: 'other', name: 'Other sheets' }]);
  return head('var(--fg)', 'Where the dashboard reads from', 'Data file') + `
  <section class="panel"><header><h3>database.xlsx</h3>${ST.err ? '<span class="pill bad">Not read</span>' : `<span class="pill ok">Read ${ST.readAt ? ST.readAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>`}</header>
    ${ST.err ? `<div class="err">${esc(ST.err)}</div>` : ''}
    <dl class="kv"><dt>File</dt><dd class="mono small" style="word-break:break-all">${esc(f.path || f.name || '–')}</dd>
      <dt>Last change in file</dt><dd>${f.mtime ? new Date(f.mtime).toLocaleString('en-GB') : '–'}</dd><dt>Size</dt><dd>${f.size ? fmtN(f.size / 1024) + ' KB' : '–'}</dd>
      <dt>Reads</dt><dd>at start, when the file changes (checked every 10 seconds), when the window comes to the front, and with Reload (F5)</dd>
      <dt>Writes</dt><dd><b>Never.</b> The dashboard only reads. To change data, use the app or Excel.</dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${N ? `<button class="btn primary" data-act="excel">Open in Excel</button><button class="btn" data-act="folder">Show in folder</button>` : ''}<button class="btn" data-act="choose">Choose another file…</button></div></section>
  ${D ? `<section class="panel"><header><h3>Sheets found</h3><span class="muted small">${D.sheets.length} sheets · dashed = hidden</span></header>
    ${groups.filter(g => D.sheets.some(s => s.app === g.k)).map(g => `<div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow" style="color:${C[g.k]}">${g.name}</span><div class="sheetlist">${D.sheets.filter(s => s.app === g.k).map(s => `<div class="${s.hidden ? 'hid' : ''}" style="--c:${C[s.app]}"><span>${esc(s.name)}</span><span class="num muted">${/^_(StoicRanger|.._Data)$/.test(s.name) ? 'JSON' : s.rows}</span></div>`).join('')}</div></div>`).join('')}
    <div class="small muted">Rows per sheet (without the header). ${D.tombs.length} entries in _Deleted (deleted on a device) are left out of every number.${APPS.filter(a => !D.present[a.k]).length ? ' No sheets from: ' + APPS.filter(a => !D.present[a.k]).map(a => a.name).join(', ') + '.' : ''}</div></section>` : ''}`;
}

function pageSettings() {
  return head('var(--fg)', 'Stoic Ranger Dashboard', 'Settings') + `
  <section class="panel"><header><h3>Apps on the dashboard</h3></header>
    <div class="small muted">The dashboard shows an app only when it is ticked here.</div>
    ${APPS.map(a => `<label class="check"><input type="checkbox" id="app-${a.k}" data-app="${a.k}" ${P.apps[a.k] ? 'checked' : ''}><span class="chip" style="--c:${a.c}"><i></i></span>${a.name}${ST.D && !ST.D.present[a.k] ? ' <span class="small muted">(no sheets in this file)</span>' : ''}</label>`).join('')}</section>
  <section class="panel"><header><h3>Display</h3></header>
    <div class="set-row"><span class="lab"><b>Theme</b><span class="small muted">Follows Windows unless you pick one.</span></span><div class="seg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, v]) => `<button data-theme-set="${k}" aria-pressed="${P.theme === k}">${v}</button>`).join('')}</div></div>
    <div class="set-row"><span class="lab"><b>Units</b><span class="small muted">The data is always metric. Imperial only changes what you see.</span></span><div class="seg">${[['metric', 'Metric'], ['imperial', 'Imperial']].map(([k, v]) => `<button data-units="${k}" aria-pressed="${P.units === k}">${v}</button>`).join('')}</div></div>
    <div class="set-row"><span class="lab"><b>Start page</b></span><select id="startpage">${[['overview', 'Overview']].concat(APPS.map(a => [a.page, a.short])).map(([k, v]) => `<option value="${k}" ${P.start === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></section>
  <section class="panel"><header><h3>Data file</h3></header>
    <div class="set-row"><span class="lab"><b>database.xlsx</b><span class="small muted">The shared file of the Stoic Ranger apps, e.g. in your Nextcloud folder. Only read, never changed.</span></span><span class="mono small" style="word-break:break-all;max-width:420px">${esc((ST.file && (ST.file.path || ST.file.name)) || 'none chosen')}</span><button class="btn" data-act="choose">Choose…</button></div></section>
  <section class="panel"><header><h3>About</h3></header><div class="small muted">Stoic Ranger Dashboard ${esc(version())}. Reads SR Shooting 1.4, SR GunSafe 0.1, SR Field Kit 0.4, SR Physical Fitness 0.4 and SR Daily Thoughts 0.3 sheets.</div></section>`;
}

function pageWelcome() {
  return `<div class="welcome">${head('var(--fg)', 'Stoic Ranger Dashboard', 'Choose your database.xlsx')}
    <p>The dashboard shows one overview of all your Stoic Ranger apps from the shared <b>database.xlsx</b>. It only reads the file and never changes it.</p>
    ${ST.err ? `<div class="err">${esc(ST.err)}</div>` : ''}
    <div><button class="btn primary" data-act="choose">Choose database.xlsx…</button></div>
    <p class="small muted">Tip: if your phones sync with Nextcloud, choose the database.xlsx in your Nextcloud folder on this PC; the dashboard follows every change.</p></div>`;
}

/* ---------- gun card ---------- */
function gunCard(id) {
  const D = ST.D, F = ST.F, w = F.gun(id); if (!w) return;
  const f = F.gunFig(id), evs = F.ev.filter(e => e.w === id).sort((a, b) => b.date.localeCompare(a.date));
  const trs = D.sr.trainings.filter(t => t.guns.some(g => g.w === id)).sort((a, b) => b.date.localeCompare(a.date));
  const bl = F.barrelsOf(id), svc = D.gs.service.filter(s => s.weaponId === id).sort((a, b) => b.date.localeCompare(a.date)), am = F.ammoFor(id), dr = D.sr.results.filter(r => r.weaponId === id).sort((a, b) => b.date.localeCompare(a.date));
  $('#layer').innerHTML = `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(w.name)}">
    <div class="dh"><div><div class="muted small">${esc(w.id)}${w.type ? ' · ' + esc(w.type) : ''} · ${esc(w.caliber)}${w.src === 'gs' ? ' · from GunSafe' : ''}</div><h2>${esc(w.name)}</h2></div><button class="x" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <div class="stats">
        <div class="stat" style="--c:var(--c-sh)"><span class="l">Rounds total</span><span class="v">${fmtN(f.total)}</span><span class="d">${w.before ? fmtN(w.before) + ' before the log' : 'all in the log'}</span></div>
        <div class="stat" style="--c:var(--c-gs)"><span class="l">Since cleaning</span><span class="v">${D.present.gs ? fmtN(f.since) : '–'}</span><span class="d">${f.lastClean ? 'cleaned ' + fmtDs(f.lastClean) : 'no cleaning logged'}</span></div>
        <div class="stat" style="--c:var(--c-gs)"><span class="l">Ammo that fits</span><span class="v">${D.present.gs ? fmtN(am.reduce((a, x) => a + Math.max(0, x.stock), 0)) : '–'}</span><span class="d">${am.length} kinds</span></div>
      </div>
      <section class="panel"><h3>Build</h3><dl class="kv">${w.make ? `<dt>Make</dt><dd>${esc(w.make)}${w.model ? ' ' + esc(w.model) : ''}</dd>` : ''}${w.barrelMm ? `<dt>Barrel</dt><dd>${mm(w.barrelMm)}</dd>` : ''}${w.optic ? `<dt>Optic</dt><dd>${esc(w.optic)}</dd>` : ''}${w.weightKg ? `<dt>Weight</dt><dd>${kg(w.weightKg)}</dd>` : ''}
        <dt>Owner(s)</dt><dd>${esc(f.owners.join(', ')) || '<span class="muted">–</span>'}</dd>${w.status ? `<dt>Status</dt><dd>${esc(w.status)}</dd>` : ''}</dl></section>
      ${bl.length ? `<section class="panel"><h3>Barrels</h3>${bl.map(b => { const x = F.barrelFig(b); return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span>${esc(b.name || b.id)}${b.removed ? ' <span class="pill n">removed ' + fmtDs(b.removed) + '</span>' : ''}</span><span class="num small">${fmtN(x.used)} / ${fmtN(x.life)}</span></div><div class="bar" style="--c:var(--c-sh)"><span style="width:${Math.min(100, x.frac * 100).toFixed(1)}%"></span></div>`; }).join('')}</section>` : ''}
      <section class="panel"><h3>Rounds</h3>${evs.length ? `<div class="tw"><table><tbody>${evs.slice(0, 8).map(e => `<tr><td class="num">${fmtD(e.date)}</td><td>${e.src === 'training' ? esc(e.ref.desc || 'Training') : e.src === 'sheet' ? 'Datasheet' : e.src === 'gs' ? 'GunSafe rounds log' : 'Rounds log'}</td><td class="num r">${e.r}</td></tr>`).join('')}</tbody></table></div>${evs.length > 8 ? `<div class="small muted">and ${evs.length - 8} more (${trs.length} trainings in all)</div>` : ''}` : '<p class="muted small">No rounds logged with this gun.</p>'}</section>
      ${dr.length ? `<section class="panel"><h3>Drills</h3>${dr.slice(0, 6).map(d => `<div class="small">${fmtDs(d.date)} · ${esc(d.drill)} · ${d.time != null ? d.time.toFixed(2) + ' s' : (d.hits ?? '') + '/' + (d.shots ?? '')}${d.pass === false ? ' · not passed' : ''}</div>`).join('')}</section>` : ''}
      ${D.present.gs ? `<section class="panel"><h3>Service log</h3>${svc.length ? svc.slice(0, 8).map(s => `<div class="small"><b>${fmtD(s.date)}</b> · ${esc(s.kind)}${s.clean ? ' (cleaning done)' : ''}${s.note ? ' · ' + esc(s.note) : ''}</div>`).join('') : '<p class="muted small">Nothing logged.</p>'}</section>
      <section class="panel"><h3>Ammunition</h3>${am.length ? am.map(a => `<div style="display:flex;justify-content:space-between;gap:8px" class="small"><span>${esc(a.name)}</span><span class="num">${fmtN(a.stock)}${a.perRd ? ' · € ' + a.perRd.toFixed(2) : ''}</span></div>`).join('') : '<p class="muted small">No ammunition for this calibre in stock.</p>'}</section>` : ''}
      <div class="small muted">Read only. To change this gun, use SR Shooting (build, barrels, rounds) or SR GunSafe (service, owners, ammo).</div>
    </div></aside>`;
  $('.drawer .x').focus();
}

/* ---------- render ---------- */
const PAGES = { overview: pageOverview, shooting: pageShooting, gunsafe: pageGunSafe, fieldkit: pageFieldKit, fitness: pageFitness, thoughts: pageThoughts, datafile: pageData, preferences: pageSettings };
const version = () => { try { return N ? N.version() : 'browser'; } catch (e) { return ''; } };
function renderNav() {
  const D = ST.D, F = ST.F;
  const it = (page, label, c, cnt) => `<button data-go="${page}" style="--c:${c}" ${ST.page === page ? 'aria-current="page"' : ''}><span class="sw"></span>${label}${cnt != null && cnt !== '' ? `<span class="cnt">${cnt}</span>` : ''}</button>`;
  const cnt = !D ? {} : { sh: D.sr.trainings.length, gs: F.guns.length, fk: D.fk.points.length, pf: F.pf.plan ? Math.min(F.pf.week, 12) + '/12' : '', dt: D.dt.favs.length };
  $('#nav').innerHTML = `<span class="grp">Dashboard</span>${it('overview', 'Overview', 'var(--fg)')}<span class="grp">Apps</span>
    ${APPS.filter(a => P.apps[a.k]).map(a => it(a.page, a.short, a.c, cnt[a.k])).join('')}
    <span class="spacer"></span><span class="grp">File</span>${it('datafile', 'Data file', 'var(--muted)')}${it('preferences', 'Settings', 'var(--muted)')}`;
}
function render() {
  if (!PAGES[ST.page]) ST.page = 'overview';
  renderNav();
  const main = $('#main'), top = main.scrollTop;
  if (!ST.D && !['datafile', 'preferences'].includes(ST.page)) main.innerHTML = pageWelcome();
  else main.innerHTML = PAGES[ST.page]();
  main.scrollTop = top;
  const f = ST.file || {};
  $('#status').innerHTML = ST.D ? `<span><span class="dot"${ST.err ? ' style="background:var(--bad)"' : ''}></span><b>${esc(f.name || 'database.xlsx')}</b> ${ST.err ? 'could not be read again: showing the last good read' : 'read ' + (ST.readAt ? ST.readAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')}</span><span>${ST.D.sr.trainings.length} trainings · ${ST.F.guns.length} guns · ${ST.F.ammo.length} ammo kinds</span><span>Units: ${P.units}</span><span>Read only</span>`
    : `<span><span class="dot" style="background:var(--warn)"></span>No database.xlsx read yet</span>`;
  const q = $('#q'); if (q) q.addEventListener('input', e => { ST.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  const sp = $('#startpage'); if (sp) sp.addEventListener('change', e => { P.start = e.target.value; savePrefs(); });
}
function applyTheme() {
  if (P.theme === 'light' || P.theme === 'dark') document.documentElement.setAttribute('data-theme', P.theme); else document.documentElement.removeAttribute('data-theme');
  try { if (N) N.setTheme(P.theme); } catch (e) { }
}
let tt; function toast(t) { clearTimeout(tt); let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; tt = setTimeout(() => el.remove(), 3000); }

/* ---------- reading the file ---------- */
function useBytes(bytes, file) {
  try {
    const D = SRD.read(bytes), F = SRD.figures(D);
    ST.D = D; ST.F = F; ST.err = ''; ST.file = file; ST.readAt = new Date();
    if (ST.page && !PAGES[ST.page]) ST.page = 'overview';
    return true;
  } catch (e) {
    ST.err = (e && e.message) || String(e); if (!ST.D) ST.file = file; return false;
  }
}
async function load(quiet) {
  if (!N) { render(); return; }
  const r = await N.read();
  if (r.ok) { const ok = useBytes(r.bytes, r.file); if (!quiet) toast(ok ? `${r.file.name} read` : 'The file could not be read: ' + ST.err); }
  else if (r.msg) { ST.err = r.msg; ST.file = r.file || ST.file; }
  render();
}
async function choose() {
  if (N) { const r = await N.choose(); if (r.ok) { ST.err = ''; await load(); if (ST.page === 'preferences') ST.page = 'datafile'; render(); } return; }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.arrayBuffer().then(b => { useBytes(b, { name: f.name, size: f.size, mtime: f.lastModified }); render(); }); };
  inp.click();
}
window.SRDash = { useBytes: (b, f) => { const ok = useBytes(b, f || { name: 'database.xlsx' }); render(); return ok; }, state: ST, prefs: P, render };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-period],[data-gun],[data-close],[data-sort],[data-units],[data-theme-set],[data-act],[data-app],[data-lrange],[data-lstep]');
  if (!t) return;
  if (t.dataset.go) { ST.page = t.dataset.go; render(); $('#main').scrollTop = 0; }
  else if (t.dataset.period) { P.period = t.dataset.period; savePrefs(); render(); }
  else if (t.dataset.gun) { e.stopPropagation(); gunCard(t.dataset.gun); }
  else if (t.hasAttribute('data-close')) $('#layer').innerHTML = '';
  else if (t.dataset.sort) { const k = t.dataset.sort; ST.sort = { k, d: ST.sort.k === k ? -ST.sort.d : (k === 'desc' ? 1 : -1) }; render(); }
  else if (t.dataset.units) { P.units = t.dataset.units; savePrefs(); render(); }
  else if (t.dataset.themeSet) { P.theme = t.dataset.themeSet; savePrefs(); applyTheme(); render(); }
  else if (t.dataset.lrange) { P.laneRange = t.dataset.lrange; if (!laneStepOk(P.laneRange, P.laneStep)) P.laneStep = 'day'; savePrefs(); render(); }
  else if (t.dataset.lstep) { if (!t.disabled) { P.laneStep = t.dataset.lstep; savePrefs(); render(); } }
  else if (t.dataset.app && t.type === 'checkbox') { P.apps[t.dataset.app] = t.checked; savePrefs(); render(); }
  else if (t.dataset.act === 'choose') choose();
  else if (t.dataset.act === 'excel' && N) N.openExcel().then(r => { if (r && !r.ok) toast(r.msg); });
  else if (t.dataset.act === 'folder' && N) N.showFolder();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#layer').innerHTML) $('#layer').innerHTML = '';
  if (e.key === 'F5') { e.preventDefault(); load(); }
});
$('#themeBtn').addEventListener('click', () => {
  const dark = P.theme === 'dark' || (P.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  P.theme = dark ? 'light' : 'dark'; savePrefs(); applyTheme(); render();
});
$('#reload').addEventListener('click', () => load());
$('#emb').innerHTML = window.SR_EMBLEM || '';
$('#ver').textContent = version();
if (N) N.onChanged(() => load(true));
applyTheme(); render(); load(true);
})();
