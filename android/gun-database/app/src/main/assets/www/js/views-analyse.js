/* Stoic Ranger — photo analysis: score a shot target, read a hand-filled datasheet. */
'use strict';
(() => {
const { $, $$, esc, fx, num } = RB;

/**
 * Photo editor. kind 'target': photo of a real target (radius linear in mm).
 * kind 'sheet': photo of the printed sheet (radius linear in schematic ring units).
 * ctx: the sheet whose target geometry (preset, d10, w, bd) is used.
 */
function Editor(host, kind, ctx) {
  const tgt = () => RB.tgtOf(ctx);
  const E = { img: null, W: 0, H: 0, cal: { cx: null, cy: null, rpx: null, k: 1 }, hits: [], mode: 'center', zoom: 1, busy: false };
  host.innerHTML = `
    <div class="row tight">
      <button class="btn sm" data-m="center" type="button">1 · Centre</button>
      <button class="btn sm" data-m="ring" type="button">2 · Ring edge</button>
      <label class="inl">ring <select data-k>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => `<option ${k === 1 ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <button class="btn sm" data-m="hits" type="button">3 · Hits</button>
      <label class="inl">zoom <select data-z><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label>
    </div>
    <div class="edbox"><div class="edempty">No photo yet.</div><canvas hidden aria-label="Photo with overlay; tap to place"></canvas></div>
    <div class="msg" data-msg></div>`;
  const cv = $('canvas', host), cx2 = cv.getContext('2d'), empty = $('.edempty', host), msgEl = $('[data-msg]', host);
  const msg = (t, err) => { msgEl.textContent = t || ''; msgEl.classList.toggle('err', !!err); };
  $$('[data-m]', host).forEach(b => b.onclick = () => { E.mode = b.dataset.m; paint(); });
  $('[data-k]', host).onchange = e => { E.cal.k = +e.target.value; E.redraw(); };
  $('[data-z]', host).onchange = e => { E.zoom = +e.target.value; E.redraw(); };
  const paint = () => $$('[data-m]', host).forEach(b => b.classList.toggle('on', b.dataset.m === E.mode));
  paint();

  E.calibrated = () => E.cal.cx != null && E.cal.rpx > 0;
  E.toMm = (px, py) => { const t = tgt(), dx = px - E.cal.cx, dy = E.cal.cy - py, d = Math.hypot(dx, dy); if (!d) return { x: 0, y: 0 };
    const rmm = kind === 'target' ? d * RB.ringR(E.cal.k, t) / E.cal.rpx : RB.fToMm(d / E.cal.rpx * (11 - E.cal.k), t);
    return { x: dx / d * rmm, y: dy / d * rmm }; };
  E.ringPx = k => kind === 'target' ? RB.ringR(k, tgt()) * E.cal.rpx / RB.ringR(E.cal.k, tgt()) : (11 - k) / (11 - E.cal.k) * E.cal.rpx;
  E.holePx = () => { if (!E.calibrated()) return 6; const bd = num(ctx.bd) || 6.7;
    return kind === 'target' ? Math.max(3, bd / 2 * E.cal.rpx / RB.ringR(E.cal.k, tgt())) : Math.max(4, E.cal.rpx * .03); };
  E.setK = k => { E.cal.k = k; $('[data-k]', host).value = k; };

  E.load = (src, done) => { const im = new Image(); im.onload = () => {
      const m = 1600, s = Math.min(1, m / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); E.img = c; E.W = c.width; E.H = c.height;
      E.cal = { cx: null, cy: null, rpx: null, k: +$('[data-k]', host).value }; E.hits = []; E.mode = 'center'; paint();
      msg(kind === 'target' ? 'Photo loaded. Auto-detect, or tap the target centre.' : 'Photo loaded.'); E.redraw(); done && done(); };
    im.onerror = () => msg('This file could not be opened as an image. Try a JPEG or PNG.', true); im.src = src; };

  E.redraw = () => {
    if (!E.img) { cv.hidden = true; empty.hidden = false; return; }
    cv.hidden = false; empty.hidden = true;
    const bw = $('.edbox', host).clientWidth || 340;
    cv.width = E.W; cv.height = E.H; cv.style.width = (bw * E.zoom) + 'px'; cv.style.height = (bw * E.zoom * E.H / E.W) + 'px';
    cx2.drawImage(E.img, 0, 0);
    const lw = Math.max(1.5, E.W / 700);
    if (E.cal.cx != null) {
      cx2.strokeStyle = '#e0b84a'; cx2.lineWidth = lw;
      cx2.beginPath(); cx2.moveTo(E.cal.cx - 14 * lw, E.cal.cy); cx2.lineTo(E.cal.cx + 14 * lw, E.cal.cy); cx2.moveTo(E.cal.cx, E.cal.cy - 14 * lw); cx2.lineTo(E.cal.cx, E.cal.cy + 14 * lw); cx2.stroke();
      if (E.cal.rpx) { for (let k = 1; k <= 10; k++) { cx2.beginPath(); cx2.setLineDash(k === E.cal.k ? [] : [6 * lw, 4 * lw]); cx2.globalAlpha = k === E.cal.k ? 1 : .75;
          cx2.strokeStyle = k === E.cal.k ? '#e0b84a' : '#3fa9f5'; cx2.arc(E.cal.cx, E.cal.cy, E.ringPx(k), 0, Math.PI * 2); cx2.stroke(); }
        cx2.setLineDash([]); cx2.globalAlpha = 1; }
    }
    const hr = E.holePx();
    E.hits.forEach((h, i) => { cx2.beginPath(); cx2.strokeStyle = '#ff2d55'; cx2.lineWidth = lw * 1.3; cx2.arc(h.px, h.py, hr * 1.6, 0, Math.PI * 2); cx2.stroke();
      cx2.fillStyle = '#ff2d55'; cx2.font = `600 ${Math.max(12, 10 * lw)}px "JetBrains Mono", monospace`; cx2.fillText(i + 1, h.px + hr * 1.8, h.py - hr * 1.6);
      if (E.calibrated()) { const m = E.toMm(h.px, h.py); cx2.fillText(RB.scoreOf(m.x, m.y, tgt(), num(ctx.bd) || 0), h.px + hr * 1.8, h.py + hr * 1.6 + 10 * lw); } });
  };
  cv.addEventListener('click', e => {
    if (!E.img) return; const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) * E.W / r.width, py = (e.clientY - r.top) * E.H / r.height;
    if (E.mode === 'center') { E.cal.cx = px; E.cal.cy = py; E.mode = 'ring'; paint(); msg(`Now tap the outer edge of ring ${E.cal.k} (change the ring number if that edge isn't visible).`); }
    else if (E.mode === 'ring') { if (E.cal.cx == null) { msg('Tap the centre first.', true); return; } E.cal.rpx = Math.hypot(px - E.cal.cx, py - E.cal.cy); E.mode = 'hits'; paint();
      msg(kind === 'target' ? 'Check the overlay rings match the target. Then find holes, or tap each hole.' : 'Check the rings line up. Tap marks to add, tap a marker to remove.'); }
    else { const tol = Math.max(E.holePx() * 1.8, 14 * E.W / r.width); const j = E.hits.findIndex(h => Math.hypot(h.px - px, h.py - py) < tol);
      if (j >= 0) E.hits.splice(j, 1); else E.hits.push({ px, py }); }
    E.redraw();
  });
  E.msg = msg;
  E.mm = () => E.hits.map(h => { const m = E.toMm(h.px, h.py); return { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 }; });
  return E;
}

/* ---------- on-device hole finder (same algorithm as the datasheet page) ---------- */
function findHoles(E) {
  const W = E.W, H = E.H, d = E.img.getContext('2d').getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2];
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const h = E.holePx(), R = Math.max(4, Math.round(h * 3)), lim = E.ringPx(1) * 1.04, T = 28;
  const lab = new Int8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x - E.cal.cx, y - E.cal.cy) > lim) continue;
    const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    const v = g[y * W + x]; if (v < m - T) lab[y * W + x] = 1; else if (v > m + T) lab[y * W + x] = 2;
  }
  const seen = new Uint8Array(W * H), out = [], Ae = Math.PI * h * h, st = [];
  for (let s = 0; s < W * H; s++) { if (!lab[s] || seen[s]) continue;
    const L = lab[s]; let n = 0, sx = 0, sy = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1; st.push(s); seen[s] = 1;
    while (st.length) { const p = st.pop(), x = p % W, y = (p - x) / W; n++; sx += x; sy += y; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) { if (q < 0 || q >= W * H || seen[q] || lab[q] !== L) continue; if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue; seen[q] = 1; st.push(q); } }
    const bw = maxx - minx + 1, bh = maxy - miny + 1, fill = n / (bw * bh), asp = Math.max(bw, bh) / Math.min(bw, bh), D = 2 * h, cxp = sx / n, cyp = sy / n;
    if (n < Ae * .3 || n > Ae * 3.5 || asp > 1.8 || fill < .5 || Math.max(bw, bh) > D * 2.2 || Math.min(bw, bh) < D * .45) continue;
    let core = 0, tot = 0; const rc = Math.max(1.5, h * .55);
    for (let yy = Math.floor(cyp - rc); yy <= cyp + rc; yy++) for (let xx = Math.floor(cxp - rc); xx <= cxp + rc; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H || Math.hypot(xx - cxp, yy - cyp) > rc) continue; tot++; if (lab[yy * W + xx] === L) core++; }
    if (!tot || core / tot < .75) continue;
    let bm = 0, bn = 0; for (let yy = Math.floor(cyp - rc); yy <= cyp + rc; yy++) for (let xx = Math.floor(cxp - rc); xx <= cxp + rc; xx++) { if (xx >= 0 && yy >= 0 && xx < W && yy < H && Math.hypot(xx - cxp, yy - cyp) <= rc) { bm += g[yy * W + xx]; bn++; } } bm /= bn;
    const a0 = h * 3, a1 = h * 5, ring = [];
    for (let yy = Math.floor(cyp - a1); yy <= cyp + a1; yy++) for (let xx = Math.floor(cxp - a1); xx <= cxp + a1; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const dd = Math.hypot(xx - cxp, yy - cyp); if (dd >= a0 && dd <= a1) ring.push(g[yy * W + xx]); }
    ring.sort((a, b) => a - b); const med = ring[ring.length >> 1];
    const like = ring.filter(v => Math.abs(v - bm) < Math.abs(v - med)).length / Math.max(1, ring.length);
    if (Math.abs(bm - med) > T && like < .2) out.push({ px: cxp, py: cyp, n });
  }
  const res = []; out.sort((a, b) => b.n - a.n).forEach(c => { if (!res.some(r => Math.hypot(r.px - c.px, r.py - c.py) < h * 1.6)) res.push({ px: c.px, py: c.py }); });
  return res;
}
function snap(E, pts) {
  let local = []; try { local = findHoles(E); } catch (e) { return pts; }
  const tol = E.holePx() * 4;
  return pts.map(p => { let best = null, bd = tol; local.forEach(l => { const d = Math.hypot(l.px - p.px, l.py - p.py); if (d < bd) { bd = d; best = l; } }); return best ? { px: best.px, py: best.py } : p; });
}
function demoPhoto(ctx) {
  const t = RB.tgtOf(ctx), N = 1400, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  const R1 = RB.ringR(1, t), s = 600 / R1, cx = 712, cy = 690;
  const gr = x.createLinearGradient(0, 0, N, N); gr.addColorStop(0, '#f2efe6'); gr.addColorStop(1, '#dcd8cc'); x.fillStyle = gr; x.fillRect(0, 0, N, N);
  x.fillStyle = '#111'; x.beginPath(); x.arc(cx, cy, RB.ringR(5, t) * s, 0, 7); x.fill();
  for (let k = 1; k <= 10; k++) { x.beginPath(); x.lineWidth = 2.2; x.strokeStyle = k >= 5 ? '#e9e6dc' : '#111'; x.arc(cx, cy, RB.ringR(k, t) * s, 0, 7); x.stroke(); }
  x.font = `600 ${Math.round(t.w * .75 * s)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let k = 1; k <= 8; k++) { const r = (RB.ringR(k, t) - t.w / 2) * s; x.fillStyle = k >= 5 ? '#e9e6dc' : '#111'; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => x.fillText(k, cx + a * r, cy + b * r)); }
  const hb = (num(ctx.bd) || 6.7) / 2 * s; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i++) { const hx = cx + (.5 * t.w + (rnd() - .5) * 1.6 * t.w) * s, hy = cy + (.8 * t.w + (rnd() - .5) * 1.6 * t.w) * s;
    const inBlack = Math.hypot(hx - cx, hy - cy) < RB.ringR(5, t) * s; x.fillStyle = inBlack ? '#bdb9ae' : '#2a2620'; x.beginPath(); x.arc(hx, hy, hb, 0, 7); x.fill(); }
  const im = x.getImageData(0, 0, N, N), d = im.data; for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; } x.putImageData(im, 0, 0);
  return c.toDataURL('image/jpeg', .9);
}

/** Wire a photo input (camera or gallery) to an editor. */
function photoButtons(prefix) {
  return `<span class="btn pri file">Take photo<input type="file" accept="image/*" capture="environment" id="${prefix}Cam"></span>
    <span class="btn file">Choose photo<input type="file" accept="image/*" id="${prefix}Pick"></span>`;
}
function wire(input, E, after) {
  input.addEventListener('change', () => { const f = input.files && input.files[0]; if (!f) return; const u = URL.createObjectURL(f); E.load(u, () => { URL.revokeObjectURL(u); after && after(); }); input.value = ''; });
}

/** Target sheet to send results to: the one in ?sheet=, else a new one. */
function targetSheet(q) {
  const s = q.sheet && RB.sheetById(q.sheet);
  return s || null;
}
function commit(sheet, isNew) {
  if (isNew) RB.db.sheets.push(sheet);
  RB.save(true);
}

RB.views.analyse = {
  render(el, [mode], q) {
    if (mode === 'target') return targetView(el, q);
    if (mode === 'scan') return scanView(el, q);
    if (mode === 'dope') return RB.dopeView(el, q);
    RB.header('Analyse');
    el.innerHTML = `
      <a class="choice" href="#/analyse/target"><div class="ic">◎</div><div><h3>Score a shot target</h3><p>Photograph the target. Holes are found on the phone (or by Claude), scored to the bullet edge, and group size, MPI and the correction are calculated.</p></div></a>
      <a class="choice" href="#/analyse/scan"><div class="ic">▤</div><div><h3>Read a filled-in datasheet</h3><p>Photograph a printed sheet you filled in by hand. Claude reads the fields, the shot table and the marked hits into a new datasheet for you to check.</p></div></a>
      <a class="choice" href="#/analyse/dope"><div class="ic">⌖</div><div><h3>Dope cards</h3><p>Pick a gun and an ammunition: elevation and wind holds by distance, from your measured V0, the BC and the weather on your sheets, trued with your long-range groups. Print as A6, A5 or A4.</p></div></a>
      <div class="card"><h3>Blank datasheets</h3><p class="note">Print A4 sheets to take to the range.</p><div class="row"><button class="btn" id="aBlank">Print blank sheet</button></div></div>`;
    $('#aBlank').onclick = () => RB.printBlank(1);
  },
};

function targetView(el, q) {
  const U = RB.U, L = U.label('len'), A = U.label('ang');
  const existing = targetSheet(q);
  const ctx = existing || RB.newSheet();
  RB.header('Score a target', { back: true });
  el.innerHTML = `
    ${existing ? `<div class="msg">Hits will go to the sheet of ${esc(RB.fmtDate(existing.date))}${existing.no ? ' · ' + esc(existing.no) : ''}.</div>` : ''}
    <div class="card"><div class="fg">
      <label class="s6"><span>Target</span><select id="tP">${Object.entries(RB.PRESETS).map(([k, p]) => `<option value="${k}" ${ctx.preset === k || (k === 'custom' && !RB.target(ctx.preset)) ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      <label class="s2"><span>Bullet Ø ${L}</span><input id="tBd" type="number" step="any" inputmode="decimal" value="${esc(U.inp('len', ctx.bd))}"></label>
      <label class="s2"><span>10-ring Ø ${L}</span><input id="tD" type="number" step="any" value="${esc(U.inp('len', ctx.d10))}"></label>
      <label class="s2"><span>Ring width ${L}</span><input id="tW" type="number" step="any" value="${esc(U.inp('len', ctx.w))}"></label>
      <label class="s3"><span>Distance ${U.label('dist')}</span><input id="tDist" type="number" step="any" inputmode="decimal" value="${esc(U.inp('dist', ctx.dist))}"></label>
    </div></div>
    <ol class="steps"><li>Photograph the target straight on, filling the frame, in even light.</li><li>Auto-detect, or tap the centre and then the outer edge of a ring you can see.</li><li>Tap to add a missed hole, tap a marker to remove it. Then send the hits to the sheet.</li></ol>
    <div class="row">${photoButtons('t')}<button class="btn" id="tDemo">Demo photo</button></div>
    <div id="tEd"></div>
    <div class="row">
      <button class="btn" id="tLocal">Find holes on phone</button>
      <button class="btn" id="tAuto">Auto-detect with Claude</button>
      <button class="btn warn" id="tClr">Clear marks</button>
    </div>
    <div class="row"><button class="btn pri wide" id="tSend">Send hits to ${existing ? 'the sheet' : 'a new sheet'}</button></div>
    <div class="card" id="tRes" hidden></div>`;
  const E = Editor($('#tEd'), 'target', ctx);
  const sync = () => {
    ctx.preset = $('#tP').value; const p = RB.PRESETS[ctx.preset] || {};
    if (p.d10) { ctx.d10 = String(p.d10); ctx.w = String(p.w); $('#tD').value = U.inp('len', ctx.d10); $('#tW').value = U.inp('len', ctx.w); }
    else { ctx.d10 = U.store('len', $('#tD').value); ctx.w = U.store('len', $('#tW').value); }
    $('#tD').disabled = $('#tW').disabled = ctx.preset !== 'custom';
    ctx.bd = U.store('len', $('#tBd').value); ctx.dist = U.store('dist', $('#tDist').value); E.redraw(); preview();
  };
  ['#tP', '#tBd', '#tD', '#tW', '#tDist'].forEach(s => $(s).addEventListener('change', sync));
  $('#tD').disabled = $('#tW').disabled = !!RB.target(ctx.preset);
  wire($('#tCam'), E); wire($('#tPick'), E);
  $('#tDemo').onclick = () => E.load(demoPhoto(ctx), () => E.msg('Demo photo. Auto-detect, or tap the centre, then the ring 1 edge, then "Find holes on phone".'));
  const preview = () => {
    const box = $('#tRes'); if (!E.calibrated() || !E.hits.length) { box.hidden = true; return; }
    const st = RB.sheetStats(Object.assign({}, ctx, { hits: E.mm() }));
    box.hidden = false;
    box.innerHTML = `<div class="kv3"><div><div class="l">Shots · total</div><div class="v">${st.n} · ${st.total}</div></div><div><div class="l">Group ES</div><div class="v">${st.n > 1 ? U.num('len', st.es, U.imperial() ? 2 : 0) + `<small> ${L}</small>` : '–'}${st.esM != null ? `<small> · ${U.num('ang', st.esM)} ${A}</small>` : ''}</div></div><div><div class="l">Correction</div><div class="v">${st.corrE != null ? RB.corrText(st) + `<small> ${A}</small>` : '<small>set distance</small>'}</div></div></div>`;
  };
  const cv = $('#tEd canvas'); cv.addEventListener('click', () => setTimeout(preview, 0));
  $('#tLocal').onclick = () => {
    if (!E.img) { E.msg('Load a photo first.', true); return; }
    if (!E.calibrated()) { E.msg('Set the centre and a ring edge first. The hole size comes from the bullet Ø and the ring scale.', true); return; }
    E.msg('Searching …'); setTimeout(() => { const f = findHoles(E); E.hits = f; E.redraw(); preview();
      E.msg(f.length ? `Found ${f.length} hole candidates. Remove false ones and tap any that were missed.` : 'No holes found. Tap them by hand, or try a sharper, closer photo.'); }, 30);
  };
  $('#tAuto').onclick = async () => {
    if (!E.img) { E.msg('Load a photo first.', true); return; }
    if (!RB.claude.ready()) { E.msg('Claude needs your Anthropic API key (More › Claude). The on-phone finder works without it.', true); return; }
    E.msg('Claude is looking at the target …'); $('#tAuto').disabled = true;
    try {
      const img = await RB.claude.jpeg(E.img), t = RB.tgtOf(ctx);
      const prompt = `You are measuring a photographed shooting target. The image is ${img.w} x ${img.h} pixels; x grows to the right, y grows downward, origin top-left.
It is a ${t.rings == 1 ? 'single steel plate or round aiming disc (treat its edge as ring 10)' : `ring target with scoring rings ${11 - t.rings} (outermost) to 10 (centre)`}. Expected geometry: 10-ring diameter ${t.d10} mm, each further ring ${t.w} mm wider in radius. Bullet diameter about ${ctx.bd || 6.7} mm.
Find: (1) the pixel centre of the rings; (2) the outermost ring whose outer edge is clearly visible all round, with its score and its radius in pixels; (3) every bullet hole (paper tears or punched holes, including ones in the dark aiming area; ignore printed numbers, staples, pasters/patches already covering old holes, and the edge of the paper).
Reply with JSON only: {"center":{"x":0,"y":0},"ring":{"score":1,"radius_px":0},"holes":[{"x":0,"y":0}],"note":"one short sentence on confidence"}`;
      const r = await RB.claude.json(prompt, img);
      const k = 1 / img.scale;
      if (r.center && r.ring && r.ring.radius_px > 0) { E.cal.cx = r.center.x * k; E.cal.cy = r.center.y * k; E.setK(Math.min(10, Math.max(11 - t.rings, Math.round(+r.ring.score) || 1))); E.cal.rpx = r.ring.radius_px * k; }
      E.hits = (r.holes || []).filter(h => isFinite(+h.x) && isFinite(+h.y)).map(h => ({ px: h.x * k, py: h.y * k }));
      if (E.calibrated()) E.hits = snap(E, E.hits);
      E.mode = 'hits'; E.redraw(); preview();
      E.msg(`Claude found ${E.hits.length} holes${r.note ? ': ' + r.note : '.'} Check the rings and markers, fix anything off, then send to the sheet.`);
    } catch (err) { E.msg(err.message + ' Use the manual steps instead.', true); }
    $('#tAuto').disabled = false;
  };
  RB.armed($('#tClr'), () => { E.hits = []; E.redraw(); preview(); });
  $('#tSend').onclick = () => {
    if (!E.calibrated()) { E.msg('Set the centre and a ring edge first, so positions can be measured.', true); return; }
    if (!E.hits.length) { E.msg('No hits marked yet.', true); return; }
    ctx.hits = E.mm();
    if (!ctx.rounds) ctx.rounds = String(ctx.hits.length);
    commit(ctx, !existing);
    RB.toast(`${ctx.hits.length} hits saved to the sheet.`);
    if (existing) history.back(); else RB.go(`#/sheet/${encodeURIComponent(ctx.id)}/hits`, true);
  };
}

function scanView(el, q) {
  const existing = targetSheet(q);
  const ctx = existing ? RB.clone(existing) : RB.newSheet();
  RB.header('Read a datasheet', { back: true });
  el.innerHTML = `
    <ol class="steps"><li>Print the blank sheet, fill it in by hand, and mark each hit on the printed target with a dot or cross.</li><li>Photograph the whole page flat and straight on, all four edges visible.</li><li>Read it with Claude: fields, shot table and marked hits come into a datasheet for you to check.</li><li>To place hits yourself, tap the target centre and the ring 1 edge on the photo, then tap the marks.</li></ol>
    <div class="row">${photoButtons('s')}</div>
    <div class="row"><button class="btn pri" id="sRead" disabled>Read with Claude</button><button class="btn" id="sManual" disabled>Use my marks only</button></div>
    <div class="msg" id="sMsg"></div>
    <div id="sEd"></div>`;
  const E = Editor($('#sEd'), 'sheet', ctx);
  const ready = () => { $('#sRead').disabled = !E.img; $('#sManual').disabled = !E.img;
    $('#sMsg').textContent = RB.claude.ready() ? 'Photo loaded. Read it with Claude, or calibrate below and tap the marks yourself.' : 'Photo loaded. To read the handwriting, add your Anthropic API key under More › Claude. Without it, calibrate below and tap the marks yourself; type the fields on the sheet.'; };
  wire($('#sCam'), E, ready); wire($('#sPick'), E, ready);
  $('#sManual').onclick = () => {
    if (!E.calibrated() || !E.hits.length) { E.msg('Tap the target centre, then the ring 1 edge, then each mark.', true); return; }
    ctx.hits = E.mm(); finish([], 0);
  };
  const finish = (unmatched, n) => {
    if (existing) Object.assign(existing, ctx); else RB.db.sheets.push(ctx);
    RB.save(true);
    RB.toast(`Read ${n} fields and ${ctx.hits.length} hits. Please check them.`);
    RB.go(`#/sheet/${encodeURIComponent(ctx.id)}`, true);
  };
  $('#sRead').onclick = async () => {
    if (!RB.claude.ready()) { $('#sMsg').textContent = 'Add your Anthropic API key under More › Claude first.'; $('#sMsg').classList.add('err'); return; }
    const m = $('#sMsg'); m.classList.remove('err'); m.textContent = 'Claude is reading the sheet …'; $('#sRead').disabled = true;
    const ul = RB.U.label;
    const fields = `no (sheet no.), date (as YYYY-MM-DD), time (HH:MM), series, shooter, purpose ("training" | "test" | "competition" | the text written next to "Other" | null, from the purpose tick boxes), discipline, position, rounds (rounds fired), gun, barrel, optic, caliber, ammo, bullet (${ul('mass')}), v0 (${ul('vel')}), v0sd (${ul('vel')}), zero (${ul('dist')}), dialE (${ul('ang')}), dialW (${ul('ang')}), range, coords, elev (${ul('alt')} ASL), dist (${ul('dist')}), setting ("indoor" | "outdoor" | null, from the In/Out tick boxes), temp (${ul('temp')}), hum (%), press (${ul('press')}), wind, light, target_name, d10 (10-ring diameter ${ul('len')}), w (ring width ${ul('len')}), bd (bullet diameter ${ul('len')}), remarks`;
    const prompt = `This is a photo of a printed, hand-filled "Training Datasheet" for long-range shooting (A4 portrait). Read the handwriting.
Sections: header box (Sheet no., Date, Time, Series), a row (Shooter, Purpose, Discipline, Position / support, Rounds fired), "1 Gun & ammunition" (older prints: "1 Rifle & ammunition"), "2 Range & conditions", "3 Target & hits" (a printed ring target on the left and a shot table Shot/Ring/X mm/Y mm on the right), "4 Remarks".
The printed target is schematic with equal ring widths: the outer edge of ring k lies at radius (11 - k) units from the centre, so the 10-ring edge is at radius 1 and the ring-1 edge at radius 10. Four small black squares sit at (±11.1, ±11.1) units; they fix the scale even if fewer rings are printed (then the rings are drawn larger). Printed ring numbers sit midway in each ring on the axes.
For every hand-drawn hit mark on the target (dot, cross, circle), estimate its centre as x,y in those units: x to the right, y UP, measured from the target centre. Ignore printed numbers and lines.
Reply with JSON only:
{"fields":{ ${fields.split(', ').map(f => `"${f.split(' ')[0]}":null`).join(',')} },
 "marks":[{"x":0,"y":0}],
 "table":[{"shot":1,"ring":null,"x_mm":null,"y_mm":null}],
 "note":"one short sentence on anything unreadable"}
Field meanings: ${fields}. Use strings for text and numbers for numeric fields; null where a field is empty or unreadable. ${RB.U.imperial() ? 'The sheet was printed in imperial units (bullet gr, V0 fps, zero/distance yd, dialed MOA, elevation ft, °F, inHg, hit X/Y and bullet Ø in inches): give numbers in those units as written.' : 'Numbers in metric as written.'}`;
    try {
      const r = await RB.claude.json(prompt, await RB.claude.jpeg(E.img, 2000), { effort: 'high' });
      const F = r.fields || {}; let n = 0;
      // text read from the sheet replaces the carried-over defaults; database links are re-made by name below
      if (F.gun) { ctx.weaponId = ''; ctx.barrelId = ''; }
      if (F.ammo) ctx.munitionId = '';
      if (F.shooter) ctx.shooterId = '';
      RB.SHEET_KEYS.forEach(k => { if (k === 'preset' || k === 'purpose' || k === 'setting') return; if (F[k] != null && F[k] !== '') { const u = RB.SHEET_UNITS[k]; ctx[k] = u ? RB.U.store(u, F[k]) : String(F[k]); n++; } });
      if (F.purpose) { const pv = String(F.purpose).trim().toLowerCase(), pp = RB.purposes().find(p => p.id === pv || p.name.toLowerCase() === pv || p.name.toLowerCase().startsWith(pv)); if (pp) { ctx.purpose = pp.id; n++; } }
      if (F.setting === 'indoor' || F.setting === 'outdoor') { ctx.setting = F.setting; n++; }
      if (F.d10 != null || F.w != null) { const p = Object.entries(RB.PRESETS).find(([, v]) => v.d10 === +ctx.d10 && v.w === +ctx.w); ctx.preset = p ? p[0] : 'custom'; }
      else if (F.target_name) { const tn = String(F.target_name).toLowerCase(), hit = (RB.db.targets || []).find(x => tn.includes(String(x.name).toLowerCase())) || (/300/.test(tn) ? RB.target('T-ISSF300') : /50/.test(tn) ? RB.target('T-ISSF50') : null);
        if (hit) Object.assign(ctx, { preset: hit.id, d10: String(hit.d10), w: String(hit.w) }); }
      const t = RB.tgtOf(ctx), z = RB.tZoom(t);
      let hits = (r.marks || []).filter(p => isFinite(+p.x) && isFinite(+p.y)).map(p => { const f = Math.hypot(+p.x, +p.y), rm = RB.fToMm(f / z, t); return f ? { x: Math.round(+p.x / f * rm), y: Math.round(+p.y / f * rm) } : { x: 0, y: 0 }; });
      const tab = (r.table || []).filter(row => isFinite(parseFloat(row.x_mm)) && isFinite(parseFloat(row.y_mm)));
      if (tab.length >= hits.length && tab.length) hits = tab.map(row => ({ x: RB.U.to('len', parseFloat(row.x_mm)), y: RB.U.to('len', parseFloat(row.y_mm)) }));
      if (E.calibrated() && E.hits.length) hits = E.mm();   // the user's own marks win
      ctx.hits = hits;
      if (ctx.weaponId === '' && ctx.gun) delete ctx.weaponId;
      RB.autoLink(ctx);
      ctx.source = { kind: 'photo', read: 'claude', note: r.note || '' };
      finish([], n);
    } catch (err) { m.classList.add('err'); m.textContent = err.message; }
    $('#sRead').disabled = false;
  };
}
})();
