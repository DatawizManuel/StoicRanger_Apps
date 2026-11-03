/* SR Physical Fitness — app shell: router, header, tabs, theme, back button, shared widgets; views Today, Plan, Session. */
'use strict';
(function () {
  const { $, $$, esc, clone, fmtD, fmtDY, parseD, iso, today, addDays } = PF;
  const P = PF.plan;
  const V = PF.views = {};
  PF.ui = {};                                         // transient view state (drafts), never saved

  /* ---------- theme ---------- */
  PF.sysDark = matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  PF.applyTheme = () => {
    const t = PF.db.settings.theme || 'auto';
    const dark = t === 'dark' || (t === 'auto' && PF.sysDark);
    document.documentElement.classList.toggle('dark', dark);
  };
  PF.setSysDark = on => { PF.sysDark = !!on; PF.applyTheme(); };
  try { if (window.PFNative && PFNative.isNight) PF.sysDark = !!PFNative.isNight(); } catch (e) { }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!window.PFNative) PF.setSysDark(e.matches); }); } catch (e) { }

  /* ---------- widgets ---------- */
  PF.w = {};
  PF.w.chips = (sel, all, attr, fmt = v => v) => `<div class="chips">${all.map(v => `<button type="button" data-${attr}="${esc(v)}" class="${sel.includes(v) ? 'on' : ''}" aria-pressed="${sel.includes(v)}">${fmt(v)}</button>`).join('')}</div>`;
  PF.w.stepper = (val, attr, label) => `<div class="stepper" role="group" aria-label="${esc(label)}"><button type="button" data-${attr}="-1" aria-label="Less">−</button><output>${esc(val)}</output><button type="button" data-${attr}="1" aria-label="More">+</button></div>`;
  PF.w.sw = (on, attr, label) => `<button type="button" class="sw ${on ? 'on' : ''}" data-${attr} role="switch" aria-checked="${!!on}" aria-label="${esc(label)}"></button>`;
  PF.w.thumb = (id, cls = 'thumb') => EX[id] ? `<span class="${cls}">${FIG.svg(EX[id], 0.999, { label: EX[id].n })}</span>` : '';
  PF.w.rxText = r => {
    const p = [];
    if (r.reps != null) p.push(`${r.sets} × ${r.reps === 'max' ? 'max reps' : r.reps + ' reps'}`);
    else if (r.sec) p.push(`${r.sets} × ${r.sec} s`);
    else if (r.m) p.push(`${r.sets} × ${r.m} m`);
    else p.push(`${r.sets} sets`);
    if (r.kg) p.push(`${PF.num(r.kg)} kg`); if (r.band) p.push(`${r.band} band`);
    return p.join(' · ');
  };
  PF.w.budget = s => {
    const tot = s.cfg.minutes, free = Math.max(0, tot - s.warm - s.cool - s.main); const pc = v => (v / tot * 100).toFixed(1) + '%';
    return `<div class="budget" aria-label="Time budget"><span class="wu" style="width:${pc(s.warm)}">warm-up</span><span class="mn" style="width:${pc(Math.min(s.main, tot))}">${Math.round(s.main)} min</span><span class="cd" style="width:${pc(s.cool)}">cool</span>${free > 1 ? `<span class="fr" style="width:${pc(free)}"></span>` : ''}</div>`;
  };
  PF.sheet = (html, onClick) => {
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<div class="mcard" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); PF._sheet = null; };
    PF._sheet = close;
    d.addEventListener('click', e => { if (e.target === d) return close(); onClick && onClick(e, close); });
    return close;
  };
  PF.confirm = (title, text, ok = 'OK', danger) => new Promise(res => {
    PF.sheet(`<div class="mhead"><h3>${esc(title)}</h3></div><div class="small">${text}</div><div class="row"><button class="btn ${danger ? 'danger' : 'primary'}" data-c="1">${esc(ok)}</button><button class="btn" data-c="0">Cancel</button></div>`,
      (e, close) => { const b = e.target.closest('[data-c]'); if (b) { close(); res(b.dataset.c === '1'); } });
  });

  /* ---------- shell ---------- */
  const TABS = [
    ['today', 'Today', '<path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/>'],
    ['plan', 'Plan', '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
    ['mobility', 'Mobility', '<circle cx="12" cy="5" r="2"/><path d="M12 7.5v6M12 13.5l-4 6M12 13.5l4 6M6 10l6 1 6-1"/>'],
    ['library', 'Exercises', '<path d="M3 9h3v6H3zM18 9h3v6h-3zM6 12h12M8 7v10M16 7v10"/>'],
    ['dashboard', 'Dashboard', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ['setup', 'Setup', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>']
  ];
  function shell() {
    document.body.innerHTML = `<div class="app"><header class="top"><button class="back" id="hBack" aria-label="Back" hidden>‹</button><img class="logo" src="img/emblem.svg" alt="" id="hLogo">
      <div class="spacer"><div class="t1">SR Physical Fitness</div><div class="t2" id="hSub"></div></div><span id="hRight"></span></header>
      ${PF.readOnly ? `<div class="robar">This data was saved by a newer app version. It opens read-only here, nothing is changed. Please update the app.</div>` : ''}
      <main id="view" tabindex="-1"></main></div>
      <nav class="tabs" aria-label="Sections"><div class="in" id="tabs"></div></nav><div id="toast" role="status" aria-live="polite"></div>`;
    $('#hBack').onclick = () => PF.back();
  }
  function renderTabs(cur) { $('#tabs').innerHTML = TABS.map(([h, l, ic]) => `<a href="#${h}" class="${cur === h ? 'on' : ''}" ${cur === h ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${l}</a>`).join(''); }
  PF.header = (sub, back) => { $('#hSub').textContent = sub || ''; $('#hBack').hidden = !back; $('#hLogo').hidden = !!back; };

  /* ---------- router + Android back button ---------- */
  let stack = [];
  PF.go = h => { location.hash = h; };
  PF.back = () => {
    if (PF._sheet) { PF._sheet(); return true; }
    if (stack.length > 1) { history.back(); return true; }
    const h = (location.hash || '#today').slice(1).split('/')[0];
    if (h !== 'today') { location.hash = '#today'; return true; }
    if (Date.now() - (PF._backAt || 0) < 2000) { PF._backAt = 0; PF.flush(); return false; }
    PF._backAt = Date.now(); PF.toast('Press back again to close'); return true;
  };
  PF.route = () => {
    const h = location.hash || '#today';
    if (stack[stack.length - 2] === h) stack.pop(); else if (stack[stack.length - 1] !== h) stack.push(h);
    if (stack.length > 30) stack = stack.slice(-30);
    const [name, ...args] = h.slice(1).split('/');
    const view = V[name] || V.today;
    const tab = { s: 'today', ex: 'library', assess: 'today', new: 'plan', next: 'plan', act: 'today', data: 'setup' }[name] || name;
    renderTabs(TABS.some(t => t[0] === tab) ? tab : 'today');
    PF.stopAnim && PF.stopAnim();
    const el = $('#view');
    try { el.innerHTML = view(...args); } catch (e) { console.error(e); el.innerHTML = `<div class="card err">Something went wrong showing this page: ${esc(e.message)}</div>`; }
    PF.afterRender && PF.afterRender(name, args);
    if (!PF._keepScroll) window.scrollTo(0, 0); PF._keepScroll = false;
  };
  PF.rerender = () => { PF._keepScroll = true; PF.route(); };
  window.addEventListener('hashchange', PF.route);

  /* ---------- delegated clicks (each view registers handlers by data attribute) ---------- */
  PF.on = {};
  document.addEventListener('click', e => {
    for (const k in PF.on) { const t = e.target.closest(`[data-${k}]`); if (t && document.body.contains(t)) { PF.on[k](t.dataset[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())], t, e); return; } }
  });
  document.addEventListener('change', e => { const f = PF.onChange && PF.onChange[e.target.dataset.ch]; if (f) f(e.target); });
  document.addEventListener('input', e => { const f = PF.onInput && PF.onInput[e.target.dataset.in]; if (f) f(e.target); });
  PF.onChange = {}; PF.onInput = {};
  const guard = () => { if (PF.readOnly) { PF.toast('Read-only: this data belongs to a newer app version.', true); return false; } return true; };
  PF.guard = guard;

  /* =====================================================================================================
     TODAY
     ===================================================================================================== */
  const sessLine = (pl, w, i, isNext) => {
    const st = P.status(pl, w, i); const s = st.s;
    return `<a class="card sess ${isNext ? 'next' : ''}" href="#s/${w}/${i}"><span class="badge">${s.key}</span><span class="spacer"><b>${esc(s.name)}</b>
      <div class="small muted">${fmtD(s.date)} · ${s.cfg.minutes} min · ${s.items.length} exercises</div></span>
      ${st.done ? '<span class="pill ok">✓ Done</span>' : st.started ? `<span class="pill">${st.n}/${st.of}</span>` : ''}<span class="chev">›</span></a>`;
  };
  V.today = () => {
    PF.header(fmtDY(today()));
    const pl = P.current(); const a = P.lastAssessment();
    let out = '';
    if (PF.recovered) out += `<div class="card warn small">The data file was damaged. The previous saved copy was opened; the damaged file was kept in the app's backups.</div>`;
    if (PF.migrated) out += `<div class="card small">Your data was updated to the new app version. A copy of the old data was kept first.</div>`;
    if (!pl) {
      out += `<div class="stack"><div class="eyebrow">Welcome</div><h1>Functional fitness on a time budget</h1>
        <div class="muted">Strength, mobility and health in the time you have. Three steps:</div></div>
        <a class="card row" href="#setup"><span class="badge pill ${PF.db.settings._setupSeen ? 'ok' : 'now'}">1</span><span class="spacer"><b>Your time and equipment</b><div class="small muted">${PF.db.settings.sessions} × ${PF.db.settings.minutes} min per week</div></span><span class="chev">›</span></a>
        <a class="card row" href="#assess"><span class="badge pill ${a ? 'ok' : 'now'}">2</span><span class="spacer"><b>Assessment training</b><div class="small muted">${a ? 'Done ' + fmtD(a.date) : '7 short tests and 4 mobility checks set your starting levels'}</div></span><span class="chev">›</span></a>
        <a class="card row" href="#new"><span class="badge pill ${a ? 'now' : ''}">3</span><span class="spacer"><b>Create your 12-week plan</b><div class="small muted">Pick a start date</div></span><span class="chev">›</span></a>
        <div class="card small muted">Everything you enter stays on this phone. Export it to Excel any time under Setup → Data.</div>`;
      return out + mobCard() + actsCard();
    }
    const wn = P.weekNo(pl), cw = P.curW(pl);
    if (wn < 1) out += `<div class="card"><div class="eyebrow">Block ${pl.block}</div><h2>Starts ${fmtDY(pl.start)}</h2><div class="small muted">${pl.cfgHist[0].cfg.sessions} × ${pl.cfgHist[0].cfg.minutes} min per week. You can look at week 1 already.</div></div>`;
    else if (wn > 12) out += `<div class="card stack"><div class="eyebrow">Block ${pl.block} finished</div><h2>Time for block ${pl.block + 1}</h2><div class="small muted">The proposal is built from what you logged.</div><a class="btn primary" href="#next">See the proposal</a></div>`;
    const nx = P.next(pl);
    if (nx) {
      const s = P.session(pl, nx.w, nx.i);
      const isToday = iso(s.date) === iso(today());
      out += `<div class="stack"><div class="eyebrow">${isToday ? 'Today' : s.date < today() ? 'Open from ' + fmtD(s.date) : 'Next: ' + fmtD(s.date)} · week ${nx.w} · ${P.PHASES[P.phaseOf(nx.w)].n}</div><h1>${esc(s.name)}</h1></div>
      <a class="card stack" href="#s/${nx.w}/${nx.i}" style="gap:10px">${PF.w.budget(s)}
        ${s.items.map(r => `<div class="exrow">${PF.w.thumb(r.id, 'thumb sm')}<div class="body"><b>${esc(EX[r.id].n)}</b><div class="small muted">${PF.w.rxText(r)}${r.note ? ' · ' + esc(r.note) : ''}</div></div></div>`).join('')}
        <span class="btn primary block">${P.status(pl, nx.w, nx.i).started ? 'Continue session' : 'Start session'}</span></a>`;
    }
    out += weekCard(pl, cw);
    if (wn >= 11 && wn <= 12) out += `<a class="card row" href="#next"><span class="spacer"><b>Block ${pl.block + 1} preview</b><div class="small muted">Proposal from what you logged so far</div></span><span class="chev">›</span></a>`;
    return out + mobCard() + actsCard();
  };
  function weekCard(pl, w) {
    const keys = P.sessionKeys(pl, w); const nx = P.next(pl);
    return `<div class="stack"><div class="row"><h3>Week ${w} of 12</h3><span class="spacer"></span><a class="small" href="#plan">Whole plan ›</a></div>
      ${keys.map((k, i) => sessLine(pl, w, i, nx && nx.w === w && nx.i === i)).join('')}</div>`;
  }
  function mobCard() {
    const ds = PF.todayIso(); const list = P.mobDay(ds), done = P.mobDone(ds); const n = list.filter(x => done.includes(x.item.id)).length;
    return `<a class="card row" href="#mobility"><span class="spacer"><b>Daily mobility block</b><div class="small muted">${n ? `${n} of ${list.length} done today` : `${list.length} drills, about ${Math.round(list.length * 1.7)} min · optional`}</div></span>${n === list.length ? '<span class="pill ok">✓ Done</span>' : ''}<span class="chev">›</span></a>`;
  }
  PF.actsCard = actsCard;
  function actsCard() {
    const l = PF.db.activities.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    return `<div class="card stack"><div class="row"><h3>Other training</h3><span class="spacer"></span><a class="btn sm" href="#act">+ Log activity</a></div>
      ${l.length ? l.map(a => `<div>${PF.actLine(a)}</div>`).join('') : '<div class="small muted">Walks, hikes, rucks, runs, rides or swims go here.</div>'}</div>`;
  }

  /* =====================================================================================================
     PLAN
     ===================================================================================================== */
  V.plan = (wArg) => {
    const pl = P.current();
    PF.header(pl ? `Block ${pl.block}` : 'No plan yet');
    if (!pl) return `<div class="stack"><h1>No plan yet</h1><div class="muted">Do the assessment, then create your first 12-week block.</div><a class="btn primary" href="#assess">Start the assessment</a><a class="btn" href="#new">Create a plan with default levels</a></div>`;
    const cw = P.curW(pl); const w = +wArg || PF.ui.planW || cw; PF.ui.planW = w;
    const keys = P.sessionKeys(pl, w); const c = P.cfgAt(pl, w);
    const wkCls = x => { const ks = P.sessionKeys(pl, x); const d = ks.filter((k, i) => P.status(pl, x, i).done).length; return [d === ks.length ? 'done' : d ? 'part' : '', x === P.weekNo(pl) ? 'cur' : '', x === w ? 'sel' : ''].join(' '); };
    const hist = pl.cfgHist.length > 1 ? `<div class="small muted">Settings changed from week ${pl.cfgHist.slice(1).map(h => h.from).join(', ')} on.</div>` : '';
    return `<div class="stack"><div class="eyebrow">${fmtD(pl.start)} – ${fmtDY(P.planEnd(pl))}</div><h1>12-week block ${pl.block}</h1>
        <div class="small muted">${c.sessions} × ${c.minutes} min · ${c.days.join(', ')}</div>${hist}</div>
      <div class="card stack"><div class="weeks" role="group" aria-label="Weeks">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-pw="${i + 1}" class="${wkCls(i + 1)}" aria-label="Week ${i + 1}">${i + 1}</button>`).join('')}</div>
        <div class="phases">${P.PHASES.map(p => `<span>${p.n}</span>`).join('')}</div></div>
      <div class="stack"><div class="row"><h3>Week ${w} · ${P.PHASES[P.phaseOf(w)].n}${P.isDeload(w) ? ' · lighter week' : ''}</h3></div>
        ${keys.map((k, i) => sessLine(pl, w, i, false)).join('')}</div>
      <div class="card small muted">${phaseText(w)}</div>
      <div class="card stack"><h3>Starting levels</h3><div class="tbl"><table><tbody>${P.LEVEL_PATTERNS.map(p => `<tr><td>${esc(P.PAT_NAMES[p])}</td><td>${esc(P.baseText(p, P.base(pl)[p]))}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="row wrap"><a class="btn" href="#next">Next block ${P.weekNo(pl) > 12 ? '' : '(preview)'}</a><a class="btn" href="#new">New plan</a></div>`;
  };
  function phaseText(w) {
    return ['Foundation: learn the movements, moderate weights, 10–12 reps. Week 4 is lighter.', 'Build: more sets, heavier weights from week 7, 8 reps. Week 8 is lighter.',
      'Strength: heavy, 5 reps, longer rests.', 'Test week: fewer sets and max-rep tests. Then the next block is proposed from your results.'][P.phaseOf(w)];
  }
  PF.on.pw = v => { PF.ui.planW = +v; PF.rerender(); };

  /* =====================================================================================================
     SESSION (logging)
     ===================================================================================================== */
  V.s = (wA, iA) => {
    const pl = P.current(); if (!pl) return V.plan();
    const w = +wA, i = +iA; const s = P.session(pl, w, i); const row = P.sessRow(pl, w, i);
    PF.header(`Week ${w} · ${fmtD(s.date)}`, true);
    PF.ui.sess = { w, i };
    return `<div class="stack"><div class="eyebrow">Block ${pl.block} · week ${w} · ${P.PHASES[P.phaseOf(w)].n}${P.isDeload(w) ? ' · lighter week' : ''}</div><h1>${esc(s.name)}</h1>${PF.w.budget(s)}
        <div class="small muted">Warm-up ${s.warm} min: easy movement, then 1–2 light sets of the first exercise. Cool-down ${s.cool} min: walk, breathe, stretch.</div></div>
      ${s.items.map(r => exBlock(pl, w, i, s.key, r)).join('')}
      ${s.skipped.length ? `<div class="card small muted">Not in this session: ${s.skipped.map(x => `${esc(P.PAT_NAMES[x.slot])} (${x.why === 'time' ? 'no time left' : 'no equipment'})`).join(', ')}.</div>` : ''}
      <div class="card stack"><div class="field"><label for="snote">Note (optional)</label><textarea id="snote" class="inp" rows="2" data-ch="snote">${esc(row && row.note || '')}</textarea></div>
        <button class="btn ${row && row.done ? '' : 'primary'} block" data-sdone="1">${row && row.done ? '✓ Session done · tap to reopen' : 'Finish session'}</button></div>`;
  };
  function exBlock(pl, w, i, key, r) {
    const ex = EX[r.id]; const logged = P.setsOf(pl, w, i, r.slot);
    const n = Math.max(r.sets, logged.length ? Math.max(...logged.map(x => x.set)) : 0);
    const col = r.sec ? ['sec', 's'] : r.m ? ['m', 'm'] : ['reps', 'reps'];
    const hasKg = !!r.kg || P.loadType(ex);
    const rows = Array.from({ length: n }, (_, k) => {
      const L = logged.find(x => x.set === k + 1) || {};
      const tv = col[0] === 'reps' ? (r.reps === 'max' ? '' : r.reps) : r[col[0]];
      return `<span class="n">${k + 1}</span>
        <input inputmode="numeric" aria-label="Set ${k + 1} ${col[1]}" placeholder="${esc(tv ?? '')}" value="${esc(L[col[0]] ?? '')}" data-ch="set" data-slot="${r.slot}" data-set="${k + 1}" data-f="${col[0]}">
        ${hasKg ? `<input inputmode="decimal" aria-label="Set ${k + 1} kg" placeholder="${esc(r.kg ?? '')}" value="${esc(L.kg ?? '')}" data-ch="set" data-slot="${r.slot}" data-set="${k + 1}" data-f="kg">` : '<span class="small muted">–</span>'}
        <button type="button" class="chk ${L.done ? 'on' : ''}" data-setdone="${r.slot}|${k + 1}" aria-label="Set ${k + 1} done" aria-pressed="${!!L.done}">✓</button>`;
    }).join('');
    return `<div class="card"><div class="exrow"><a href="#ex/${r.id}" aria-label="How to do ${esc(ex.n)}">${PF.w.thumb(r.id)}</a><div class="body">
        <div class="eyebrow">${esc(P.PAT_NAMES[r.slot])}${r.acc ? ' · extra' : ''}</div><b>${esc(ex.n)}</b><div class="rx">${PF.w.rxText(r)}</div>${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}
        <div class="row" style="gap:6px;margin-top:6px"><a class="btn xs" href="#ex/${r.id}">How</a><button type="button" class="btn xs" data-swap="${key}|${r.slot}|${r.id}">Swap</button></div></div></div>
      <div class="sets"><span class="h">Set</span><span class="h">${col[1]}</span><span class="h">${hasKg ? 'kg' : ''}</span><span class="h"></span>${rows}</div>
      <button type="button" class="btn xs" style="margin-top:8px" data-addset="${r.slot}|${n + 1}">+ Set</button></div>`;
  }
  const setRow = (slot, set) => {
    const pl = P.current(); const { w, i } = PF.ui.sess;
    let r = PF.db.sets.find(x => x.plan === pl.id && x.week === w && x.sess === i && x.slot === slot && x.set === set);
    if (!r) { const s = P.session(pl, w, i); const it = s.items.find(x => x.slot === slot); r = { id: PF.uid('s'), plan: pl.id, week: w, sess: i, slot, ex: it ? it.id : '', set, date: PF.todayIso() }; }
    return r;
  };
  PF.onChange.set = el => {
    if (!guard()) return;
    const r = setRow(el.dataset.slot, +el.dataset.set); const v = el.value.trim().replace(',', '.');
    r[el.dataset.f] = v === '' ? null : +v; if (!r.date) r.date = PF.todayIso();
    PF.put('sets', r);
  };
  PF.on.setdone = (v, el) => {
    if (!guard()) return;
    const [slot, set] = v.split('|'); const r = setRow(slot, +set);
    r.done = !r.done; r.date = PF.todayIso();
    // a ticked set without numbers takes the target values
    const pl = P.current(); const { w, i } = PF.ui.sess; const it = P.session(pl, w, i).items.find(x => x.slot === slot);
    if (r.done && it) { if (r.reps == null && typeof it.reps === 'number') r.reps = it.reps; if (r.sec == null && it.sec) r.sec = it.sec; if (r.m == null && it.m) r.m = it.m; if (r.kg == null && it.kg) r.kg = it.kg; }
    PF.put('sets', r); PF.rerender();
  };
  PF.on.addset = v => { if (!guard()) return; const [slot, set] = v.split('|'); const r = setRow(slot, +set); PF.put('sets', r); PF.rerender(); };
  PF.onChange.snote = el => { if (!guard()) return; const pl = P.current(); const { w, i } = PF.ui.sess; const row = P.sessRow(pl, w, i) || { plan: pl.id, week: w, sess: i, done: false }; row.note = el.value; PF.put('sessions', row); };
  PF.on.sdone = () => {
    if (!guard()) return;
    const pl = P.current(); const { w, i } = PF.ui.sess; const row = P.sessRow(pl, w, i) || { plan: pl.id, week: w, sess: i };
    row.done = !row.done; row.date = PF.todayIso(); PF.put('sessions', row);
    if (row.done) { PF.toast('Session saved. Well done.'); PF.go('#today'); } else PF.rerender();
  };
  PF.on.swap = v => {
    if (!guard()) return;
    const [key, slot, cur] = v.split('|'); const pl = P.current(); const { w } = PF.ui.sess;
    const opts = P.candidates(slot).filter(id => P.available(P.cfgAt(pl, w).eq, id));
    PF.sheet(`<div class="mhead"><h3>Swap ${esc(EX[cur].n)}</h3><button class="ib" data-x="1" aria-label="Close">✕</button></div>
      <div class="small muted">Same movement (${esc(P.PAT_NAMES[slot])}), your equipment. Applies to this slot from week ${w} on.</div>
      <div class="stack">${opts.map(id => `<button class="card row" style="text-align:left;cursor:pointer" data-pick="${id}" ${id === cur ? 'disabled' : ''}>${PF.w.thumb(id, 'thumb sm')}<span class="spacer"><b>${esc(EX[id].n)}</b><div class="small muted">Level ${EX[id].lvl}${id === cur ? ' · current' : ''}</div></span></button>`).join('')}</div>`,
      (e, close) => { if (e.target.closest('[data-x]')) return close(); const b = e.target.closest('[data-pick]'); if (!b) return; P.swap(pl, w, key, slot, b.dataset.pick); close(); PF.rerender(); PF.toast('Swapped from week ' + w); });
  };

  /* ---------- start ---------- */
  PF.start = () => {
    PF.applyTheme(); shell();
    if (!location.hash) history.replaceState(null, '', '#today');
    PF.route();
  };
})();
