/* SR Field Kit 0.6.0 — Drop & wind extras (backlog #19, #20).
   #20 trajectory graph below the table: the bullet's path out to "Out to", the line of sight, the bore line starting
       sight height below it (height over bore), every point where the path crosses the line of sight (the zero
       distance labelled "Zero …"), the drop at every 100 m (50 m for short tables), plus a close-range view
       (0 to about 150 m, height every 25 m). Redraws with every change; follows light/dark.
   #19 export as PDF in A4 (full page), A5 (half sheet) or A6 (dope card): inputs, table and graph on one page.
       Android: Save (pick a folder), Share (mail, Nextcloud, messenger…) or Print. Web app: the same, through
       the browser (share sheet / download / PDF view).
   Uses the same solver as the table (js/ballistics.js, RB.dope). Nothing leaves the phone unless the user shares. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const store = window.FKStore, N = window.FKNative || null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MOA_CM_100 = 2.90888;
  const COL = { path: '#4B5320', los: '#111111', bore: '#5C462A', cross: '#b45309', grid: '#d9d3c4', ink: '#111111', mute: '#3a372f', box: '#f4f1ea' };
  let last = null, T = null;
  const appVer = () => { try { return JSON.parse(N.appInfo()).version || ''; } catch (e) { return ''; } };
  let paper = /^A[456]$/.test(store.get('dw-paper', '')) ? store.get('dw-paper', '') : 'A4';

  // ---------- numbers ----------
  const fx = (v, d) => { const r = +v.toFixed(d); return (r === 0 ? 0 : r).toFixed(d); };     // no "-0"
  const signed = (v, d) => { const s = fx(v, d); return +s > 0 ? '+' + s : s; };

  /** Fine trajectory (every 5 m or 5 yd) from the inputs of the table. */
  function trajectory(b) {
    const o = b.o, I = !!o.imp, D = I ? 0.9144 : 1, air = RB.air({ temp: o.temp, alt: o.alt });
    const windMs = o.wind / 3.6 * Math.abs(Math.sin(o.clock * Math.PI / 6));
    const d = RB.dope({ v0: o.mv, bc: o.bc, model: o.model || 'G1', sightMm: o.sh * 10, zeroM: o.zero, air, maxM: o.max, stepM: 5 * D, windMs, massG: o.mass });
    const h = o.sh / 100, tan = Math.tan(d.angle);
    const pts = d.rows.map((r, i) => ({ i, x: r.x, u: i * 5, rel: r.dropM, bore: -h + r.x * tan, v: r.v, t: r.t, drift: r.driftM, e: r.e, mach: r.mach }));
    const cross = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i];
      if (a.i === 0) continue;                                     // the muzzle is sight height below the line
      if ((a.rel < 0) !== (c.rel < 0) || c.rel === 0) {
        const f = c.rel === a.rel ? 1 : (0 - a.rel) / (c.rel - a.rel), x = a.x + (c.x - a.x) * f;
        if (!cross.length || Math.abs(cross[cross.length - 1].x - x) > 1) cross.push({ x, u: x / D });
      }
    }
    let zi = -1, best = 1e9;
    cross.forEach((c, k) => { const dd = Math.abs(c.x - o.zero); if (dd < best) { best = dd; zi = k; } });
    cross.forEach((c, k) => { c.zero = k === zi && best < 3 * D; });
    const peak = Math.max(0, ...pts.filter(p => p.x < o.zero - 1).map(p => p.rel));
    return { pts, cross, I, D, du: I ? 'yd' : 'm', cu: I ? 'in' : 'cm', cv: m => I ? m * 100 / 2.54 : m * 100, maxU: Math.round(o.max / D), peak, sos: air.c };
  }
  const niceStep = (range, n) => { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; };

  /** Geometry of one graph, shared by the screen (SVG) and the PDF. */
  function geom(T, maxU, W, H, pad, zoom, fs) {
    const L = pad.l, Tp = pad.t, PW = W - pad.l - pad.r, PH = H - pad.t - pad.b;
    const use = T.pts.filter(p => p.u <= maxU + 1e-6), cv = T.cv;
    const vals = use.map(p => cv(p.rel)), bores = use.map(p => cv(p.bore));
    let lo = Math.min(0, ...vals, ...(zoom ? bores : [])), hi = Math.max(0, ...vals, ...bores);
    const span = hi - lo || 1; hi += span * 0.14; lo -= span * (zoom ? 0.16 : 0.12);
    const sx = u => L + u / maxU * PW, sy = v => Tp + (hi - v) / (hi - lo) * PH;
    const xs = zoom ? 25 : (maxU <= 500 ? 50 : 100), ys = niceStep(hi - lo, zoom ? 3 : 4);
    const G = { W, H, fs, grid: [], xt: [], yt: [], dots: [], zs: [] };
    for (let u = 0; u <= maxU + 1e-6; u += xs) { G.grid.push([sx(u), Tp, sx(u), Tp + PH]); G.xt.push({ x: sx(u), y: Tp + PH + fs * 1.25, t: String(u) }); }
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) { G.grid.push([L, sy(v), L + PW, sy(v)]); G.yt.push({ x: L - fs * 0.4, y: sy(v) + fs * 0.35, t: String(+v.toFixed(1)) }); }
    G.unitY = { x: 2, y: Tp - fs * 0.6, t: T.cu };
    G.unitX = { x: W - 1, y: Tp - fs * 0.6, t: T.du, end: true };
    G.path = use.map(p => [sx(p.u), sy(cv(p.rel))]);
    const b0 = use[0], b1 = use[use.length - 1];
    G.bore = [[sx(b0.u), sy(cv(b0.bore))], [sx(b1.u), sy(cv(b1.bore))]];
    G.los = [[sx(0), sy(0)], [sx(maxU), sy(0)]];
    const every = (zoom ? 25 : xs) / 5;
    const nearCross = p => T.cross.some(c => Math.abs(c.u - p.u) < 3);
    use.forEach(p => { if (p.i > 0 && p.i % every === 0 && !nearCross(p)) {
      const v = cv(p.rel); G.dots.push({ x: sx(p.u), y: sy(v), ly: sy(v) + fs * 1.35, t: zoom ? signed(v, 1) : fx(v, 0) }); } });
    T.cross.filter(c => c.u <= maxU + 1e-6).forEach((c, k) => G.zs.push({ x: sx(c.u), y: sy(0), ly: sy(0) - fs * 0.9 - (k % 2) * fs * 1.25,
      t: (c.zero ? 'Zero ' : '') + Math.round(c.u) + ' ' + T.du + ' · 0 ' + T.cu }));
    G.zs.forEach(z => { const half = z.t.length * fs * 0.27; if (z.x - half < 2) z.start = true; });
    G.dots.forEach(d => { const half = d.t.length * fs * 0.3; if (d.x + half > W - 1) { d.end = true; d.lx = W - 1; } });
    if (zoom) { G.sh = [[sx(0), sy(0)], [sx(0), sy(cv(b0.bore))]]; G.shT = { x: sx(0) + fs * 0.4, y: sy(cv(b0.bore)) + fs * 1.3, t: 'Sight height ' + fx(cv(-b0.bore), T.I ? 1 : 1) + ' ' + T.cu }; }
    return G;
  }

  // ---------- on screen (SVG, themed by CSS) ----------
  const P = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const txt = (o, cls, anchor) => `<text x="${o.x.toFixed(1)}" y="${o.y.toFixed(1)}" class="${cls}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(o.t)}</text>`;
  function svg(G, label) {
    return `<svg viewBox="0 0 ${G.W} ${G.H}" role="img" aria-label="${esc(label)}" style="font-size:${G.fs}px">` +
      `<path class="tg" d="${G.grid.map(g => 'M' + g[0].toFixed(1) + ' ' + g[1].toFixed(1) + 'L' + g[2].toFixed(1) + ' ' + g[3].toFixed(1)).join('')}"/>` +
      `<path class="tb" d="${P(G.bore)}"/><path class="tl" d="${P(G.los)}"/><path class="tp" d="${P(G.path)}"/>` +
      (G.sh ? `<path class="ts" d="${P(G.sh)}"/>` + txt(G.shT, 'tt') : '') +
      G.xt.map(t => txt(t, 'tx', t.end ? 'end' : 'middle')).join('') + G.yt.map(t => txt(t, 'tx', 'end')).join('') + txt(G.unitY, 'tu') + txt(G.unitX, 'tu', 'end') +
      G.dots.map(d => `<circle class="td" cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${(G.fs * 0.3).toFixed(1)}"/>` + txt({ x: d.end ? d.lx : d.x, y: d.ly, t: d.t }, 'tv', d.end ? 'end' : 'middle')).join('') +
      G.zs.map(z => `<circle class="tz" cx="${z.x.toFixed(1)}" cy="${z.y.toFixed(1)}" r="${(G.fs * 0.48).toFixed(1)}"/>` + txt({ x: z.start ? 2 : z.x, y: z.ly, t: z.t }, 'tzl', z.start ? 'start' : 'middle')).join('') +
      `</svg>`;
  }
  const zoomMax = T => Math.min(T.maxU, Math.max(150, Math.ceil(((T.cross[0] && T.cross[0].u) || 100) / 50) * 50 + 50, (T.cross.find(c => c.zero) || { u: 0 }).u + 50));
  function crossText(T, o) {
    const z = Math.round(o.zero / T.D);
    if (!T.cross.length) return `The bullet does not reach the line of sight within ${T.maxU} ${T.du}. Check sight height and zero.`;
    return `Crosses the line of sight at ${T.cross.map(c => Math.round(c.u) + ' ' + T.du).join(' and ')} (zero ${z} ${T.du}). ` +
      `Highest point before the zero: ${fx(T.cv(T.peak), 1)} ${T.cu} above the line. Labels: drop in ${T.cu}.`;
  }

  function draw(b) {
    last = b; const box = $('dwGraph'); if (!box) return;
    if (!b || !b.res || !b.res.length) { box.hidden = true; $('dwExport').hidden = true; T = null; return; }
    try { T = trajectory(b); } catch (e) { box.hidden = true; return; }
    box.hidden = false; $('dwExport').hidden = false;
    const zm = zoomMax(T);
    $('dwMain').innerHTML = svg(geom(T, T.maxU, 340, 236, { l: 38, r: 16, t: 16, b: 22 }, false, 10), 'Trajectory: bullet path, line of sight, bore line, crossings and drop');
    $('dwZoomT').textContent = `Close range, 0 to ${zm} ${T.du} (height over bore)`;
    $('dwZoom').innerHTML = svg(geom(T, zm, 340, 170, { l: 38, r: 16, t: 16, b: 22 }, true, 10), 'Close range: sight height, bore line and the crossings');
    $('dwCross').textContent = crossText(T, b.o);
  }
  window.__afterBall = draw;

  // ---------- PDF ----------
  function clickOf() {
    const c = window.__SR && __SR.current && __SR.current();
    const w = c && c.w; const v = w && +w.clickValue > 0 ? +w.clickValue : 0.1;
    return { unit: w && /moa/i.test(w.scopeUnit || '') ? 'MOA' : 'MIL', v };
  }
  function stamp() { const d = new Date(), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { long: d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
      short: d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear(), file: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }; }
  const CLOCK = { 3: '3 / 9 o’clock (full)', 2: '2 / 4 / 8 / 10 o’clock', 1: '1 / 5 / 7 / 11 o’clock (half)', 0: '12 / 6 o’clock (none)' };

  function rowsFor(T, b, ck) {
    const step = T.maxU <= 500 ? 50 : 100, o = b.o;
    return T.pts.filter(p => p.i > 0 && p.u % step === 0).map(p => {
      const R = p.x, dropcm = p.rel * 100, mil = -dropcm * 10 / R, moa = -dropcm / (MOA_CM_100 * R / 100), wcm = p.drift * 100;
      const clicks = Math.round((ck.unit === 'MOA' ? moa : mil) / ck.v);
      return { u: String(Math.round(p.u)), drop: fx(T.cv(p.rel), 0), mil: fx(mil, 1), moa: fx(moa, 1), clk: String(clicks === 0 ? 0 : clicks),
        wind: fx(T.cv(p.drift), 0), wmil: fx(wcm * 10 / R, 1), v: fx(T.I ? p.v * 3.28084 : p.v, 0), e: fx(T.I ? p.e * 0.737562 : p.e, 0), t: fx(p.t, 2),
        zero: Math.abs(R - o.zero) < 0.5, trans: p.v < 1.2 * T.sos };
    });
  }
  function inputs(b, T, ck) {
    const o = b.o, I = T.I, c = window.__SR && __SR.current && __SR.current();
    const v0 = (I ? fx(o.mv * 3.28084, 0) + ' fps' : fx(o.mv, 0) + ' m/s') + (c && c.meas ? ' (measured)' : '');
    return [['Drag model / BC', (o.model || 'G1') + ' ' + o.bc], ['Muzzle velocity', v0], ['Bullet', I ? fx(o.mass * 15.4324, 0) + ' gr' : fx(o.mass, 1) + ' g'],
      ['Sight height', I ? fx(o.sh / 2.54, 2) + ' in' : fx(o.sh, 1) + ' cm'], ['Zero', Math.round(o.zero / T.D) + ' ' + T.du],
      ['Wind', (I ? fx(o.wind * 0.621371, 0) + ' mph' : fx(o.wind, 0) + ' km/h')], ['Wind from', CLOCK[o.clock] || ''],
      ['Altitude', I ? fx(o.alt * 3.28084, 0) + ' ft' : fx(o.alt, 0) + ' m'], ['Temperature', I ? fx(o.temp * 9 / 5 + 32, 0) + ' °F' : fx(o.temp, 0) + ' °C'],
      ['1 click', ck.v + ' ' + ck.unit], ['Source', c ? 'My database' : 'Own load']];
  }
  function fit(doc, s, size, bold, maxW) { while (size > 6 && doc.width(s, size, bold) > maxW) size -= 0.5; return size; }
  function wrap(doc, s, size, bold, maxW) { const words = String(s).split(' '), out = []; let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (doc.width(t, size, bold) > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }

  function pdfGraph(doc, G, ox, oy) {
    const X = p => [ox + p[0], oy + p[1]], fs = G.fs;
    G.grid.forEach(g => doc.line(ox + g[0], oy + g[1], ox + g[2], oy + g[3], { w: 0.4, color: COL.grid }));
    doc.poly(G.bore.map(X), { w: 0.9, color: COL.bore, dash: [1.2, 1.8] });
    doc.poly(G.los.map(X), { w: 0.9, color: COL.los, dash: [4, 2.5] });
    doc.poly(G.path.map(X), { w: 1.6, color: COL.path });
    if (G.sh) { doc.poly(G.sh.map(X), { w: 1.4, color: '#b08d3c' }); doc.text(ox + G.shT.x, oy + G.shT.y, G.shT.t, { size: fs * 0.9, color: COL.bore }); }
    G.xt.forEach(t => doc.text(ox + t.x, oy + t.y, t.t, { size: fs, color: COL.mute, align: t.end ? 'right' : 'center' }));
    G.yt.forEach(t => doc.text(ox + t.x, oy + t.y, t.t, { size: fs, color: COL.mute, align: 'right' }));
    doc.text(ox + G.unitY.x, oy + G.unitY.y, G.unitY.t, { size: fs, bold: true, color: COL.mute });
    doc.text(ox + G.unitX.x, oy + G.unitX.y, G.unitX.t, { size: fs, bold: true, color: COL.mute, align: 'right' });
    G.dots.forEach(d => { doc.circle(ox + d.x, oy + d.y, fs * 0.28, { fill: COL.path }); doc.text(ox + (d.end ? d.lx : d.x), oy + d.ly, d.t, { size: fs, bold: true, align: d.end ? 'right' : 'center', halo: true }); });
    G.zs.forEach(z => { doc.circle(ox + z.x, oy + z.y, fs * 0.45, { stroke: COL.cross, w: 1.2 }); doc.text(ox + (z.start ? 2 : z.x), oy + z.ly, z.t, { size: fs, bold: true, color: COL.cross, align: z.start ? 'left' : 'center', halo: true }); });
  }
  function legend(doc, x, y, fs, maxW) {
    const items = [['Bullet path', COL.path, null, 1.6], ['Line of sight', COL.los, [4, 2.5], 0.9], ['Bore line (height over bore)', COL.bore, [1.2, 1.8], 0.9], ['Crosses line of sight', COL.cross, 'o']];
    let cx = x, cy = y;
    items.forEach(([t, c, d, w]) => { const need = 20 + doc.width(t, fs, false) + 12; if (cx + need > x + maxW) { cx = x; cy += fs * 1.6; }
      if (d === 'o') doc.circle(cx + 7, cy - fs * 0.35, fs * 0.4, { stroke: c, w: 1.1 }); else doc.line(cx, cy - fs * 0.35, cx + 16, cy - fs * 0.35, { w, color: c, dash: d });
      doc.text(cx + 20, cy, t, { size: fs, color: COL.mute }); cx += need; });
    return cy + fs * 0.6;
  }
  function table(doc, x, y, w, cols, rows, o) {
    const total = cols.reduce((a, c) => a + c.w, 0), k = w / total;
    let cx = x; const xs = cols.map(c => { const s = cx; cx += c.w * k; return [s, cx]; });
    cols.forEach((c, i) => {
      const lines = c.h.split('\n');
      lines.forEach((l, j) => doc.text(i ? xs[i][1] - 3 : xs[i][0] + 2, y + o.hs * (j + 1) * 1.1 - (lines.length === 1 && o.two ? -o.hs * 1.1 : 0) - o.hs * 0.2, l, { size: o.hs, bold: true, color: COL.mute, align: i ? 'right' : 'left' }));
    });
    y += o.hs * (o.two ? 2.3 : 1.3) + 2; doc.line(x, y, x + w, y, { w: 1.2, color: COL.ink }); y += 1;
    rows.forEach(r => {
      if (r.zero) doc.rect(x, y, w, o.rh, { fill: '#e8ead9' });
      cols.forEach((c, i) => doc.text(i ? xs[i][1] - 3 : xs[i][0] + 2, y + o.rh * 0.7, r[c.k], { size: c.big ? o.fs * 1.12 : o.fs, bold: !!c.b || (c.big), color: COL.ink, align: i ? 'right' : 'left' }));
      y += o.rh; doc.line(x, y, x + w, y, { w: 0.4, color: COL.grid });
    });
    return y;
  }

  function build(size) {
    const b = last; if (!b || !T) return null;
    const [PW, PH] = FKPdf.PAPER[size], doc = FKPdf.Doc(PW, PH), ck = clickOf(), when = stamp(), o = b.o;
    const rows = rowsFor(T, b, ck), inp = inputs(b, T, ck), du = T.du, cu = T.cu, vu = T.I ? 'fps' : 'm/s', eu = T.I ? 'ft·lb' : 'J';
    const title = String(b.load || 'Own load'), foot = 'SR Field Kit ' + appVer() + ' · calculated with a ' + (o.model || 'G1') + ' point-mass model · check on the range before relying on it';
    if (size === 'A6') {
      const m = 16; doc.rect(6, 6, PW - 12, PH - 12, { stroke: '#9a937f', w: 0.6, dash: [3, 2] });
      doc.text(m, m + 8, 'DOPE CARD', { size: 7, bold: true, color: COL.bore }); doc.text(PW - m, m + 8, when.short, { size: 7, bold: true, color: COL.bore, align: 'right' });
      const ts = fit(doc, title, 12, true, PW - 2 * m); doc.text(m, m + 23, title, { size: ts, bold: true });
      const sum = 'Zero ' + Math.round(o.zero / T.D) + ' ' + du + ' · V0 ' + inp[1][1] + ' · ' + inp[0][1] + ' · ' + inp[7][1] + ', ' + inp[8][1] + ' · wind ' + inp[5][1] + ' ' + (CLOCK[o.clock] || '') + ' · 1 click ' + ck.v + ' ' + ck.unit;
      let y = m + 33; wrap(doc, sum, 6.8, false, PW - 2 * m).forEach(l => { doc.text(m, y, l, { size: 6.8, color: COL.mute }); y += 8.5; });
      doc.line(m, y - 4, PW - m, y - 4, { w: 1.6, color: COL.ink }); y += 2;
      y = table(doc, m, y, PW - 2 * m, [{ k: 'u', h: du, w: 0.9, b: 1 }, { k: ck.unit === 'MOA' ? 'moa' : 'mil', h: 'Up ' + ck.unit, w: 1.2, big: 1 }, { k: 'clk', h: 'Clicks', w: 1 }, { k: 'wmil', h: 'Wind MIL', w: 1.15 }, { k: 'drop', h: 'Drop ' + cu, w: 1.1 }],
        rows, { hs: 6.5, fs: 10, rh: Math.min(16, (PH - y - 150) / rows.length) });
      const gh = Math.max(90, PH - y - 34);
      pdfGraph(doc, geom(T, T.maxU, PW - 2 * m, gh, { l: 22, r: 4, t: 22, b: 13 }, false, 6.2), m, y + 4);
      doc.text(m, PH - m + 2, 'Drop in ' + cu + ' on the graph · check on the range', { size: 5.8, color: COL.mute });
      doc.text(PW - m, PH - m + 2, 'SR Field Kit · A6', { size: 5.8, color: COL.mute, align: 'right' });
      return doc.bytes('Dope card ' + title);
    }
    const A4 = size === 'A4', m = A4 ? 42 : 28, W = PW - 2 * m;
    doc.text(m, m + 8, 'SR FIELD KIT · DROP TABLE', { size: A4 ? 8 : 7, bold: true, color: COL.bore });
    doc.text(PW - m, m + 8, when.long, { size: A4 ? 8 : 7, color: COL.mute, align: 'right' });
    const ts = fit(doc, title, A4 ? 20 : 15, true, W); doc.text(m, m + (A4 ? 30 : 25), title, { size: ts, bold: true });
    let y = m + (A4 ? 38 : 32); doc.line(m, y, PW - m, y, { w: 2, color: COL.ink }); y += A4 ? 10 : 8;
    // inputs
    const ncol = A4 ? 4 : 3, cw = W / ncol, rh = A4 ? 24 : 21, nrow = Math.ceil(inp.length / ncol);
    doc.rect(m, y, W, nrow * rh + 8, { fill: COL.box });
    inp.forEach((p, i) => { const cx = m + 8 + (i % ncol) * cw, cy = y + 12 + Math.floor(i / ncol) * rh;
      doc.text(cx, cy, p[0].toUpperCase(), { size: A4 ? 6.5 : 5.8, bold: true, color: COL.mute });
      doc.text(cx, cy + (A4 ? 10.5 : 9.5), p[1], { size: fit(doc, p[1], A4 ? 9.5 : 8.5, true, cw - 10), bold: true }); });
    y += nrow * rh + 8 + (A4 ? 14 : 10);
    const cols = A4
      ? [{ k: 'u', h: du, w: 0.8, b: 1 }, { k: 'drop', h: 'Drop\n' + cu, w: 1 }, { k: 'mil', h: 'Up\nMIL', w: 0.9, b: 1 }, { k: 'moa', h: 'Up\nMOA', w: 0.9 }, { k: 'clk', h: 'Clicks\n' + ck.v + ' ' + ck.unit, w: 1.1 },
        { k: 'wind', h: 'Wind\n' + cu, w: 0.9 }, { k: 'wmil', h: 'Wind\nMIL', w: 0.9 }, { k: 'v', h: 'Velocity\n' + vu, w: 1 }, { k: 'e', h: 'Energy\n' + eu, w: 1 }, { k: 't', h: 'Time\ns', w: 0.8 }]
      : [{ k: 'u', h: du, w: 0.8, b: 1 }, { k: 'drop', h: 'Drop\n' + cu, w: 1 }, { k: 'mil', h: 'Up\nMIL', w: 0.9, b: 1 }, { k: 'clk', h: 'Clicks\n' + ck.v + ' ' + ck.unit, w: 1.15 },
        { k: 'wind', h: 'Wind\n' + cu, w: 0.9 }, { k: 'wmil', h: 'Wind\nMIL', w: 0.9 }, { k: 'v', h: 'Velocity\n' + vu, w: 1.05 }, { k: 'e', h: 'Energy\n' + eu, w: 1 }];
    y = table(doc, m, y, W, cols, rows, { hs: A4 ? 7 : 6.2, fs: A4 ? 9 : 8, rh: A4 ? (rows.length > 12 ? 13.5 : 15.5) : (rows.length > 12 ? 11.5 : 13), two: true });
    y += A4 ? 16 : 12;
    doc.text(m, y, 'Trajectory', { size: A4 ? 12 : 10, bold: true }); y += 4;
    const footY = PH - m + 6, left = footY - y - 30 - (A4 ? 34 : 28);
    const gh = A4 ? Math.max(150, Math.min(270, left - 180)) : Math.max(110, Math.min(330, left));
    pdfGraph(doc, geom(T, T.maxU, W, gh, { l: A4 ? 40 : 32, r: 6, t: 16, b: 16 }, false, A4 ? 8 : 6.8), m, y);
    y += gh + 12; y = legend(doc, m, y, A4 ? 7.5 : 6.5, W) + 4;
    wrap(doc, crossText(T, o), A4 ? 7.5 : 6.5, false, W).forEach(l => { doc.text(m, y + 6, l, { size: A4 ? 7.5 : 6.5, color: COL.mute }); y += A4 ? 10 : 8.5; });
    const zoomH = A4 ? Math.min(150, footY - 18 - (y + 18) - 4) : 0;
    if (zoomH >= 100) { const zm = zoomMax(T); y += 14; doc.text(m, y, 'Close range, 0 to ' + zm + ' ' + du + ' (height over bore)', { size: 9, bold: true }); y += 4;
      pdfGraph(doc, geom(T, zm, W, zoomH, { l: 40, r: 6, t: 16, b: 16 }, true, 8), m, y); }
    doc.line(m, footY - 10, PW - m, footY - 10, { w: 0.4, color: COL.grid });
    doc.text(m, footY, foot, { size: fit(doc, foot, A4 ? 7 : 6, false, W - 40), color: COL.mute });
    doc.text(PW - m, footY, size, { size: A4 ? 7 : 6, color: COL.mute, align: 'right' });
    return doc.bytes('Drop table ' + title);
  }
  window.__dwPdf = size => build(size || paper);     // for tests

  // ---------- export buttons ----------
  const cbs = {}; let cbn = 0;
  const prevCb = window.FKNativeCallback;
  window.FKNativeCallback = (id, res) => { if (cbs[id]) { const f = cbs[id]; delete cbs[id]; f(res); return; } if (prevCb) prevCb(id, res); };
  const call = fn => new Promise(res => { const id = 'dw-' + (++cbn); cbs[id] = res; fn(id); });
  const fileName = () => { const t = String(last && last.load || 'own-load').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    return 'SR-' + (paper === 'A6' ? 'dope-card' : 'drop-table') + '-' + paper + '-' + t + '-' + stamp().file + '.pdf'; };
  const msg = t => { const e = $('dwMsg'); if (e) e.textContent = t; };
  const download = (bytes, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };
  async function act(kind) {
    if (window.__ballFlush) window.__ballFlush();   // 0.7.0 (#21): export the values on screen, calculated
    const bytes = build(paper); if (!bytes) { msg('Fill in the load first.'); return; }
    const name = fileName(), b64 = FKPdf.b64(bytes);
    if (kind === 'save') {
      if (N && N.saveFile) { const r = await call(id => N.saveFile(name, 'application/pdf', b64, id)); msg(r && r.ok ? 'Saved: ' + (r.msg || name) : (r && r.msg === 'cancelled' ? '' : 'Not saved: ' + (r && r.msg || 'error'))); }
      else { download(bytes, name); msg('Downloaded: ' + name); }
    } else if (kind === 'share') {
      if (N && N.sharePdf) N.sharePdf(b64, name); else if (N && N.shareFile) N.shareFile(name, 'application/pdf', b64, ''); else download(bytes, name);
      msg('');
    } else {
      if (N && N.printPdf) N.printPdf(b64, name, paper);
      else { const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); }
      msg('');
    }
  }
  function showPaper() {
    document.querySelectorAll('#dwPaper button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.p === paper)));
    const t = { A4: 'A4: one full page with all inputs, the table and the graph' + ' (plus the close-range view when it fits).', A5: 'A5: half sheet with the main inputs, the table and the graph.', A6: 'A6 dope card: the corrections in big print and a small graph, with a cut line. Fits a stock pouch or a pocket.' };
    $('dwPaperNote').textContent = t[paper];
  }
  document.querySelectorAll('#dwPaper button').forEach(x => x.addEventListener('click', () => { paper = x.dataset.p; store.set('dw-paper', paper); showPaper(); msg(''); }));
  $('dwSave').addEventListener('click', () => act('save'));
  $('dwShare').addEventListener('click', () => act('share'));
  $('dwPrint').addEventListener('click', () => act('print'));
  showPaper();
  if (window.__ballNow) window.__ballNow(); else if (window.__ball) window.__ball();
})();
