/* Stoic Ranger — small SVG chart kit (no external libraries, works offline). */
'use strict';
(() => {
const esc = RB.esc;
const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
RB.color = i => PAL[i % PAL.length];

function nice(lo, hi, n = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo: a, hi: b, ticks };
}
const fmtTick = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('de-AT') + 'k' : (+v.toFixed(3)).toString();

function frame(el, h) {
  const W = Math.max(280, el.clientWidth || 320);
  el.innerHTML = ''; el.classList.add('chart');
  const tip = RB.h('<div class="tip" hidden></div>');
  el.appendChild(tip);
  return { W, H: h || 220, tip };
}
function bindTips(el, tip) {
  el.addEventListener('click', e => {
    const p = e.target.closest('[data-tip]');
    if (!p) { tip.hidden = true; return; }
    tip.innerHTML = p.getAttribute('data-tip'); tip.hidden = false;
    const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.left = Math.min(Math.max(4, x - 70), r.width - 150) + 'px'; tip.style.top = Math.max(0, y - 54) + 'px';
  });
}
function axes(W, H, m, xs, ys, xl, yl, xf = fmtTick, yf = fmtTick) {
  let g = '';
  ys.ticks.forEach(v => { const y = m.sy(v); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="grid"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="tk">${yf(v)}</text>`; });
  xs.ticks.forEach(v => { const x = m.sx(v); g += `<line x1="${x}" x2="${x}" y1="${H - m.b}" y2="${H - m.b + 4}" class="ax"/><text x="${x}" y="${H - m.b + 16}" text-anchor="middle" class="tk">${xf(v)}</text>`; });
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" class="ax"/>`;
  if (xl) g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle" class="al">${esc(xl)}</text>`;
  if (yl) g += `<text x="${m.l}" y="11" class="al">${esc(yl)}</text>`;
  return g;
}
function legend(el, names) {
  if (names.length < 2) return;
  el.appendChild(RB.h(`<div class="legend">${names.map((n, i) => `<span><i style="background:${RB.color(i)}"></i>${esc(n)}</span>`).join('')}</div>`));
}

/** Scatter (optionally joined) with optional trend lines and a horizontal reference. */
RB.chart = {};
RB.chart.scatter = (el, o) => {
  const pts = o.series.flatMap(s => s.pts);
  if (!pts.length) { el.innerHTML = `<div class="empty">${esc(o.empty || 'No data yet.')}</div>`; return; }
  const { W, H, tip } = frame(el, o.h);
  const isDate = !!o.dates;
  const X = p => isDate ? Date.parse(p.x) : p.x;
  let xlo = Math.min(...pts.map(X)), xhi = Math.max(...pts.map(X));
  let ylo = Math.min(...pts.map(p => p.y), o.refY ?? Infinity), yhi = Math.max(...pts.map(p => p.y), o.refY ?? -Infinity);
  if (o.y0) ylo = Math.min(0, ylo);
  const pad = (yhi - ylo) * .08 || 1; const ys = nice(o.y0 && ylo >= 0 ? 0 : ylo - pad, yhi + pad, 4);
  let xs;
  if (isDate) { if (xlo === xhi) { xlo -= 864e5 * 15; xhi += 864e5 * 15; } const n = Math.min(5, Math.max(2, Math.round(W / 110))); xs = { lo: xlo, hi: xhi, ticks: Array.from({ length: n }, (_, i) => xlo + (xhi - xlo) * i / (n - 1)) }; }
  else { const px = (xhi - xlo) * .05 || 1; xs = nice(Math.max(o.x0 ? 0 : -Infinity, xlo - px), xhi + px, Math.max(3, Math.round(W / 90))); }
  const m = { l: 44, r: 10, t: 18, b: 34 };
  m.sx = v => m.l + (v - xs.lo) / (xs.hi - xs.lo) * (W - m.l - m.r);
  m.sy = v => H - m.b - (v - ys.lo) / (ys.hi - ys.lo) * (H - m.t - m.b);
  const xf = isDate ? v => { const d = new Date(v); return d.toLocaleDateString('de-AT', { month: 'short', year: '2-digit' }); } : (o.xf || fmtTick);
  let g = axes(W, H, m, xs, ys, o.xLabel, o.yLabel, xf, o.yf);
  if (o.refY != null) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.sy(o.refY)}" y2="${m.sy(o.refY)}" class="ref"/>`;
  (o.lines || []).forEach(L => g += `<line x1="${m.sx(L.x0)}" x2="${m.sx(L.x1)}" y1="${m.sy(L.y0)}" y2="${m.sy(L.y1)}" stroke="${L.color}" stroke-width="2" stroke-dasharray="${L.dash || ''}"/>`);
  o.series.forEach((s, i) => {
    const c = s.color || RB.color(i);
    if (s.join && s.pts.length > 1) { const ps = [...s.pts].sort((a, b) => X(a) - X(b)); g += `<polyline fill="none" stroke="${c}" stroke-width="1.6" stroke-opacity=".7" points="${ps.map(p => m.sx(X(p)) + ',' + m.sy(p.y)).join(' ')}"/>`; }
    s.pts.forEach(p => g += `<circle cx="${m.sx(X(p))}" cy="${m.sy(p.y)}" r="${s.r || 4.5}" fill="${c}" stroke="var(--bg)" stroke-width="1.2" data-tip="${esc(p.tip || '')}"/><circle cx="${m.sx(X(p))}" cy="${m.sy(p.y)}" r="14" fill="transparent" data-tip="${esc(p.tip || '')}"/>`);
  });
  el.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`);
  legend(el, o.series.map(s => s.name)); bindTips(el, tip);
};

/** Vertical bars, one per item. */
RB.chart.bars = (el, o) => {
  if (!o.items.length) { el.innerHTML = `<div class="empty">${esc(o.empty || 'No data yet.')}</div>`; return; }
  const { W, H, tip } = frame(el, o.h);
  const ys = o.yDomain ? { lo: o.yDomain[0], hi: o.yDomain[1], ticks: nice(o.yDomain[0], o.yDomain[1], 4).ticks.filter(v => v >= o.yDomain[0] && v <= o.yDomain[1]) } : nice(0, Math.max(...o.items.map(i => i.value)), 4);
  const m = { l: 40, r: 8, t: 18, b: 34 };
  m.sy = v => H - m.b - (v - ys.lo) / (ys.hi - ys.lo) * (H - m.t - m.b);
  const bw = (W - m.l - m.r) / o.items.length;
  let g = '';
  ys.ticks.forEach(v => g += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.sy(v)}" y2="${m.sy(v)}" class="grid"/><text x="${m.l - 6}" y="${m.sy(v) + 4}" text-anchor="end" class="tk">${fmtTick(v)}</text>`);
  const every = Math.ceil(o.items.length / Math.max(1, Math.floor((W - m.l) / 46)));
  o.items.forEach((it, i) => {
    const x = m.l + i * bw + bw * .15, y = m.sy(it.value), w = Math.max(2, bw * .7);
    g += `<rect x="${x}" y="${y}" width="${w}" height="${H - m.b - y}" rx="2" fill="${it.color || 'var(--c1)'}" data-tip="${esc(it.tip || '')}"/>`;
    if (i % every === 0) g += `<text x="${x + w / 2}" y="${H - m.b + 16}" text-anchor="middle" class="tk">${esc(it.label)}</text>`;
  });
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" class="ax"/>`;
  if (o.yLabel) g += `<text x="${m.l}" y="11" class="al">${esc(o.yLabel)}</text>`;
  if (o.xLabel) g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle" class="al">${esc(o.xLabel)}</text>`;
  el.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`);
  bindTips(el, tip);
};

/** Shot cloud: each test shot relative to its group centre (values already in the shown angle unit), one colour per ammo. */
RB.chart.cloud = (el, o) => {
  if (!o.series.some(s => s.pts.length)) { el.innerHTML = `<div class="empty">${esc(o.empty || 'No test shots yet.')}</div>`; return; }
  const W0 = Math.max(260, el.clientWidth || 300), side = Math.min(W0, 360);
  const { tip } = frame(el, side);
  const all = o.series.flatMap(s => s.pts), lim = Math.max(.15, Math.ceil(Math.max(...all.map(p => Math.max(Math.abs(p.dx), Math.abs(p.dy)))) * 10 * 1.1) / 10);
  const c = side / 2, s = v => v / lim * (side / 2 - 14);
  let g = '';
  [.1, .2, .3, .5, 1, 2, 3, 5].filter(r => r <= lim).forEach(r => g += `<circle cx="${c}" cy="${c}" r="${s(r)}" fill="none" class="grid"/><text x="${c + s(r) * .707 + 2}" y="${c - s(r) * .707 - 2}" class="tk">${r}</text>`);
  g += `<line x1="0" x2="${side}" y1="${c}" y2="${c}" class="ax"/><line y1="0" y2="${side}" x1="${c}" x2="${c}" class="ax"/>`;
  o.series.forEach((se, i) => se.pts.forEach(p => g += `<circle cx="${c + s(p.dx)}" cy="${c - s(p.dy)}" r="3.6" fill="${RB.color(i)}" fill-opacity=".8" data-tip="${esc(se.name)}<br>${RB.fx(p.dx, 2)} / ${RB.fx(p.dy, 2)} ${RB.U.label('ang')}"/>`));
  g += `<text x="4" y="12" class="al">${RB.U.label('ang')} from group centre</text>`;
  el.insertAdjacentHTML('afterbegin', `<svg width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" style="margin:0 auto">${g}</svg>`);
  legend(el, o.series.map(s => s.name)); bindTips(el, tip);
};

/** Load ladder: bars = mean radius, dots = V0, over charge weight (values already in the shown units). */
RB.chart.ladder = (el, items) => {
  if (items.length < 2) { el.innerHTML = '<div class="empty">Add handloads with a charge weight and test them to see a ladder.</div>'; return; }
  const { W, H, tip } = frame(el, 230);
  const m = { l: 40, r: 44, t: 18, b: 34 };
  const mr = nice(0, Math.max(...items.map(i => i.mrM || 0)) || .3, 4), vs = items.filter(i => i.v0), vr = vs.length ? nice(Math.min(...vs.map(i => i.v0)) - 3, Math.max(...vs.map(i => i.v0)) + 3, 4) : null;
  const bw = (W - m.l - m.r) / items.length, sy = v => H - m.b - (v - mr.lo) / (mr.hi - mr.lo) * (H - m.t - m.b), sv = v => H - m.b - (v - vr.lo) / (vr.hi - vr.lo) * (H - m.t - m.b);
  let g = '';
  mr.ticks.forEach(v => g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end" class="tk">${fmtTick(v)}</text>`);
  if (vr) vr.ticks.forEach(v => g += `<text x="${W - m.r + 6}" y="${sv(v) + 4}" class="tk" fill="var(--c2)">${fmtTick(v)}</text>`);
  const pl = [];
  items.forEach((it, i) => {
    const x = m.l + i * bw + bw * .2, w = bw * .6;
    if (it.mrM) g += `<rect x="${x}" y="${sy(it.mrM)}" width="${w}" height="${H - m.b - sy(it.mrM)}" rx="2" fill="var(--c1)" data-tip="${esc(it.name)}<br>MR ${RB.fx(it.mrM, 3)} ${RB.U.label('ang')}"/>`;
    if (it.v0 && vr) pl.push([x + w / 2, sv(it.v0), it]);
    g += `<text x="${x + w / 2}" y="${H - m.b + 16}" text-anchor="middle" class="tk">${RB.fx(it.chargeG, 2)}</text>`;
  });
  if (pl.length > 1) g += `<polyline fill="none" stroke="var(--c2)" stroke-width="1.6" points="${pl.map(p => p[0] + ',' + p[1]).join(' ')}"/>`;
  pl.forEach(([x, y, it]) => g += `<circle cx="${x}" cy="${y}" r="4.5" fill="var(--c2)" stroke="var(--bg)" data-tip="${esc(it.name)}<br>V0 ${RB.fx(it.v0, 0)} ${RB.U.label('vel')}"/>`);
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" class="ax"/><text x="${m.l}" y="11" class="al">MR ${RB.U.label('ang')} (bars)</text><text x="${W - m.r}" y="11" text-anchor="end" class="al" fill="var(--c2)">V0 ${RB.U.label('vel')} (dots)</text><text x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle" class="al">Charge ${RB.U.label('mass')}</text>`;
  el.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`);
  bindTips(el, tip);
};
})();
