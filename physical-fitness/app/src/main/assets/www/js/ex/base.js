/* SR Physical Fitness — exercise library: registry and pose builders.
   Every exercise: id (permanent, never reused), n name, g group, pat movement pattern (plan slot), equip (all needed),
   dose: reps | load (kg × reps) | time (s) | carry (kg × m) | dist (m), side: true = per side, lvl 1–3,
   prim/sec muscles, how (steps), cue, err (common mistakes), easy / hard (regression / progression ids or text),
   A/B poses (FIG) – the drawing animates between them. */
'use strict';
(function () {
  const EX = window.EX = {};
  const EXLIST = window.EXLIST = [];
  const GROUPS = window.EX_GROUPS = {
    bw: 'Bodyweight', kb: 'Kettlebell', band: 'Bands', sb: 'Sandbag', db: 'Dumbbells', grip: 'Grip', carry: 'Loaded carries',
    feet: 'Feet, ankles & shins', neck: 'Neck', power: 'Power & speed', mob: 'Mobility'
  };
  window.EX_PATTERNS = {
    hinge: 'Hip hinge', squat: 'Squat', lunge: 'Single leg', hpush: 'Horizontal push', vpush: 'Vertical push', hpull: 'Horizontal pull',
    vpull: 'Vertical pull', core: 'Core', rot: 'Rotation & anti-rotation', carry: 'Carry', power: 'Power', grip: 'Grip', arms: 'Arms',
    prehab: 'Shoulder health', neck: 'Neck', feet: 'Feet & ankles', cond: 'Conditioning', mob: 'Mobility'
  };
  window.X = function (id, n, g, pat, o) {
    if (EX[id]) throw new Error('duplicate exercise id ' + id);
    const e = Object.assign({ id, n, g, pat, equip: [], dose: 'reps', lvl: 1, prim: [], sec: [], how: [], cue: [], err: [] }, o);
    EX[id] = e; EXLIST.push(e); return e;
  };

  /* ---------- pose builders (side view faces right, floor y = 200) ---------- */
  const F = window.FIG;
  const C = o => JSON.parse(JSON.stringify(o));
  const base = o => Object.assign({ p: [100, 110], t: 0, ln: [0, 0], an: [0, 0] }, C(o || {}));
  const PB = window.PB = {};
  PB.fit = (P, c) => F.fit(P, c);
  /* standing, feet under the hips */
  PB.stand = (o) => F.fit(base(o));
  /* hip hinge / squat: pelvis at (x, y), torso t, both feet planted at ankle x fx */
  PB.legsTo = (o, fx = 102, bend) => { const P = base(o); P.ln = { to: [fx, 196] }; if (bend) P.ln.bend = bend; return P; };
  PB.hinge = (t, x, y, o = {}, fx = 102) => F.fit(Object.assign(PB.legsTo(o, fx), { t, p: [x, y] }));
  /* split stance (lunge): near (front) foot at fx, far (back) foot at bx on the toes */
  PB.split = (t, x, y, fx, bx, o = {}, backAnkleY = 189) => { const P = base(o); Object.assign(P, { t, p: [x, y], ln: { to: [fx, 196] }, lf: { to: [bx, backAnkleY] }, ff: 40 }); return P; };
  /* plank-type support on hands (or forearms/knees) and toes; the torso angle is found so both touch the floor */
  PB.plank = (an, o = {}, hand = 'haN', foot = 'toeN') => F.balance(v => Object.assign(base(o), { t: v, ln: o.ln || [-v, -v], an, fn: o.fn ?? (95 - v), hn: o.hn ?? 90 }), hand, foot, 45, 100);
  /* lying on the back, head to the left */
  PB.supine = (o = {}) => { const P = Object.assign(base({ t: -90, h: 0, p: [104, 189] }), C(o)); return o.contacts ? F.fit(P, o.contacts) : P; };
  /* lying face down, head to the right */
  PB.prone = (o = {}) => F.fit(Object.assign(base({ t: 90, ln: [-90, -90], an: [180, 180], fn: 150 }), o), o.contacts || ['pelvis', 'sh', 'knN']);
  /* kneeling (tall kneel), shins on the floor */
  PB.kneel = (o = {}) => F.fit(Object.assign(base({ ln: [0, -90], fn: 0 }), o), ['knN', 'knF']);
  /* hanging from a bar seen end-on at (bx, by) */
  PB.hang = (bx, by, o = {}) => {
    const P = base(Object.assign({ ln: [6, -6] }, o)); const t = P.t || 0, r = Math.PI / 180;
    if (!o.an) P.an = { to: [bx, by + 3], bend: 1 };
    if (!o.p) P.p = [bx - 1 - Math.sin(t * r) * 47, by + 57 + Math.cos(t * r) * 47];
    P.eq = [{ k: 'bar', at: [bx, by], back: true, fixed: true }].concat(P.eq || []);
    P.fist = true; P.hn = P.hn ?? 180;
    return P;
  };
  /* sitting on the floor */
  PB.sit = (o = {}) => F.fit(Object.assign(base({ t: -5, ln: [90, 90], fn: 170 }), o), o.contacts || ['pelvis', 'anN', 'anF']);
  /* front / back view standing */
  PB.front = (o = {}) => F.fit(Object.assign({ view: 'front', p: [100, 110], an: [-6, -3], af: [6, 3], ln: [0, 0], lf: [0, 0] }, C(o)));
  PB.back = (o = {}) => PB.front(Object.assign({ view: 'back' }, o));
  /* place hands relative to the shoulder after the pose is fitted: {an:[dx,dy,bend], af:[…]} */
  PB.arm = (P, o) => { const S = F.solve(P); const sh = S.front ? { an: S.shR, af: S.shL } : { an: S.sh, af: S.sh };
    for (const k of ['an', 'af']) if (o[k]) P[k] = { to: [sh[k][0] + o[k][0], sh[k][1] + o[k][1]], bend: o[k][2] || 1 };
    for (const k in o) if (k !== 'an' && k !== 'af') P[k] = o[k];
    return P; };
  PB.kb = (o) => Object.assign({ k: 'kb' }, o);
  PB.C = C;
})();
