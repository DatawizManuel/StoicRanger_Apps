/* Stoic Ranger - Training Log — printable A4 record sheet (print or "Save as PDF") and CSV export of the
   dashboard's current filter. Same figures as the dashboard (TL.filtered / TL.summary). */
'use strict';
(() => {
const { esc, fh, fmtInt, fmtDate } = TL;

TL.FONTS_CSS = `
@font-face{font-family:"Barlow Condensed";font-weight:600;src:url(fonts/barlow-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Condensed";font-weight:700;src:url(fonts/barlow-condensed-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:400;src:url(fonts/barlow-semi-condensed-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:500;src:url(fonts/barlow-semi-condensed-latin-500-normal.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:600;src:url(fonts/barlow-semi-condensed-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400;src:url(fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:600;src:url(fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2")}`;

const PAPER_CSS = `
@page{size:A4;margin:11mm 11mm 13mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:400 9.5pt/1.35 "Barlow Semi Condensed","Arial Narrow",sans-serif}
.band{display:flex;align-items:center;gap:4mm;background:#111;color:#fff;padding:3mm 4mm;border-bottom:1.2mm solid #4B5320}
.band svg{width:15mm;height:15mm;color:#fff;flex:none}
.band .bt{font:700 17pt/1 "Barlow Condensed",sans-serif;letter-spacing:.08em;text-transform:uppercase}
.band .bs{font:600 8pt/1.2 "Barlow Semi Condensed",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#C9B46A;margin-top:1mm}
.band .r{margin-left:auto;text-align:right}
.band .r .t{font:700 14pt/1 "Barlow Condensed",sans-serif;letter-spacing:.12em;text-transform:uppercase}
.band .r .d{font:400 7.5pt "JetBrains Mono",monospace;color:#ccc;margin-top:1mm}
h2{font:700 11pt/1 "Barlow Condensed",sans-serif;letter-spacing:.1em;text-transform:uppercase;margin:4mm 0 2mm;padding-bottom:1mm;border-bottom:.5mm solid #111;display:flex;gap:2mm;align-items:center}
h2 .n{background:#4B5320;color:#fff;font-size:9pt;padding:.4mm 1.6mm}
.flt{display:grid;grid-template-columns:repeat(5,1fr);border:.3mm solid #999;margin-top:4mm}
.flt div{padding:1.5mm 2mm;border-right:.3mm solid #999}.flt div:last-child{border-right:0}
.l{font:600 6.5pt/1.2 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#555}
.v{font:600 10.5pt/1.25 "Barlow Semi Condensed",sans-serif}
.sum{display:grid;grid-template-columns:52mm 1fr;gap:5mm;align-items:start}
.kf{border:.3mm solid #999;border-left:1.2mm solid #4B5320}
.kf div{padding:1.1mm 2.5mm;border-bottom:.3mm solid #ccc}.kf div:last-child{border-bottom:0}
.kf .big{font:700 15pt/1.05 "Barlow Condensed",sans-serif}
.kf .big small{font:500 8pt "Barlow Semi Condensed",sans-serif;color:#555}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
th{font:600 6.8pt/1.2 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#333;text-align:left;border-bottom:.5mm solid #111;padding:1.2mm 1.4mm;vertical-align:bottom}
td{padding:1.3mm 1.4mm;border-bottom:.25mm solid #bbb;vertical-align:top}
.num{text-align:right;font-family:"JetBrains Mono",monospace;font-size:8pt;white-space:nowrap}
.mono{font-family:"JetBrains Mono",monospace;font-size:8pt;white-space:nowrap}
tr.tot td{border-top:.5mm solid #111;border-bottom:0;font-weight:700}
.rem{color:#444;font-style:italic;font-size:8.5pt;margin-top:.6mm}
.ws{font-size:8.5pt}
.ws span{white-space:nowrap}
.cts td{font-size:8.5pt}
.end{break-inside:avoid;page-break-inside:avoid}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:12mm;padding-top:9mm}
.sig div{border-top:.3mm solid #111;padding-top:1mm;font:600 7pt "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#555}
.foot{margin-top:4mm;font:400 6.8pt "JetBrains Mono",monospace;color:#777;display:flex;justify-content:space-between}
.empty{padding:6mm;text-align:center;color:#666}
.dry{display:inline-block;font:600 6.5pt/1 "Barlow Semi Condensed",sans-serif;text-transform:uppercase;letter-spacing:.08em;background:#2b6f9e;color:#fff;padding:.5mm 1.2mm;margin-top:.5mm}
.kf .sp{font:500 8pt "Barlow Semi Condensed",sans-serif;color:#555;margin-top:.3mm}`;

/** The A4 record: header with the filter, totals (time, rounds per gun), all matching trainings. */
TL.recordDoc = (f, o = {}) => {
  const list = TL.filtered(f).slice().reverse();                 // printed oldest first, like a logbook
  const s = TL.summary(list, f);
  const ft = TL.filterText(f);
  const showShooter = !f.shooter;
  const title = f.shooter ? TL.nameOf('shooters', f.shooter) : 'All shooters';
  const trainers = Array.from(new Set(list.map(t => t.trainerId).filter(Boolean))).map(TL.trainer).filter(Boolean);
  const ws = t => t.weapons.filter(w => !f.weapon || w.weaponId === f.weapon)
    .map(w => `<span>${esc(TL.nameOf('weapons', w.weaponId))}${w.rounds ? ' · ' + fmtInt(w.rounds) + (TL.isDry(t) ? ' reps' : '') : ''}</span>`).join('<br>');
  const anyDry = s.nDry > 0, split = (l, d) => anyDry && !f.fire ? `<div class="sp">live ${l} · dry ${d}</div>` : '';
  const now = new Date();
  const stamp = `${fmtDate(TL.today())} ${now.toTimeString().slice(0, 5)}`;
  let sec = 0;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Training record</title><style>${TL.FONTS_CSS}${PAPER_CSS}</style></head><body>
  <div class="band">${TL.logo()}<div><div class="bt">Stoic Ranger</div><div class="bs">Training Log</div></div>
    <div class="r"><div class="t">Training record</div><div class="d">${esc(title)}${f.year ? ' · ' + esc(f.year) : ''}</div></div></div>
  <div class="flt">${ft.map(([l, v]) => `<div><div class="l">${l}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>

  <h2><span class="n">${++sec}</span>Summary</h2>
  <div class="sum">
    <div class="kf">
      <div><div class="l">Trainings</div><div class="big">${s.n}</div>${split(s.nLive, s.nDry)}</div>
      <div><div class="l">Total training time</div><div class="big">${fh(s.hours) || 0}<small> h</small></div>${split((fh(s.hoursLive) || 0) + ' h', (fh(s.hoursDry) || 0) + ' h')}</div>
      <div><div class="l">Total rounds${f.weapon ? ' (this gun)' : ''}</div><div class="big">${fmtInt(s.rounds) || 0}</div>${anyDry ? `<div class="sp">live fire only${s.reps ? ` · ${fmtInt(s.reps)} dry-fire reps` : ''}</div>` : ''}</div>
      <div><div class="l">Period</div><div class="v">${list.length ? fmtDate(list[0].date) + ' – ' + fmtDate(list[list.length - 1].date) : '–'}</div></div>
    </div>
    <table><thead><tr><th>Gun</th><th>Caliber</th><th class="num">Trainings${anyDry ? ' live/dry' : ''}</th><th class="num">Rounds</th></tr></thead>
      <tbody>${s.perWeapon.map(p => { const w = TL.weapon(p.weaponId) || {}; return `<tr><td>${esc(w.name || '(deleted)')}</td><td>${esc(w.caliber || '')}</td><td class="num">${anyDry ? p.live + '/' + p.dry : p.trainings}</td><td class="num">${fmtInt(p.rounds)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">No rounds recorded.</td></tr>'}
      ${s.perWeapon.length ? `<tr class="tot"><td colspan="3">Total</td><td class="num">${fmtInt(s.rounds)}</td></tr>` : ''}</tbody></table>
  </div>

  <h2><span class="n">${++sec}</span>Trainings</h2>
  ${list.length ? `<table><thead><tr><th class="num">No.</th><th>Date</th><th>Start</th><th class="num">h</th>${showShooter ? '<th>Shooter</th>' : ''}<th>Training${o.remarks ? ' / remarks' : ''}</th><th>Guns · rounds</th><th>Trainer / organizer</th></tr></thead>
    <tbody>${list.map((t, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${fmtDate(t.date)}</td><td class="mono">${esc(t.start || '')}</td><td class="num">${fh(t.durationH)}</td>
      ${showShooter ? `<td>${esc(TL.nameOf('shooters', t.shooterId))}</td>` : ''}
      <td>${esc(t.desc || '')}${TL.isDry(t) ? ' <span class="dry">Dry fire</span>' : ''}${o.remarks && t.remarks ? `<div class="rem">${esc(t.remarks)}</div>` : ''}</td>
      <td class="ws">${ws(t)}</td><td>${esc(TL.nameOf('trainers', t.trainerId))}</td></tr>`).join('')}
    <tr class="tot"><td colspan="3">Total</td><td class="num">${fh(s.hours)}</td>${showShooter ? '<td></td>' : ''}<td></td><td class="num" style="text-align:left">${fmtInt(s.rounds)} rds</td><td></td></tr>
    </tbody></table>` : '<div class="empty">No training matches this selection.</div>'}

  ${o.contacts && trainers.length ? `<h2><span class="n">${++sec}</span>Trainers / organizers</h2>
  <table class="cts"><thead><tr><th>Name</th><th>Contact person</th><th>Phone</th><th>E-mail</th><th>Website</th></tr></thead><tbody>
    ${trainers.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.contact || '')}</td><td class="mono">${esc(t.phone || '')}</td><td>${esc(t.email || '')}</td><td>${esc(t.website || '')}</td></tr>`).join('')}</tbody></table>` : ''}

  <div class="end">${o.signature ? `<div class="sig"><div>Place, date</div><div>Signature${f.shooter ? ' – ' + esc(TL.nameOf('shooters', f.shooter)) : ''}</div></div>` : ''}
  <div class="foot"><span>Stoic Ranger - Training Log</span><span>Printed ${stamp}</span></div></div>
  </body></html>`;
};

/** Semicolon CSV (opens directly in Excel with Austrian/German settings), one row per training. */
TL.csv = f => {
  const list = TL.filtered(f).slice().reverse();
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const dec = v => v == null || v === '' ? '' : String(v).replace('.', ',');
  const head = ['ID', 'Date', 'Start', 'Duration h', 'Type', 'Shooter', 'Training', 'Guns (rounds / reps)', 'Rounds total', 'Dry-fire reps', 'Trainer / organizer', 'Remarks'];
  const rows = list.map(t => [t.id, t.date, t.start, dec(t.durationH), TL.FIRE[t.fire] || TL.FIRE.live, TL.nameOf('shooters', t.shooterId), t.desc,
    t.weapons.map(w => `${TL.nameOf('weapons', w.weaponId)} (${w.rounds || 0})`).join(', '), TL.rounds(t), TL.reps(t) || '', TL.nameOf('trainers', t.trainerId), t.remarks]);
  return '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
};

TL.fileStem = f => ['training-record', f.shooter && TL.nameOf('shooters', f.shooter), f.year].filter(Boolean).join('_').replace(/[^\w\-]+/g, '-');

TL.printDialog = f => {
  const o = Object.assign({ remarks: true, contacts: true, signature: true }, TL.db.settings.printOpts || {});
  const n = TL.filtered(f).length;
  const m = TL.sheet('Print record sheet', `
    <p class="note">${TL.filterText(f).map(([l, v]) => `${l}: <b>${esc(v)}</b>`).join(' · ')}<br>${n} training${n === 1 ? '' : 's'} · change the filters on the dashboard to print another selection.</p>
    <div class="stack" style="gap:4px">
      <label class="inl"><input type="checkbox" data-o="remarks"${o.remarks ? ' checked' : ''}>Remarks under each training</label>
      <label class="inl"><input type="checkbox" data-o="contacts"${o.contacts ? ' checked' : ''}>Trainer / organizer contacts</label>
      <label class="inl"><input type="checkbox" data-o="signature"${o.signature ? ' checked' : ''}>Signature line</label>
    </div>
    <div class="stack">
      <button class="btn pri big" id="pPrint">Print or save as PDF</button>
      <button class="btn" id="pCsv">Share as CSV (Excel)</button>
    </div>
    <p class="note">In the print dialog choose <b>Save as PDF</b> as printer to get a PDF you can share (iPhone: share button in the print options, then <b>Save to Files</b>).</p>`);
  TL.$$('[data-o]', m.body).forEach(c => c.onchange = () => { o[c.dataset.o] = c.checked; TL.db.settings.printOpts = o; TL.save(); });
  TL.$('#pPrint', m.body).onclick = () => { TL.print(TL.recordDoc(f, o), TL.fileStem(f)); m.close(); };
  TL.$('#pCsv', m.body).onclick = () => { TL.shareFile(TL.fileStem(f) + '.csv', 'text/csv', TL.csv(f)); };
};
})();
