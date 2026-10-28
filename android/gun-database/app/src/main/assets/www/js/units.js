/* Stoic Ranger — units. Everything is stored metric; Settings › Units only changes what is shown and typed.
   kinds: dist m|yd, alt m|ft, len mm|in, drop cm|in, vel m/s|fps, wind m/s|mph, temp °C|°F, press hPa|inHg,
          mass g|gr, kg kg|lb, ang mrad|MOA, energy J|ft·lbf */
'use strict';
(() => {
const K = {
  dist:   { m: 'm',    i: 'yd',     f: 1 / 0.9144,  d: [0, 0] },
  alt:    { m: 'm',    i: 'ft',     f: 1 / 0.3048,  d: [0, 0] },
  len:    { m: 'mm',   i: 'in',     f: 1 / 25.4,    d: [1, 3] },
  drop:   { m: 'cm',   i: 'in',     f: 1 / 2.54,    d: [0, 1] },
  vel:    { m: 'm/s',  i: 'fps',    f: 1 / 0.3048,  d: [0, 0] },
  wind:   { m: 'm/s',  i: 'mph',    f: 2.2369363,   d: [1, 1] },
  temp:   { m: '°C',   i: '°F',     f: null,        d: [1, 0] },
  press:  { m: 'hPa',  i: 'inHg',   f: 1 / 33.8639, d: [0, 2] },
  mass:   { m: 'g',    i: 'gr',     f: 15.4323584,  d: [2, 1] },
  kg:     { m: 'kg',   i: 'lb',     f: 2.20462262,  d: [2, 2] },
  ang:    { m: 'mrad', i: 'MOA',    f: 3.43774677,  d: [2, 2] },   // 1 mrad = 3.438 MOA
  energy: { m: 'J',    i: 'ft·lbf', f: 0.737562149, d: [0, 0] },
};
const imp = () => !!(RB.db && RB.db.settings && RB.db.settings.units === 'imperial');
RB.U = {
  KINDS: K,
  imperial: imp,
  label: kind => K[kind] ? (imp() ? K[kind].i : K[kind].m) : '',
  /** metric -> shown unit */
  from(kind, v) {
    if (v === '' || v == null || isNaN(+v)) return null; v = +v;
    if (!imp() || !K[kind]) return v;
    return kind === 'temp' ? v * 9 / 5 + 32 : v * K[kind].f;
  },
  /** shown unit -> metric */
  to(kind, v) {
    if (v === '' || v == null || isNaN(+String(v).replace(',', '.'))) return null; v = +String(v).replace(',', '.');
    if (!imp() || !K[kind]) return v;
    return kind === 'temp' ? (v - 32) * 5 / 9 : v / K[kind].f;
  },
  dec: kind => K[kind] ? K[kind].d[imp() ? 1 : 0] : 2,
  /** formatted number in the shown unit ('' when empty); d overrides the decimals */
  num(kind, v, d) { const x = RB.U.from(kind, v); return x == null || !isFinite(x) ? '' : (+x).toFixed(d ?? RB.U.dec(kind)).replace(/^-(0(\.0+)?)$/, '$1'); },
  /** number + unit */
  fmt(kind, v, d) { const n = RB.U.num(kind, v, d); return n === '' ? '' : n + ' ' + RB.U.label(kind); },
  /** value for an <input>: shown unit, rounded so a round trip does not drift */
  inp(kind, v) { const x = RB.U.from(kind, v); return x == null ? (v ?? '') : String(+x.toFixed(Math.max(RB.U.dec(kind) + 1, 2))); },
  /** store from an <input>: metric, rounded to 6 significant decimals, as text like the sheets keep it */
  store(kind, s) { if (String(s).trim() === '') return ''; const m = RB.U.to(kind, s); return m == null ? String(s) : String(+m.toFixed(6)); },
  /** replace a metric unit at the end of a label */
  lab(text, kind) { return K[kind] ? text.replace(/\s*(mm|cm|m\/s|m|g|kg|mrad|°C|hPa|J)(\s|$).*$/, '') + ' ' + RB.U.label(kind) : text; },
};
})();
