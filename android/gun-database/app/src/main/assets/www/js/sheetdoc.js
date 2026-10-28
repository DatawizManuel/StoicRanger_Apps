/* Stoic Ranger — the printable A4 training datasheet (same layout as the "Range Training Datasheet" page). */
'use strict';
(() => {
const { esc, fx, num } = RB;

RB.FONTS_CSS = `
@font-face{font-family:"Barlow Condensed";font-weight:600;src:url(fonts/barlow-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Condensed";font-weight:700;src:url(fonts/barlow-condensed-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:400;src:url(fonts/barlow-semi-condensed-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:500;src:url(fonts/barlow-semi-condensed-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:600;src:url(fonts/barlow-semi-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400;src:url(fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:600;src:url(fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2")}`;

RB.SHEET_CSS = `
.sheet .brand{display:flex;align-items:center;gap:3mm}.sheet .slogo{width:17mm;height:17mm;flex:none;color:#111}
.sheet{--s-page:#ffffff;--s-ink:#111111;--s-muted:#4a4a4a;--s-faint:#8a8a8a;--s-hair:#b9b9b2;--s-panel:#f1f1ec;--s-panel2:#e4e4dc;--s-acc:#4b5320;--s-crit:#a3201a;--s-hit:#1f4f8f;
  width:210mm;height:297mm;background:var(--s-page);color:var(--s-ink);position:relative;padding:9mm 12mm 10mm 14mm;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Barlow Semi Condensed",sans-serif;font-size:8.6pt;line-height:1.28;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-scheme:light;box-sizing:border-box}
.sheet *{box-sizing:border-box}
.sheet .sm{font-family:"JetBrains Mono",monospace;font-size:.95em;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.sheet .cls{position:absolute;left:0;right:0;height:5mm;background:var(--s-ink);color:#fff;font:700 7.4pt/5mm "Barlow Condensed",sans-serif;letter-spacing:.32em;text-align:center;text-transform:uppercase}
.sheet .cls.top{top:0}.sheet .cls.bot{bottom:0}
.sheet .shdr{display:grid;grid-template-columns:1fr auto;gap:4mm;border-bottom:1.6pt solid var(--s-ink);padding-bottom:2mm}
.sheet .doctype{font:700 25pt/.95 "Barlow Condensed",sans-serif;letter-spacing:.04em;text-transform:uppercase}
.sheet .docsub{font:600 9.5pt/1.2 "Barlow Semi Condensed",sans-serif;color:var(--s-muted);text-transform:uppercase;letter-spacing:.12em;margin-top:1.2mm}
.sheet .idbox{display:grid;grid-template-columns:auto 34mm;border:.8pt solid var(--s-ink);align-self:start;font-size:7.6pt}
.sheet .idbox div{padding:.7mm 2mm;border-bottom:.5pt solid var(--s-hair);min-height:5.2mm}
.sheet .idbox div:nth-child(odd){color:var(--s-muted);text-transform:uppercase;letter-spacing:.08em;border-right:.5pt solid var(--s-hair);font-weight:600}
.sheet .idbox div:nth-last-child(-n+2){border-bottom:0}
.sheet .meta{display:grid;grid-template-columns:1fr 1.15fr 1fr 1.25fr .75fr;border-bottom:.6pt solid var(--s-hair)}
.sheet .meta>div{padding:1.1mm 2mm 1.1mm 0;min-height:9mm}
.sheet .meta>div+div{padding-left:2mm;border-left:.5pt solid var(--s-hair)}
.sheet .lbl{display:block;font:600 6.3pt/1.2 "Barlow Semi Condensed",sans-serif;color:var(--s-muted);text-transform:uppercase;letter-spacing:.13em}
.sheet .lbl i{font-style:normal;text-transform:none;letter-spacing:0;color:var(--s-faint)}
.sheet .val{font:500 9pt/1.2 "JetBrains Mono",monospace;letter-spacing:-.02em;min-height:4.2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sheet h3{font:700 11pt/1 "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:2mm;margin:3.4mm 0 1mm;padding-bottom:.8mm;border-bottom:.8pt solid var(--s-ink)}
.sheet h3 .n{background:var(--s-acc);color:#fff;min-width:6mm;height:5mm;display:inline-flex;align-items:center;justify-content:center;font-size:9.5pt;padding:0 1.2mm}
.sheet h3 .x{margin-left:auto;font:400 6.8pt "JetBrains Mono",monospace;letter-spacing:0;text-transform:none;color:var(--s-muted)}
.sheet .cols2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.sheet .ff{display:grid;grid-template-columns:repeat(6,1fr)}
.sheet .ff>div{grid-column:span 6;padding:.9mm 1.6mm .4mm 0;border-bottom:.5pt solid var(--s-hair);min-height:8.6mm}
.sheet .ff>div.h{grid-column:span 3}.sheet .ff>div.t{grid-column:span 2}
.sheet .ff>div.b{padding-left:1.6mm;border-left:.5pt solid var(--s-hair)}
.sheet .ck{display:inline-flex;align-items:center;gap:1.2mm;margin-right:3mm;font:600 7.8pt "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.06em}
.sheet .ck b{width:3.3mm;height:3.3mm;border:.8pt solid var(--s-ink);display:inline-flex;align-items:center;justify-content:center;font:700 8pt/1 "JetBrains Mono",monospace}
.sheet .tgt{display:grid;grid-template-columns:116mm 1fr;gap:4mm;margin-top:1.2mm}
.sheet figure{margin:0;border:.8pt solid var(--s-ink);display:flex;flex-direction:column}
.sheet figure .fh{display:flex;justify-content:space-between;align-items:center;padding:.8mm 2mm;border-bottom:.6pt solid var(--s-ink);font:700 7.4pt/1 "Barlow Condensed",sans-serif;letter-spacing:.12em;text-transform:uppercase}
.sheet figure .fh span:last-child{font:400 6.6pt "JetBrains Mono",monospace;letter-spacing:0;color:var(--s-muted);text-transform:none}
.sheet figure svg{display:block;width:100%;height:auto}
.sheet figure .fc{display:flex;justify-content:space-between;gap:2mm;padding:.8mm 2mm;border-top:.6pt solid var(--s-hair);font-size:6.8pt;color:var(--s-muted)}
.sheet table{width:100%;border-collapse:collapse;font-size:7.8pt;line-height:1.2}
.sheet th{font:600 6.4pt/1.2 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;text-align:right;color:var(--s-muted);border-bottom:.9pt solid var(--s-ink);padding:.7mm 1.3mm}
.sheet th:first-child,.sheet td:first-child{text-align:left}
.sheet td{padding:0 1.3mm;height:5.05mm;border-bottom:.4pt solid var(--s-hair);text-align:right;font-family:"JetBrains Mono",monospace;font-size:7.8pt}
.sheet tr:nth-child(even) td{background:var(--s-panel)}
.sheet td.sc{font-weight:600}
.sheet .kp{display:grid;grid-template-columns:1fr 1fr;border:.8pt solid var(--s-ink);margin-top:2mm}
.sheet .kp>div{padding:.9mm 1.8mm;border-right:.5pt solid var(--s-hair);border-bottom:.5pt solid var(--s-hair);min-height:10.4mm}
.sheet .kp>div:nth-child(2n){border-right:0}
.sheet .kp>div:nth-last-child(-n+2){border-bottom:0}
.sheet .kp .v{font:700 13pt/1.05 "Barlow Condensed",sans-serif;letter-spacing:.02em;margin-top:.4mm;white-space:nowrap}
.sheet .kp .v small{font:500 6.8pt "Barlow Semi Condensed",sans-serif;color:var(--s-muted);margin-left:.8mm}
.sheet .rem{flex:1;min-height:20mm;border:.7pt solid var(--s-hair);position:relative;overflow:hidden}
.sheet .rem i{position:absolute;left:0;right:0;height:0;border-top:.5pt solid var(--s-hair)}
.sheet .rem p{position:relative;margin:0;padding:.4mm 2mm;font:500 8.6pt/6.6mm "Barlow Semi Condensed",sans-serif;white-space:pre-wrap}
.sheet .ftr{margin-top:2.4mm;display:grid;grid-template-columns:1fr auto 1fr;font:400 6.6pt "JetBrains Mono",monospace;color:var(--s-muted);border-top:.6pt solid var(--s-hair);padding-top:1.2mm}
.sheet .ftr div:nth-child(2){text-align:center}.sheet .ftr div:last-child{text-align:right}
.sheet svg text{font-family:"JetBrains Mono",monospace}`;

/** Schematic ring target (equal ring widths, ring k edge at 11-k units, scaled by RB.tZoom so the outermost
    scoring ring of a target with fewer rings still fills the drawing). Hits are placed by their real mm radius. */
RB.targetSVG = (s, opts = {}) => {
  const t = RB.tgtOf(s), st = RB.sheetStats(s), hits = s.hits || [], z = RB.tZoom(t), lo = 11 - t.rings, R = f => +(f * z).toFixed(3);
  const blk = Math.min(6, t.rings);   // black aiming area: rings 5–10 (or the whole plate)
  let g = `<rect x="-11.6" y="-11.6" width="23.2" height="23.2" fill="#ffffff"/><circle r="${R(t.rings)}" fill="#ffffff" stroke="#111" stroke-width=".07"/><circle r="${R(blk)}" fill="#e4e4dc" stroke="#111" stroke-width=".07"/>`;
  for (let k = lo + 1; k <= 10; k++) { const f = 11 - k; if (f !== blk) g += `<circle r="${R(f)}" fill="none" stroke="${k === 10 ? '#4b5320' : '#111'}" stroke-width="${k === 10 ? .11 : .05}"/>`; }
  if (t.rings > 1) g += `<circle r="${R(.5)}" fill="none" stroke="#4b5320" stroke-width=".05" stroke-dasharray=".18 .12"/>`;
  g += `<path d="M-10.9 0H10.9M0 -10.9V10.9" stroke="#8a8a8a" stroke-width=".035"/>`;
  for (let k = lo; k <= 9; k++) { const f = R(11 - k - .5);
    g += `<text x="${f}" y=".17" font-size=".42" text-anchor="middle" fill="#4a4a4a">${k}</text><text x="${-f}" y=".17" font-size=".42" text-anchor="middle" fill="#4a4a4a">${k}</text><text x="0" y="${-f + .17}" font-size=".42" text-anchor="middle" fill="#4a4a4a">${k}</text><text x="0" y="${f + .17}" font-size=".42" text-anchor="middle" fill="#4a4a4a">${k}</text>`; }
  g += `<text x="${R(.55)}" y="-.25" font-size=".36" fill="#4b5320">${t.rings > 1 ? 10 : 'hit'}</text>`;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g += `<rect x="${a * 11.1 - .25}" y="${b * 11.1 - .25}" width=".5" height=".5" fill="#111"/>`);
  const pos = (x, y) => { const r = Math.hypot(x, y), f = Math.min(RB.mmToF(r, t) * z, 11.2); return r ? [x / r * f, -y / r * f] : [0, 0]; };
  hits.forEach((h, i) => { const [u, v] = pos(h.x, h.y);
    g += `<g data-i="${i}"><circle cx="${u}" cy="${v}" r="${opts.live ? .42 : .3}" fill="#1f4f8f" fill-opacity=".85" stroke="#fff" stroke-width=".05"/><text x="${u + .36}" y="${v - .3}" font-size=".38" font-weight="600" fill="#1f4f8f">${i + 1}</text></g>`;
  });
  if (st.n > 1) { const [u, v] = pos(st.mx, st.my);
    g += `<path d="M${u - .5} ${v}H${u + .5}M${u} ${v - .5}V${v + .5}" stroke="#a3201a" stroke-width=".1"/><circle cx="${u}" cy="${v}" r=".22" fill="none" stroke="#a3201a" stroke-width=".07"/>`; }
  return `<svg class="tsvg${opts.live ? ' live' : ''}" viewBox="-11.6 -11.6 23.2 23.2" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
};

RB.sheetHTML = s => {
  const U = RB.U, SU = RB.SHEET_UNITS;
  const v = k => { const u = SU[k], n = u ? RB.num(s[k]) : null; return n != null ? esc(U.num(u, n, (k === 'v0' || k === 'zero' || k === 'dist' || k === 'elev') ? 0 : undefined)) : esc(s[k]); };
  const ul = k => U.label(k), lenD = U.imperial() ? 2 : 0, ml = n => U.num('len', n, lenD);
  const st = RB.sheetStats(s), hits = s.hits || [];
  const box = c => `<b>${c ? '×' : ''}</b>`, ROWS = 12;
  let rows = '';
  for (let i = 0; i < ROWS; i++) { const h = hits[i];
    rows += h ? `<tr><td>${i + 1}</td><td class="sc">${st.rings[i]}</td><td>${ml(h.x)}</td><td>${ml(h.y)}</td></tr>` : `<tr><td>${i + 1}</td><td></td><td></td><td></td></tr>`; }
  const more = hits.length > ROWS ? ` · +${hits.length - ROWS} more on target` : '';
  const hasT = !!s.preset, tname = (RB.PRESETS[s.preset] || {}).name || '';
  const K = (l, val, u) => `<div><span class="lbl">${l}</span><div class="v">${val}${val !== '' && u ? `<small>${u}</small>` : ''}</div></div>`;
  return `
  <div class="cls top">Stoic Ranger // Training datasheet</div>
  <div class="shdr">
    <div class="brand">${RB.logo('slogo')}<div><div class="doctype">Training Datasheet</div><div class="docsub">Stoic Ranger · Gun Database · record of one series</div></div></div>
    <div class="idbox"><div>Sheet no.</div><div class="sm">${v('no')}</div><div>Date</div><div class="sm">${esc(RB.fmtDate(s.date))}</div><div>Time</div><div class="sm">${v('time')}</div><div>Series</div><div class="sm">${v('series')}</div></div>
  </div>
  <div class="meta">
    <div><span class="lbl">Shooter</span><div class="val">${v('shooter')}</div></div>
    <div><span class="lbl">Purpose</span><div style="margin-top:.6mm"><span class="ck">${box(s.purpose === 'training')}Training</span><span class="ck">${box(s.purpose === 'test')}Test</span><span class="ck">${box(s.purpose === 'competition')}Comp.</span>${s.purpose && !['training', 'test', 'competition'].includes(s.purpose) ? `<span class="ck">${box(true)}${esc(RB.purposeName(s.purpose))}</span>` : `<span class="ck">${box(false)}Other ____</span>`}</div></div>
    <div><span class="lbl">Discipline</span><div class="val">${v('discipline')}</div></div>
    <div><span class="lbl">Position / support</span><div class="val">${v('position')}</div></div>
    <div><span class="lbl">Rounds fired</span><div class="val">${v('rounds')}</div></div>
  </div>
  <div class="cols2">
    <div><h3><span class="n">1</span>Gun &amp; ammunition</h3><div class="ff">
      <div class="h"><span class="lbl">Gun</span><div class="val">${v('gun')}</div></div>
      <div class="h b"><span class="lbl">Barrel <i>ID</i></span><div class="val">${v('barrel')}</div></div>
      <div><span class="lbl">Optic / mount</span><div class="val">${v('optic')}</div></div>
      <div class="h"><span class="lbl">Caliber</span><div class="val">${v('caliber')}</div></div>
      <div class="h b"><span class="lbl">Ammunition <i>load / lot</i></span><div class="val">${v('ammo')}</div></div>
      <div class="t"><span class="lbl">Bullet <i>${ul('mass')}</i></span><div class="val">${v('bullet')}</div></div>
      <div class="t b"><span class="lbl">V0 <i>${ul('vel')} · Xero</i></span><div class="val">${v('v0')}</div></div>
      <div class="t b"><span class="lbl">V0 SD <i>${ul('vel')}</i></span><div class="val">${v('v0sd')}</div></div>
      <div class="t"><span class="lbl">Zero <i>${ul('dist')}</i></span><div class="val">${v('zero')}</div></div>
      <div class="t b"><span class="lbl">Dialed elev. <i>${ul('ang')}</i></span><div class="val">${v('dialE')}</div></div>
      <div class="t b"><span class="lbl">Dialed wind. <i>${ul('ang')}</i></span><div class="val">${v('dialW')}</div></div>
    </div></div>
    <div><h3><span class="n">2</span>Range &amp; conditions</h3><div class="ff">
      <div><span class="lbl">Range</span><div class="val">${v('range')}</div></div>
      <div><span class="lbl">Coordinates of range <i>WGS 84 / UTM</i></span><div class="val">${v('coords')}</div></div>
      <div class="t"><span class="lbl">Elevation <i>${ul('alt')} ASL</i></span><div class="val">${v('elev')}</div></div>
      <div class="t b"><span class="lbl">Distance <i>${ul('dist')}</i></span><div class="val">${v('dist')}</div></div>
      <div class="t b"><span class="lbl">Setting</span><div style="margin-top:.6mm"><span class="ck">${box(s.setting === 'indoor')}In</span><span class="ck">${box(s.setting === 'outdoor')}Out</span></div></div>
      <div class="t"><span class="lbl">Temperature <i>${ul('temp')}</i></span><div class="val">${v('temp')}</div></div>
      <div class="t b"><span class="lbl">Humidity <i>%</i></span><div class="val">${v('hum')}</div></div>
      <div class="t b"><span class="lbl">Pressure <i>${ul('press')}</i></span><div class="val">${v('press')}</div></div>
      <div class="h"><span class="lbl">Wind <i>${ul('wind')} · from</i></span><div class="val">${v('wind')}</div></div>
      <div class="h b"><span class="lbl">Light / weather</span><div class="val">${v('light')}</div></div>
    </div></div>
  </div>
  <h3><span class="n">3</span>Target &amp; hits<span class="x">mark each hit with a dot · X right, Y up, ${ul('len')} from centre</span></h3>
  <div class="tgt">
    <figure>
      <div class="fh"><span>${hasT && RB.tgtOf(s).rings < 10 ? 'Target ' + (RB.tgtOf(s).rings == 1 ? 'plate' : (11 - RB.tgtOf(s).rings) + '–10') : 'Ring target 1–10'}</span><span>${hasT ? `${esc(tname)} · ${RB.tgtOf(s).rings == 1 ? 'Ø' : '10: Ø'}${ml(RB.num(s.d10))} ${ul('len')}${RB.tgtOf(s).rings == 1 ? '' : ` · ring ${ml(RB.num(s.w))} ${ul('len')}`}` : `Target ________ · 10 Ø ____ ${ul('len')} · ring ____ ${ul('len')}`}</span></div>
      ${RB.targetSVG(s)}
      <div class="fc"><span>Schematic, rings equal width · centre cross = MPI</span><span class="sm">bullet Ø ${hasT && s.bd ? U.fmt('len', RB.num(s.bd), U.imperial() ? 3 : 1) : '____ ' + ul('len')}</span></div>
    </figure>
    <div>
      <table><thead><tr><th>Shot</th><th>Ring</th><th>X ${ul('len')}</th><th>Y ${ul('len')}</th></tr></thead><tbody>${rows}</tbody></table>
      ${more ? `<div class="sm" style="font-size:6.6pt;color:var(--s-muted);margin-top:.6mm">${esc(more)}</div>` : ''}
      <div class="kp">
        ${K('Shots · total', st.n ? `${st.n} · ${st.total}` : '', '')}
        ${K('Average ring', st.n ? fx(st.avg, 2) : '', '')}
        ${K('Group ES', st.n > 1 ? ml(st.es) : '', st.esM != null ? `${ul('len')} · ${U.num('ang', st.esM)} ${ul('ang')}` : ul('len'))}
        ${K('Mean radius', st.n > 1 ? ml(st.mr) : '', ul('len'))}
        ${K('MPI X / Y', st.n ? `${ml(st.mx)} / ${ml(st.my)}` : '', ul('len'))}
        ${K('Correction', st.n && st.corrE != null ? RB.corrText(st) : '', ul('ang'))}
      </div>
    </div>
  </div>
  <h3><span class="n">4</span>Remarks</h3>
  <div class="rem">${Array.from({ length: 12 }, (_, i) => `<i style="top:${(i + 1) * 6.6 + .4}mm"></i>`).join('')}<p>${v('remarks')}</p></div>
  <div class="ftr"><div>${esc(s.no || 'Training datasheet')}</div><div>Stoic Ranger - Gun Database</div><div>${esc([s.gun, s.caliber].filter(Boolean).join(' · '))}</div></div>
  <div class="cls bot">Long range training // Datasheet</div>`;
};

RB.printDoc = (sheets, title) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${RB.FONTS_CSS}
@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}${RB.SHEET_CSS}
.sheet{page-break-after:always;break-after:page;height:296mm}.sheet:last-child{page-break-after:auto;break-after:auto}</style></head>
<body>${sheets.map(s => `<div class="sheet">${RB.sheetHTML(s)}</div>`).join('')}</body></html>`;
RB.printSheets = (sheets, title) => RB.print(RB.printDoc(sheets, title), title);
RB.printBlank = (n = 1) => RB.printSheets(Array.from({ length: n }, () => RB.blankSheet()), 'Training datasheet (blank)');
})();
