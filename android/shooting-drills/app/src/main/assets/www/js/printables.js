/* Stoic Ranger - Shooting Drills — printable targets. Own designs (plain geometric shapes, no copied target faces),
   each with the Stoic Ranger emblem and a 100 mm check bar. Drawn as A4 SVG in millimetres (210 × 297), so printing
   at 100 % gives true sizes. Black ink only. */
'use strict';
(() => {
const INK = '#111', FONT = "'Barlow Semi Condensed','Arial Narrow',sans-serif", DISP = "'Barlow Condensed','Arial Narrow',sans-serif";

SD.PRINTABLES = [
  { id: 'sr-body', name: 'Body Zone', desc: 'Body zone 15 × 20 cm with a 10 cm centre. Staple onto cardboard or an existing backer.' },
  { id: 'sr-head', name: 'Head Zone', desc: 'Two head zones 10 × 8 cm and three 5 cm precision dots.' },
  { id: 'sr-dots10', name: '10-Dot Sheet', desc: '10 numbered dots, 5 cm, with the SR dot sequence (50 rounds).' },
  { id: 'sr-dots25', name: '25-Dot Sheet', desc: '25 numbered dots, 2.5 cm, for dry fire and small-target work.' },
  { id: 'sr-bull', name: 'Bullseye', desc: '10 rings in 1 cm radius steps (20 cm overall), scored 1–10.' },
  { id: 'sr-grid', name: 'Zero Grid', desc: '1 cm grid: 0.1 mrad per square at 100 m, 0.2 mrad at 50 m. Centre and four corner aim points.' },
  { id: 'sr-ladder', name: 'Rifle Dot Ladder', desc: 'Rows of 4 / 3 / 2 / 1.5 / 1 cm dots (0.4 to 0.1 mrad at 100 m).' },
  { id: 'sr-shapes', name: 'Numbered Shapes', desc: 'Nine numbered circles, squares and triangles for call-out and counting drills.' },
  { id: 'sr-tall', name: 'Tall Target', desc: 'Vertical line with a cm scale and an aim point: tall target test, cant check, vertical line drill.' },
  { id: 'sr-dryrifle', name: 'Dry-Fire Plates 10 m', desc: 'Scaled plates for rifle dry fire at 10 m: 1 cm = 1 mrad.' },
  { id: 'sr-drypistol', name: 'Dry-Fire Pistol 3 m', desc: 'Reduced body and head zones that look like 7, 15 and 25 m when hung at 3 m.' },
  { id: 'sr-plot', name: 'Shot Plot & Data Card', desc: 'Session data, five plot circles and a shot table for cold bore, wind and DOPE work.' },
  { id: 'sr-log', name: 'Drill Score Log', desc: 'Table for date, drill, live/dry, time, hits, points and pass.' },
];
SD.printable = id => SD.PRINTABLES.find(p => p.id === id) || null;

const t = (x, y, s, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${s}" font-family="${o.disp ? DISP : FONT}" font-weight="${o.w || 500}" fill="${o.fill || INK}" text-anchor="${o.a || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${SD.esc(txt)}</text>`;
const circle = (cx, cy, r, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill || 'none'}" stroke="${o.stroke || INK}" stroke-width="${o.sw ?? 0.5}"${o.dash ? ' stroke-dasharray="1.5 1.5"' : ''}/>`;
const rect = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || 'none'}" stroke="${o.stroke || INK}" stroke-width="${o.sw ?? 0.5}"${o.dash ? ' stroke-dasharray="1.5 1.5"' : ''}/>`;
const line = (x1, y1, x2, y2, sw = 0.3, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${sw}"${dash ? ' stroke-dasharray="1.5 1.5"' : ''}/>`;
const cross = (cx, cy, s = 3, sw = 0.3) => line(cx - s, cy, cx + s, cy, sw) + line(cx, cy - s, cx, cy + s, sw);
const diamond = (cx, cy, s, o = {}) => `<path d="M${cx} ${cy - s}L${cx + s} ${cy}L${cx} ${cy + s}L${cx - s} ${cy}Z" fill="${o.fill || 'none'}" stroke="${INK}" stroke-width="${o.sw ?? 0.8}"/>`;
const logo = (x, y, s) => SD.LOGO_SVG.replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" color="${INK}" `).replace(/<title>[^<]*<\/title>/, '');

function footer(p) {
  return line(10, 266, 200, 266, 0.4) + logo(10, 269, 22)
    + t(36, 276.5, 6, 'STOIC RANGER', { disp: true, w: 700, ls: 0.6 })
    + t(36, 282.5, 3.6, 'SR Shooting Drills · ' + p.name, { w: 600 })
    + t(36, 287.5, 2.8, 'Own design · free for personal training use')
    + t(200, 276, 2.8, 'Print at 100 % / actual size. This bar must measure 100 mm:', { a: 'end' })
    + `<rect x="100" y="279" width="100" height="3" fill="${INK}"/>` + line(100, 278, 100, 283.5, 0.3) + line(200, 278, 200, 283.5, 0.3)
    + t(150, 288, 2.6, '100 mm', { a: 'middle' })
    + t(200, 8, 2.6, p.id, { a: 'end', fill: '#666' });
}

const SEQ = { 1: '5 slow shots', 2: '5 shots, 1 per start from ready', 3: '1 on 3, 1 on 4, four times', 4: 'see dot 3', 5: '5 shots strong hand only',
  6: '5 shots weak hand only', 7: '6 single shots from holster or ready', 8: '4 pairs', 9: '1 pair on 9, 1 pair on 10, twice', 10: 'see dot 9' };

const DRAW = {
  'sr-body'() {
    return t(105, 22, 4.5, 'BODY ZONE  15 × 20 cm', { disp: true, w: 700, a: 'middle', ls: 0.4 })
      + rect(30, 30, 150, 200, { sw: 0.9 }) + circle(105, 130, 50, { dash: true, sw: 0.4 }) + cross(105, 130, 4)
      + t(105, 186, 3, '10 cm centre', { a: 'middle', fill: '#555' })
      + t(105, 242, 3.4, 'A hit touching the line counts. Hang the centre at chest height.', { a: 'middle' });
  },
  'sr-head'() {
    let s = t(105, 18, 4.5, 'HEAD ZONE  10 × 8 cm', { disp: true, w: 700, a: 'middle', ls: 0.4 });
    [22, 112].forEach(y => { s += rect(55, y, 100, 80, { sw: 0.9 }) + cross(105, y + 40, 3); });
    s += t(105, 203, 3.6, 'PRECISION DOTS  5 cm', { disp: true, w: 700, a: 'middle', ls: 0.3 });
    [45, 105, 165].forEach(x => { s += circle(x, 236, 25, { fill: INK, sw: 0 }) + cross(x, 236, 3, 0.4).replace(/stroke="#111"/g, 'stroke="#fff"'); });
    return s;
  },
  'sr-dots10'() {
    let s = t(10, 12, 4.5, '10 DOTS · 5 cm', { disp: true, w: 700, ls: 0.4 }) + t(200, 12, 3, 'SR dot sequence: 50 rounds, 3–5 m, no time limit', { a: 'end' });
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / 3), col = i % 3, cx = i === 9 ? 105 : 35 + col * 70, cy = 42 + row * 60, n = i + 1;
      s += circle(cx, cy, 25, { sw: 0.9 }) + cross(cx, cy, 2.5) + t(cx - 26, cy - 19, 6, String(n), { disp: true, w: 700, a: 'end' })
        + t(cx, cy + 30.5, 3, SEQ[n], { a: 'middle', w: 600 });
    }
    return s;
  },
  'sr-dots25'() {
    let s = t(10, 14, 4.5, '25 DOTS · 2.5 cm', { disp: true, w: 700, ls: 0.4 });
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const cx = 33 + i * 36, cy = 42 + j * 46;
      s += circle(cx, cy, 12.5, { sw: 0.7 }) + cross(cx, cy, 1.6, 0.25) + t(cx - 13, cy - 13, 3.6, String(j * 5 + i + 1), { w: 700, a: 'end' });
    }
    return s;
  },
  'sr-bull'() {
    let s = t(105, 18, 4.5, 'BULLSEYE · 10 rings', { disp: true, w: 700, a: 'middle', ls: 0.4 });
    for (let r = 100; r >= 10; r -= 10) s += circle(105, 128, r, { fill: r <= 40 ? INK : '#fff', stroke: r <= 40 ? '#fff' : INK, sw: 0.5 });
    s += circle(105, 128, 5, { stroke: '#fff', sw: 0.4 });
    for (let k = 1; k <= 9; k++) { const r = 100 - (k - 1) * 10 - 5, c = r <= 40 ? '#fff' : INK; s += t(105 - r, 129.3, 3.4, String(k), { a: 'middle', fill: c, w: 700 }) + t(105 + r, 129.3, 3.4, String(k), { a: 'middle', fill: c, w: 700 }); }
    s += t(105, 245, 3.4, 'Ring 10 = 2 cm, X = 1 cm. Each ring adds 1 cm radius.', { a: 'middle' });
    return s;
  },
  'sr-grid'() {
    let s = t(10, 18, 4.5, 'ZERO GRID · 1 cm squares', { disp: true, w: 700, ls: 0.4 });
    for (let k = 0; k <= 18; k++) { s += line(15 + k * 10, 30, 15 + k * 10, 210, k % 5 === 0 || k === 9 ? 0.35 : 0.15) + line(15, 30 + k * 10, 195, 30 + k * 10, k % 5 === 0 || k === 9 ? 0.35 : 0.15); }
    s += line(105, 30, 105, 210, 0.6) + line(15, 120, 195, 120, 0.6);
    s += diamond(105, 120, 12, { sw: 1.2 }) + diamond(105, 120, 3, { fill: INK });
    [[45, 60], [165, 60], [45, 180], [165, 180]].forEach(([x, y]) => { s += diamond(x, y, 7, { sw: 1 }) + diamond(x, y, 1.6, { fill: INK }); });
    s += t(15, 222, 3.6, '1 square = 1 cm = 0.1 mrad at 100 m · 0.2 mrad at 50 m · 0.4 mrad at 25 m', { w: 600 })
      + t(15, 229, 3.2, 'Zero: 5 shots at the centre, measure the group centre in squares, dial the difference.')
      + t(15, 235, 3.2, 'Box test: centre shot, then dial the same value up, right, down, left using the corner points as a check.');
    return s;
  },
  'sr-ladder'() {
    let s = t(10, 12, 4.5, 'RIFLE DOT LADDER', { disp: true, w: 700, ls: 0.4 });
    const rows = [[40, 42], [30, 97], [20, 142], [15, 180], [10, 212]];
    rows.forEach(([d, y]) => {
      s += t(15, y - d / 2 - 3, 3.2, `${d / 10} cm · ${(d / 100).toFixed(2).replace(/0$/, '')} mrad at 100 m · ${(d / 50).toFixed(2).replace(/0$/, '')} mrad at 50 m`, { w: 600 });
      [37.5, 82.5, 127.5, 172.5].forEach(x => { s += circle(x, y, d / 2, { fill: INK, sw: 0 }); });
    });
    s += t(15, 240, 3.2, 'Work from the largest row down: one or two shots per dot, move on after a hit.');
    return s;
  },
  'sr-shapes'() {
    let s = t(10, 14, 4.5, 'NUMBERED SHAPES', { disp: true, w: 700, ls: 0.4 });
    const types = ['c', 's', 't', 's', 't', 'c', 't', 'c', 's'], nums = [3, 7, 1, 5, 9, 2, 8, 4, 6];
    types.forEach((ty, i) => {
      const cx = 40 + (i % 3) * 65, cy = 52 + Math.floor(i / 3) * 74;
      s += ty === 'c' ? circle(cx, cy, 24, { fill: INK, sw: 0 }) : ty === 's' ? rect(cx - 22, cy - 22, 44, 44, { fill: INK, sw: 0 })
        : `<path d="M${cx} ${cy - 27}L${cx + 27} ${cy + 20}L${cx - 27} ${cy + 20}Z" fill="${INK}"/>`;
      s += t(cx, cy + (ty === 't' ? 9 : 6), 17, String(nums[i]), { disp: true, w: 700, a: 'middle', fill: '#fff' });
    });
    s += t(105, 250, 3.4, 'A partner calls a number, a shape or both ("three", "triangle", "square four").', { a: 'middle' });
    return s;
  },
  'sr-tall'() {
    let s = t(10, 14, 4.5, 'TALL TARGET · cm scale', { disp: true, w: 700, ls: 0.4 });
    s += line(105, 20, 105, 250, 0.6);
    for (let k = 0; k <= 22; k++) { const y = 245 - k * 10; s += line(105, y, k % 5 === 0 ? 117 : 111, y, k % 5 === 0 ? 0.5 : 0.3); if (k % 5 === 0 || k <= 10) s += t(120, y + 1.2, 3.2, k + ' cm', { w: k % 5 === 0 ? 700 : 400 }); }
    for (let k = 1; k <= 225; k++) if (k % 10) { const y = 245 - k; if (y >= 20) s += line(105, y, 107.5, y, 0.15); }
    s += diamond(105, 245, 6, { sw: 1 }) + diamond(105, 245, 1.5, { fill: INK });
    s += t(15, 40, 3.4, 'Aim at the diamond for every shot.', { w: 600 })
      + t(15, 46, 3.2, '1 mrad = 10 cm at 100 m, 5 cm at 50 m.')
      + t(15, 52, 3.2, 'Tall target: group, dial up, same aim, group again.')
      + t(15, 58, 3.2, 'Compare the measured shift with the dialled value.')
      + t(15, 66, 3.2, 'For more than 2 mrad at 100 m tape a second')
      + t(15, 71, 3.2, 'sheet above this one, lines aligned.')
      + t(15, 80, 3.2, 'Vertical line drill: aim anywhere on the line;')
      + t(15, 85, 3.2, 'only left/right errors show.');
    return s;
  },
  'sr-dryrifle'() {
    let s = t(10, 14, 4.5, 'DRY-FIRE PLATES · hang at 10 m', { disp: true, w: 700, ls: 0.4 }) + t(200, 14, 3.4, 'At 10 m: 1 cm = 1 mrad. At 5 m: 1 cm = 2 mrad.', { a: 'end', w: 600 });
    s += t(10, 26, 3.4, 'KNOW YOUR LIMITS · 2 / 1.5 / 1 / 0.75 / 0.5 mrad', { w: 700 });
    [[20, 25], [15, 60], [10, 90], [7.5, 115], [5, 137]].forEach(([d, x]) => { s += circle(x, 45, d / 2, { fill: INK, sw: 0 }) + t(x, 60, 3, d / 10 + ' mrad', { a: 'middle' }); });
    s += t(10, 76, 3.4, 'ARRAY · six numbered plates for stages and transitions', { w: 700 });
    const arr = [['c', 20, 25, 98], ['r', 15, 70, 95], ['c', 10, 110, 102], ['r', 10, 145, 92], ['c', 15, 180, 100], ['c', 5, 196, 112]];
    arr.forEach(([ty, d, x, y], i) => { s += ty === 'c' ? circle(x, y, d / 2, { fill: INK, sw: 0 }) : rect(x - d / 2, y - d * 0.75, d, d * 1.5, { fill: INK, sw: 0 }); s += t(x, y + d * 0.8 + 6, 3.2, String(i + 1), { a: 'middle', w: 700 }); });
    s += t(10, 140, 3.4, 'TRANSITION PAIR · 2 mrad plates, 4 mrad apart', { w: 700 });
    s += circle(55, 160, 10, { fill: INK, sw: 0 }) + circle(95, 160, 10, { fill: INK, sw: 0 }) + line(55, 174, 95, 174, 0.3) + t(75, 179, 3, '4 mrad', { a: 'middle' });
    s += t(120, 140, 3.4, 'RANGING PLATE', { w: 700 }) + rect(130, 150, 20, 20, { fill: INK, sw: 0 })
      + t(156, 156, 3, 'Treat it as 50 cm wide:') + t(156, 161, 3, 'reads 2.0 mrad →') + t(156, 166, 3, '500 mm ÷ 2.0 = 250 m');
    s += t(10, 196, 3.4, 'WIND HOLD STRIP · aim point plus 0.5 mrad ticks', { w: 700 });
    s += line(20, 215, 190, 215, 0.4);
    for (let k = -16; k <= 16; k++) { const x = 105 + k * 5; s += line(x, 215 - (k % 2 ? 2 : 4), x, 215 + (k % 2 ? 2 : 4), 0.3); if (!(k % 2)) s += t(x, 225, 2.6, String(Math.abs(k / 2)), { a: 'middle' }); }
    s += diamond(105, 215, 3, { fill: INK }) + t(105, 233, 3, 'Partner calls a hold ("left 1.5"): hold off from the centre diamond and press.', { a: 'middle' });
    return s;
  },
  'sr-drypistol'() {
    let s = t(10, 12, 4.5, 'DRY-FIRE PISTOL · hang at 3 m', { disp: true, w: 700, ls: 0.4 });
    const row = (label, k, n, y) => {
      const bw = 150 * k, bh = 200 * k, hw = 100 * k, hh = 80 * k, gap = (190 - n * bw) / (n + 1);
      let r = t(10, y, 3.3, label, { w: 700 });
      for (let i = 0; i < n; i++) { const x = 10 + gap + i * (bw + gap), cx = x + bw / 2; r += rect(cx - hw / 2, y + 3, hw, hh, { sw: 0.6 }) + rect(x, y + 3 + hh + 2, bw, bh, { sw: 0.6 }); }
      return r;
    };
    s += row('Looks like 7 m', 3 / 7, 2, 20) + row('Looks like 15 m', 3 / 15, 3, 152) + row('Looks like 25 m', 3 / 25, 5, 220);
    s += t(200, 262, 2.8, 'Zones scaled from 15 × 20 cm body and 10 × 8 cm head. Dry fire only: no ammunition in the room.', { a: 'end' });
    return s;
  },
  'sr-plot'() {
    let s = t(10, 14, 4.5, 'SHOT PLOT & DATA CARD', { disp: true, w: 700, ls: 0.4 });
    const f = [['Date', 10, 45], ['Shooter', 55, 45], ['Gun', 100, 55], ['Ammo / lot', 155, 45], ['Distance m', 10, 45], ['Temp °C', 55, 45], ['Wind m/s · dir', 100, 55], ['Cold / clean bore', 155, 45]];
    f.forEach(([l, x, w], i) => { const y = i < 4 ? 20 : 34; s += rect(x, y, w, 12, { sw: 0.3 }) + t(x + 1.5, y + 3.6, 2.6, l, { fill: '#555' }); });
    for (let i = 0; i < 5; i++) { const cx = 25 + i * 40, cy = 75; s += circle(cx, cy, 17, { sw: 0.4 }) + circle(cx, cy, 8.5, { sw: 0.2, dash: true }) + line(cx - 18, cy, cx + 18, cy, 0.15) + line(cx, cy - 18, cx, cy + 18, 0.15) + t(cx, cy + 23, 3, 'Group ' + (i + 1), { a: 'middle' }); }
    const cols = [['#', 10, 8], ['Dist. m', 18, 18], ['Elev. mrad', 36, 20], ['Wind mrad', 56, 20], ['Call', 76, 30], ['Impact', 106, 30], ['Notes', 136, 64]];
    const y0 = 108; cols.forEach(([l, x, w]) => { s += rect(x, y0, w, 8, { sw: 0.3, fill: '#eee' }) + t(x + 1.5, y0 + 5.4, 3, l, { w: 700 }); });
    for (let r = 0; r < 15; r++) cols.forEach(([, x, w], ci) => { s += rect(x, y0 + 8 + r * 9.6, w, 9.6, { sw: 0.25 }) + (ci === 0 ? t(x + 4, y0 + 14.6 + r * 9.6, 3, String(r + 1), { a: 'middle' }) : ''); });
    return s;
  },
  'sr-log'() {
    let s = t(10, 14, 4.5, 'DRILL SCORE LOG', { disp: true, w: 700, ls: 0.4 }) + t(200, 14, 3, 'Shooter: ______________________', { a: 'end' });
    const cols = [['Date', 10, 22], ['Drill', 32, 52], ['L/D', 84, 10], ['Dist. m', 94, 14], ['Time s', 108, 16], ['Hits', 124, 14], ['Points', 138, 14], ['Pass', 152, 10], ['Notes', 162, 38]];
    const y0 = 22; cols.forEach(([l, x, w]) => { s += rect(x, y0, w, 8, { sw: 0.3, fill: '#eee' }) + t(x + 1.5, y0 + 5.4, 3, l, { w: 700 }); });
    for (let r = 0; r < 24; r++) cols.forEach(([, x, w]) => { s += rect(x, y0 + 8 + r * 9.6, w, 9.6, { sw: 0.25 }); });
    return s;
  },
};

/** Full A4 sheet as SVG markup (true size in mm). */
SD.printableSvg = (id, { cls = '' } = {}) => {
  const p = SD.printable(id); if (!p) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''} viewBox="0 0 210 297" width="210mm" height="297mm" role="img" aria-label="${SD.esc(p.name)}"><rect width="210" height="297" fill="#fff"/>${DRAW[id]()}${footer(p)}</svg>`;
};
SD.drillsUsing = id => SD.DRILLS.filter(d => d.printable === id);
})();
