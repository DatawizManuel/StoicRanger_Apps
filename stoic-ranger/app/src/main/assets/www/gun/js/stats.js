/* Stoic Ranger — statistics. Same maths as 05_tools/build_datasets.py and update_database.py:
   1 mrad = 1 mm per m; ring score counts the bullet edge; ES = largest centre-to-centre distance;
   wear is judged only from Test sessions against each ammo's median mean radius. */
'use strict';
(() => {
const { num } = RB;

/** Group statistics of one sheet. */
RB.sheetStats = s => {
  const t = RB.tgtOf(s), bd = num(s.bd) || 0, H = (s.hits || []).map(h => ({ x: +h.x || 0, y: +h.y || 0 })), n = H.length, dist = num(s.dist);
  const out = { n, rings: [], total: null, avg: null, es: null, mr: null, mx: null, my: null, esM: null, mrM: null, corrE: null, corrW: null };
  if (!n) return out;
  out.rings = H.map(h => RB.scoreOf(h.x, h.y, t, bd));
  out.total = out.rings.reduce((a, b) => a + b, 0); out.avg = out.total / n;
  out.mx = H.reduce((a, h) => a + h.x, 0) / n; out.my = H.reduce((a, h) => a + h.y, 0) / n;
  let es = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) es = Math.max(es, Math.hypot(H[i].x - H[j].x, H[i].y - H[j].y));
  out.es = es; out.mr = H.reduce((a, h) => a + Math.hypot(h.x - out.mx, h.y - out.my), 0) / n;
  if (dist) { if (n > 1) { out.esM = es / dist; out.mrM = out.mr / dist; } out.corrE = -out.my / dist; out.corrW = -out.mx / dist; }
  return out;
};
RB.corrText = st => {
  if (st.corrE == null) return '';
  const d = RB.U.imperial() ? 2 : 1, q = 10 ** d, e = Math.round(RB.U.from('ang', st.corrE) * q) / q, w = Math.round(RB.U.from('ang', st.corrW) * q) / q;
  return `${e >= 0 ? 'U' : 'D'} ${Math.abs(e).toFixed(d)} · ${w >= 0 ? 'R' : 'L'} ${Math.abs(w).toFixed(d)}`;
};

const median = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const fit = pts => {                       // least-squares slope
  if (pts.length < 3) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return sxx ? pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx : null;
};
RB.fitLine = pts => {
  const k = fit(pts); if (k == null) return null;
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
  return { k, x0, y0: my + k * (x0 - mx), x1, y1: my + k * (x1 - mx) };
};

/**
 * Build everything the dashboard and the database lists need.
 */
RB.build = (keep) => {   // keep: optional session filter for the ammo figures (round counts always use every sheet)
  const db = RB.db, ex = RB.hasExamples();
  const sheets = db.sheets;
  const W = new Map(db.weapons.map(w => [w.id, w])), B = new Map(db.barrels.map(b => [b.id, b])), M = new Map(db.munitions.map(m => [m.id, m])), S = new Map(db.shooters.map(s => [s.id, s]));
  const sessions = [], shots = [];
  const sorted = [...sheets].sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  for (const s of sorted) {
    const st = RB.sheetStats(s);
    const w = W.get(s.weaponId), b = B.get(s.barrelId) || (w ? RB.barrelAt(w.id, s.date) : null), m = M.get(s.munitionId), sh = S.get(s.shooterId);
    const rounds = num(s.rounds);
    const row = {
      id: s.id, no: s.no || '', date: s.date || '', time: s.time || '',
      weaponId: w ? w.id : null, rifle: w ? w.name : (s.gun || 'Unknown gun'),
      barrelId: b ? b.id : null, barrel: b ? b.name : (s.barrel || 'Unknown'),
      munitionId: m ? m.id : null, ammo: m ? m.name : (s.ammo || 'Unknown'),
      shooterId: sh ? sh.id : null, shooter: sh ? sh.name : (s.shooter || ''),
      caliber: s.caliber || (w && w.caliber) || '', purpose: s.purpose || '', evalAs: RB.evalAs(s.purpose), discipline: s.discipline || '', position: s.position || '',
      setting: s.setting || '', range: s.range || '', dist: num(s.dist), temp: num(s.temp), hum: num(s.hum), press: num(s.press), elev: num(s.elev),
      rounds: rounds != null ? Math.round(rounds) : st.n, v0: num(s.v0), v0sd: num(s.v0sd),
      hits: st.n, score: st.total, avgRing: st.avg, es: st.es, mr: st.mr, mx: st.mx, my: st.my, esM: st.esM, mrM: st.mrM, example: !!s.example,
    };
    sessions.push(row);
    (s.hits || []).forEach((h, i) => shots.push({ sheetId: s.id, date: row.date, ammo: row.ammo, munitionId: row.munitionId, purpose: row.purpose, evalAs: row.evalAs, shot: i + 1, x: +h.x, y: +h.y, ring: st.rings[i], dist: row.dist }));
  }

  // rounds through each barrel, in date order (sheets + rounds log)
  const logRows = db.roundsLog;
  const count = new Map(db.barrels.map(b => [b.id, Math.round(num(b.roundsAtInstall) || 0)]));
  const events = sessions.map(s => [s.date, 0, s]).concat(logRows.map(r => [r.date || '', 1, r])).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  for (const [d, kind, x] of events) {
    if (kind === 0) { const k = x.barrelId || 'u:' + x.rifle + '/' + x.barrel; x.barrelRoundsBefore = count.get(k) || 0; count.set(k, (count.get(k) || 0) + (x.rounds || 0)); }
    else { const bid = x.barrelId || (RB.barrelAt(x.weaponId, d) || {}).id; if (bid) count.set(bid, (count.get(bid) || 0) + Math.round(num(x.rounds) || 0)); }
  }

  // relative precision of each test session vs the median of its ammo
  const base = new Map();
  for (const a of new Set(sessions.map(s => s.ammo))) {
    const v = sessions.filter(s => s.ammo === a && s.evalAs === 'rifle' && s.mrM).map(s => s.mrM);
    base.set(a, v.length >= 2 ? median(v) : null);
  }
  sessions.forEach(s => { const b = base.get(s.ammo); s.mrRel = (b && s.mrM && s.evalAs === 'rifle') ? s.mrM / b : null; });

  // barrels
  const barrels = db.barrels.map(b => {
    const w = W.get(b.weaponId), ss = sessions.filter(s => s.barrelId === b.id);
    const rel = ss.filter(s => s.mrRel != null).map(s => [s.barrelRoundsBefore, s.mrRel]);
    const precNeed = RB.enough(ss.filter(s => s.mrRel != null).map(s => s.hits));
    const slope = precNeed.ok ? fit(rel) : null;
    const vNeed = RB.enough(ss.filter(s => s.v0).map(s => s.rounds || 0));
    const vs = vNeed.ok ? [...new Set(ss.map(s => s.ammo))].map(a => fit(ss.filter(s => s.ammo === a && s.v0).map(s => [s.barrelRoundsBefore, s.v0]))).filter(v => v != null) : [];
    const life = num(b.lifeRounds) || RB.barrelLifeFor(w ? w.caliber : '');
    const total = count.get(b.id) || 0;
    return {
      id: b.id, name: b.name, weaponId: b.weaponId, rifle: w ? w.name : '?', installed: b.installed || '', removed: b.removed || '',
      status: b.removed ? 'removed' : 'fitted', roundsAtInstall: Math.round(num(b.roundsAtInstall) || 0), total, life, lifePct: life ? total / life * 100 : null,
      sessions: ss.length, testSessions: rel.length, last: ss.length ? ss[ss.length - 1].date : '',
      precPer1000: slope != null ? slope * 1000 * 100 : null, v0Per1000: vs.length ? mean(vs) * 1000 : null, precNeed, vNeed,
    };
  });

  // weapons
  const weapons = db.weapons.map(w => {
    const ss = sessions.filter(s => s.weaponId === w.id);
    const extra = logRows.filter(r => r.weaponId === w.id).reduce((a, r) => a + Math.round(num(r.rounds) || 0), 0);
    const before = Math.round(num(w.roundsBeforeLog) || 0);
    const fitted = RB.barrelAt(w.id, RB.today());
    return { id: w.id, name: w.name, total: before + ss.reduce((a, s) => a + (s.rounds || 0), 0) + extra, sessions: ss.length, last: ss.length ? ss[ss.length - 1].date : '', fitted: fitted ? fitted.id : null };
  });

  const ms = keep ? sessions.filter(keep) : sessions;
  // munitions: pooled V0 (Xero C1 Pro values on the sheets, weighted by rounds fired) and precision from test sessions
  const munitions = db.munitions.map(m => {
    const ss = ms.filter(s => s.munitionId === m.id);
    const pts = ss.filter(s => s.v0).map(s => [Math.max(1, s.rounds || s.hits || 1), s.v0, s.v0sd]);
    const N = pts.reduce((a, p) => a + p[0], 0);
    const vNeed = RB.enough(pts.map(p => p[0]));
    let v0 = null, sd = null;
    if (N && vNeed.ok) {
      v0 = pts.reduce((a, p) => a + p[0] * p[1], 0) / N;
      const within = pts.reduce((a, p) => a + (p[0] - 1) * (p[2] || 0) ** 2, 0), between = pts.reduce((a, p) => a + p[0] * (p[1] - v0) ** 2, 0);
      sd = N > 1 ? Math.sqrt((within + between) / (N - 1)) : null;
    }
    const allTests = ss.filter(s => s.evalAs === 'rifle' && s.mrM), precNeed = RB.enough(allTests.map(s => s.hits));
    const tests = precNeed.ok ? allTests : [];
    const nShots = tests.reduce((a, s) => a + s.hits, 0);
    const es = tests.filter(s => s.esM).map(s => s.esM);
    const ringNeed = RB.enough(ss.filter(s => s.avgRing != null).map(s => s.hits));
    const rings = ringNeed.ok ? ss.filter(s => s.avgRing != null).map(s => s.avgRing) : [];
    return {
      id: m.id, name: m.name, type: m.type || 'Factory', chargeG: num(m.chargeG), sessions: ss.length, testSessions: allTests.length, testShots: allTests.reduce((a, s) => a + s.hits, 0), precNeed, vNeed, example: !!m.example,
      mrM: nShots ? tests.reduce((a, s) => a + s.mrM * s.hits, 0) / nShots : null, esAvg: es.length ? mean(es) : null, esBest: es.length ? Math.min(...es) : null,
      v0, v0sd: sd, v0Shots: N, v0Sheets: pts.length, avgRing: rings.length ? mean(rings) : null,
    };
  });
  // ammo rows that are only text on sheets (not linked to the database)
  const loose = [...new Set(ms.filter(s => !s.munitionId).map(s => s.ammo))].map(a => {
    const ss = ms.filter(s => !s.munitionId && s.ammo === a), allTests = ss.filter(s => s.evalAs === 'rifle' && s.mrM), precNeed = RB.enough(allTests.map(s => s.hits));
    const tests = precNeed.ok ? allTests : [], nShots = tests.reduce((t, s) => t + s.hits, 0);
    const vss = ss.filter(s => s.v0), vNeed = RB.enough(vss.map(s => s.rounds || 0));
    const v = vNeed.ok ? vss.map(s => s.v0) : [], es = tests.filter(s => s.esM).map(s => s.esM);
    return { id: null, name: a, type: '', sessions: ss.length, testSessions: allTests.length, testShots: allTests.reduce((t, s) => t + s.hits, 0), precNeed, vNeed, mrM: nShots ? tests.reduce((t, s) => t + s.mrM * s.hits, 0) / nShots : null,
      esAvg: es.length ? mean(es) : null, esBest: es.length ? Math.min(...es) : null, v0: v.length ? mean(v) : null, v0sd: null, v0Shots: 0, v0Sheets: v.length, avgRing: null, loose: true };
  });

  return { sessions, shots, barrels, weapons, munitions: munitions.concat(loose), example: ex };
};

/** Ammo precision ranking per barrel: gun/ammo sheets grouped by (barrel, ammo), pooled mean radius by shots,
    each pair gated by RB.enough. Returns [{ key, barrel, rifle, rows: [{ ammo, munitionId, ok, need, mrM, esAvg, shots, sets, v0, v0sd }] }]. */
RB.pairRanking = sessions => {
  const by = new Map();
  sessions.filter(s => s.evalAs === 'rifle' && s.mrM != null).forEach(s => {
    const bk = s.barrelId || 'u:' + s.rifle + '/' + s.barrel;
    if (!by.has(bk)) by.set(bk, { key: bk, barrelId: s.barrelId, barrel: s.barrel, rifle: s.rifle, pairs: new Map() });
    const B = by.get(bk), ak = s.munitionId || 'a:' + s.ammo;
    if (!B.pairs.has(ak)) B.pairs.set(ak, { ammo: s.ammo, munitionId: s.munitionId, ss: [] });
    B.pairs.get(ak).ss.push(s);
  });
  return [...by.values()].map(B => {
    const rows = [...B.pairs.values()].map(p => {
      const need = RB.enough(p.ss.map(s => s.hits)), n = p.ss.reduce((a, s) => a + s.hits, 0);
      const es = p.ss.filter(s => s.esM != null).map(s => s.esM), vs = p.ss.filter(s => s.v0);
      const vN = vs.reduce((a, s) => a + Math.max(1, s.rounds || s.hits), 0);
      const v0 = vN ? vs.reduce((a, s) => a + Math.max(1, s.rounds || s.hits) * s.v0, 0) / vN : null;
      const sds = vs.filter(s => s.v0sd != null).map(s => s.v0sd);
      return { ammo: p.ammo, munitionId: p.munitionId, ok: need.ok, need, shots: n, sets: p.ss.length,
        mrM: need.ok && n ? p.ss.reduce((a, s) => a + s.mrM * s.hits, 0) / n : null, esAvg: need.ok && es.length ? mean(es) : null,
        v0: need.ok ? v0 : null, v0sd: need.ok && sds.length ? mean(sds) : null };
    }).sort((a, b) => (a.mrM == null) - (b.mrM == null) || (a.mrM - b.mrM) || b.shots - a.shots);
    return { key: B.key, barrelId: B.barrelId, barrel: B.barrel, rifle: B.rifle, rows };
  }).sort((a, b) => b.rows.reduce((t, r) => t + r.shots, 0) - a.rows.reduce((t, r) => t + r.shots, 0));
};

/** Shots of test sessions relative to their own group centre, in mrad. */
RB.centred = (data) => {
  const by = new Map(data.sessions.map(s => [s.id, s]));
  return data.shots.filter(t => t.evalAs === 'rifle').map(t => { const s = by.get(t.sheetId); if (!s || !s.dist || s.hits < 2) return null; return { ammo: t.ammo, dx: (t.x - s.mx) / s.dist, dy: (t.y - s.my) / s.dist }; }).filter(Boolean);
};
})();
