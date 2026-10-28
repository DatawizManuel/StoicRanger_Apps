/* Stoic Ranger — point-mass exterior ballistics for the dope cards. Offline, SI units inside.
   Drag: standard G1 / G7 reference tables (Mach, Cd), the same public data used by JBM, the BRL tables and
   py-ballisticcalc. Retardation a = (rho/rho0) * Cd(M) * K / BC * v^2 with BC in lb/in^2 (as published),
   K = 2.08551e-4 / 0.3048 per metre. Wind drift from the lag-time rule: drift = W * (TOF - x / V0). */
'use strict';
(() => {
const RAW = {
G1: [0,0.2629,0.05,0.2558,0.1,0.2487,0.15,0.2413,0.2,0.2344,0.25,0.2278,0.3,0.2214,0.35,0.2155,0.4,0.2104,0.45,0.2061,0.5,0.2032,0.55,0.202,0.6,0.2034,0.7,0.2165,0.725,0.223,0.75,0.2313,0.775,0.2417,0.8,0.2546,0.825,0.2706,0.85,0.2901,0.875,0.3136,0.9,0.3415,0.925,0.3734,0.95,0.4084,0.975,0.4448,1,0.4805,1.025,0.5136,1.05,0.5427,1.075,0.5677,1.1,0.5883,1.125,0.6053,1.15,0.6191,1.2,0.6393,1.25,0.6518,1.3,0.6589,1.35,0.6621,1.4,0.6625,1.45,0.6607,1.5,0.6573,1.55,0.6528,1.6,0.6474,1.65,0.6413,1.7,0.6347,1.75,0.628,1.8,0.621,1.85,0.6141,1.9,0.6072,1.95,0.6003,2,0.5934,2.05,0.5867,2.1,0.5804,2.15,0.5743,2.2,0.5685,2.25,0.563,2.3,0.5577,2.35,0.5527,2.4,0.5481,2.45,0.5438,2.5,0.5397,2.6,0.5325,2.7,0.5264,2.8,0.5211,2.9,0.5168,3,0.5133,3.1,0.5105,3.2,0.5084,3.3,0.5067,3.4,0.5054,3.5,0.504,3.6,0.503,3.7,0.5022,3.8,0.5016,3.9,0.501,4,0.5006,4.2,0.4998,4.4,0.4995,4.6,0.4992,4.8,0.499,5,0.4988],
G7: [0,0.1198,0.05,0.1197,0.1,0.1196,0.15,0.1194,0.2,0.1193,0.25,0.1194,0.3,0.1194,0.35,0.1194,0.4,0.1193,0.45,0.1193,0.5,0.1194,0.55,0.1193,0.6,0.1194,0.65,0.1197,0.7,0.1202,0.725,0.1207,0.75,0.1215,0.775,0.1226,0.8,0.1242,0.825,0.1266,0.85,0.1306,0.875,0.1368,0.9,0.1464,0.925,0.166,0.95,0.2054,0.975,0.2993,1,0.3803,1.025,0.4015,1.05,0.4043,1.075,0.4034,1.1,0.4014,1.125,0.3987,1.15,0.3955,1.2,0.3884,1.25,0.381,1.3,0.3732,1.35,0.3657,1.4,0.358,1.5,0.344,1.55,0.3376,1.6,0.3315,1.65,0.326,1.7,0.3209,1.75,0.316,1.8,0.3117,1.85,0.3078,1.9,0.3042,1.95,0.301,2,0.298,2.05,0.2951,2.1,0.2922,2.15,0.2892,2.2,0.2864,2.25,0.2835,2.3,0.2807,2.35,0.2779,2.4,0.2752,2.45,0.2725,2.5,0.2697,2.55,0.267,2.6,0.2643,2.65,0.2615,2.7,0.2588,2.75,0.2561,2.8,0.2533,2.85,0.2506,2.9,0.2479,2.95,0.2451,3,0.2424,3.1,0.2368,3.2,0.2313,3.3,0.2258,3.4,0.2205,3.5,0.2154,3.6,0.2106,3.7,0.206,3.8,0.2017,3.9,0.1975,4,0.1935,4.2,0.1861,4.4,0.1793,4.6,0.173,4.8,0.1672,5,0.1618]
};
const TAB = {};
Object.entries(RAW).forEach(([k, a]) => { const m = [], c = []; for (let i = 0; i < a.length; i += 2) { m.push(a[i]); c.push(a[i + 1]); } TAB[k] = { m, c }; });
const cd = (model, M) => {
  const t = TAB[model] || TAB.G7, m = t.m, c = t.c;
  if (M <= m[0]) return c[0]; if (M >= m[m.length - 1]) return c[c.length - 1];
  let lo = 0, hi = m.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m[mid] > M) hi = mid; else lo = mid; }
  return c[lo] + (c[hi] - c[lo]) * (M - m[lo]) / (m[hi] - m[lo]);
};
const K = 2.08551e-4 / 0.3048, RHO0 = 1.2250, G = 9.80665;

/** Air from temperature °C, station pressure hPa, humidity %. Missing pressure: ICAO standard at the altitude (m). */
RB.air = ({ temp, press, hum, alt } = {}) => {
  const T = (temp ?? 15) + 273.15, h = Math.max(0, Math.min(100, hum ?? 50)) / 100;
  const p = (press ?? 1013.25 * Math.pow(1 - 2.25577e-5 * (alt || 0), 5.25588)) * 100;
  const es = 6.1078 * Math.pow(10, 7.5 * (T - 273.15) / (T - 35.85)) * 100, pv = h * es;   // Tetens, Pa
  const rho = (p - pv) / (287.058 * T) + pv / (461.495 * T);
  return { rho, c: Math.sqrt(1.4 * 287.058 * T), T, p: p / 100 };
};

/** Fly one trajectory. o: { v0 m/s, bc, model 'G1'|'G7', sightMm, zeroM, air, angle (rad, optional), maxM, stepM }
    Returns rows every stepM: { x, y (m, above bore line), t, v } */
function fly(o, angle, stopX) {
  const kk = (o.air.rho / RHO0) * K / o.bc, c = o.air.c;
  let x = 0, y = 0, vx = o.v0 * Math.cos(angle), vy = o.v0 * Math.sin(angle), t = 0;
  const acc = (vx, vy) => { const v = Math.hypot(vx, vy), d = kk * cd(o.model, v / c) * v; return [-d * vx, -d * vy - G]; };
  const out = []; let next = 0; const dt = 0.0005;
  while (x <= stopX + 1e-9 && t < 10) {
    // RK4
    const [a1x, a1y] = acc(vx, vy);
    const [a2x, a2y] = acc(vx + a1x * dt / 2, vy + a1y * dt / 2);
    const [a3x, a3y] = acc(vx + a2x * dt / 2, vy + a2y * dt / 2);
    const [a4x, a4y] = acc(vx + a3x * dt, vy + a3y * dt);
    const nvx = vx + dt / 6 * (a1x + 2 * a2x + 2 * a3x + a4x), nvy = vy + dt / 6 * (a1y + 2 * a2y + 2 * a3y + a4y);
    const nx = x + dt / 6 * (vx + 2 * (vx + a1x * dt / 2) + 2 * (vx + a2x * dt / 2) + (vx + a3x * dt));
    const ny = y + dt / 6 * (vy + 2 * (vy + a1y * dt / 2) + 2 * (vy + a2y * dt / 2) + (vy + a3y * dt));
    while (next <= nx && next <= stopX + 1e-9) { const f = (next - x) / (nx - x || 1);
      out.push({ x: next, y: y + (ny - y) * f, t: t + dt * f, v: Math.hypot(vx + (nvx - vx) * f, vy + (nvy - vy) * f) }); next += o.stepM; }
    x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
    if (vx < 50) break;
  }
  return out;
}
/** Launch angle that puts the bullet on the line of sight at the zero distance. */
function zeroAngle(o) {
  const h = o.sightMm / 1000, z = o.zeroM;
  const yAt = a => { const r = fly(Object.assign({}, o, { stepM: z }), a, z); const p = r[r.length - 1]; return p && p.x >= z - 1e-6 ? p.y - h : -1; };
  let a0 = 0, a1 = 0.005, f0 = yAt(a0), f1 = yAt(a1);
  for (let i = 0; i < 30 && Math.abs(f1) > 1e-6; i++) { const a2 = a1 - f1 * (a1 - a0) / (f1 - f0 || 1e-12); a0 = a1; f0 = f1; a1 = a2; f1 = yAt(a1); }
  return a1;
}
/** Full dope table. Returns { rows: [{ x, dropM (vs line of sight, + = above), elevMrad (dial up), windMrad (per 1 unit wind, hold into wind), driftM, v, mach, e (J), t }], angle, transonicM, subsonicM } */
RB.dope = o => {
  const angle = zeroAngle(o);
  const rows = fly(o, angle, o.maxM).map(r => {
    const drop = r.y - o.sightMm / 1000, drift = o.windMs * (r.t - r.x / o.v0);
    return { x: r.x, dropM: drop, elevMrad: r.x ? -drop / r.x * 1000 : 0, driftM: drift, windMrad: r.x ? drift / r.x * 1000 : 0, v: r.v, mach: r.v / o.air.c, e: 0.5 * (o.massG / 1000) * r.v * r.v, t: r.t };
  });
  const tr = rows.find(r => r.mach < 1.2), sub = rows.find(r => r.mach < 1.0);
  return { rows, angle, transonicM: tr ? tr.x : null, subsonicM: sub ? sub.x : null };
};
/** Elevation (mrad) needed at one distance for the given inputs. */
RB.elevAt = (o, x) => { const d = RB.dope(Object.assign({}, o, { stepM: x, maxM: x })); const r = d.rows[d.rows.length - 1]; return r && Math.abs(r.x - x) < 1e-6 ? r.elevMrad : null; };
})();
