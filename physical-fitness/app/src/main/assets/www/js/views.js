/* SR Physical Fitness — views: Exercises, exercise detail, Mobility, Activity log, Dashboard, Setup, Assessment, New plan, Next block. */
'use strict';
(function () {
  const { $, $$, esc, clone, fmtD, fmtDY, parseD, iso, today, addDays, clamp } = PF;
  const P = PF.plan, V = PF.views, W = PF.w;

  /* =====================================================================================================
     EXERCISE LIBRARY + DETAIL
     ===================================================================================================== */
  V.library = () => {
    PF.header(`${EXLIST.length} exercises`);
    const f = PF.ui.lib || (PF.ui.lib = { q: '', g: 'all', mine: true });
    const eq = PF.db.settings.eq; const q = f.q.trim().toLowerCase();
    const list = EXLIST.filter(e => (f.g === 'all' || e.g === f.g) && (!f.mine || P.available(eq, e.id)) &&
      (!q || (e.n + ' ' + e.prim.concat(e.sec).map(k => FIG.MUSCLE_NAMES[k] || k).join(' ') + ' ' + (EX_PATTERNS[e.pat] || '')).toLowerCase().includes(q)));
    const groups = Object.keys(EX_GROUPS).filter(g => f.g === 'all' || g === f.g);
    return `<div class="stack"><h1>Exercises</h1>
      <input class="inp search" type="search" placeholder="Search name or muscle" value="${esc(f.q)}" data-in="libq" aria-label="Search exercises">
      <div class="chips">${['all', ...Object.keys(EX_GROUPS)].map(g => `<button type="button" data-libg="${g}" class="${f.g === g ? 'on' : ''}">${g === 'all' ? 'All' : EX_GROUPS[g]}</button>`).join('')}</div>
      <div class="toggle"><span class="small">Only what my equipment allows</span>${W.sw(f.mine, 'libmine', 'Only my equipment')}</div></div>
      ${groups.map(g => { const l = list.filter(e => e.g === g); if (!l.length) return '';
        return `<div class="stack"><h3>${EX_GROUPS[g]} <span class="small muted">${l.length}</span></h3><div class="grid2">${l.map(e => `<a class="card excard" href="#ex/${e.id}"><span class="pic">${FIG.svg(e, 0.999, { label: e.n })}</span><b>${esc(e.n)}</b><span class="small muted">${esc(e.prim.slice(0, 3).map(k => FIG.MUSCLE_NAMES[k] || k).join(', '))}</span></a>`).join('')}</div></div>`; }).join('')}
      ${list.length ? '' : '<div class="empty">Nothing found. Switch off "only my equipment" to see all.</div>'}`;
  };
  PF.onInput.libq = el => { PF.ui.lib.q = el.value; clearTimeout(PF._lq); PF._lq = setTimeout(() => { PF.rerender(); const i = $('[data-in=libq]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  PF.on.libg = v => { PF.ui.lib.g = v; PF.rerender(); };
  PF.on.libmine = () => { PF.ui.lib.mine = !PF.ui.lib.mine; PF.rerender(); };

  const doseText = { reps: 'Reps', load: 'Weight × reps', time: 'Hold for time', carry: 'Weight × distance', dist: 'Distance' };
  V.ex = id => {
    const e = EX[id]; if (!e) return V.library();
    PF.header(EX_GROUPS[e.g], true);
    const eq = PF.db.settings.eq; const ok = P.available(eq, id);
    const link = x => EX[x] ? `<a href="#ex/${x}">${esc(EX[x].n)}</a>` : esc(x || '');
    const mob = (window.MOB || []).filter(m => m.ex === id);
    return `<div class="stack"><div class="eyebrow">${esc(EX_PATTERNS[e.pat] || '')} · level ${e.lvl}${e.side ? ' · per side' : ''}</div><h1>${esc(e.n)}</h1>
        <div class="tags">${(e.equip.length ? e.equip : ['none']).map(k => `<span class="pill ${k === 'none' || P.has(eq, k) ? '' : 'warn'}">${k === 'none' ? 'No equipment' : esc(P.EQUIP_NAMES[k])}${k !== 'none' && !P.has(eq, k) ? ' · not in Setup' : ''}</span>`).join('')}<span class="pill">${doseText[e.dose]}</span></div></div>
      <div class="stage" id="stage">${FIG.svg(e, 0, { label: e.n })}</div>
      <div class="row"><button type="button" class="btn sm" data-anim="1" id="animBtn">Pause</button><span class="small muted">The figure moves between start and end position.</span></div>
      <div class="card stack"><h3>How to</h3><ol class="steps">${e.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
      ${e.cue.length ? `<div class="card stack"><h3>Cues</h3><ul class="dots">${e.cue.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      ${e.err.length ? `<div class="card stack"><h3>Common mistakes</h3><ul class="dots">${e.err.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      <div class="mapwrap stack">${MMAP.svg(e.prim, e.sec, { label: 'Muscles worked by ' + e.n })}
        <div class="legend"><span><i style="background:var(--hl)"></i>Main: ${esc(MMAP.names(e.prim))}</span>${e.sec.length ? `<span><i style="background:var(--hl2)"></i>Supporting: ${esc(MMAP.names(e.sec))}</span>` : ''}</div></div>
      ${e.easy || e.hard ? `<div class="card stack">${e.easy ? `<div><b>Easier:</b> ${link(e.easy)}</div>` : ''}${e.hard ? `<div><b>Harder:</b> ${link(e.hard)}</div>` : ''}</div>` : ''}
      ${mob.length ? `<div class="card small muted">Also part of the daily mobility block (${esc(mob[0].d)}).</div>` : ''}
      ${historyCard(id)}`;
  };
  function historyCard(id) {
    const pts = {}; PF.db.sets.filter(s => s.ex === id && s.done).forEach(s => { const pl = P.byId(s.plan); const k = (pl ? pl.block : 0) * 100 + s.week; const v = s.kg ? (+s.kg) * (+s.reps || 1) : (+s.reps || +s.sec || +s.m || 0); pts[k] = Math.max(pts[k] || 0, v); });
    const keys = Object.keys(pts).map(Number).sort((a, b) => a - b); if (!keys.length) return '';
    return `<div class="card stack chart"><h3>Your history</h3>${PF.lineChart(keys.map((k, i) => [i + 1, pts[k], `B${Math.floor(k / 100)} W${k % 100}`]), EX[id].dose === 'load' || EX[id].dose === 'carry' ? 'best set (kg × reps) per week' : 'best set per week')}</div>`;
  }
  /* animation of the exercise drawing */
  let anim = null, paused = false;
  PF.stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = null; };
  PF.afterRender = (name, args) => {
    if (name !== 'ex') return; const e = EX[args[0]]; const st = $('#stage'); if (!e || !st) return;
    paused = false; const t0 = performance.now(); const period = 2600;
    const tick = now => {
      if (!document.body.contains(st)) return PF.stopAnim();
      if (!paused) { const ph = ((now - t0) % period) / period; const t = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI); st.innerHTML = FIG.svg(e, t, { label: e.n }); }
      anim = requestAnimationFrame(tick);
    };
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) anim = requestAnimationFrame(tick); else { $('#animBtn').textContent = 'Show end'; paused = true; }
  };
  PF.on.anim = (v, el) => {
    const e = EX[(location.hash.split('/')[1] || '')];
    if (!anim && e) { const st = $('#stage'); const end = el.textContent === 'Show end'; st.innerHTML = FIG.svg(e, end ? 1 : 0); el.textContent = end ? 'Show start' : 'Show end'; return; }
    paused = !paused; el.textContent = paused ? 'Play' : 'Pause';
  };

  /* =====================================================================================================
     MOBILITY
     ===================================================================================================== */
  V.mobility = () => {
    PF.header('Optional · never changes the plan');
    const ds = PF.todayIso(); const list = P.mobDay(ds); const done = P.mobDone(ds); const n = list.filter(x => done.includes(x.item.id)).length;
    const open = PF.ui.mobOpen;
    const days = Array.from({ length: 14 }, (_, k) => { const d = iso(addDays(today(), k - 13)); const c = P.mobDone(d).length; return `<i class="${c >= 5 ? 'full' : c ? 'part' : ''}" title="${fmtD(d)}: ${c} done"></i>`; }).join('');
    return `<div class="stack"><div class="eyebrow">${fmtD(today())} · about ${Math.round(list.length * 1.7)} min</div><h1>Daily mobility block</h1>
        <div class="small muted">Do it any time of the day. Skipping it never changes your plan.</div>
        <div class="bar" aria-label="Done today"><i style="width:${(n / list.length * 100).toFixed(0)}%;background:var(--olive)"></i></div><div class="small muted">${n} of ${list.length} done today</div></div>
      <div class="stack">${list.map(({ item: x, slot, flag }) => { const e = EX[x.ex]; const on = done.includes(x.id), op = open === x.id;
        return `<div class="card stack" style="gap:8px"><div class="row top"><button type="button" class="chk ${on ? 'on' : ''}" data-mob="${x.id}" aria-label="${esc(e.n)} done" aria-pressed="${on}">✓</button>
          <div class="spacer"><b>${esc(e.n)}</b><div class="small muted">${esc(x.d)} · ${MOB_AREAS[x.a]}${flag ? ` · <span class="warn">extra: ${esc(flag)}</span>` : ''}</div></div>
          <button type="button" class="btn xs" data-mobinfo="${x.id}" aria-expanded="${op}">${op ? 'Less' : 'How'}</button></div>
          ${op ? `<div class="grid2"><div class="stage">${FIG.svg(e, 1, { label: e.n })}</div><div class="small">${e.how.map(esc).join(' ')}</div></div><a class="small" href="#ex/${e.id}">Moving drawing and muscles ›</a>` : ''}
          ${on ? '' : `<button type="button" class="btn xs" style="align-self:flex-start" data-mobswap="${slot}">Suggest another</button>`}</div>`; }).join('')}</div>
      <div class="card stack"><h3>Last 14 days</h3><div class="days14">${days}</div><div class="small muted">Dark = whole block, light = part of it. Just for you; it doesn't count anywhere.</div></div>
      <div class="card small muted">Each day proposes one drill for hips, hamstrings and back, shoulders, feet and ankles, and neck. One extra comes from your assessment (tight spots first).</div>`;
  };
  PF.on.mob = v => {
    if (!PF.guard()) return; const ds = PF.todayIso();
    const r = PF.db.mobility.find(m => m.date === ds && m.item === v);
    if (r) PF.del('mobility', r.id); else PF.put('mobility', { date: ds, item: v });
    PF.rerender();
  };
  PF.on.mobinfo = v => { PF.ui.mobOpen = PF.ui.mobOpen === v ? null : v; PF.rerender(); };
  PF.on.mobswap = v => { const ds = PF.todayIso(); const u = PF.db.ui; u.mobSwap = u.mobSwap || {}; Object.keys(u.mobSwap).forEach(d => { if (d < iso(addDays(today(), -30))) delete u.mobSwap[d]; }); const s = u.mobSwap[ds] || (u.mobSwap[ds] = {}); s[v] = (s[v] || 0) + 1; PF.save(); PF.rerender(); };

  /* =====================================================================================================
     ACTIVITY LOG
     ===================================================================================================== */
  const ACT = PF.ACT = {
    walk: { n: 'Walking', f: ['km'] }, hike: { n: 'Hiking', f: ['km', 'elev', 'kg'] }, ruck: { n: 'Rucking', f: ['km', 'elev', 'kg'] }, run: { n: 'Running', f: ['km', 'elev', 'hr'] },
    bike: { n: 'Cycling', f: ['km', 'elev', 'hr'] }, swim: { n: 'Swimming', f: ['m'] }, ski: { n: 'Ski touring / cross-country', f: ['km', 'elev'] }, row: { n: 'Rowing', f: ['m'] },
    climb: { n: 'Climbing', f: [] }, martial: { n: 'Martial arts / self-defence', f: [] }, yoga: { n: 'Yoga / mobility', f: [] }, other: { n: 'Other', f: ['name', 'km'] }
  };
  const AF = { min: ['Duration', 'min', 'numeric'], km: ['Distance', 'km', 'decimal'], m: ['Distance', 'm', 'numeric'], elev: ['Elevation gain', 'm', 'numeric'], kg: ['Pack / ruck weight', 'kg', 'decimal'], hr: ['Avg heart rate (optional)', 'bpm', 'numeric'], name: ['What was it?', '', 'text'], note: ['Note (optional)', '', 'text'] };
  PF.actLine = a => {
    const t = ACT[a.type] || ACT.other; const p = [`${a.min || 0} min`];
    if (a.km) p.push(`${PF.num(a.km)} km`); if (a.m) p.push(`${a.m} m`); if (a.elev) p.push(`↑${a.elev} m`); if (a.kg) p.push(`${PF.num(a.kg)} kg`); if (a.rpe) p.push(`effort ${a.rpe}/10`);
    return `<b>${a.type === 'other' && a.name ? esc(a.name) : t.n}</b><div class="small muted">${fmtD(a.date)} · ${p.join(' · ')}${a.note ? ' · ' + esc(a.note) : ''}</div>`;
  };
  V.act = (editId) => {
    PF.header('Other training', true);
    if (!PF.ui.act || PF.ui.act._for !== (editId || '')) PF.ui.act = editId && PF.db.activities.find(a => a.id === editId) ? Object.assign(clone(PF.db.activities.find(a => a.id === editId)), { _for: editId }) : { _for: '', type: 'ruck', date: PF.todayIso(), min: '', rpe: 5 };
    const F = PF.ui.act; const t = ACT[F.type];
    const inp = k => { const [l, u, mode] = AF[k]; return `<div class="field"><label for="f-${k}">${l}${u ? ` (${u})` : ''}</label><input class="inp" id="f-${k}" data-in="af" data-k="${k}" inputmode="${mode}" value="${esc(F[k] ?? '')}"></div>`; };
    const list = PF.db.activities.slice().sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="stack"><div class="eyebrow">Walking, rucking, running and more</div><h1>${editId ? 'Edit activity' : 'Log activity'}</h1></div>
      <div class="card stack">
        <div class="field"><span class="lbl">Activity</span><div class="chips">${Object.entries(ACT).map(([k, v]) => `<button type="button" data-acttype="${k}" class="${F.type === k ? 'on' : ''}">${v.n}</button>`).join('')}</div></div>
        <div class="field"><label for="f-date">Date</label><input class="inp" type="date" id="f-date" data-in="af" data-k="date" value="${esc(F.date)}"></div>
        ${inp('min')}${t.f.map(inp).join('')}
        <div class="field"><span class="lbl">Effort (1 = very easy, 10 = all-out)</span><div class="chips">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<button type="button" data-rpe="${v}" class="${+F.rpe === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        ${inp('note')}
        <div class="row"><button type="button" class="btn primary" data-saveact="1">${editId ? 'Save changes' : 'Save activity'}</button>${editId ? '<a class="btn" href="#act">Cancel</a>' : ''}</div></div>
      <div class="stack"><h3>All activities</h3>${list.length ? list.map(a => `<div class="card row"><div class="spacer">${PF.actLine(a)}</div><a class="btn xs" href="#act/${a.id}">Edit</a><button type="button" class="btn xs" data-delact="${a.id}" aria-label="Delete">✕</button></div>`).join('') : '<div class="small muted">Nothing logged yet.</div>'}</div>`;
  };
  PF.onInput.af = el => { PF.ui.act[el.dataset.k] = el.value; };
  PF.on.acttype = v => { PF.ui.act.type = v; PF.rerender(); };
  PF.on.rpe = v => { PF.ui.act.rpe = +v; PF.rerender(); };
  PF.on.saveact = () => {
    if (!PF.guard()) return; const F = PF.ui.act;
    const n = k => { const v = String(F[k] ?? '').trim().replace(',', '.'); return v === '' ? null : +v; };
    if (!(n('min') > 0)) return PF.toast('Enter the duration in minutes.', true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date || '')) return PF.toast('Pick a date.', true);
    const row = { id: F._for || undefined, date: F.date, type: F.type, min: n('min'), rpe: +F.rpe || null, note: (F.note || '').trim() };
    for (const k of ACT[F.type].f) row[k] = k === 'name' ? (F.name || '').trim() : n(k);
    PF.put('activities', row); PF.ui.act = null; PF.toast('Activity saved'); PF.go('#act');
    PF.rerender();
  };
  PF.on.delact = async v => { if (!PF.guard()) return; if (await PF.confirm('Delete activity?', 'This removes it from the log.', 'Delete', true)) { PF.del('activities', v); PF.rerender(); } };

  /* =====================================================================================================
     DASHBOARD
     ===================================================================================================== */
  V.dashboard = () => {
    PF.header('Your training');
    const pl = P.current();
    const doneSess = PF.db.sessions.filter(s => s.done).length;
    const setsDone = PF.db.sets.filter(s => s.done);
    const tonnage = setsDone.reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 0), 0);
    const actMin = PF.db.activities.reduce((a, x) => a + (+x.min || 0), 0);
    const km = PF.db.activities.reduce((a, x) => a + (+x.km || 0) + (+x.m || 0) / 1000, 0);
    const mobDays = new Set(PF.db.mobility.map(m => m.date)).size;
    let out = `<div class="stack"><h1>Dashboard</h1></div>
      <div class="tiles"><div class="tile"><div class="eyebrow">Sessions done</div><div class="v">${doneSess}</div></div>
        <div class="tile"><div class="eyebrow">Sets logged</div><div class="v">${setsDone.length}</div></div>
        <div class="tile"><div class="eyebrow">Weight moved</div><div class="v">${PF.num(tonnage / 1000)}<span class="u">t</span></div></div>
        <div class="tile"><div class="eyebrow">Other training</div><div class="v">${PF.num(actMin / 60)}<span class="u">h · ${PF.num(km)} km</span></div></div>
        <div class="tile"><div class="eyebrow">Mobility days</div><div class="v">${mobDays}</div></div>
        <div class="tile"><div class="eyebrow">Assessments</div><div class="v">${PF.db.assessments.length}</div></div></div>`;
    if (pl) {
      const an = P.analyze(pl, P.weekNo(pl) - 1);
      out += `<div class="card stack chart"><h3>Block ${pl.block}: minutes per week</h3>${minutesChart(pl)}<div class="legend"><span><i style="background:var(--sect)"></i>Plan sessions</span><span><i style="background:var(--gold)"></i>Other training</span></div></div>
        <div class="card stack"><h3>Adherence</h3><div class="small">${an.last ? `${an.done} of ${an.planned} planned sessions in the first ${an.last} week${an.last === 1 ? '' : 's'} (${Math.round(an.adh * 100)} %).` : 'The block has not started yet.'}</div>
          <div class="bar"><i style="width:${Math.round(an.adh * 100)}%"></i></div></div>`;
      out += `<div class="card stack chart"><h3>Strength trend</h3>${strengthTable()}</div>`;
    }
    const as = PF.db.assessments.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (as.length) out += `<div class="card stack"><h3>Assessments</h3><div class="tbl"><table><thead><tr><th>Test</th>${as.map(a => `<th>${fmtD(a.date)}</th>`).join('')}</tr></thead><tbody>
      ${P.TESTS.map(t => `<tr><td>${esc(t.t)}</td>${as.map(a => `<td>${a[t.k] == null ? '–' : esc(t.type === 'yn' ? (a[t.k] === 'yes' ? 'yes' : 'no') : a[t.k] + (t.type === 'kg' ? ' kg' : ' ' + t.u))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    out += PF.actsCard();
    return out;
  };
  function strengthTable() {
    const by = {}; PF.db.sets.filter(s => s.done).forEach(s => { const e = EX[s.ex]; if (!e) return; const k = s.ex; const v = s.kg ? +s.kg : 0; const r = +s.reps || 0; const b = by[k] || (by[k] = { first: null, best: null, n: 0 }); b.n++; const sc = v * 100 + r; if (!b.first) b.first = { v, r, d: s.date }; if (!b.best || sc > b.best.v * 100 + b.best.r) b.best = { v, r, d: s.date }; });
    const ids = Object.keys(by).sort((a, b) => by[b].n - by[a].n).slice(0, 10);
    if (!ids.length) return '<div class="small muted">Log sets to see your progress per exercise.</div>';
    const f = x => x.v ? `${PF.num(x.v)} kg × ${x.r}` : `${x.r} reps`;
    return `<div class="tbl"><table><thead><tr><th>Exercise</th><th>First</th><th>Best</th></tr></thead><tbody>${ids.map(id => `<tr><td><a href="#ex/${id}">${esc(EX[id].n)}</a></td><td>${f(by[id].first)}</td><td><b>${f(by[id].best)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function minutesChart(pl) {
    const st = {}, ac = {};
    for (let w = 1; w <= 12; w++) P.sessionKeys(pl, w).forEach((k, i) => { const s = P.status(pl, w, i); if (s.started) st[w] = (st[w] || 0) + Math.round(s.s.warm + s.s.main + s.s.cool); });
    PF.db.activities.forEach(a => { const w = Math.floor((parseD(a.date) - parseD(pl.start)) / 864e5 / 7) + 1; if (w >= 1 && w <= 12) ac[w] = (ac[w] || 0) + (+a.min || 0); });
    const Wd = 320, H = 160, l = 34, b = 20, t = 10; const max = Math.max(60, ...Array.from({ length: 12 }, (_, i) => (st[i + 1] || 0) + (ac[i + 1] || 0))); const nice = Math.ceil(max / 60) * 60; const bw = (Wd - l - 6) / 12;
    let s = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Training minutes per week">`;
    for (let g = 0; g <= 2; g++) { const v = nice * g / 2, y = H - b - (H - b - t) * g / 2; s += `<line x1="${l}" x2="${Wd - 4}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${l - 4}" y="${y + 3}" text-anchor="end">${PF.num(v / 60)} h</text>`; }
    for (let w = 1; w <= 12; w++) {
      const x = l + (w - 1) * bw + 2, h1 = (st[w] || 0) / nice * (H - b - t), h2 = (ac[w] || 0) / nice * (H - b - t);
      s += `<rect x="${x}" width="${bw - 4}" y="${H - b - h1}" height="${h1}" fill="var(--sect)" rx="1.5"><title>Week ${w}: ${st[w] || 0} min plan</title></rect>`;
      s += `<rect x="${x}" width="${bw - 4}" y="${H - b - h1 - h2}" height="${h2}" fill="var(--gold)" rx="1.5"><title>Week ${w}: ${ac[w] || 0} min other</title></rect>`;
      s += `<text x="${x + (bw - 4) / 2}" y="${H - 6}" text-anchor="middle">${w}</text>`;
    }
    return s + '</svg>';
  }
  PF.lineChart = (pts, label) => {
    const Wd = 320, H = 150, l = 36, b = 22, t = 10; const max = Math.max(...pts.map(p => p[1]), 1); const min = Math.min(...pts.map(p => p[1]), max);
    const lo = Math.max(0, min - (max - min) * 0.2); let hi = max + (max - lo) * 0.1; if (!(hi > lo)) hi = lo + 1; const n = pts.length;
    const X = i => l + (n === 1 ? (Wd - l - 10) / 2 : i * (Wd - l - 10) / (n - 1)), Y = v => H - b - (v - lo) / (hi - lo) * (H - b - t);
    let s = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(label)}"><line x1="${l}" x2="${Wd - 4}" y1="${H - b}" y2="${H - b}" stroke="var(--line)"/>`;
    s += `<text x="${l - 4}" y="${Y(hi) + 3}" text-anchor="end">${PF.num(hi, 0)}</text><text x="${l - 4}" y="${H - b}" text-anchor="end">${PF.num(lo, 0)}</text>`;
    s += `<polyline fill="none" stroke="var(--sect)" stroke-width="2" points="${pts.map((p, i) => `${X(i)},${Y(p[1])}`).join(' ')}"/>`;
    pts.forEach((p, i) => { s += `<circle cx="${X(i)}" cy="${Y(p[1])}" r="3" fill="var(--sect)"><title>${esc(p[2] || '')}: ${PF.num(p[1])}</title></circle>`; if (n <= 8 || i % Math.ceil(n / 8) === 0) s += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(p[2] || i + 1)}</text>`; });
    return s + `</svg><div class="small muted">${esc(label)}</div>`;
  };

  /* =====================================================================================================
     SETUP (settings, equipment, data)
     ===================================================================================================== */
  const KB_ALL = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32], DB_ALL = [2, 4, 5, 6, 8, 10, 12, 12.5, 15, 17.5, 20, 22.5, 25, 30], SB_ALL = [5, 10, 15, 20, 25, 30, 40], BANDS = ['light', 'medium', 'heavy', 'extra heavy'];
  const PRESET = { 2: ['Tue', 'Fri'], 3: ['Mon', 'Wed', 'Fri'], 4: ['Mon', 'Tue', 'Thu', 'Fri'], 5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'], 6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
  const cfgOf = s => ({ sessions: s.sessions, minutes: s.minutes, days: s.days.slice(), eq: clone(s.eq) });
  V.setup = () => {
    PF.header('Settings and data');
    if (!PF.ui.setup) PF.ui.setup = cfgOf(PF.db.settings);
    const D = PF.ui.setup; const dirty = JSON.stringify(D) !== JSON.stringify(cfgOf(PF.db.settings));
    const toggle = (k, label) => `<div class="toggle"><span>${label}</span>${W.sw(D.eq[k], 'eqsw="' + k + '" data-x', label)}</div>`;
    const info = PF.appInfo();
    return `<div class="stack"><h1>Setup</h1></div>
      <div class="card stack"><h3>Time</h3>
        <div class="field"><span class="lbl">Sessions per week</span>${W.stepper(D.sessions, 'sess', 'Sessions per week')}</div>
        <div class="field"><span class="lbl">Minutes per session</span>${W.chips([D.minutes], [20, 30, 45, 60, 75, 90], 'mins', v => v + ' min')}</div>
        <div class="field"><span class="lbl">Training days</span>${W.chips(D.days, PF.DAYS, 'day')}${D.days.length !== D.sessions ? `<div class="small warn">Pick ${D.sessions} days.</div>` : ''}</div></div>
      <div class="card stack"><h3>Equipment</h3><div class="small muted">Tap to add or remove. Exercises and weights follow what you select.</div>
        <div class="equip"><span class="lbl"><b>Kettlebells</b> (kg)</span>${W.chips(D.eq.kb, KB_ALL, 'eqkb')}</div>
        <div class="equip"><span class="lbl"><b>Dumbbells</b> (kg, one pair each)</span>${W.chips(D.eq.db, DB_ALL, 'eqdb')}</div>
        <div class="equip"><span class="lbl"><b>Sandbags</b> (kg)</span>${W.chips(D.eq.sb, SB_ALL, 'eqsb')}</div>
        <div class="equip"><span class="lbl"><b>Long loop bands</b></span>${W.chips(D.eq.bands, BANDS, 'eqband')}</div>
        <div class="equip">${toggle('bar', 'Pull-up bar')}${toggle('mini', 'Mini band (hips)')}${toggle('bench', 'Bench, box or sturdy chair')}${toggle('gripper', 'Hand gripper')}${toggle('roller', 'Wrist roller')}</div></div>
      ${dirty ? `<div class="row"><button type="button" class="btn primary" data-savesetup="1" ${D.days.length !== D.sessions ? 'disabled' : ''}>Save changes</button><button type="button" class="btn" data-resetsetup="1">Undo</button></div>` : ''}
      <div class="card stack"><h3>Look</h3><div class="seg">${[['auto', 'Like the phone'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-theme="${k}" class="${(PF.db.settings.theme || 'auto') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="card stack"><h3>Assessment</h3><div class="small muted">${P.lastAssessment() ? 'Last one: ' + fmtDY(P.lastAssessment().date) : 'Not done yet.'}</div><a class="btn" href="#assess">Do the assessment</a></div>
      <div class="card stack"><h3>Data</h3>
        <div class="small">Your data is stored only on this phone. App updates keep it; when a new version changes the format, the data is converted and a copy of the old file is kept first.</div>
        <div class="small muted">Excel file: one sheet per table (plans, sets, sessions, activities, mobility, assessments, settings) plus an exercise list. Open it in Excel, edit it, and import it back here or on another phone. Importing merges: nothing on this phone is deleted.</div>
        <div class="row wrap"><button type="button" class="btn primary" data-xls="export">Export to Excel</button><button type="button" class="btn" data-xls="share">Share Excel file</button><button type="button" class="btn" data-xls="import">Import Excel file</button></div>
        <div class="small muted">${PF.db.sets.length} sets · ${PF.db.sessions.length} sessions · ${PF.db.activities.length} activities · ${PF.db.mobility.length} mobility entries · ${PF.db.plans.length} plans</div></div>
      <div class="card small muted">SR Physical Fitness ${esc(info.version || PF.VERSION)} · data format ${PF.SCHEMA}${PF.readOnly ? ' (file: ' + PF.dataSchema + ', read-only)' : ''} · Stoic Ranger</div>`;
  };
  const D = () => PF.ui.setup;
  const tog = (a, v) => { const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); };
  const num = v => isNaN(+v) ? v : +v;
  PF.on.sess = v => { const d = D(); d.sessions = clamp(d.sessions + +v, 2, 6); d.days = (PRESET[d.sessions] || d.days).slice(); PF.rerender(); };
  PF.on.mins = v => { D().minutes = +v; PF.rerender(); };
  PF.on.day = v => { tog(D().days, v); D().days.sort((a, b) => PF.DAYS.indexOf(a) - PF.DAYS.indexOf(b)); PF.rerender(); };
  PF.on.eqkb = v => { tog(D().eq.kb, num(v)); D().eq.kb.sort((a, b) => a - b); PF.rerender(); };
  PF.on.eqdb = v => { tog(D().eq.db, num(v)); D().eq.db.sort((a, b) => a - b); PF.rerender(); };
  PF.on.eqsb = v => { tog(D().eq.sb, num(v)); D().eq.sb.sort((a, b) => a - b); PF.rerender(); };
  PF.on.eqband = v => { tog(D().eq.bands, v); D().eq.bands.sort((a, b) => BANDS.indexOf(a) - BANDS.indexOf(b)); PF.rerender(); };
  PF.on.eqsw = v => { D().eq[v] = !D().eq[v]; PF.rerender(); };
  PF.on.resetsetup = () => { PF.ui.setup = null; PF.rerender(); };
  PF.on.theme = v => { PF.db.settings.theme = v; if (!PF.readOnly) PF.save(); PF.applyTheme(); PF.rerender(); };
  const diffText = (a, b) => {
    const o = [];
    if (a.sessions !== b.sessions) o.push(`Sessions ${a.sessions} → ${b.sessions} per week`);
    if (a.minutes !== b.minutes) o.push(`Minutes ${a.minutes} → ${b.minutes}`);
    if (a.days.join() !== b.days.join()) o.push(`Days ${a.days.join(', ')} → ${b.days.join(', ')}`);
    for (const [k, n, u] of [['kb', 'Kettlebells', ' kg'], ['db', 'Dumbbells', ' kg'], ['sb', 'Sandbags', ' kg'], ['bands', 'Bands', '']]) {
      const add = b.eq[k].filter(x => !a.eq[k].includes(x)), rem = a.eq[k].filter(x => !b.eq[k].includes(x));
      if (add.length) o.push(`${n} added: ${add.join(', ')}${u}`); if (rem.length) o.push(`${n} removed: ${rem.join(', ')}${u}`);
    }
    for (const k of ['bar', 'mini', 'bench', 'gripper', 'roller']) if (!!a.eq[k] !== !!b.eq[k]) o.push(`${P.EQUIP_NAMES[k]} ${b.eq[k] ? 'added' : 'removed'}`);
    return o;
  };
  PF.on.savesetup = () => {
    if (!PF.guard()) return;
    const d = clone(D()); const pl = P.current(); const s = PF.db.settings;
    const commit = (planToo, from) => {
      Object.assign(s, d); s._setupSeen = true; s.at = PF.now(); PF.save();
      if (planToo && pl) P.applyCfg(pl, d, from);
      PF.ui.setup = null; PF.rerender(); PF.toast(planToo && pl ? `Plan updated from week ${from}` : 'Saved');
    };
    if (!pl || P.weekNo(pl) > 12) return commit(false);
    const wn = P.weekNo(pl), from = wn < 1 ? 1 : wn;
    PF.sheet(`<div class="eyebrow">Save settings</div><h2>Where should these changes apply?</h2>
      <ul class="dots small">${diffText(cfgOf(s), d).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn primary block col" data-apply="cur">Current plan (block ${pl.block}) and new plans<span class="small" style="font-weight:400">${wn < 1 ? "The plan hasn't started yet: changes apply from week 1" : from === 1 ? 'From week 1 (this week) on.' : `From this week (week ${from}) on. Weeks 1–${from - 1} stay as they were.`}</span></button>
      <button class="btn block col" data-apply="new">Only new plans<span class="small muted" style="font-weight:400">Block ${pl.block} keeps its settings</span></button>
      <button class="btn block" data-apply="cancel">Back to editing</button>`,
      (e, close) => { const b = e.target.closest('[data-apply]'); if (!b) return; close(); if (b.dataset.apply === 'cancel') return; commit(b.dataset.apply === 'cur', from); });
  };
  PF.on.xls = v => PF.xls && PF.xls[v] && PF.xls[v]();

  /* =====================================================================================================
     ASSESSMENT
     ===================================================================================================== */
  V.assess = () => {
    PF.header('Assessment training', true);
    if (!PF.ui.assess) PF.ui.assess = Object.assign(clone(P.DEF_ASSESS), P.lastAssessment() ? clone(P.lastAssessment()) : {}, { id: undefined, at: undefined, date: PF.todayIso() });
    const A = PF.ui.assess; const kbs = PF.db.settings.eq.kb.length ? PF.db.settings.eq.kb : KB_ALL;
    const card = t => {
      let ctl;
      const ch = (all, fmt) => `<div class="chips">${all.map(v => `<button type="button" data-tav="${t.k}|${v}" class="${A[t.k] === v ? 'on' : ''}" aria-pressed="${A[t.k] === v}">${fmt(v)}</button>`).join('')}</div>`;
      if (t.type === 'kg') ctl = ch(kbs, v => v + ' kg');
      else if (t.type === 'yn') ctl = ch(['yes', 'heels up', 'no'], v => v);
      else ctl = `<div class="row"><input class="inp num" inputmode="numeric" value="${esc(A[t.k] ?? '')}" data-in="ta" data-k="${t.k}" aria-label="${esc(t.t)}"><span class="muted">${t.u}</span></div>`;
      return `<div class="card stack"><div class="row top">${t.ex ? `<a href="#ex/${t.ex}">${W.thumb(t.ex, 'thumb sm')}</a>` : ''}<div class="spacer"><b>${esc(t.t)}</b><div class="small muted">${esc(t.how)}</div></div></div>${ctl}</div>`;
    };
    return `<div class="stack"><div class="eyebrow">About 30 minutes · warm up first</div><h1>Assessment training</h1>
        <div class="small muted">Instead of picking beginner, intermediate or advanced, these tests set your starting level for each movement. Rest 2–3 minutes between tests. Repeat it any time; week 12 of each block is a good moment.</div></div>
      <div class="field"><label for="adate">Date</label><input class="inp" type="date" id="adate" value="${esc(A.date)}" data-in="ta" data-k="date"></div>
      <h3>Strength</h3>${P.TESTS.filter(t => !t.mob).map(card).join('')}
      <h3>Mobility checks</h3>${P.TESTS.filter(t => t.mob).map(card).join('')}
      <div class="card stack"><h3>What this means for week 1</h3>${assessEffect(A)}</div>
      <button type="button" class="btn primary" data-saveassess="1">Save assessment</button>`;
  };
  function assessEffect(a) {
    const base = P.baseFrom(a);
    const rows = P.LEVEL_PATTERNS.map(p => `<tr><td>${esc(P.PAT_NAMES[p])}</td><td>${esc(P.baseText(p, base[p]))}</td></tr>`).join('');
    const mob = P.mobFlags(a);
    return `<div class="tbl"><table><tbody>${rows}</tbody></table></div><div class="small muted">${mob.length ? 'Extra daily mobility for: ' + mob.map(m => esc(m.t)).join('; ') + '.' : 'No extra mobility work needed.'}</div>`;
  }
  PF.onInput.ta = el => { const k = el.dataset.k; const v = el.value.trim().replace(',', '.'); PF.ui.assess[k] = k === 'date' ? el.value : v === '' || v === '-' ? v : +v; };
  PF.on.saveassess = () => {
    if (!PF.guard()) return; const A = PF.ui.assess;
    for (const t of P.TESTS) if (t.type === 'n' && (A[t.k] === '' || A[t.k] == null || isNaN(+A[t.k]))) return PF.toast(`Enter a number for "${t.t}".`, true);
    const row = {}; for (const t of P.TESTS) row[t.k] = t.type === 'n' ? +A[t.k] : A[t.k]; row.date = A.date || PF.todayIso();
    PF.put('assessments', row); PF.ui.assess = null; PF.toast('Assessment saved');
    PF.go(P.current() && P.weekNo(P.current()) <= 12 ? '#today' : P.current() ? '#next' : '#new');
  };
  PF.on.tav = v => { const [k, x] = v.split('|'); PF.ui.assess[k] = isNaN(+x) ? x : +x; PF.rerender(); };

  /* =====================================================================================================
     NEW PLAN
     ===================================================================================================== */
  V.new = () => {
    PF.header('New 12-week plan', true);
    const s = PF.db.settings; const a = P.lastAssessment();
    if (!PF.ui.np) PF.ui.np = { sessions: s.sessions, minutes: s.minutes, days: s.days.slice(), start: iso(PF.nextMonday()) };
    const N = PF.ui.np; const cur = P.current();
    return `<div class="stack"><div class="eyebrow">${cur ? `Replaces block ${cur.block} as your current plan` : 'Your first block'}</div><h1>New 12-week plan</h1></div>
      ${a ? `<div class="card small">Starting levels from your assessment on ${fmtD(a.date)}. <a href="#assess">Redo it</a></div>` : `<div class="card small warn">No assessment yet: the plan uses moderate default levels. <a href="#assess">Do the assessment first</a> for a better start.</div>`}
      <div class="card stack"><div class="field"><span class="lbl">Sessions per week</span>${W.stepper(N.sessions, 'npsess', 'Sessions per week')}</div>
        <div class="field"><span class="lbl">Minutes per session</span>${W.chips([N.minutes], [20, 30, 45, 60, 75, 90], 'npmin', v => v + ' min')}</div>
        <div class="field"><span class="lbl">Training days</span>${W.chips(N.days, PF.DAYS, 'npday')}${N.days.length !== N.sessions ? `<div class="small warn">Pick ${N.sessions} days.</div>` : ''}</div>
        <div class="field"><label for="npstart">Start date</label><input class="inp" type="date" id="npstart" value="${esc(N.start)}" data-in="npstart"><div class="small muted">Default: Monday next week.</div></div></div>
      ${preview(N)}
      <button type="button" class="btn primary" data-createplan="1" ${N.days.length !== N.sessions ? 'disabled' : ''}>Create plan</button>`;
  };
  function preview(N) {
    const s = PF.db.settings; const cfg = { sessions: N.sessions, minutes: N.minutes, days: N.days.slice(), eq: clone(s.eq) };
    const pl = { id: '_preview', block: (P.current() ? P.current().block : 0) + (N.block ? 0 : 1), start: N.start, cfgHist: [{ from: 1, cfg }], base: N.base || P.baseFrom(P.lastAssessment() || P.DEF_ASSESS), swaps: [] };
    if (N.block) pl.block = N.block;
    return `<div class="card stack"><h3>Week 1 preview</h3>${P.sessionKeys(pl, 1).map((k, i) => { const x = P.session(pl, 1, i); return `<div class="stack" style="gap:4px"><b>${esc(x.name)} · ${fmtD(x.date)}</b>${W.budget(x)}<div class="small muted">${x.items.map(r => esc(EX[r.id].n) + ' (' + PF.w.rxText(r) + ')').join(' · ')}</div></div>`; }).join('<hr class="sep">')}</div>`;
  }
  PF.on.npsess = v => { const N = PF.ui.np; N.sessions = clamp(N.sessions + +v, 2, 6); N.days = (PRESET[N.sessions] || N.days).slice(); PF.rerender(); };
  PF.on.npmin = v => { PF.ui.np.minutes = +v; PF.rerender(); };
  PF.on.npday = v => { tog(PF.ui.np.days, v); PF.ui.np.days.sort((a, b) => PF.DAYS.indexOf(a) - PF.DAYS.indexOf(b)); PF.rerender(); };
  PF.onInput.npstart = el => { if (el.value) { PF.ui.np.start = el.value; } };
  PF.onChange.npstart = el => { if (el.value) { PF.ui.np.start = el.value; PF.rerender(); } };
  PF.on.createplan = async () => {
    if (!PF.guard()) return; const N = PF.ui.np; const s = PF.db.settings; const cur = P.current();
    if (cur && P.weekNo(cur) <= 12 && !(await PF.confirm('Replace the current plan?', `Block ${cur.block} is still running. Your logged sets stay saved; the new plan becomes the current one.`, 'Create new plan'))) return;
    const cfg = { sessions: N.sessions, minutes: N.minutes, days: N.days.slice(), eq: clone(s.eq) };
    Object.assign(s, { sessions: N.sessions, minutes: N.minutes, days: N.days.slice() }); PF.save();
    const a = P.lastAssessment();
    P.create({ start: N.start, cfg, base: P.baseFrom(a || P.DEF_ASSESS), block: cur ? cur.block + 1 : 1, prev: cur ? cur.id : null, assessment: a ? a.id : null });
    PF.ui.np = null; PF.ui.planW = null; PF.toast('Plan created'); PF.go('#plan');
  };

  /* =====================================================================================================
     NEXT BLOCK
     ===================================================================================================== */
  V.next = () => {
    const pl = P.current(); if (!pl) return V.new();
    PF.header(`Block ${pl.block} → ${pl.block + 1}`, true);
    const an = P.analyze(pl, P.weekNo(pl) - 1); const cfg = P.cfgAt(pl, clamp(P.weekNo(pl), 1, 12));
    if (!PF.ui.nb || PF.ui.nb._pl !== pl.id) {
      const st = addDays(P.planEnd(pl), 1);
      PF.ui.nb = { _pl: pl.id, sessions: an.prop.sessions, minutes: an.prop.minutes, days: an.prop.sessions === cfg.sessions ? cfg.days.slice() : PRESET[an.prop.sessions].slice(), steps: clone(an.prop.steps), start: iso(st < today() ? PF.nextMonday() : st) };
    }
    const NB = PF.ui.nb; const early = P.weekNo(pl) <= 12; const lvl = { '-1': 'Easier', '0': 'Same', '1': 'Harder' };
    const eq = PF.db.settings.eq;
    return `<div class="stack"><div class="eyebrow">Built from what you logged in block ${pl.block}</div><h1>Proposal for block ${pl.block + 1}</h1>
        ${early ? `<div class="small warn">Preview: block ${pl.block} runs until ${fmtDY(P.planEnd(pl))}. This uses the ${an.last} week${an.last === 1 ? '' : 's'} logged so far.</div>` : ''}</div>
      <div class="tiles"><div class="tile"><div class="eyebrow">Sessions done</div><div class="v">${an.done}<span class="u">of ${an.planned}</span></div></div>
        <div class="tile"><div class="eyebrow">Per week</div><div class="v">${PF.num(an.avg)}<span class="u">planned ${cfg.sessions}</span></div></div></div>
      <div class="card stack"><h3>What we propose</h3>${an.prop.reasons.length ? an.prop.reasons.map(r => `<div class="small">${esc(r)}</div>`).join('') : '<div class="small">You trained as planned. Keep the same schedule.</div>'}</div>
      <div class="card stack"><h3>Schedule</h3>
        <div class="field"><span class="lbl">Sessions per week ${NB.sessions !== cfg.sessions ? '<span class="pill ex">changed</span>' : ''}</span>${W.stepper(NB.sessions, 'nbsess', 'Sessions per week')}</div>
        <div class="field"><span class="lbl">Minutes per session ${NB.minutes !== cfg.minutes ? '<span class="pill ex">changed</span>' : ''}</span>${W.chips([NB.minutes], [20, 30, 45, 60, 75, 90], 'nbmin', v => v + ' min')}</div>
        <div class="field"><span class="lbl">Training days</span>${W.chips(NB.days, PF.DAYS, 'nbday')}${NB.days.length !== NB.sessions ? `<div class="small warn">Pick ${NB.sessions} days.</div>` : ''}</div></div>
      <div class="card stack"><h3>Starting level per movement</h3><div class="small muted">Compared with where block ${pl.block} started. Proposed values are pre-selected; change any of them.</div>
        ${P.LEVEL_PATTERNS.map(p => { const st = NB.steps[p] || 0; const nb = P.stepBase(P.base(pl), p, st, eq); const prop = an.prop.steps[p];
          return `<div class="stack" style="gap:6px;padding-top:8px;border-top:1px solid var(--line)"><div class="row"><b>${esc(P.PAT_NAMES[p])}</b><span class="spacer"></span><span class="small">${esc(P.baseText(p, P.base(pl)[p]))} → <b>${esc(P.baseText(p, nb))}</b></span></div>
            <div class="small muted">${esc(an.prop.why[p])}</div>
            <div class="seg" role="group" aria-label="${esc(P.PAT_NAMES[p])} level">${[-1, 0, 1].map(v => `<button type="button" data-nbstep="${p}|${v}" class="${st === v ? 'on' : ''}">${lvl[v]}${v === prop ? ' · proposed' : ''}</button>`).join('')}</div></div>`; }).join('')}</div>
      <div class="card stack"><div class="field"><label for="nbstart">Start date</label><input class="inp" type="date" id="nbstart" value="${esc(NB.start)}" data-ch="nbstart"><div class="small muted">Default: the day after block ${pl.block} ends.</div></div></div>
      <div class="row wrap"><button type="button" class="btn primary" data-acceptnext="1" ${NB.days.length !== NB.sessions ? 'disabled' : ''}>Accept and create block ${pl.block + 1}</button><a class="btn" href="#assess">Redo the assessment instead</a></div>`;
  };
  PF.on.nbsess = v => { const N = PF.ui.nb; N.sessions = clamp(N.sessions + +v, 2, 6); N.days = (PRESET[N.sessions] || N.days).slice(); PF.rerender(); };
  PF.on.nbmin = v => { PF.ui.nb.minutes = +v; PF.rerender(); };
  PF.on.nbday = v => { tog(PF.ui.nb.days, v); PF.ui.nb.days.sort((a, b) => PF.DAYS.indexOf(a) - PF.DAYS.indexOf(b)); PF.rerender(); };
  PF.on.nbstep = v => { const [p, s] = v.split('|'); PF.ui.nb.steps[p] = +s; PF.rerender(); };
  PF.onChange.nbstart = el => { if (el.value) PF.ui.nb.start = el.value; };
  PF.on.acceptnext = () => {
    if (!PF.guard()) return; const pl = P.current(); const NB = PF.ui.nb; const s = PF.db.settings;
    const base = clone(P.base(pl)); for (const p of P.LEVEL_PATTERNS) base[p] = P.stepBase(P.base(pl), p, NB.steps[p] || 0, s.eq);
    const cfg = { sessions: NB.sessions, minutes: NB.minutes, days: NB.days.slice(), eq: clone(s.eq) };
    Object.assign(s, { sessions: NB.sessions, minutes: NB.minutes, days: NB.days.slice() }); PF.save();
    P.create({ start: NB.start, cfg, base, block: pl.block + 1, prev: pl.id });
    PF.ui.nb = null; PF.ui.planW = null; PF.toast(`Block ${pl.block + 1} created`); PF.go('#plan');
  };
})();
