/* Stoic Ranger — downloads: printable analysis report (all or by selection), every datasheet as A4, blank sheets.
   Everything goes through the Android print dialog, where "Save as PDF" gives the file. */
'use strict';
(() => {
const { $, $$, esc, fx } = RB;

// light colours for paper, whatever theme the app is in
const PAPER_CSS = `:root{--bg:#fff;--card:#fff;--fg:#141612;--muted:#5a5f55;--hair:#d6d6cd;--panel:#ecece4;--panel2:#e0e0d6;--accent:#4b5320;--warn:#9a6a00;
--c1:#4b5320;--c2:#b0581c;--c3:#2b6f9e;--c4:#8a3f8f;--c5:#7d7a2a;--c6:#2f8f72;
--f-disp:"Barlow Condensed","Arial Narrow",sans-serif;--f-body:"Barlow Semi Condensed","Arial Narrow",sans-serif;--f-mono:"JetBrains Mono",ui-monospace,monospace}
@page{size:A4;margin:14mm 12mm}html,body{margin:0;background:#fff;color:var(--fg);font:10.5pt/1.4 var(--f-body)}
.band{background:#121512;color:#fff;font:700 9pt var(--f-disp);letter-spacing:.18em;text-transform:uppercase;padding:2.2mm 4mm}
h1{font:700 22pt/1.1 var(--f-disp);text-transform:uppercase;letter-spacing:.02em;margin:5mm 0 1mm}
h2{font:700 13pt var(--f-disp);text-transform:uppercase;letter-spacing:.05em;border-bottom:.5mm solid var(--fg);padding-bottom:1mm;margin:7mm 0 3mm;break-after:avoid}
h3{font:700 10.5pt var(--f-disp);text-transform:uppercase;letter-spacing:.05em;margin:4mm 0 1mm}
.sub{color:var(--muted)}.need{color:var(--muted);font-style:italic;font-size:9.5pt;margin:1mm 0}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:4mm}
.tile{border:.3mm solid var(--hair);border-left:1mm solid var(--accent);padding:2.5mm 3mm}.tile .l{font:600 7.5pt var(--f-body);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.tile .v{font:700 17pt var(--f-disp)}.tile .s{font-size:8.5pt;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:9pt}th{font:600 7.5pt var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:right;border-bottom:.3mm solid var(--fg);padding:1mm 1.5mm}
td{text-align:right;padding:1mm 1.5mm;border-bottom:.2mm solid var(--hair);font-family:var(--f-mono);font-size:8.5pt}th.t,td.t{text-align:left;font-family:var(--f-body);font-size:9pt}
tr{break-inside:avoid}.fig{break-inside:avoid;margin:2mm 0 4mm}
.chart{position:relative}.chart svg{display:block;max-width:100%}.chart .tip{display:none}
.chart .grid{stroke:var(--hair);stroke-width:1}.chart .ax{stroke:var(--muted);stroke-width:1}.chart .ref{stroke:var(--muted);stroke-dasharray:4 4}
.chart .tk{fill:var(--muted);font:500 10px var(--f-mono)}.chart .al{fill:var(--muted);font:600 10px var(--f-body);letter-spacing:.06em;text-transform:uppercase}
.legend{display:flex;flex-wrap:wrap;gap:1mm 4mm;font-size:8.5pt;color:var(--muted);margin-top:1mm}.legend i{display:inline-block;width:2.5mm;height:2.5mm;border-radius:50%;margin-right:1.2mm}
.empty{color:var(--muted);font-style:italic;font-size:9.5pt;padding:2mm 0}
.rhead{display:flex;align-items:center;gap:4mm;margin-top:4mm}.rhead h1{margin:0}.rlogo{width:20mm;height:20mm;color:#111;flex:none}
.ftr{margin-top:8mm;color:var(--muted);font-size:8pt;border-top:.2mm solid var(--hair);padding-top:1.5mm}`;

/** Render a chart offscreen at paper width and return its markup. */
function chartHTML(fn, opts) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:680px';
  document.body.appendChild(host);
  try { fn(host, opts); return host.innerHTML; } finally { host.remove(); }
}

RB.selectionLabel = f => [
  f.shooter ? 'Shooter: ' + ((RB.shooter(f.shooter) || {}).name || f.shooter.replace(/^n:/, '')) : 'All shooters',
  f.weapon ? 'Gun: ' + ((RB.weapon(f.weapon) || {}).name || '?') : 'All guns',
  f.munition ? 'Ammunition: ' + ((RB.munition(f.munition) || {}).name || f.munition.replace(/^n:/, '')) : 'All ammunition',
].join(' · ');

RB.reportHTML = f => {
  const { sessions, barrels, ammo, data } = RB.selectData(f);
  const U = RB.U, A = U.label('ang'), V = U.label('vel'), AD = U.imperial() ? 2 : 3, an = (v, d) => v != null ? U.num('ang', v, d) : '–';
  const mv = a => { const m = a.id ? RB.munition(a.id) : null; return m ? RB.num(m.nominalV0) : null; };
  const pairs = RB.pairRanking(sessions);
  const need = m => `<div class="need">${esc(m)}</div>`;
  const rounds = sessions.reduce((t, s) => t + (s.rounds || 0), 0);
  const dates = sessions.map(s => s.date).filter(Boolean).sort();
  const fitted = barrels.filter(b => b.status === 'fitted').sort((a, b) => b.total - a.total)[0];
  const ranked = ammo.filter(a => a.mrM != null).sort((a, b) => a.mrM - b.mrM);
  const byPurpose = RB.purposes().map(p => [p, sessions.filter(s => s.purpose === p.id)]).filter(x => x[1].length);

  const okB = barrels.filter(b => b.precNeed.ok).map(b => b.id);
  const wb = [...new Set(sessions.filter(s => s.mrRel != null && okB.includes(s.barrelId)).map(s => s.barrelId))];
  const wear = chartHTML(RB.chart.scatter, { series: wb.map(b => ({ name: (RB.barrel(b) || {}).name || b, pts: sessions.filter(s => s.barrelId === b && s.mrRel != null).map(s => ({ x: s.barrelRoundsBefore, y: s.mrRel })) })),
    lines: wb.map((b, i) => { const L = RB.fitLine(sessions.filter(s => s.barrelId === b && s.mrRel != null).map(s => [s.barrelRoundsBefore, s.mrRel])); return L ? Object.assign(L, { color: RB.color(i) }) : null; }).filter(Boolean),
    refY: 1, x0: true, xLabel: 'Rounds through the barrel', yLabel: '× median MR', empty: 'Not enough data to evaluate.' });
  const vA = ammo.filter(a => a.vNeed.ok).map(a => a.name);
  const v0 = chartHTML(RB.chart.scatter, { series: vA.map(a => ({ name: a, pts: sessions.filter(s => s.ammo === a && s.v0).map(s => ({ x: s.barrelRoundsBefore, y: U.from('vel', s.v0) })) })).filter(x => x.pts.length), x0: true, xLabel: 'Rounds through the barrel', yLabel: 'V0 ' + V, empty: 'Not enough data to evaluate.' });
  const pA = ammo.filter(a => a.precNeed.ok).map(a => a.name);
  const cen = RB.centred(data).filter(c => pA.includes(c.ammo));
  const cloud = cen.length ? chartHTML(RB.chart.cloud, { series: [...new Set(cen.map(c => c.ammo))].map(a => ({ name: a, pts: cen.filter(c => c.ammo === a).map(c => ({ dx: U.from('ang', c.dx), dy: U.from('ang', c.dy) })) })) }) : '<div class="empty">Not enough data to evaluate.</div>';
  const kinds = [['rifle', 'Gun / ammo sheets'], ['shooter', 'Shooter sheets']];
  const trend = chartHTML(RB.chart.scatter, { dates: true, y0: true, yLabel: 'MR ' + A, empty: 'Not enough data to evaluate.',
    series: kinds.map(([k, n]) => { const L = sessions.filter(s => s.evalAs === k && s.mrM != null && s.date); return { name: n, join: true, pts: RB.enough(L.map(s => s.hits)).ok ? L.map(s => ({ x: s.date, y: U.from('ang', s.mrM) })) : [] }; }).filter(s => s.pts.length) });

  const sorted = [...sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Analysis report</title><style>${RB.FONTS_CSS}${PAPER_CSS}</style></head><body>
  <div class="band">Stoic Ranger // Gun Database</div>
  <div class="rhead">${RB.logo('rlogo')}<h1>Analysis report</h1></div>
  <div class="sub">${esc(RB.selectionLabel(f))}<br>Created ${esc(RB.fmtDate(RB.today()))} · ${sessions.length} sheets${dates.length ? ' · ' + esc(RB.fmtDate(dates[0])) + ' – ' + esc(RB.fmtDate(dates[dates.length - 1])) : ''}</div>
  <div class="tiles">
    <div class="tile"><div class="l">Sheets · rounds</div><div class="v">${sessions.length} · ${RB.fmtInt(rounds)}</div></div>
    <div class="tile"><div class="l">Rounds on fitted barrel</div><div class="v">${fitted ? RB.fmtInt(fitted.total) : '–'}</div><div class="s">${fitted ? esc(fitted.name + ' · ' + fitted.rifle) : ''}</div></div>
    <div class="tile"><div class="l">Barrel life used</div><div class="v">${fitted && fitted.lifePct != null ? fx(fitted.lifePct, 0) + ' %' : '–'}</div><div class="s">${fitted ? 'of ' + RB.fmtInt(fitted.life) + ' rounds' : ''}</div></div>
    <div class="tile"><div class="l">Best ammo, mean radius</div><div class="v">${ranked[0] ? an(ranked[0].mrM, AD) : '–'}</div><div class="s">${ranked[0] ? esc(ranked[0].name) + ' · ' + A : 'not enough data yet'}</div></div>
  </div>
  ${byPurpose.length ? `<h3>Sheets by purpose</h3><div class="sub">${byPurpose.map(([p, L]) => `${esc(p.name)}: ${L.length}`).join(' · ')}</div>` : ''}

  <h2>Barrels</h2>
  <table><thead><tr><th class="t">Barrel</th><th class="t">Gun</th><th>Rounds</th><th>Life</th><th>Group /1k</th><th>V0 /1k ${V}</th></tr></thead><tbody>
  ${barrels.map(b => `<tr><td class="t">${esc(b.name)}${b.status === 'removed' ? ' (removed)' : ''}</td><td class="t">${esc(b.rifle)}</td><td>${RB.fmtInt(b.total)}</td><td>${b.lifePct != null ? fx(b.lifePct, 0) + ' %' : '–'}</td><td>${b.precPer1000 != null ? (b.precPer1000 > 0 ? '+' : '') + fx(b.precPer1000, 0) + ' %' : '–'}</td><td>${b.v0Per1000 != null ? U.num('vel', b.v0Per1000, 1) : '–'}</td></tr>`).join('') || '<tr><td class="t" colspan="6">No barrels.</td></tr>'}
  </tbody></table>
  ${barrels.filter(b => !b.precNeed.ok).map(b => need(b.name + ': ' + b.precNeed.msg)).join('')}
  <div class="fig"><h3>Group size vs rounds through the barrel</h3>${wear}</div>
  <div class="fig"><h3>Muzzle velocity vs rounds through the barrel</h3>${v0}</div>

  <h2>Ammunition</h2>
  <table><thead><tr><th class="t">Ammo</th><th>Sheets</th><th>Shots</th><th>MR ${A}</th><th>Avg ES</th><th>Best ES</th><th>Maker V0</th><th>Measured V0</th><th>SD</th></tr></thead><tbody>
  ${ammo.map(a => `<tr><td class="t">${esc(a.name)}</td><td>${a.testSessions}</td><td>${a.testShots}</td><td>${an(a.mrM, AD)}</td><td>${an(a.esAvg)}</td><td>${an(a.esBest)}</td><td>${mv(a) != null ? U.num('vel', mv(a)) : '–'}</td><td>${a.v0 != null ? U.num('vel', a.v0) : '–'}</td><td>${a.v0sd != null ? U.num('vel', a.v0sd, 1) : '–'}</td></tr>`).join('') || '<tr><td class="t" colspan="8">No ammo on sheets.</td></tr>'}
  </tbody></table>
  ${ammo.filter(a => !a.precNeed.ok || !a.vNeed.ok).map(a => need(a.name + ': ' + (!a.precNeed.ok ? a.precNeed.msg : a.vNeed.msg))).join('')}
  <h3>Most precise ammo per barrel</h3>
  ${pairs.length ? pairs.map(B => `<table style="margin-bottom:3mm"><thead><tr><th class="t" colspan="2">${esc(B.barrel)} · ${esc(B.rifle)}</th><th>MR ${A}</th><th>Avg ES</th><th>Shots · sets</th><th>V0 ${V}</th></tr></thead><tbody>
    ${B.rows.map((r, i) => `<tr${r.ok && i === 0 ? ' style="font-weight:700"' : ''}><td class="t">${r.ok ? (i === 0 ? '★' : i + 1) : '–'}</td><td class="t">${esc(r.ammo)}${r.ok ? '' : `<div class="need">${esc(r.need.msg)}</div>`}</td><td>${an(r.mrM, AD)}</td><td>${an(r.esAvg)}</td><td>${r.shots} · ${r.sets}</td><td>${r.v0 != null ? U.num('vel', r.v0) : '–'}</td></tr>`).join('')}</tbody></table>`).join('') : need('No gun/ammo sheets with groups yet.')}
  <div class="fig"><h3>All gun/ammo shots, each group centred (${A})</h3>${cloud}</div>

  <h2>Shooter</h2>
  <div class="fig"><h3>Group size over time</h3>${trend}</div>

  <h2>Sheets</h2>
  <table><thead><tr><th class="t">Date</th><th class="t">No.</th><th class="t">Purpose</th><th class="t">Shooter</th><th class="t">Gun · ammo</th><th>${U.label('dist')}</th><th>Shots</th><th>MR ${A}</th><th>Ring</th></tr></thead><tbody>
  ${sorted.map(s => `<tr><td class="t">${esc(RB.fmtDate(s.date))}</td><td class="t">${esc(s.no)}</td><td class="t">${esc(RB.purposeName(s.purpose))}</td><td class="t">${esc(s.shooter)}</td><td class="t">${esc(s.rifle + ' · ' + s.ammo)}</td><td>${s.dist != null ? U.num('dist', s.dist) : ''}</td><td>${s.hits}</td><td>${s.mrM != null ? U.num('ang', s.mrM, AD) : ''}</td><td>${s.avgRing != null ? fx(s.avgRing, 1) : ''}</td></tr>`).join('') || '<tr><td class="t" colspan="9">No sheets.</td></tr>'}
  </tbody></table>
  <div class="ftr">${U.imperial() ? 'Imperial units (yd, MOA, fps). 1 MOA ≈ 1.047 in at 100 yd.' : 'Metric units. 1 mrad = 10 cm at 100 m.'} Figures are only calculated from ${RB.MIN_SETS} sets of ${RB.SET_ROUNDS} rounds on. Stoic Ranger - Gun Database ${esc(RB.appInfo().version || '')}</div>
  </body></html>`;
};

const fileBit = f => [f.shooter && ((RB.shooter(f.shooter) || {}).name || f.shooter.slice(2)), f.weapon && (RB.weapon(f.weapon) || {}).name, f.munition && ((RB.munition(f.munition) || {}).name || f.munition.slice(2))].filter(Boolean).join('_').replace(/[^\w.-]+/g, '-');

RB.views.download = {
  tab: 'more',
  render(el) {
    RB.header('Download', { back: true });
    const f = RB._dlF || (RB._dlF = Object.assign({ shooter: '', weapon: '', munition: '' }, RB.db.settings.dashFilter || {}));
    const { shooterOpts, weaponOpts, ammoOpts, filtered, sessions } = RB.selectData(f);
    const dc = RB.dopeCards(f);
    const list = RB.db.sheets.filter(s => sessions.some(x => x.id === s.id)).sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
    el.innerHTML = `
      <p class="note">Everything opens the print dialog: pick <b>Save as PDF</b> to get a file, or a printer for paper.</p>
      <div class="filters">
        ${RB.pickSel('xS', 'Shooter', 'All shooters', shooterOpts, f.shooter)}
        ${RB.pickSel('xW', 'Gun', 'All guns', weaponOpts, f.weapon)}
        ${RB.pickSel('xM', 'Ammunition', 'All ammunition', ammoOpts, f.munition)}
      </div>
      <div class="fbar"><span class="fnote">${filtered ? `${sessions.length} of ${RB.db.sheets.length} sheets selected` : `All ${RB.db.sheets.length} sheets`}</span><button class="btn sm" id="xClear" ${filtered ? '' : 'disabled'}>Clear selection</button></div>
      <div class="card"><h3>Analysis report</h3><p class="note">Summary, barrels, ammunition, charts and a list of the sheets${filtered ? ' for this selection' : ''}.</p>
        <div class="row"><button class="btn pri" id="xReport">Analysis report (PDF)</button></div></div>
      <div class="card"><h3>Dope cards</h3><p class="note">One dope card per gun and ammunition ${filtered ? 'in this selection' : 'shot on your sheets'}${dc.cards.length ? ` (${dc.cards.length}: ${esc(dc.cards.map(c => c.I.w.name + ' · ' + c.I.m.name).join('; '))})` : ''}, one per page.</p>
        ${dc.skipped.map(t => `<p class="need">${esc(t)}</p>`).join('')}
        <div class="row"><button class="btn" data-dc="A6" ${dc.cards.length ? '' : 'disabled'}>Dope cards A6</button><button class="btn" data-dc="A5" ${dc.cards.length ? '' : 'disabled'}>A5</button><button class="btn" data-dc="A4" ${dc.cards.length ? '' : 'disabled'}>A4</button><a class="btn" href="#/analyse/dope">Open dope cards</a></div></div>
      <div class="card"><h3>Datasheets</h3><p class="note">Each shooting result as its A4 datasheet, as entered or read in (no photos).</p>
        <div class="row"><button class="btn" id="xAll" ${list.length ? '' : 'disabled'}>All ${list.length} sheets in one PDF</button></div>
        <div class="list">${list.map(s => `<div class="item"><div class="main"><div class="t">${esc(RB.fmtDate(s.date))} <span class="id">${esc(s.no || '')}</span>${s.purpose ? `<span class="pill ${RB.evalAs(s.purpose)}">${esc(RB.purposeName(s.purpose))}</span>` : ''}</div><div class="kvs"><span>${esc(s.gun || '–')}</span><span>${esc(s.ammo || '')}</span>${s.shooter ? `<span>${esc(s.shooter)}</span>` : ''}</div></div><div class="side"><button class="btn sm" data-dl="${esc(s.id)}">PDF</button></div></div>`).join('') || '<div class="empty">No sheets for this selection.</div>'}</div></div>
      <div class="card"><h3>Blank datasheets</h3><div class="row"><button class="btn" id="xBlank">1 blank sheet</button><button class="btn" id="xBlank4">4 blank sheets</button></div></div>`;
    [['xS', 'shooter'], ['xW', 'weapon'], ['xM', 'munition']].forEach(([id, k]) => $('#' + id).onchange = e => { f[k] = e.target.value; RB.views.download.render(el); });
    $('#xClear').onclick = () => { Object.assign(f, { shooter: '', weapon: '', munition: '' }); RB.views.download.render(el); };
    $('#xReport').onclick = () => RB.print(RB.reportHTML(f), `analysis_${RB.today()}${filtered ? '_' + fileBit(f) : ''}`);
    $('#xAll').onclick = () => RB.printSheets([...list].reverse(), `datasheets_${RB.today()}${filtered ? '_' + fileBit(f) : ''}`);
    $$('[data-dl]', el).forEach(b => b.onclick = () => { const s = RB.sheetById(b.dataset.dl); RB.printSheets([s], `${s.date}_datasheet${s.no ? '_' + s.no.replace(/[^\w-]+/g, '-') : ''}`); });
    $$('[data-dc]', el).forEach(b => b.onclick = () => RB.print(RB.dopePrintHTML(dc.cards, b.dataset.dc), `dopecards_${RB.today()}${filtered ? '_' + fileBit(f) : ''}_${b.dataset.dc}`, b.dataset.dc));
    $('#xBlank').onclick = () => RB.printBlank(1);
    $('#xBlank4').onclick = () => RB.printBlank(4);
  },
};
})();
