/* Stoic Ranger - Shooting Drills — printed pages: a drill as an A4 one-pager and the printable targets.
   Printed through the Android print dialog (print or "Save as PDF"). */
'use strict';
(() => {
const { esc } = SD;

SD.FONTS_CSS = `
@font-face{font-family:"Barlow Condensed";font-weight:600;src:url(fonts/barlow-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Condensed";font-weight:700;src:url(fonts/barlow-condensed-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:400;src:url(fonts/barlow-semi-condensed-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:500;src:url(fonts/barlow-semi-condensed-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:600;src:url(fonts/barlow-semi-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400;src:url(fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:600;src:url(fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2")}`;

/** Diagram colours on paper (the app uses its theme tokens instead, see app.css). */
const DG_PAPER = `.dg{width:100%;height:auto;display:block}
.dg .tl{fill:#111;font-family:"Barlow Semi Condensed",sans-serif}.dg .tm{fill:#555;font-family:"Barlow Semi Condensed",sans-serif}
.dg .tf{fill:#111}.dg .tp{fill:#fff;stroke:#111;stroke-width:1.4}.dg .ln{stroke:#111;stroke-width:1.6;fill:none}
.dg .sh,.dg .acf{fill:#4B5320}.dg .ac{stroke:#4B5320}.dg .fl{stroke:#888;stroke-width:1;stroke-dasharray:3 3}
.dg .dm{stroke:#666;stroke-width:1}.dg .dmh{fill:none;stroke:#666;stroke-width:1.4}.dg .st{stroke:#888;stroke-width:1.2;stroke-dasharray:4 3}
.dg .bx{fill:none;stroke:#888;stroke-width:1.2;stroke-dasharray:4 3}.dg .pf{fill:#999}.dg .wl{stroke:#111;stroke-width:4}`;

const PAPER_CSS = `
@page{size:A4;margin:11mm 12mm 12mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:400 10pt/1.38 "Barlow Semi Condensed","Arial Narrow",sans-serif}
.band{display:flex;align-items:center;gap:4mm;background:#111;color:#fff;padding:3mm 4mm;border-bottom:1.2mm solid #4B5320}
.band svg{width:15mm;height:15mm;color:#fff;flex:none}
.band .bt{font:700 17pt/1 "Barlow Condensed",sans-serif;letter-spacing:.08em;text-transform:uppercase}
.band .bs{font:600 8pt/1.2 "Barlow Semi Condensed",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#C9B46A;margin-top:1mm}
.band .r{margin-left:auto;text-align:right;font:400 7.5pt "JetBrains Mono",monospace;color:#ccc}
h1{font:700 21pt/1.05 "Barlow Condensed",sans-serif;letter-spacing:.03em;text-transform:uppercase;margin:4mm 0 1.5mm}
.tags{display:flex;flex-wrap:wrap;gap:1.5mm;margin-bottom:2mm}
.tags span{font:600 7.5pt/1 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;border:.3mm solid #111;padding:1mm 1.8mm}
.tags span.k{background:#4B5320;border-color:#4B5320;color:#fff}
.goal{font-size:11.5pt;margin:1mm 0 3mm}
.facts{display:grid;grid-template-columns:repeat(4,1fr);border:.3mm solid #999;border-left:1.2mm solid #4B5320}
.facts div{padding:1.6mm 2.2mm;border-right:.3mm solid #ccc}.facts div:last-child{border-right:0}
.l{font:600 6.5pt/1.2 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#555}
.v{font:600 10.5pt/1.25 "Barlow Semi Condensed",sans-serif}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm;align-items:start}
h2{font:700 11pt/1 "Barlow Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2mm;padding-bottom:1mm;border-bottom:.5mm solid #111}
ol{margin:0;padding-left:5mm}ol li{margin:0 0 1.6mm}
.box{border:.3mm solid #999;padding:2mm 3mm;margin-top:3mm}
.box.std{border-left:1.2mm solid #4B5320}
p{margin:0 0 1.5mm}.muted{color:#555;font-size:8.5pt}
.dgw{border:.3mm solid #ccc;padding:1mm}
.log{width:100%;border-collapse:collapse;margin-top:2mm;font-size:8.5pt}
.log th{font:600 6.5pt "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#555;text-align:left;border-bottom:.4mm solid #111;padding:1mm}
.log td{border-bottom:.25mm solid #bbb;height:7mm;padding:1mm}
.foot{margin-top:4mm;padding-top:2mm;border-top:.3mm solid #999;display:flex;justify-content:space-between;font-size:7.5pt;color:#555}
${DG_PAPER}`;

SD.SAFETY_LIVE = 'Live fire only on an approved range under its rules and range officer. Draws, turns and movement only where the range allows them.';
SD.SAFETY_DRY = 'Dry fire: no ammunition in the room, gun and magazines checked empty twice, safe backstop in the aiming direction.';

/** A4 one-pager of a drill (same content as the drill screen). */
SD.drillPage = d => {
  const res = SD.resultsOf(d.id).slice(0, 6), p = d.printable && SD.printable(d.printable), dg = SD.diagram(d), st = SD.setup(d);
  const facts = [['Distance', d.distance], ['Rounds', d.rounds || 'none (dry)'], ['Par time', d.par || 'not timed'], ['Target', d.target]];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${SD.FONTS_CSS}${PAPER_CSS}</style></head><body>
  <div class="band">${SD.logo()}<div><div class="bt">Stoic Ranger</div><div class="bs">Shooting Drills</div></div><div class="r">${esc(d.id)}<br>level ${d.level} of 3</div></div>
  <h1>${esc(d.name)}</h1>
  <div class="tags"><span class="k">${d.weapon === 'pistol' ? 'Pistol' : 'Rifle'}</span><span>${d.motion === 'static' ? 'Static' : 'Dynamic'}</span><span>${d.timed ? 'Timed' : 'Not timed'}</span><span>${SD.fireText(d)}</span>${st.start ? `<span>Start: ${esc(st.start)}</span>` : ''}</div>
  <div class="goal">${esc(d.goal)}.</div>
  <div class="facts">${facts.map(([l, v]) => `<div><div class="l">${l}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
  <div class="cols">
    <div><h2>How to</h2><ol>${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="box std"><div class="l">Standard</div><p>${esc(d.standard)}</p></div>
      ${d.dryNote ? `<div class="box"><div class="l">Dry fire</div><p>${esc(d.dryNote)}</p></div>` : ''}
      ${d.credit ? `<p class="muted" style="margin-top:3mm">${esc(d.credit)}.</p>` : ''}</div>
    <div>${dg ? `<h2>Setup</h2><div class="dgw">${dg}</div>` : ''}
      ${p ? `<div class="box"><div class="l">Printable target</div><p><b>${esc(p.name)}</b> · ${esc(p.desc)}</p></div>` : ''}
      <div class="box"><div class="l">Safety</div><p>${esc(d.live ? SD.SAFETY_LIVE : '')} ${esc(d.dry ? SD.SAFETY_DRY : '')}</p></div></div>
  </div>
  <h2 style="margin-top:5mm">Results</h2>
  <table class="log"><tr><th>Date</th><th>Shooter</th><th>Live / dry</th><th>Time s</th><th>Hits</th><th>Points</th><th>Pass</th><th>Notes</th></tr>
  ${res.map(r => `<tr><td>${esc(SD.fmtDate(r.date))}</td><td>${esc(SD.nameOf('shooters', r.shooterId))}</td><td>${r.mode === 'dry' ? 'dry' : 'live'}</td><td>${esc(SD.fx(r.timeS, 2))}</td><td>${esc(r.hits ?? '')}${r.shots != null ? '/' + esc(r.shots) : ''}</td><td>${esc(r.points ?? '')}</td><td>${r.pass === true ? '✓' : r.pass === false ? '✗' : ''}</td><td>${esc(r.notes || '')}</td></tr>`).join('')}
  ${Array.from({ length: Math.max(0, 6 - res.length) }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}</table>
  <div class="foot"><span>Stoic Ranger - Shooting Drills · metric units</span><span>Printed ${esc(SD.fmtDate(SD.today()))}</span></div>
  </body></html>`;
};

/** A4 printable target: the SVG at true size, no page margins. */
SD.printablePage = id => `<!doctype html><html><head><meta charset="utf-8"><style>${SD.FONTS_CSS}
@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:210mm;height:297mm}</style></head><body>${SD.printableSvg(id)}</body></html>`;

SD.printDrill = d => SD.print(SD.drillPage(d), `SR Drill ${d.id} ${d.name}`);
SD.printPrintable = id => { const p = SD.printable(id); SD.print(SD.printablePage(id), `SR Target ${p ? p.name : id}`); };
})();
