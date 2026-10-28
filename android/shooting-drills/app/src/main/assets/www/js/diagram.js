/* Stoic Ranger - Shooting Drills — range setup diagram for a drill (top view, not to scale).
   The layout is read from the drill's own text (targets, distances, start position, movement, props), so new
   drills get a diagram without extra data. Drawn in currentColor; the accent marks the shooter and movement. */
'use strict';
(() => {
const has = (s, re) => re.test(s);

/** What the diagram shows, derived from the drill text. */
SD.setup = d => {
  const all = [d.name, d.target, d.distance, ...(d.steps || [])].join(' · ').toLowerCase();
  const tg = d.target.toLowerCase();
  // targets
  let n = 1, m = /(\d+)\s*(?:body|steel|plates?|dots|targets?|head|shapes)/.exec(tg);
  if (m) n = +m[1];
  else if (/numbered shapes/.test(tg)) n = 3;
  else if (/2 head zones|two/.test(tg)) n = 2;
  const kind = /none|^—|blank wall|any target|any dot/.test(tg) && !/dot sheet/.test(tg) ? (/wall/.test(tg) ? 'wall' : /none|^—/.test(tg) ? 'none' : 'paper')
    : /steel|plate|mrad|game/.test(tg) ? (d.weapon === 'rifle' ? 'steel' : 'plate')
    : /shape/.test(tg) ? 'shapes' : /dot|bull|grid|ladder|line|plot|card/.test(tg) ? 'paper' : /moving/.test(tg) ? 'mover' : 'zone';
  // distances: "3 / 7 / 15 m" = several stations; "100–300 m" = one range
  const dists = /\//.test(d.distance) ? d.distance.replace(/\s*m\b.*$/, '').split('/').map(s => s.trim()).filter(Boolean) : [];
  const multiTargets = d.weapon === 'rifle' && (dists.length > 1 || /at each distance|3 distances|ladder 100/.test(all));
  // start position
  const start = has(all, /back to the targets/) ? 'Back to targets'
    : has(all, /holster|draw/) && !has(d.name.toLowerCase(), /ready variant|from ready/) && d.motion === 'dynamic' ? 'Holster'
    : has(all, /seated|chair/) ? 'Seated' : has(all, /\bprone\b/) && !has(all, /standing.*prone|go prone|drop/) ? 'Prone'
    : has(all, /bench/) ? 'Bench' : has(all, /low ready|ready/) ? 'Low ready' : has(all, /standing/) ? 'Standing'
    : has(all, /sitting/) ? 'Sitting' : '';
  // movement
  const move = has(all, /two boxes|box a|two-box/) ? 'box'
    : has(all, /sideways|lateral/) ? 'lateral'
    : has(all, /walk forward.*back|advance/) ? 'advance'
    : has(all, /run 25|sprint|run /) ? 'run'
    : has(all, /90°/) ? 'turn90' : has(all, /back to the targets|turn/) && d.motion === 'dynamic' ? 'turn180'
    : has(all, /standing.*kneeling|kneeling.*prone|position change|positions?\b.*\d|go prone|drop to|hasty/) && d.motion === 'dynamic' ? 'positions'
    : has(all, /walk the range|walk quietly|walk to|walk between|between strings|walk /) ? 'walk' : '';
  const props = [];
  if (has(all, /barricade|cover|corner|doorway/)) props.push(has(all, /doorway|corner/) ? 'door' : 'barricade');
  if (has(all, /tripod/)) props.push('tripod');
  if (has(all, /sticks/)) props.push('sticks');
  if (has(all, /chair|seated/)) props.push('chair');
  if (has(all, /wall, tyre|prop|tyre|fence|roof/)) props.push('prop');
  if (has(all, /bench|rear bag|rest/) && d.weapon === 'rifle') props.push('bag');
  return { n, kind, dists, multiTargets, start, move, props, dryOnly: !d.live };
};

const W = 340, H = 232;
const tx = (x, y, s, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="${o.a || 'middle'}" class="${o.cls || 'tl'}"${o.w ? ` font-weight="${o.w}"` : ''}>${SD.esc(txt)}</text>`;
const arrow = (x1, y1, x2, y2, dashed) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ac" stroke-width="2.2" marker-end="url(#ah)"${dashed ? ' stroke-dasharray="5 4"' : ''}/>`;

function target(kind, x, y, s = 1, i = 0) {
  const k = s;
  switch (kind) {
    case 'steel': return i % 2 ? `<rect x="${x - 7 * k}" y="${y - 10 * k}" width="${14 * k}" height="${20 * k}" class="tf"/>` : `<circle cx="${x}" cy="${y}" r="${9 * k}" class="tf"/>`;
    case 'plate': return `<circle cx="${x}" cy="${y}" r="${7 * k}" class="tf"/><line x1="${x}" y1="${y + 7 * k}" x2="${x}" y2="${y + 14 * k}" class="ln"/>`;
    case 'shapes': return [`<circle cx="${x}" cy="${y}" r="${9 * k}" class="tf"/>`, `<rect x="${x - 8 * k}" y="${y - 8 * k}" width="${16 * k}" height="${16 * k}" class="tf"/>`, `<path d="M${x} ${y - 10 * k}L${x + 10 * k} ${y + 8 * k}L${x - 10 * k} ${y + 8 * k}Z" class="tf"/>`][i % 3];
    case 'paper': return `<rect x="${x - 10 * k}" y="${y - 14 * k}" width="${20 * k}" height="${28 * k}" class="tp"/><circle cx="${x}" cy="${y}" r="${4 * k}" class="tf"/>`;
    case 'mover': return `<rect x="${x - 9}" y="${y - 12}" width="18" height="24" class="tp"/><line x1="${x - 34}" y1="${y + 18}" x2="${x + 34}" y2="${y + 18}" class="ac" stroke-width="2" marker-end="url(#ah)"/>`;
    default: return `<rect x="${x - 5 * k}" y="${y - 20 * k}" width="${10 * k}" height="${8 * k}" class="tp"/><rect x="${x - 9 * k}" y="${y - 10 * k}" width="${18 * k}" height="${24 * k}" class="tp"/>`;
  }
}
function shooter(x, y, facing = 'up', label = '') {
  const tri = facing === 'down' ? `M${x - 6} ${y + 6}L${x + 6} ${y + 6}L${x} ${y + 15}Z` : facing === 'right' ? `M${x + 6} ${y - 6}L${x + 6} ${y + 6}L${x + 15} ${y}Z` : `M${x - 6} ${y - 6}L${x + 6} ${y - 6}L${x} ${y - 15}Z`;
  return `<circle cx="${x}" cy="${y}" r="9" class="sh"/><path d="${tri}" class="sh"/>` + (label ? tx(x, y + 24, 11, label, { w: 600 }) : '');
}
function prop(p, x, y) {
  switch (p) {
    case 'barricade': return `<rect x="${x - 4}" y="${y - 30}" width="8" height="34" class="pf"/>` + tx(x, y - 34, 9.5, 'cover');
    case 'door': return `<line x1="${x - 40}" y1="${y - 26}" x2="${x - 8}" y2="${y - 26}" class="wl"/><line x1="${x + 8}" y1="${y - 26}" x2="${x + 40}" y2="${y - 26}" class="wl"/>` + tx(x, y - 32, 9.5, 'doorway');
    case 'tripod': return `<path d="M${x} ${y - 18}L${x - 9} ${y - 4}M${x} ${y - 18}L${x + 9} ${y - 4}M${x} ${y - 18}L${x} ${y - 2}" class="ln"/>` + tx(x, y - 22, 9.5, 'tripod');
    case 'sticks': return `<path d="M${x - 8} ${y - 2}L${x + 8} ${y - 22}M${x + 8} ${y - 2}L${x - 8} ${y - 22}" class="ln"/>` + tx(x, y - 26, 9.5, 'sticks');
    case 'chair': return `<rect x="${x - 10}" y="${y - 2}" width="20" height="14" class="pf"/>`;
    case 'prop': return `<rect x="${x - 22}" y="${y - 26}" width="44" height="9" class="pf"/>` + tx(x, y - 30, 9.5, 'prop / wall');
    case 'bag': return `<rect x="${x - 12}" y="${y + 12}" width="24" height="7" rx="3" class="pf"/>`;
    default: return '';
  }
}

/** SVG markup of the drill's setup, or '' when the drill needs no range layout. */
SD.diagram = d => {
  const s = SD.setup(d);
  if (s.kind === 'none' && !s.move && !s.props.length) return '';
  const shY = 172, shX = W / 2;
  let g = '';
  // range floor: firing line and side limits
  g += `<line x1="18" y1="${shY + 12}" x2="${W - 18}" y2="${shY + 12}" class="fl"/>`;
  // targets
  const drawRow = (y, n, scale, label) => {
    const shown = Math.min(n, 6), span = Math.min(220, (shown - 1) * (s.move === 'lateral' || /wide|3 m apart/.test(d.target) ? 60 : 36));
    let r = '';
    for (let i = 0; i < shown; i++) r += target(s.kind === 'wall' ? 'paper' : s.kind, shX - span / 2 + (shown > 1 ? i * span / (shown - 1) : 0), y, scale, i);
    if (n > 6) r += tx(shX + span / 2 + 22, y + 4, 10, '×' + n, { w: 700 });
    if (label) r += tx(W - 22, y + 4, 10.5, label, { a: 'end', w: 600 });
    return r;
  };
  if (s.kind === 'wall') g += `<line x1="60" y1="${shY - 34}" x2="${W - 60}" y2="${shY - 34}" class="wl"/>` + tx(shX, shY - 40, 10.5, 'blank wall, 5 cm in front of the muzzle');
  else if (s.kind !== 'none') {
    if (s.multiTargets && s.dists.length > 1) s.dists.forEach((dist, i) => { g += drawRow(26 + i * (90 / (s.dists.length)), Math.max(1, Math.round(s.n / s.dists.length)) || 1, 0.8 - i * 0.1, dist + ' m'); });
    else g += drawRow(40, s.n, 1, '');
  }
  // distance dimension line (left side)
  if (s.kind !== 'none' && s.kind !== 'wall') {
    g += `<line x1="26" y1="34" x2="26" y2="${shY}" class="dm" marker-start="url(#ad)" marker-end="url(#ad)"/>`;
    const lbl = s.multiTargets ? d.distance : d.distance.replace(/\s*\(dry\)/, '');
    g += `<g transform="translate(20 ${(34 + shY) / 2}) rotate(-90)">${tx(0, 0, 11, lbl, { w: 700 })}</g>`;
  }
  // pistol stations at several distances: marks on the floor
  if (!s.multiTargets && s.dists.length > 1) {
    s.dists.forEach((dist, i) => { const y = shY - i * (110 / s.dists.length); if (i) g += `<line x1="${shX - 40}" y1="${y}" x2="${shX + 40}" y2="${y}" class="st"/>` + tx(shX + 50, y + 4, 10, dist + ' m', { a: 'start' }); });
    g += tx(shX + 50, shY + 4, 10, s.dists[0] + ' m', { a: 'start' });
    g += arrow(shX - 30, shY - 4, shX - 30, shY - 100 + 10, true);
  }
  // movement
  const facing = s.move === 'turn180' ? 'down' : s.move === 'turn90' ? 'right' : 'up';
  switch (s.move) {
    case 'box':
      g += `<rect x="${shX - 92}" y="${shY - 16}" width="32" height="32" class="bx"/><rect x="${shX + 60}" y="${shY - 16}" width="32" height="32" class="bx"/>`
        + tx(shX - 76, shY + 30, 11, 'A', { w: 700 }) + tx(shX + 76, shY + 30, 11, 'B', { w: 700 }) + arrow(shX - 52, shY, shX + 52, shY, true);
      g += shooter(shX - 76, shY, 'up');
      break;
    case 'lateral':
      g += `<rect x="${shX - 110}" y="${shY - 12}" width="220" height="24" class="bx"/>` + arrow(shX - 96, shY, shX + 96, shY) + shooter(shX - 96, shY, 'up') + tx(shX, shY + 28, 10.5, 'walk sideways, shoot while moving');
      break;
    case 'advance':
      g += arrow(shX + 26, shY, shX + 26, shY - 70) + arrow(shX + 44, shY - 70, shX + 44, shY) + shooter(shX, shY, 'up') + tx(shX + 58, shY - 34, 10.5, 'forward, then back', { a: 'start' });
      break;
    case 'run':
      g += `<path d="M${shX - 140} ${shY + 6} Q ${shX - 80} ${shY - 40} ${shX - 16} ${shY - 4}" class="ac" fill="none" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#ah)"/>` + tx(shX - 120, shY - 22, 10.5, 'run in') + shooter(shX, shY, 'up');
      break;
    case 'turn90': case 'turn180':
      g += shooter(shX, shY, facing) + `<path d="M${shX + 18} ${shY + 8} A 18 18 0 0 0 ${shX + 8} ${shY - 18}" class="ac" fill="none" stroke-width="2.2" marker-end="url(#ah)"/>` + tx(shX + 30, shY + 4, 10.5, s.move === 'turn90' ? 'turn 90°' : 'turn 180°', { a: 'start' });
      break;
    case 'positions': {
      const P = s.props.includes('barricade') ? ['pos 1', 'pos 2', 'pos 3', 'pos 4'] : ['stand', 'kneel', 'sit', 'prone'];
      g += shooter(shX, shY, 'up');
      g += P.map((p, i) => tx(shX - 105 + i * 70, shY + 30, 10, p, { w: 600 })).join('') + P.slice(1).map((p, i) => arrow(shX - 82 + i * 70, shY + 26, shX - 58 + i * 70, shY + 26)).join('');
      break;
    }
    case 'walk':
      g += shooter(shX, shY, 'up') + arrow(shX - 60, shY + 4, shX - 18, shY + 4, true) + tx(shX - 64, shY + 8, 10.5, 'walk', { a: 'end' });
      break;
    default:
      g += shooter(shX, shY, 'up');
  }
  // props next to the shooter
  s.props.forEach((p, i) => { g += prop(p, p === 'chair' || p === 'bag' ? (s.move === 'box' ? shX - 76 : shX) : shX + (i % 2 ? -1 : 1) * (p === 'door' ? 0 : 40), p === 'door' ? shY : shY); });
  if (s.start && s.move !== 'lateral' && s.move !== 'positions') g += tx(s.move === 'box' ? shX - 76 : shX, shY + (s.move === 'box' ? 46 : 32), 10.5, 'start: ' + s.start.toLowerCase(), { cls: 'tm' });
  if (s.dryOnly) g += tx(W - 18, H - 6, 10, 'dry fire', { a: 'end', cls: 'tm' });
  g += tx(18, H - 6, 9, 'not to scale', { a: 'start', cls: 'tm' });
  const defs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" class="acf"/></marker>
    <marker id="ad" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 2L5 8L10 2" class="dmh"/></marker></defs>`;
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Range setup for ${SD.esc(d.name)}">${defs}${g}</svg>`;
};
})();
