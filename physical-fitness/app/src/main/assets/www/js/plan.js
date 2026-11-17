/* SR Physical Fitness — plan engine: assessment → starting levels, 12-week blocks, sessions that fit the time budget,
   prescriptions per week, analysis of what was logged, proposal for the next block. Pure functions on PF.db. */
'use strict';
(function () {
  const P = PF.plan = {};
  const { clone, clamp, addDays, parseD, iso, today } = PF;

  /* ---------- phases of a 12-week block ---------- */
  P.PHASES = [{ n: 'Foundation', w: [1, 2, 3, 4] }, { n: 'Build', w: [5, 6, 7, 8] }, { n: 'Strength', w: [9, 10, 11] }, { n: 'Test', w: [12] }];
  P.phaseOf = w => w <= 4 ? 0 : w <= 8 ? 1 : w <= 11 ? 2 : 3;
  P.isDeload = w => w === 4 || w === 8;

  /* ---------- session templates: movement slots in priority order (first four are the main lifts) ---------- */
  P.SESS = {
    A: { n: 'Strength A', slots: ['squat', 'hpush', 'hpull', 'core', 'power', 'carry', 'feet', 'prehab'] },
    B: { n: 'Strength B', slots: ['hinge', 'vpush', 'vpull', 'lunge', 'rot', 'grip', 'neck', 'arms'] },
    C: { n: 'Power & conditioning', slots: ['power', 'hinge', 'hpush', 'vpull', 'core', 'carry', 'cond', 'prehab'] }
  };
  P.MAIN = 4;
  /* preferred exercises per slot, best first; anything else of that pattern follows */
  P.PREF = {
    hinge: ['kb_swing', 'kb_deadlift', 'db_rdl', 'sb_deadlift', 'kb_sldl', 'band_goodmorning', 'glutebridge1', 'superman', 'nordic'],
    squat: ['goblet', 'kb_frontsquat', 'db_goblet', 'sb_hugsquat', 'sb_zercher', 'squat'],
    lunge: ['lunge', 'split_squat', 'db_lunge', 'sb_lunge', 'db_stepup', 'pistol'],
    hpush: ['pushup', 'kb_floorpress', 'db_press_flat', 'band_chestpress', 'pushup_incline', 'pushup_decline'],
    vpush: ['kb_press', 'db_press', 'sb_press', 'band_press', 'pushup_pike', 'dip', 'kb_pushpress'],
    hpull: ['kb_row', 'invrow', 'db_row', 'sb_row', 'band_row', 'kb_gorilla', 'db_renegade'],
    vpull: ['pullup', 'chinup', 'band_pullup', 'band_pulldown'],
    core: ['situp', 'plank', 'hollow', 'legraise', 'kb_tgu'],
    rot: ['band_pallof', 'band_woodchop', 'kb_windmill', 'sb_rotlunge'],
    carry: ['grip_farmer', 'grip_suitcase', 'kb_rackcarry', 'sb_hugcarry', 'carry_overhead', 'db_farmer'],
    power: ['kb_clean', 'pow_broad', 'sb_clean', 'kb_snatch', 'pow_boxjump', 'pow_throw', 'sb_shoulder', 'sb_g2o', 'sb_toss', 'pow_sprint'],
    grip: ['grip_hang', 'grip_horns', 'grip_towel', 'grip_bottomsup', 'grip_pinch', 'grip_gripper', 'grip_roller', 'grip_fingerext', 'grip_hang1'],
    arms: ['db_curl', 'band_curl', 'band_pushdown', 'db_ohext', 'db_latraise', 'grip_wristcurl', 'db_pullover'],
    prehab: ['band_facepull', 'band_pullapart', 'band_extrot', 'kb_halo', 'db_reardelt', 'band_latwalk', 'band_monster', 'mob_wallslide'],
    neck: ['neck_iso', 'neck_tuck', 'neck_bandext', 'db_shrug'],
    feet: ['feet_tib', 'calfraise1', 'feet_calf', 'feet_balance', 'feet_short', 'feet_circles'],
    cond: ['burpee', 'bearcrawl', 'climber', 'kb_complex', 'db_thruster', 'sb_drag', 'sb_getup']
  };
  P.candidates = pat => { const pref = P.PREF[pat] || []; const rest = EXLIST.filter(e => e.pat === pat && !pref.includes(e.id) && e.g !== 'mob').map(e => e.id); return pref.filter(id => EX[id]).concat(rest); };

  /* ---------- equipment ---------- */
  P.EQUIP_NAMES = { kb: 'Kettlebells', db: 'Dumbbells', sb: 'Sandbags', bar: 'Pull-up bar', band: 'Long loop bands', mini: 'Mini band', bench: 'Bench, box or sturdy chair', gripper: 'Hand gripper', roller: 'Wrist roller' };
  P.has = (eq, k) => {
    if (k === 'kb' || k === 'db' || k === 'sb') return (eq[k] || []).length > 0;
    if (k === 'band') return (eq.bands || []).length > 0;
    return !!eq[k];
  };
  P.available = (eq, id) => (EX[id].equip || []).every(k => P.has(eq, k));
  P.loadType = ex => (ex.equip || []).find(k => k === 'kb' || k === 'db' || k === 'sb') || null;
  P.weights = (eq, type) => (eq[type] || []).slice().sort((a, b) => a - b);
  /* nearest weight the user owns, moved `step` weights up or down */
  P.pick = (eq, type, kg, step = 0) => {
    const w = P.weights(eq, type); if (!w.length) return null;
    let i = 0, best = Infinity; w.forEach((v, j) => { const d = Math.abs(v - kg); if (d < best - 1e-9) { best = d; i = j; } });
    return w[clamp(i + step, 0, w.length - 1)];
  };

  /* ---------- muscle groups the user can leave out (per block; settings change asks: this block or new blocks) ---------- */
  P.MGROUPS = [
    { k: 'chest', n: 'Chest', m: ['chest'] }, { k: 'back', n: 'Back', m: ['upperback', 'lats'] }, { k: 'shoulders', n: 'Shoulders', m: ['shoulders'] },
    { k: 'arms', n: 'Arms', m: ['biceps', 'triceps'] }, { k: 'forearms', n: 'Forearms & grip', m: ['forearms'] }, { k: 'core', n: 'Core', m: ['abs', 'obliques', 'lowerback'] },
    { k: 'hips', n: 'Glutes & hips', m: ['glutes', 'hipflex', 'adductors'] }, { k: 'thighs', n: 'Thighs', m: ['quads', 'hamstrings'] },
    { k: 'calves', n: 'Calves & shins', m: ['calves', 'shins'] }, { k: 'neck', n: 'Neck & traps', m: ['neck', 'traps'] }
  ];
  P.MG_NAME = k => (P.MGROUPS.find(g => g.k === k) || { n: k }).n;
  /* an exercise is left out when at least half of its main muscles belong to groups that are not targeted */
  P.skipEx = (id, skip) => {
    if (!skip || !skip.length || !EX[id]) return false;
    const off = new Set(P.MGROUPS.filter(g => skip.includes(g.k)).flatMap(g => g.m)); const pr = EX[id].prim || [];
    return pr.length > 0 && pr.filter(m => off.has(m)).length * 2 >= pr.length;
  };
  P.targetText = skip => !skip || !skip.length ? 'All muscle groups' : 'All except ' + skip.map(P.MG_NAME).join(', ');

  /* ---------- assessment ---------- */
  P.TESTS = [
    { k: 'swingKg', ex: 'kb_swing', t: 'Kettlebell swing', how: 'Heaviest bell you can swing for 15 clean reps to chest height.', type: 'kg' },
    { k: 'gobletKg', ex: 'goblet', t: 'Goblet squat', how: 'Heaviest bell for 10 deep reps with good form.', type: 'kg' },
    { k: 'pressKg', ex: 'kb_press', t: 'Overhead press', how: 'Heaviest bell for 5 strict reps per arm.', type: 'kg' },
    { k: 'pullup', ex: 'pullup', t: 'Pull-ups', how: "Max strict reps from a dead hang. Enter 0 if you can't do one yet.", type: 'n', u: 'reps' },
    { k: 'pushup', ex: 'pushup', t: 'Push-ups', how: "Max reps with the chest to a fist's height, body straight.", type: 'n', u: 'reps' },
    { k: 'situp', ex: 'situp', t: 'Sit-ups', how: 'As many as you can in 1 minute.', type: 'n', u: 'reps' },
    { k: 'hang', ex: 'grip_hang', t: 'Dead hang', how: 'Hang from the bar with straight arms as long as you can.', type: 'n', u: 's' },
    { k: 'toe', t: 'Toe touch', how: 'Stand, legs straight, reach down. Fingertips to floor: minus = short of the floor, plus = past it.', type: 'n', u: 'cm', mob: true },
    { k: 'squat', ex: 'mob_deepsquat', t: 'Deep squat hold', how: 'Can you hold a deep bodyweight squat, heels down, for 30 s?', type: 'yn', mob: true },
    { k: 'reachR', t: 'Shoulder reach, right hand up', how: 'Right hand over the shoulder, left hand up the back. Gap between the fingertips (0 if they touch).', type: 'n', u: 'cm', mob: true },
    { k: 'reachL', t: 'Shoulder reach, left hand up', how: 'Same with the left hand on top.', type: 'n', u: 'cm', mob: true }
  ];
  P.DEF_ASSESS = { swingKg: 16, gobletKg: 12, pressKg: 10, pullup: 3, pushup: 15, situp: 25, hang: 30, toe: 0, squat: 'yes', reachR: 0, reachL: 0 };
  /* which test drives which pattern, and the share of that load */
  const REF = { hinge: ['swingKg', 1], vpull: ['pressKg', 1], squat: ['gobletKg', 1], vpush: ['pressKg', 1], hpull: ['gobletKg', 1], hpush: ['pressKg', 1.25], lunge: ['gobletKg', 0.5],
    carry: ['swingKg', 1], power: ['pressKg', 1.15], arms: ['pressKg', 0.6], prehab: ['pressKg', 0.6], rot: ['pressKg', 0.8], grip: ['swingKg', 0.8],
    core: ['pressKg', 0.8], neck: ['swingKg', 1], cond: ['pressKg', 0.9], mob: ['pressKg', 0.6], feet: ['pressKg', 1] };
  const MAXREF = { hpush: 'pushup', vpull: 'pullup', core: 'situp' };
  P.baseFrom = a => {
    const b = {};
    for (const pat in REF) b[pat] = { kg: Math.round(((+a[REF[pat][0]] || 8) * REF[pat][1]) * 2) / 2 };
    for (const pat in MAXREF) b[pat].max = Math.max(0, +a[MAXREF[pat]] || 0);
    b.grip.sec = Math.max(10, +a.hang || 20);
    return b;
  };
  /* starting levels of a plan; gaps (older or hand-edited data) are filled with moderate defaults */
  P.base = pl => { const d = P.baseFrom(P.DEF_ASSESS), b = pl.base || {}; const o = {}; for (const k in d) o[k] = Object.assign({}, d[k], b[k] || {}); return o; };
  P.mobFlags = a => {
    const f = []; if (!a) return f;
    if (+a.toe < 0) f.push({ area: 'back', t: `Toe touch ${a.toe} cm` });
    if (a.squat === 'no') f.push({ area: 'hips', t: 'Deep squat hold under 30 s' });
    if (Math.max(+a.reachL || 0, +a.reachR || 0) > 5) f.push({ area: 'shoulders', t: `Shoulder reach gap ${Math.max(+a.reachL || 0, +a.reachR || 0)} cm` });
    return f;
  };
  P.lastAssessment = () => PF.db.assessments.slice().sort((x, y) => (x.date + x.at).localeCompare(y.date + y.at)).pop() || null;

  /* ---------- plans ---------- */
  P.current = () => {
    const pl = PF.db.plans.filter(p => p.status !== 'archived').sort((a, b) => (a.block - b.block) || a.start.localeCompare(b.start));
    return pl.pop() || null;
  };
  P.byId = id => PF.db.plans.find(p => p.id === id);
  P.cfgAt = (pl, w) => { let c = pl.cfgHist[0].cfg; for (const h of pl.cfgHist) if (h.from <= w) c = h.cfg; return c; };
  P.weekNo = (pl, d = today()) => Math.floor((d - parseD(pl.start)) / 864e5 / 7) + 1;     // < 1 not started, > 12 finished
  P.curW = pl => clamp(P.weekNo(pl), 1, 12);
  P.planEnd = pl => addDays(parseD(pl.start), 83);
  P.sessionKeys = (pl, w) => { const n = P.cfgAt(pl, w).sessions; return Array.from({ length: n }, (_, i) => 'ABC'[i % 3]); };
  P.sessDate = (pl, w, i) => {
    const c = P.cfgAt(pl, w); const days = c.days.slice().sort((a, b) => PF.DAYS.indexOf(a) - PF.DAYS.indexOf(b));
    const day = days[i] != null ? PF.DAYS.indexOf(days[i]) : Math.min(6, i * 2);
    return addDays(parseD(pl.start), (w - 1) * 7 + day);
  };
  P.allowedLvl = (pl, pat) => {
    const b = pl.base[pat] || {}; let l = pl.block >= 2 ? 3 : 2;
    return l;
  };
  /* exercise for a slot: swaps first, then preference list filtered by equipment and level */
  P.exFor = (pl, w, key, slot, occ) => {
    const sk = key + '.' + slot;
    let sw = null; for (const s of (pl.swaps || [])) if (s.slot === sk && s.from <= w && EX[s.ex]) sw = s.ex;
    const cfg = P.cfgAt(pl, w), eq = cfg.eq;
    if (sw && P.available(eq, sw) && !P.skipEx(sw, cfg.skip)) return sw;
    const list = P.options(pl, w, slot);
    if (!list.length) return null;
    const n = Math.min(3, list.length);
    return list[((occ || 0) + (pl.block - 1)) % n];
  };
  P.options = (pl, w, slot) => {
    const cfg = P.cfgAt(pl, w), eq = cfg.eq; const b = P.base(pl);
    return P.candidates(slot).filter(id => {
      const e = EX[id]; if (!P.available(eq, id)) return false;
      if (P.skipEx(id, cfg.skip)) return false;
      if (e.lvl > P.allowedLvl(pl, slot)) return false;
      if ((id === 'pullup' || id === 'chinup') && (b.vpull.max || 0) < 3) return false;
      if (id === 'legraise' && (b.vpull.max || 0) < 1) return false;
      if (id === 'pushup_decline' && (b.hpush.max || 0) < 12) return false;
      if (id === 'pushup' && (b.hpush.max || 0) < 5 && P.available(eq, 'pushup_incline')) return false;
      return true;
    });
  };

  /* ---------- prescription ---------- */
  const SETS = [3, 4, 5, 2], REPS = [10, 8, 5, 5], BWPCT = [0.5, 0.6, 0.7, 0.5];
  P.rx = (pl, w, key, slot, id, idx) => {
    const ex = EX[id], cfg = P.cfgAt(pl, w), ph = P.phaseOf(w), wi = P.PHASES[ph].w.indexOf(w), deload = P.isDeload(w);
    const acc = idx >= P.MAIN; const B = P.base(pl); const b = B[slot] || B[ex.pat] || {};
    let sets = acc ? 2 : SETS[ph], reps = null, kg = null, sec = null, m = null, note = '', band = null;
    const lt = P.loadType(ex);
    if (ex.dose === 'load' || ex.dose === 'carry') {
      if (lt) kg = P.pick(cfg.eq, lt, b.kg || 10, (ph === 1 ? (wi >= 2 ? 1 : 0) : ph === 2 ? 1 : 0) - (acc ? 1 : 0));
      if (ex.dose === 'carry') { m = acc ? 30 : [30, 40, 40, 30][ph]; sets = acc ? 2 : [3, 3, 4, 2][ph]; }
      else reps = acc ? 12 : REPS[ph] + (ph < 2 ? Math.min(wi, 2) : 0);
      if (ex.pat === 'power' || ex.pat === 'hinge' && id.includes('swing')) { reps = acc ? 10 : [12, 15, 10, 10][ph]; sets = acc ? 3 : [5, 6, 8, 3][ph]; }
      if (ex.pat === 'power' && !id.includes('swing')) { reps = 5; sets = acc ? 3 : [4, 5, 5, 3][ph]; }
    } else if (ex.dose === 'time') {
      sec = ex.pat === 'grip' ? clamp(Math.round((b.sec || 30) * [0.6, 0.7, 0.8, 1][ph]) + wi * 5, 10, 120) : clamp(25 + ph * 10 + wi * 5, 20, 75);
    } else if (ex.dose === 'dist') {
      m = id === 'pow_sprint' ? 20 : 15 + ph * 5; sets = acc ? 3 : 4;
    } else {                                            // reps (bodyweight or band)
      if (b.max != null && MAXREF[ex.pat] && (EX[id].equip || []).length === 0 || ['pullup', 'chinup', 'pushup', 'situp'].includes(id)) {
        const max = b.max || 5; reps = Math.max(3, Math.round(max * BWPCT[ph]) + Math.min(wi, 2));
      } else if (ex.pat === 'power') { reps = 5; sets = acc ? 3 : 4; }
      else if (ex.pat === 'cond') { reps = [8, 10, 12, 8][ph]; }
      else if (ex.pat === 'feet' || ex.pat === 'neck' || ex.pat === 'prehab' || ex.pat === 'arms' || ex.pat === 'rot') { reps = 12 + Math.min(wi, 2) * 2; if (ex.pat === 'neck') reps = 10; }
      else reps = (ex.lvl >= 2 ? 6 : 10) + Math.min(wi, 2) + (ph === 2 ? -2 : 0);
      if ((ex.equip || []).includes('band')) { const bl = cfg.eq.bands || []; band = bl[clamp(Math.min(ph, 1) + (acc ? -1 : 0), 0, bl.length - 1)] || null; }
      if (id === 'band_pullup') { const bl = cfg.eq.bands || []; band = bl[bl.length - 1 - Math.min(ph, bl.length - 1)] || null; }
    }
    if (deload) { sets = Math.max(2, sets - 1); note = 'lighter week'; }
    if (w === 12 && !acc && ['pullup', 'pushup', 'situp', 'chinup'].includes(id)) { sets = 1; reps = 'max'; note = 'test: max reps, strict form'; }
    if (ex.side) note = note ? 'per side · ' + note : 'per side';
    if (id === 'kb_swing' && key === 'C' && ph < 3 && !acc) { note = 'EMOM: one set at the start of every minute'; }
    const repsNum = typeof reps === 'number' ? reps : reps === 'max' ? (b.max || 10) : 0;
    const work = sec ? sec : m ? m * 0.9 : (repsNum || 8) * 3.2;
    const rest = acc ? 45 : ph === 2 ? 120 : 90;
    const min = sets * ((ex.side ? 2 : 1) * work + rest) / 60;
    return { id, slot, sets, reps, repsNum, kg, sec, m, band, note, min, acc };
  };

  /* a session: exercises that fit into the time budget (warm-up and cool-down included) */
  P.session = (pl, w, i) => {
    const key = P.sessionKeys(pl, w)[i]; const cfg = P.cfgAt(pl, w);
    const warm = cfg.minutes >= 40 ? 7 : 5, cool = cfg.minutes >= 40 ? 5 : 3, budget = cfg.minutes - warm - cool;
    const occ = P.sessionKeys(pl, w).slice(0, i).filter(k => k === key).length;
    const items = [], skipped = []; let used = 0, idx = 0;
    const seen = new Set();
    for (const slot of P.SESS[key].slots) {
      const sameBefore = P.sessionKeys(pl, w).slice(0, i).reduce((n, k) => n + P.SESS[k].slots.filter(s => s === slot).length, 0);
      let id = P.exFor(pl, w, key, slot, occ + sameBefore);
      if (id && seen.has(id)) { const alt = P.options(pl, w, slot).find(x => !seen.has(x)); id = alt || null; }
      if (!id) { skipped.push({ slot, why: (cfg.skip || []).length && P.candidates(slot).some(x => P.available(cfg.eq, x) && P.skipEx(x, cfg.skip)) ? 'muscles' : 'equipment' }); continue; }
      const r = P.rx(pl, w, key, slot, id, idx);
      const per = r.min / r.sets, fit = Math.floor((budget - used + 0.5) / per);
      if (fit < r.sets) { if (fit >= 2) r.sets = fit; else if (idx < 2) r.sets = 2; else { skipped.push({ slot, why: 'time' }); continue; } r.min = per * r.sets; }
      items.push(r); used += r.min; seen.add(id); idx++;
    }
    return { key, name: P.SESS[key].n, week: w, i, warm, cool, main: used, items, skipped, cfg, date: P.sessDate(pl, w, i) };
  };

  /* ---------- logs ---------- */
  P.setsOf = (pl, w, i, slot) => PF.db.sets.filter(s => s.plan === pl.id && s.week === w && s.sess === i && (slot == null || s.slot === slot)).sort((a, b) => a.set - b.set);
  P.sessRow = (pl, w, i) => PF.db.sessions.find(s => s.plan === pl.id && s.week === w && s.sess === i) || null;
  P.status = (pl, w, i) => {
    const s = P.session(pl, w, i); const row = P.sessRow(pl, w, i);
    const n = s.items.filter(r => P.setsOf(pl, w, i, r.slot).some(x => x.done)).length;
    return { n, of: s.items.length, s, done: !!(row && row.done) || (n === s.items.length && n > 0), started: n > 0 || !!(row && row.done) };
  };
  /* next session to do: first one not done from the current week on */
  P.next = pl => {
    const cw = Math.max(1, P.weekNo(pl));
    for (let w = Math.min(cw, 12); w <= 12; w++) for (let i = 0; i < P.sessionKeys(pl, w).length; i++) if (!P.status(pl, w, i).done) return { w, i };
    return null;
  };

  /* ---------- analysis and next block ---------- */
  P.analyze = (pl, upto) => {
    const last = clamp(upto ?? (P.weekNo(pl) - 1), 0, 12);
    const cfg = P.cfgAt(pl, Math.max(1, last)); let planned = 0, done = 0; const per = {};
    for (let w = 1; w <= last; w++) P.sessionKeys(pl, w).forEach((k, i) => {
      planned++; const st = P.status(pl, w, i); if (!st.started) return; done++;
      st.s.items.forEach(r => {
        const pat = r.slot; const p = per[pat] || (per[pat] = { plan: 0, act: 0, low: 0, n: 0 });
        const goal = r.repsNum || r.sec || r.m || 1;
        p.plan += r.sets * goal; p.n++;
        P.setsOf(pl, w, i, r.slot).filter(x => x.done).forEach(x => {
          const v = r.sec ? +x.sec || r.sec : r.m ? +x.m || r.m : +x.reps || 0;
          p.act += Math.min(v, goal * 1.5); if (r.kg && +x.kg && +x.kg < r.kg) p.low++;
        });
      });
    });
    const adh = planned ? done / planned : 1, avg = last ? done / last : cfg.sessions;
    const prop = { sessions: cfg.sessions, minutes: cfg.minutes, reasons: [], steps: {}, why: {} };
    if (last >= 2 && adh < 0.85 && cfg.sessions > 2) {
      const ns = Math.max(2, Math.round(avg) >= cfg.sessions ? cfg.sessions - 1 : Math.round(avg));
      const weekly = cfg.sessions * cfg.minutes; const mins = [20, 30, 45, 60, 75, 90].reduce((b, v) => Math.abs(v - weekly / ns) < Math.abs(b - weekly / ns) ? v : b, 45);
      prop.sessions = ns; prop.minutes = mins;
      prop.reasons.push(`You trained ${PF.num(avg)} times a week on average instead of ${cfg.sessions}. Fewer, longer sessions keep your weekly time similar (${ns} × ${mins} min instead of ${cfg.sessions} × ${cfg.minutes} min).`);
    }
    for (const pat of P.LEVEL_PATTERNS) {
      const p = per[pat];
      if (!p || !p.plan) { prop.steps[pat] = 0; prop.why[pat] = 'nothing logged: start where this block started'; continue; }
      const r = p.act / p.plan;
      if (r >= 0.97 && !p.low) { prop.steps[pat] = 1; prop.why[pat] = `hit ${Math.round(r * 100)} % of the planned work`; }
      else if (r >= 0.85) { prop.steps[pat] = 0; prop.why[pat] = `${Math.round(r * 100)} % of the planned work: repeat this level`; }
      else { prop.steps[pat] = -1; prop.why[pat] = `only ${Math.round(r * 100)} % of the planned work: start a bit easier`; }
    }
    return { last, planned, done, adh, avg, per, prop };
  };
  P.LEVEL_PATTERNS = ['hinge', 'squat', 'hpush', 'vpush', 'hpull', 'vpull', 'lunge', 'core', 'carry', 'power', 'grip'];
  P.PAT_NAMES = window.EX_PATTERNS;
  P.stepBase = (base, pat, step, eq) => {
    const b = clone(base[pat] || {});
    if (b.kg != null && step) { const t = ['kb', 'db', 'sb'].find(k => (eq[k] || []).length) || 'kb'; const nk = P.pick(eq, t, b.kg, step); b.kg = nk != null && nk !== b.kg ? nk : Math.max(2, b.kg + step * 2); }
    if (b.max != null) b.max = Math.max(0, Math.round(b.max * (1 + 0.15 * step) + (step === 0 ? 1 : step > 0 ? 1 : 0)));
    if (b.sec != null) b.sec = Math.max(10, Math.round(b.sec * (1 + 0.15 * step)));
    return b;
  };
  P.baseText = (pat, b) => {
    if (!b) return '–';
    const parts = []; if (MAXREF[pat] && b.max != null) parts.push(`max ${b.max} reps`); else if (b.kg != null) parts.push(`${PF.num(b.kg)} kg`);
    if (pat === 'grip' && b.sec != null) parts.push(`hang ${b.sec} s`);
    return parts.join(' · ');
  };
  P.create = ({ start, cfg, base, block = 1, prev = null, assessment = null }) => {
    if (prev) { const p = P.byId(prev); if (p && p.status !== 'done') PF.put('plans', Object.assign(p, { status: 'done' })); }
    return PF.put('plans', { id: PF.uid('p'), block, start, status: 'active', prev, assessment, cfgHist: [{ from: 1, cfg: clone(cfg) }], base: clone(base), swaps: [], created: PF.todayIso() });
  };
  /* settings changed: apply to the current plan from week `from` on */
  P.applyCfg = (pl, cfg, from) => {
    pl.cfgHist = pl.cfgHist.filter(h => h.from < from);
    if (!pl.cfgHist.length) pl.cfgHist.push({ from: 1, cfg: clone(cfg) }); else pl.cfgHist.push({ from, cfg: clone(cfg) });
    PF.put('plans', pl);
  };
  P.swap = (pl, w, key, slot, ex) => {
    pl.swaps = (pl.swaps || []).filter(s => !(s.slot === key + '.' + slot && s.from >= w));
    pl.swaps.push({ from: w, slot: key + '.' + slot, ex });
    PF.put('plans', pl);
  };

  /* ---------- daily mobility block ---------- */
  P.mobDay = (ds) => {
    let seed = [...ds].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
    const sw = (PF.db.ui.mobSwap && PF.db.ui.mobSwap[ds]) || {};
    const pickArea = (a, k) => { const list = MOB.filter(x => x.a === a); const i = (seed + k * 3 + (sw[a + k] || 0)) % list.length; return { item: list[i], slot: a + k }; };
    const out = Object.keys(MOB_AREAS).map(a => pickArea(a, 0));
    const flag = P.mobFlags(P.lastAssessment())[0];
    if (flag) {
      let e = pickArea(flag.area, 1);
      if (e.item.id === out.find(o => o.slot === flag.area + '0').item.id) { sw[flag.area + '1'] = (sw[flag.area + '1'] || 0) + 1; e = pickArea(flag.area, 1); }
      out.push(Object.assign(e, { flag: flag.t }));
    }
    return out;
  };
  P.mobDone = ds => PF.db.mobility.filter(m => m.date === ds).map(m => m.item);
})();
