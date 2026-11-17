/* SR Physical Fitness — exercise drawings.
   A figure is a small skeleton (pelvis, spine, neck, head, two arms, two legs) posed by angles or by hand/foot targets
   (two-bone inverse kinematics), then drawn as muscle shapes in the anatomy style of the muscle maps: red muscles,
   cream tendons, worked muscles in blue (main) and light blue (supporting). Side view by default (figure faces right),
   front or back view for movements that happen sideways. Poses interpolate smoothly, so every exercise animates.
   Pose fields (all optional except p):
     p:[x,y] pelvis · t torso angle (° from vertical, + = lean forward) · h head angle relative to the torso
     an/af (near/far arm), ln/lf (near/far leg): [a1,a2] absolute angles (0 = straight down, 90 = forward, 180 = up)
       or {to:[x,y], bend:±1}; legs take a third value / `foot` for the foot angle (90 = flat, pointing forward)
     front/back view: an = right arm on screen left … see FIG.front.
   Floor is y = 200. */
'use strict';
(function () {
  const FIG = window.FIG = {};
  const L = { spine: 52, neck: 8, head: 10, ua: 29, fa: 26, hand: 8, th: 44, sh: 42, foot: 15 };
  FIG.L = L;
  const rad = d => d * Math.PI / 180;
  const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))];          // 0 = down, 90 = +x, 180 = up
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = v => Math.hypot(v[0], v[1]);
  const norm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const f1 = n => (Math.round(n * 10) / 10).toString();
  const pt = p => f1(p[0]) + ',' + f1(p[1]);

  /* two-bone IK: root R, lengths a, b, target T, bend sign s → joint, end */
  function ik(R, a, b, T, s) {
    const v = sub(T, R); let d = len(v);
    const th = Math.atan2(v[1], v[0]);
    d = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.05, d));
    const c = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
    const al = Math.acos(c) * s;
    const J = [R[0] + a * Math.cos(th + al), R[1] + a * Math.sin(th + al)];
    const E = add(J, norm(sub(T, J)), b);
    return [J, E];
  }
  function limb(R, l1, l2, spec, bendDefault) {
    if (Array.isArray(spec)) { const J = add(R, dir(spec[0]), l1); return [J, add(J, dir(spec[1]), l2)]; }
    return ik(R, l1, l2, spec.to, spec.bend || bendDefault);
  }

  /* ---------- skeleton ---------- */
  FIG.solve = function (P) {
    const front = P.view === 'front' || P.view === 'back';
    const S = { P, front };
    const t = P.t || 0;
    const up = [Math.sin(rad(t)), -Math.cos(rad(t))];               // pelvis → neck
    S.up = up;
    S.pelvis = P.p.slice();
    S.neck = add(S.pelvis, up, L.spine);
    const ht = t + (P.h || 0);
    const hu = [Math.sin(rad(ht)), -Math.cos(rad(ht))];
    S.hu = hu;
    S.headBase = add(S.neck, hu, L.neck);
    S.head = add(S.headBase, hu, L.head * 0.9);
    if (!front) {
      S.sh = add(S.neck, up, -5);                                     // shoulder joint just below the neck base
      S.shF = add(S.sh, [-up[1], up[0]], 0); S.hipN = S.pelvis; S.hipF = S.pelvis;
    } else {
      const side = [-up[1], up[0]];                                   // screen-right of the spine
      S.shR = add(add(S.neck, up, -6), side, -17); S.shL = add(add(S.neck, up, -6), side, 17);
      S.hipR = add(S.pelvis, side, -9); S.hipL = add(S.pelvis, side, 9);
      S.side = side;
    }
    const arm = (R, spec, bend) => limb(R, L.ua, L.fa, spec || [0, 0], bend);
    const leg = (R, spec, bend) => limb(R, L.th, L.sh, spec || [0, 0], bend);
    if (!front) {
      [S.elN, S.haN] = arm(S.sh, P.an, 1); [S.elF, S.haF] = arm(S.sh, P.af || P.an, 1);
      [S.knN, S.anN] = leg(S.pelvis, P.ln, -1); [S.knF, S.anF] = leg(S.pelvis, P.lf || P.ln, -1);
    } else {
      [S.elN, S.haN] = arm(S.shR, P.an, -1); [S.elF, S.haF] = arm(S.shL, P.af, 1);
      [S.knN, S.anN] = leg(S.hipR, P.ln, 1); [S.knF, S.anF] = leg(S.hipL, P.lf, -1);
    }
    const footA = (k, an, kn, def) => {
      const v = P[k]; if (v != null) return v;
      if (front) return 0;
      if (def != null) return def;
      const sh = Math.atan2(an[0] - kn[0], an[1] - kn[1]) * 180 / Math.PI;   // shin angle in our convention
      return sh + 90 > 135 ? sh + 90 : 90;                              // flat on the floor unless the shin lies down
    };
    S.ftN = footA('fn', S.anN, S.knN); S.ftF = footA('ff', S.anF, S.knF, P.fn);
    const hand = (el, ha, a) => add(ha, a != null ? dir(a) : norm(sub(ha, el)), L.hand);
    S.hnN = hand(S.elN, S.haN, P.hn); S.hnF = hand(S.elF, S.haF, P.hf);
    S.toeN = add(S.anN, dir(S.ftN), L.foot); S.toeF = add(S.anF, dir(S.ftF), L.foot);
    return S;
  };

  /* interpolate two poses (numbers, arrays, IK targets) */
  FIG.lerpPose = function (A, B, t) {
    if (!B) return A;
    const o = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const a = A[k], b = B[k];
      if (a == null) { o[k] = b; continue; } if (b == null) { o[k] = a; continue; }
      if (typeof a === 'number' && typeof b === 'number') o[k] = lerp(a, b, t);
      else if (Array.isArray(a) && Array.isArray(b) && typeof a[0] === 'number') o[k] = a.map((v, i) => lerp(v, b[i] ?? v, t));
      else if (a && b && a.to && b.to) o[k] = { to: [lerp(a.to[0], b.to[0], t), lerp(a.to[1], b.to[1], t)], bend: t < 0.5 ? a.bend : b.bend };
      else if (a && b && typeof a === 'object' && !Array.isArray(a) && typeof b === 'object' && !Array.isArray(b) && !a.to && !b.to) o[k] = FIG.lerpPose(a, b, t);
      else o[k] = t < 0.5 ? a : b;
    }
    return o;
  };

  /* move a whole pose (pelvis, IK targets, absolute equipment points) */
  function shiftPose(P, dx, dy) {
    const mv = a => [a[0] + dx, a[1] + dy];
    P.p = mv(P.p);
    for (const k of ['an', 'af', 'ln', 'lf']) if (P[k] && P[k].to) P[k] = Object.assign({}, P[k], { to: mv(P[k].to) });
    P.eq = (P.eq || []).map(e => { if (e.fixed) return e; e = Object.assign({}, e); for (const k of ['at', 'c', 'to', 'from']) if (Array.isArray(e[k])) e[k] = mv(e[k]); return e; });
    return P;
  }
  FIG.shiftPose = shiftPose;
  /* put a pose on the floor: the lowest contact point touches y = 200 (contacts default to feet) */
  const CONTACT = { anN: 196, anF: 196, toeN: 198.3, toeF: 198.3, hnN: 198, hnF: 198, haN: 196.5, haF: 196.5, knN: 194.5, knF: 194.5,
    elN: 195.5, elF: 195.5, pelvis: 190, neck: 192, head: 189.5, sh: 192.5, headBase: 192 };
  FIG.fit = function (P, contacts) {
    const S = FIG.solve(P); let dy = Infinity;
    for (const c of contacts || ['anN', 'anF', 'toeN', 'toeF']) { const p = S[c]; if (p) dy = Math.min(dy, CONTACT[c] - p[1]); }
    return shiftPose(P, 0, dy);
  };
  /* find a parameter value so that two contacts touch the floor together (bisection) */
  FIG.balance = function (build, a, b, lo, hi) {
    const err = v => { const P = FIG.fit(build(v), [a, b]); const S = FIG.solve(P); return (CONTACT[a] - S[a][1]) - (CONTACT[b] - S[b][1]); };
    let el = err(lo);
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, em = err(m); if ((em > 0) === (el > 0)) { lo = m; el = em; } else hi = m; }
    return FIG.fit(build((lo + hi) / 2), [a, b]);
  };

  /* ---------- muscle-shaped segments ---------- */
  // widths at u = 0, .25, .5, .75, 1 on the front (anterior) and back side of each segment
  const W = {
    thigh: { f: [8.4, 9.4, 8.8, 7.2, 5.6], b: [8.6, 8.6, 8.0, 6.6, 5.2] },
    shin: { f: [5.0, 4.6, 4.0, 3.4, 2.9], b: [5.2, 7.2, 6.0, 3.9, 2.8] },
    ua: { f: [5.8, 6.0, 6.3, 5.2, 4.2], b: [6.4, 6.6, 6.0, 4.9, 4.0] },
    fa: { f: [4.7, 5.0, 4.4, 3.5, 2.9], b: [4.6, 4.7, 4.1, 3.3, 2.7] },
    torso: { f: [11.5, 10.2, 10.8, 13.4, 8.5], b: [12.5, 10.4, 12.2, 13.6, 9.5] },
    neck: { f: [4.6, 4.3, 4.2, 4.2, 4.4], b: [5.4, 4.8, 4.4, 4.2, 4.4] },
  };
  // muscle regions on a segment: [key, side 'f'|'b', u0, u1, w0, w1] (w = fraction of the half width, from the centre line)
  const REG = {
    thigh: [['hipflex', 'f', -0.02, 0.16, 0, 1], ['quads', 'f', 0.14, 0.94, 0, 1], ['glutes', 'b', -0.04, 0.3, 0, 1.18], ['hamstrings', 'b', 0.3, 0.93, 0, 1]],
    shin: [['calves', 'b', 0.05, 0.62, 0, 1], ['shin', 'f', 0.08, 0.72, 0.25, 1]],
    ua: [['shoulders', 'f', -0.06, 0.32, 0, 1.05], ['shoulders', 'b', -0.06, 0.32, 0, 1.05], ['biceps', 'f', 0.32, 0.9, 0, 1], ['triceps', 'b', 0.3, 0.9, 0, 1]],
    fa: [['forearms', 'f', 0.02, 0.78, 0, 1], ['forearms', 'b', 0.02, 0.78, 0, 1]],
    torso: [['abs', 'f', 0.1, 0.56, 0.42, 1], ['obliques', 'f', 0.14, 0.56, -0.25, 0.42], ['chest', 'f', 0.58, 0.93, 0.05, 1.02],
      ['lowerback', 'b', 0.08, 0.46, 0.35, 1], ['lats', 'b', 0.42, 0.8, -0.2, 0.62], ['upperback', 'b', 0.56, 0.88, 0.62, 1.02], ['traps', 'b', 0.84, 1.02, 0.2, 1]],
    neck: [['neck', 'f', 0, 1, 0, 1], ['traps', 'b', 0, 0.85, 0, 1]],
  };
  const MAP_KEY = { shin: 'calves' };          // shin muscles count as lower leg on the map
  function frameOf(A, B, kind) {
    const d = norm(sub(B, A)), l = len(sub(B, A));
    const n = kind === 'torso' || kind === 'neck' ? [-d[1], d[0]] : [d[1], -d[0]];   // anterior normal
    return { A, d, l, n };
  }
  const interp = (arr, u) => { u = Math.max(0, Math.min(1, u)) * 4; const i = Math.min(3, Math.floor(u)); return lerp(arr[i], arr[i + 1], u - i); };
  function edge(F, w, side, u0, u1, k0, k1, steps = 8) {    // points along a band between fractions k0..k1 of the half width
    const out = [];
    const sgn = side === 'f' ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const u = lerp(u0, u1, i / steps);
      const hw = interp(side === 'f' ? w.f : w.b, u);
      out.push([u, hw * sgn]);
    }
    const P = (u, off) => add(add(F.A, F.d, u * F.l), F.n, off);
    const env = i => Math.max(0.12, Math.pow(Math.sin(Math.PI * i / steps), 0.55));   // muscle belly: tapers to the tendons
    const outer = out.map(([u, hw], i) => P(u, hw * (k0 + (k1 - k0) * env(i))));
    const inner = out.map(([u, hw]) => P(u, hw * k0)).reverse();
    return outer.concat(inner);
  }
  function smoothClosed(pts) {                                  // Catmull-Rom → cubic Bézier, closed
    const n = pts.length; let s = 'M' + pt(pts[0]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      s += 'C' + pt(c1) + ' ' + pt(c2) + ' ' + pt(p2);
    }
    return s + 'Z';
  }
  function outline(F, w) {
    const N = 10, fr = [], bk = [];
    for (let i = 0; i <= N; i++) { const u = i / N; fr.push(add(add(F.A, F.d, u * F.l), F.n, interp(w.f, u))); bk.push(add(add(F.A, F.d, u * F.l), F.n, -interp(w.b, u))); }
    // rounded ends
    const capB = add(F.B || add(F.A, F.d, F.l), F.d, Math.min(interp(w.f, 1), interp(w.b, 1)) * 0.75);
    const capA = add(F.A, F.d, -Math.min(interp(w.f, 0), interp(w.b, 0)) * 0.7);
    return smoothClosed([capA].concat(fr, [capB], bk.reverse()));
  }
  function cls(key, M, far) {
    const k = MAP_KEY[key] || key;
    let c = M.prim && M.prim.includes(k) ? 'mp' : M.sec && M.sec.includes(k) ? 'ms' : 'mm';
    return c + (far ? ' far' : '');
  }
  let BASES = null;                                   // while a group is drawn, base shapes are collected here
  const baseP = d => { if (BASES) { BASES.push(d); return ''; } return `<path class="mb" d="${d}"/>`; };
  function segment(A, B, kind, M, far, extraW) {
    const F = frameOf(A, B, kind); F.B = B;
    const w = extraW || W[kind];
    const base = outline(F, w);
    let s = '';
    if (BASES) BASES.push(base); else s += `<path class="mb${far ? ' far' : ''}" d="${base}"/>`;
    for (const [key, side, u0, u1, k0, k1] of REG[kind] || []) {
      s += `<path class="${cls(key, M, far)}" d="${smoothClosed(edge(F, w, side, u0, u1, k0, k1))}"/>`;
    }
    // fibre lines along the segment
    const fib = [];
    for (const side of ['f', 'b']) for (const k of [0.35, 0.7]) {
      const p0 = add(add(F.A, F.d, 0.18 * F.l), F.n, (side === 'f' ? 1 : -1) * interp(side === 'f' ? w.f : w.b, 0.18) * k);
      const p1 = add(add(F.A, F.d, 0.8 * F.l), F.n, (side === 'f' ? 1 : -1) * interp(side === 'f' ? w.f : w.b, 0.8) * k);
      const pm = add(add(F.A, F.d, 0.5 * F.l), F.n, (side === 'f' ? 1 : -1) * interp(side === 'f' ? w.f : w.b, 0.5) * k * 1.05);
      fib.push(`M${pt(p0)}Q${pt(pm)} ${pt(p1)}`);
    }
    s += `<path class="fib" d="${fib.join('')}"/>`;
    return s;
  }
  const circle = (c, r, k) => `<circle class="${k}" cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(r)}"/>`;
  function ell(c, rx, ry, angDeg, k) { return `<ellipse class="${k}" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(angDeg)} ${f1(c[0])} ${f1(c[1])})"/>`; }
  const angOf = v => Math.atan2(v[1], v[0]) * 180 / Math.PI;

  function foot(an, toe, far) {
    const d = norm(sub(toe, an)), n = [d[1], -d[0]];
    const heel = add(an, d, -4.5), sole = 2.6;
    const p = [add(heel, n, -sole), add(heel, n, 3.5), add(an, n, 4.2), add(add(an, d, 7), n, 3.2), add(toe, n, 1.6), add(toe, d, 1.5), add(toe, n, -sole), add(add(an, d, 6), n, -sole - 0.4)];
    return `<path class="tendon${far ? ' far' : ''}" d="${smoothClosed(p)}"/>`;
  }
  function hand(ha, hn, far, fist) {
    const d = norm(sub(hn, ha)), n = [d[1], -d[0]];
    const p = fist ? [add(ha, n, 3.2), add(add(ha, d, 5.5), n, 3.6), add(add(ha, d, 7), n, 0), add(add(ha, d, 5.5), n, -3.6), add(ha, n, -3.2)]
      : [add(ha, n, 3), add(add(ha, d, 5), n, 3.4), add(hn, n, 1.6), add(hn, d, 0.8), add(hn, n, -1.6), add(add(ha, d, 5), n, -3.2), add(ha, n, -3)];
    return `<path class="tendon${far ? ' far' : ''}" d="${smoothClosed(p)}"/>`;
  }
  function head(S, M, front, back) {
    const c = S.head, u = S.hu, n = [-u[1], u[0]];           // n = face direction (side view)
    const r = L.head;
    if (front) {
      let s = ell(c, r * 0.86, r, angOf(u) + 90, back ? 'hair' : 'mm face');
      if (!back) s += `<path class="fib" d="M${pt(add(add(c, n, -3.6), u, 1.5))}h0.1M${pt(add(add(c, n, 3.6), u, 1.5))}h0.1M${pt(add(c, u, -1))}l0 3M${pt(add(add(c, u, -5), n, -2.5))}L${pt(add(add(c, u, -5), n, 2.5))}"/>`;
      return s;
    }
    const nose = add(add(c, n, r * 0.98), u, -0.5);
    const chin = add(add(c, n, r * 0.62), u, -r * 0.85);
    const pts = [add(c, n, -r), add(add(c, n, -r * 0.7), u, r * 0.75), add(c, u, r), add(add(c, n, r * 0.75), u, r * 0.7),
      add(add(c, n, r * 0.92), u, r * 0.15), add(nose, n, 1.6), add(add(c, n, r * 0.9), u, -r * 0.35), chin, add(add(c, n, -r * 0.1), u, -r * 0.95), add(add(c, n, -r * 0.75), u, -r * 0.65)];
    let s = `<path class="mm face" d="${smoothClosed(pts)}"/>`;
    s += `<path class="hair" d="${smoothClosed([add(add(c, n, -r * 1.03), u, -0.2), add(add(c, n, -r * 0.75), u, r * 0.74), add(add(c, n, 0), u, r * 1.04), add(add(c, n, r * 0.55), u, r * 0.86), add(add(c, n, r * 0.15), u, r * 0.66), add(add(c, n, -r * 0.45), u, r * 0.4), add(add(c, n, -r * 0.8), u, -r * 0.05)])}"/>`;
    s += ell(add(add(c, n, -r * 0.18), u, -0.5), 2.2, 3, angOf(u) + 90, 'tendon');
    s += `<circle class="eye" cx="${f1(add(add(c, n, r * 0.6), u, r * 0.18)[0])}" cy="${f1(add(add(c, n, r * 0.6), u, r * 0.18)[1])}" r="0.9"/>`;
    return s;
  }

  /* ---------- equipment ---------- */
  const EQ = {};
  EQ.kb = (o, S) => {                       // kettlebell held at a hand; a = direction of the bell from the handle
    const H = S[o.at || 'hnN'] || S.hnN; const a = o.a ?? 0; const d = dir(a), n = [d[1], -d[0]];
    const h = add(H, d, -1), c = add(H, d, 9.5 + (o.big ? 1.5 : 0)); const r = 7.2 + (o.big ? 1.2 : 0);
    const pts = [add(h, n, -4.6), add(add(h, d, -3.8), n, -3.6), add(add(h, d, -4.6), n, 0), add(add(h, d, -3.8), n, 3.6), add(h, n, 4.6)];
    return `<path class="kbh" d="M${pt(add(c, n, -4.8))}L${pt(pts[0])}C${pt(pts[1])} ${pt(pts[3])} ${pt(pts[4])}L${pt(add(c, n, 4.8))}"/>` +
      `<circle class="iron" cx="${f1(c[0])}" cy="${f1(c[1])}" r="${r}"/><path class="ironhl" d="M${pt(add(add(c, n, -r * 0.55), d, -r * 0.3))}A${r * 0.7} ${r * 0.7} 0 0 1 ${pt(add(add(c, n, r * 0.1), d, -r * 0.62))}"/>` +
      (o.kg ? `<text class="kbt" x="${f1(c[0])}" y="${f1(c[1] + 2.2)}">${o.kg}</text>` : '');
  };
  EQ.db = (o, S) => {                       // dumbbell end-on at a hand
    const H = S[o.at || 'hnN'] || S.hnN; const c = add(H, norm(sub(H, S[o.at === 'hnF' ? 'haF' : 'haN'])), -3);
    return `<circle class="iron" cx="${f1(c[0])}" cy="${f1(c[1])}" r="6.6"/><circle class="ironhl2" cx="${f1(c[0])}" cy="${f1(c[1])}" r="3.6"/>`;
  };
  EQ.dbs = (o, S) => {                      // dumbbell seen from the side (axis in the picture plane), held at a hand along angle a
    const H = S[o.at || 'hnN']; const d = dir(o.a ?? 90), n = [d[1], -d[0]]; const hw = 9;
    const p1 = add(H, d, -hw), p2 = add(H, d, hw);
    const plate = (p) => { const q = [add(add(p, d, -2.6), n, -6), add(add(p, d, 2.6), n, -6), add(add(p, d, 2.6), n, 6), add(add(p, d, -2.6), n, 6)]; return `<path class="iron" d="M${q.map(pt).join('L')}Z"/>`; };
    return `<path class="bar" d="M${pt(p1)}L${pt(p2)}"/>` + plate(p1) + plate(p2);
  };
  EQ.sb = (o, S) => {                       // sandbag: centre c (point or anchor + offset), length, angle
    let c = Array.isArray(o.c) ? o.c : S[o.c || 'hnN'];
    if (o.off) c = add(c, o.off);
    const a = o.a ?? 90, d = dir(a), n = [d[1], -d[0]]; const hl = (o.len || 30) / 2, r = o.r || 8.5;
    const A = add(c, d, -hl), B = add(c, d, hl);
    const body = [add(A, n, r), add(add(A, d, hl * 0.5), n, r * 1.06), add(add(c, d, 0), n, r * 1.08), add(add(B, d, -hl * 0.5), n, r * 1.06), add(B, n, r), add(B, d, r * 0.8), add(B, n, -r), add(add(c, d, 0), n, -r * 1.08), add(A, n, -r), add(A, d, -r * 0.8)];
    let s = `<path class="sand" d="${smoothClosed(body)}"/>`;
    for (const k of [-0.45, 0.45]) { const q = add(c, d, hl * k * 1.4); s += `<path class="strap" d="M${pt(add(q, n, -r * 1.05))}L${pt(add(q, n, r * 1.05))}"/>`; }
    return s;
  };
  EQ.band = (o, S) => {                     // resistance band from a point to an anchor
    const p1 = Array.isArray(o.from) ? o.from : S[o.from || 'hnN'], p2 = Array.isArray(o.to) ? o.to : S[o.to];
    let s = `<path class="band" d="M${pt(p1)}L${pt(p2)}"/>`;
    if (Array.isArray(o.to) && o.anchor !== false) s += `<rect class="anchor" x="${f1(o.to[0] - 3)}" y="${f1(o.to[1] - 3)}" width="6" height="6" rx="1.5"/>`;
    return s;
  };
  EQ.bar = (o) => `<path class="post" d="M${f1(o.at[0])},${f1(o.at[1] - 3)}V${f1(o.at[1] - 26)}"/><circle class="iron" cx="${f1(o.at[0])}" cy="${f1(o.at[1])}" r="3.4"/>`;
  EQ.hbar = (o) => `<path class="bar" d="M${f1(o.at[0] - (o.w || 40))},${f1(o.at[1])}H${f1(o.at[0] + (o.w || 40))}"/>`;
  EQ.dip = (o) => `<path class="post" d="M${f1(o.at[0])},${f1(o.at[1] + 3)}V200"/><circle class="iron" cx="${f1(o.at[0])}" cy="${f1(o.at[1])}" r="3.4"/>`;
  EQ.bench = (o) => { const [x, y] = o.at, w = o.w || 60, h = o.h || 42; return `<rect class="bench" x="${f1(x - w / 2)}" y="${f1(y)}" width="${w}" height="6" rx="2"/><path class="post" d="M${f1(x - w / 2 + 8)},${f1(y + 6)}V200M${f1(x + w / 2 - 8)},${f1(y + 6)}V200"/>`; };
  EQ.box = (o) => { const [x, y] = o.at, w = o.w || 46; return `<rect class="box" x="${f1(x - w / 2)}" y="${f1(y)}" width="${w}" height="${f1(200 - y)}" rx="2"/>`; };
  EQ.wall = (o) => `<rect class="wall" x="${f1(o.x - 4)}" y="${f1(o.y ?? 40)}" width="8" height="${f1(200 - (o.y ?? 40))}"/>`;
  EQ.mat = (o) => `<rect class="mat" x="${f1(o.x ?? 20)}" y="196.5" width="${f1(o.w ?? 160)}" height="3.5" rx="1.5"/>`;
  EQ.step = (o) => { const [x, y] = o.at, w = o.w || 34; return `<rect class="box" x="${f1(x - w / 2)}" y="${f1(y)}" width="${w}" height="${f1(200 - y)}" rx="1.5"/>`; };
  EQ.ball = (o, S) => { const c = Array.isArray(o.c) ? o.c : add(S[o.c || 'hnN'], o.off || [0, 0]); return `<circle class="ball" cx="${f1(c[0])}" cy="${f1(c[1])}" r="${o.r || 9}"/><path class="ballseam" d="M${f1(c[0] - (o.r || 9))},${f1(c[1])}Q${f1(c[0])},${f1(c[1] + 4)} ${f1(c[0] + (o.r || 9))},${f1(c[1])}"/>`; };
  EQ.towel = (o, S) => { const a = S.hnN, b = o.at; return `<path class="towel" d="M${pt(b)}L${pt(a)}"/>`; };
  EQ.gripper = (o, S) => { const H = S[o.at || 'hnN'], d = dir(o.a ?? 0), n = [d[1], -d[0]]; const sq = o.sq ?? 0.3; return `<path class="bar thin" d="M${pt(add(H, n, -3))}L${pt(add(add(H, d, 14), n, -3 - 4 * (1 - sq)))}M${pt(add(H, n, 3))}L${pt(add(add(H, d, 14), n, 3 + 4 * (1 - sq)))}"/>`; };
  EQ.roller = (o, S) => { const c = add(S.hnN, [0, 0]); return `<path class="bar" d="M${pt(add(c, [-16, 0]))}L${pt(add(c, [16, 0]))}"/><path class="towel thin" d="M${pt(c)}L${pt(add(c, [0, o.drop || 40]))}"/><circle class="iron" cx="${f1(c[0])}" cy="${f1(c[1] + (o.drop || 40) + 5)}" r="5"/>`; };
  EQ.arrow = (o) => { const [a, b] = [o.from, o.to]; const d = norm(sub(b, a)), n = [d[1], -d[0]]; return `<path class="mv" d="M${pt(a)}L${pt(b)}M${pt(add(add(b, d, -5), n, 3.5))}L${pt(b)}L${pt(add(add(b, d, -5), n, -3.5))}"/>`; };
  FIG.EQ = EQ;

  /* a group of body parts gets one joint outline: all base shapes stroked, then filled, then the muscle details */
  function group(fn, far, extra = []) {
    const prev = BASES; BASES = extra.slice();
    const detail = fn();
    const bases = BASES; BASES = prev;
    const f = far ? ' far' : '';
    return `<g class="grp${f}"><path class="mbo" d="${bases.join('')}"/><path class="mbf" d="${bases.join('')}"/>${detail}</g>`;
  }
  /* ---------- drawing ---------- */
  function drawSide(S, M, opts) {
    const P = S.P;
    const farArm = group(() => segment(S.sh, S.elF, 'ua', M) + segment(S.elF, S.haF, 'fa', M), true) + hand(S.haF, S.hnF, true, P.fist);
    const farLeg = group(() => segment(S.pelvis, S.knF, 'thigh', M) + segment(S.knF, S.anF, 'shin', M), true)
      + ell(add(S.knF, frameOf(S.pelvis, S.knF, 'thigh').n, 4.6), 2.6, 3.4, angOf(sub(S.knF, S.pelvis)), 'tendon far') + foot(S.anF, S.toeF, true);
    const thF = frameOf(S.pelvis, S.knN, 'thigh');
    const body = group(() => segment(S.neck, S.headBase, 'neck', M) + segment(S.pelvis, S.neck, 'torso', M)
      + segment(S.pelvis, S.knN, 'thigh', M) + segment(S.knN, S.anN, 'shin', M), false)
      + ell(add(S.knN, thF.n, 4.7), 2.7, 3.6, angOf(sub(S.knN, S.pelvis)), 'tendon') + foot(S.anN, S.toeN, false);
    const arm = group(() => segment(S.sh, S.elN, 'ua', M) + segment(S.elN, S.haN, 'fa', M), false)
      + ell(add(S.elN, frameOf(S.sh, S.elN, 'ua').n, -4.2), 2.2, 2.8, angOf(sub(S.elN, S.sh)), 'tendon') + hand(S.haN, S.hnN, false, P.fist);
    const hd = head(S, M, false);
    const eq = (list) => (list || []).map(e => { const f = EQ[e.k]; return f ? f(e, S) : ''; }).join('');
    const eqBack = eq((P.eq || []).filter(e => e.back)), eqFront = eq((P.eq || []).filter(e => !e.back && !e.mid)), eqMid = eq((P.eq || []).filter(e => e.mid));
    return eqBack + farArm + farLeg + body + hd + eqMid + arm + eqFront;
  }

  /* front / back view: torso drawn wide, muscles of that side */
  function drawFront(S, M, back) {
    const P = S.P;
    const up = S.up, sd = S.side;
    const T = (x, y) => add(add(S.pelvis, sd, x), up, y);       // torso-local: x right, y up from the pelvis
    const tp = arr => arr.map(([x, y]) => T(x, y));
    const sil = tp([[-13, -4], [-15, 8], [-12.5, 22], [-15, 36], [-19, 46], [-12, 52], [-5, 55], [5, 55], [12, 52], [19, 46], [15, 36], [12.5, 22], [15, 8], [13, -4], [6, -8], [0, -6], [-6, -8]]);
    let s = '';
    const limbSet = (sh, el, ha, hn, hip, kn, an, toe, far) => {
      let o = segment(hip, kn, 'thigh', M, false, back ? { f: W.thigh.b, b: W.thigh.b } : null) + segment(kn, an, 'shin', M, false);
      return o;
    };
    // legs (both visible): front view shows quads + adductor strip, back view hamstrings + glutes
    const leg = (hip, kn, an, toe, inner) => {
      const F = frameOf(hip, kn, 'thigh');
      const w = { f: [8.6, 9, 8.2, 6.8, 5.4], b: [8.6, 9, 8.2, 6.8, 5.4] };
      let o = baseP(outline(F, w));
      const outSide = inner > 0 ? 'b' : 'f';
      if (!back) {
        o += `<path class="${cls('quads', M)}" d="${smoothClosed(edge(F, w, outSide, 0.08, 0.92, -0.35, 1))}"/>`;
        o += `<path class="${cls('adductors', M)}" d="${smoothClosed(edge(F, w, outSide === 'f' ? 'b' : 'f', 0.04, 0.6, 0.35, 1))}"/>`;
      } else {
        o += `<path class="${cls('hamstrings', M)}" d="${smoothClosed(edge(F, w, 'f', 0.28, 0.92, 0, 1))}"/><path class="${cls('hamstrings', M)}" d="${smoothClosed(edge(F, w, 'b', 0.28, 0.92, 0, 1))}"/>`;
      }
      const F2 = frameOf(kn, an, 'shin'); const w2 = { f: [5, 5.6, 4.6, 3.4, 2.8], b: [5, 5.6, 4.6, 3.4, 2.8] };
      o += baseP(outline(F2, w2)) + `<path class="${cls('calves', M)}" d="${smoothClosed(edge(F2, w2, 'f', 0.06, 0.66, -0.6, 0.9))}"/>`;
      o += ell(kn, 3.4, 4, angOf(sub(kn, hip)) + 90, 'tendon') + foot2(an, toe);
      return o;
    };
    const foot2 = (an, toe) => ell(add(an, [0, 2]), 4.2, 3, 0, 'tendon');
    const arm = (sh, el, ha, hn) => {
      const F = frameOf(sh, el, 'ua'); const w = { f: [6.2, 6.2, 6, 5, 4.2], b: [6.2, 6.2, 6, 5, 4.2] };
      let o = baseP(outline(F, w));
      o += `<path class="${cls(back ? 'triceps' : 'biceps', M)}" d="${smoothClosed(edge(F, w, 'f', 0.3, 0.9, -0.7, 0.8))}"/>`;
      const F2 = frameOf(el, ha, 'fa'); const w2 = { f: [4.8, 5, 4.3, 3.4, 2.8], b: [4.8, 5, 4.3, 3.4, 2.8] };
      o += baseP(outline(F2, w2)) + `<path class="${cls('forearms', M)}" d="${smoothClosed(edge(F2, w2, 'f', 0.04, 0.78, -0.8, 0.8))}"/>`;
      o += hand(ha, hn, false, P.fist) + ell(el, 2.6, 3, 0, 'tendon');
      o += ell(add(sh, up, 0.5), 6.4, 5.6, angOf(up), cls('shoulders', M) + ' cap');
      return o;
    };
    s += group(() => leg(S.hipR, S.knN, S.anN, S.toeN, -1) + leg(S.hipL, S.knF, S.anF, S.toeF, 1), false, [smoothClosed(sil)]);
    const reg = (key, arr) => `<path class="${cls(key, M)}" d="${smoothClosed(tp(arr))}"/>`;
    const mir = arr => arr.map(([x, y]) => [-x, y]);
    if (!back) {
      const pec = [[-1.5, 36.5], [-14, 37], [-17.5, 43], [-12, 50], [-1.5, 49]];
      s += reg('chest', pec) + reg('chest', mir(pec));
      for (let r = 0; r < 4; r++) { const y0 = 33 - r * 7.6, h = r === 3 ? 9 : 6.6; const bx = [[-1, y0], [-6.6, y0 + 0.2], [-6.8, y0 - h], [-1, y0 - h]]; s += reg('abs', bx) + reg('abs', mir(bx)); }
      const obl = [[-7.6, 34], [-13, 33], [-12, 22], [-13.5, 9], [-8, 6]];
      s += reg('obliques', obl) + reg('obliques', mir(obl));
      const nk = [[-1.5, 55], [-4.5, 55], [-3, 63], [-1, 63]]; s += reg('neck', nk) + reg('neck', mir(nk));
      const tr = [[-5, 54.5], [-15, 50.5], [-7, 52]]; s += reg('traps', tr) + reg('traps', mir(tr));
      const hf = [[-6, 2], [-12.5, 6], [-9, -3], [-4, -4]]; s += reg('hipflex', hf) + reg('hipflex', mir(hf));
    } else {
      s += reg('traps', [[0, 63], [-4, 56], [-16, 50.5], [-6, 44], [-1, 28], [1, 28], [6, 44], [16, 50.5], [4, 56]]);
      const ub = [[-2.5, 46], [-9, 47], [-13, 41], [-8, 36], [-2.5, 38]]; s += reg('upperback', ub) + reg('upperback', mir(ub));
      const lat = [[-4, 34], [-14, 42], [-16, 33], [-12.5, 22], [-5, 14]]; s += reg('lats', lat) + reg('lats', mir(lat));
      const lb = [[-1, 26], [-5, 24], [-6, 6], [-1, 4]]; s += reg('lowerback', lb) + reg('lowerback', mir(lb));
      const gl = [[-0.8, 2], [-12, 4], [-15.5, -6], [-10, -15], [-1, -12]]; s += reg('glutes', gl) + reg('glutes', mir(gl));
    }
    s += `<path class="fib" d="M${pt(T(0, 52))}L${pt(T(0, back ? 0 : 6))}"/>`;
    s += group(() => arm(S.shR, S.elN, S.haN, S.hnN), false) + group(() => arm(S.shL, S.elF, S.haF, S.hnF), false);
    s += head(S, M, true, back);
    const eq = (list) => (list || []).map(e => { const f = EQ[e.k]; return f ? f(e, S) : ''; }).join('');
    return eq((P.eq || []).filter(e => e.back)) + s + eq((P.eq || []).filter(e => !e.back));
  }

  FIG.drawPose = function (P, M = {}) {
    const S = FIG.solve(P);
    let body = S.front ? drawFront(S, M, P.view === 'back') : drawSide(S, M);
    if (P.flip) body = `<g transform="translate(200 0) scale(-1 1)">${body}</g>`;
    return { svg: body, S };
  };

  /* bounding box of a pose (joints + head + equipment hints) */
  function bbox(P) {
    const S = FIG.solve(P); const pts = [S.head, S.pelvis, S.neck, S.knN, S.knF, S.anN, S.anF, S.toeN, S.toeF, S.hnN, S.hnF, S.elN, S.elF, S.haN, S.haF];
    (P.eq || []).forEach(e => { if (Array.isArray(e.at)) pts.push(e.at); if (Array.isArray(e.c)) pts.push(e.c); if (e.k === 'kb') pts.push(add(S[e.at || 'hnN'], dir(e.a ?? 0), 18)); if (e.k === 'sb') { const c = Array.isArray(e.c) ? e.c : S[e.c || 'hnN']; pts.push(add(c, e.off || [0, 0])); } if (Array.isArray(e.to)) pts.push(e.to); if (e.k === 'roller') pts.push(add(S.hnN, [0, (e.drop || 40) + 12])); });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let p of pts) { if (!p) continue; if (P.flip) p = [200 - p[0], p[1]]; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }
  FIG.viewBox = function (ex) {
    if (ex._vb) return ex._vb;
    const poses = [ex.A, ex.B].filter(Boolean);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const P of poses) { const b = bbox(P); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    x0 -= 10; x1 += 10; y0 -= 10; y1 = Math.max(y1 + 8, 206);
    const w = x1 - x0, h = y1 - y0, sz = Math.max(w, h, 110);
    const cx = (x0 + x1) / 2;
    return (ex._vb = [cx - sz / 2, y1 - sz, sz, sz].map(v => Math.round(v)).join(' '));
  };

  FIG.svg = function (ex, t = 0, o = {}) {
    const P = FIG.lerpPose(ex.A, ex.B, t);
    if (o.kg != null) (P.eq || []).forEach(e => { if (e.k === 'kb') e.kg = o.kg; });
    const M = { prim: ex.prim || [], sec: ex.sec || [] };
    const { svg } = FIG.drawPose(P, M);
    const vb = FIG.viewBox(ex); const [vx, vy, vw] = vb.split(' ').map(Number);
    const floor = ex.noFloor ? '' : `<path class="floor" d="M${vx - 10},200.5H${vx + vw + 10}"/>`;
    return `<svg class="fig" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${(o.label || ex.name || 'Exercise').replace(/"/g, '')}">${floor}${svg}</svg>`;
  };

  /* ---------- muscle map (front and back, anatomical) ---------- */
  FIG.MUSCLE_NAMES = { neck: 'Neck', traps: 'Trapezius', shoulders: 'Shoulders (deltoids)', chest: 'Chest (pectorals)', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
    abs: 'Abdominals', obliques: 'Obliques', upperback: 'Upper back (rhomboids)', lats: 'Lats', lowerback: 'Lower back', glutes: 'Glutes', hipflex: 'Hip flexors',
    adductors: 'Adductors', quads: 'Quadriceps', hamstrings: 'Hamstrings', calves: 'Calves and shins' };
})();
