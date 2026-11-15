/* SR Physical Fitness — drinks and weight log (0.3.0, remark #3), shown on the Dashboard.
   Drinks: one "Add drink" with volumes, no drink types and no advice: today's total against the daily goal from
   Settings › User profile, and the average of the last 7 days.
   Weight: one entry per day (date editable). Graph: the measurements are the primary line (dots on 1M/3M), the 7-day
   average is a thin grey trend line, the goal a dashed line; kg to go and an estimated date at the current trend.
   Metric only: kg and ml. Rows: drinks {id, at, date, time, ml}, weights {id, at, date, kg, note}. */
'use strict';
(function () {
  const { esc, iso, today, addDays, parseD, fmtD, fmtDY } = PF;
  const B = PF.body = {};
  const prof = () => PF.db.settings.profile || PF.DEFAULT_PROFILE();
  const fmtMl = ml => Math.round(ml).toLocaleString('en-GB') + ' ml';
  const kg = v => PF.num(v, 1) + ' kg';
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const numIn = v => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' || isNaN(+s) ? null : +s; };

  /* =========================== drinks =========================== */
  B.dayMl = ds => PF.db.drinks.filter(d => d.date === ds).reduce((a, d) => a + (+d.ml || 0), 0);
  /** average per day over the 7 days before today (today is not over yet); null when nothing was logged then */
  B.avg7 = () => {
    let sum = 0, any = false;
    for (let k = 1; k <= 7; k++) { const ds = iso(addDays(today(), -k)); const v = B.dayMl(ds); if (v) any = true; sum += v; }
    return any ? sum / 7 : null;
  };
  B.addDrink = (ml, date, time) => {
    if (!PF.guard()) return null;
    ml = Math.round(+ml); if (!(ml > 0 && ml <= 5000)) { PF.toast('Enter an amount between 1 and 5000 ml.', true); return null; }
    return PF.put('drinks', { date: date || PF.todayIso(), time: time || nowTime(), ml });
  };
  B.drinksCard = () => {
    const ds = PF.todayIso(), tot = B.dayMl(ds), goal = +prof().drinkMl || 0, avg = B.avg7();
    const list = PF.db.drinks.filter(d => d.date === ds).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const pc = goal ? Math.min(100, tot / goal * 100) : 0;
    return `<div class="card stack" id="drinks"><div class="row"><h3>Drinks</h3><span class="spacer"></span><span class="small muted">today</span></div>
      <div class="row" style="align-items:baseline;gap:6px"><span style="font-size:26px;font-weight:700">${fmtMl(tot)}</span>${goal ? `<span class="small muted">of ${fmtMl(goal)}</span>` : ''}</div>
      ${goal ? `<div class="bar" role="img" aria-label="${Math.round(pc)} % of the daily goal"><i style="width:${pc.toFixed(1)}%"></i></div>` : '<div class="small muted">Set a daily goal in Settings › User profile.</div>'}
      <div class="row wrap"><span class="small" style="font-weight:600">Add drink</span><button type="button" class="btn sm primary" data-drink="250">+250 ml</button><button type="button" class="btn sm primary" data-drink="500">+500 ml</button><button type="button" class="btn sm" data-drink="other">Other amount</button></div>
      ${list.length ? `<div class="chips" aria-label="Drinks today">${list.map(d => `<button type="button" data-deldrink="${esc(d.id)}" aria-label="Remove ${esc(d.ml)} ml at ${esc(d.time || '')}">${esc(d.time || '')} · ${esc(d.ml)} ml ✕</button>`).join('')}</div>` : ''}
      <div class="small muted">Average last 7 days: ${avg == null ? '–' : fmtMl(avg) + ' per day'}</div></div>`;
  };
  PF.on.drink = v => {
    if (v !== 'other') { if (B.addDrink(+v)) { PF.toast(`+${v} ml`); PF.rerender(); } return; }
    PF.sheet(`<div class="mhead"><h3>Add drink</h3><button class="ib" data-x="1" aria-label="Close">✕</button></div>
      <div class="field"><label for="dkMl">Amount (ml)</label><input class="inp" id="dkMl" inputmode="numeric" placeholder="330"></div>
      <div class="row wrap"><div class="field"><label for="dkDate">Date</label><input class="inp" type="date" id="dkDate" value="${PF.todayIso()}"></div>
        <div class="field"><label for="dkTime">Time</label><input class="inp" type="time" id="dkTime" value="${nowTime()}"></div></div>
      <div class="row"><button class="btn primary" data-dk="1">Add</button><button class="btn" data-x="1">Cancel</button></div>`,
      (e, close) => {
        if (e.target.closest('[data-x]')) return close();
        if (!e.target.closest('[data-dk]')) return;
        const ml = numIn(document.getElementById('dkMl').value), date = document.getElementById('dkDate').value || PF.todayIso(), time = document.getElementById('dkTime').value || nowTime();
        if (B.addDrink(ml, date, time)) { close(); PF.toast(`+${Math.round(ml)} ml`); PF.rerender(); }
      });
    setTimeout(() => { const i = document.getElementById('dkMl'); if (i) i.focus(); }, 50);
  };
  PF.on.deldrink = id => {
    if (!PF.guard()) return; const d = PF.db.drinks.find(x => x.id === id); if (!d) return;
    PF.del('drinks', id, `Drink ${d.ml} ml, ${fmtD(d.date)} ${d.time || ''}`.trim());
    PF.toast('Drink removed. Undo under Settings › Recently deleted.'); PF.rerender();
  };

  /* =========================== weight =========================== */
  /** one value per day: the entry changed last wins if two phones logged the same day before a sync */
  B.weights = () => {
    const m = new Map();
    PF.db.weights.forEach(w => { if (!w.date || !(+w.kg > 0)) return; const o = m.get(w.date); if (!o || String(w.at || '') > String(o.at || '')) m.set(w.date, w); });
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  };
  /** the series for the graph: the start weight from the profile is the first point (unless a weight was logged that day or before) */
  B.series = () => {
    const ws = B.weights().map(w => ({ date: w.date, kg: +w.kg, id: w.id })), p = prof();
    if (+p.startKg > 0 && p.startDate && !(ws.length && ws[0].date <= p.startDate)) ws.unshift({ date: p.startDate, kg: +p.startKg, start: true });
    return ws;
  };
  B.start = () => { const p = prof(); if (+p.startKg > 0) return { kg: +p.startKg, date: p.startDate || '' }; const s = B.weights()[0]; return s ? { kg: +s.kg, date: s.date } : null; };
  /** 7-day average at each point: mean of the measurements in the 7 days up to that day */
  B.trend = pts => pts.map((p, i) => { const from = iso(addDays(parseD(p.date), -6)); const w = pts.slice(0, i + 1).filter(q => q.date >= from); return { date: p.date, kg: w.reduce((a, q) => a + q.kg, 0) / w.length }; });
  /** kg per day over the last 28 days of the trend line (least squares); null with fewer than 2 points or 7 days */
  B.slope = pts => {
    if (pts.length < 2) return null;
    const last = parseD(pts[pts.length - 1].date), from = iso(addDays(last, -28));
    const t = B.trend(pts).filter(p => p.date >= from); if (t.length < 2) return null;
    const xs = t.map(p => (parseD(p.date) - last) / 864e5), ys = t.map(p => p.kg);
    if (xs[xs.length - 1] - xs[0] < 7) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    return den ? num / den : null;
  };
  /** goal facts: kg to go and an estimated date at the current trend */
  B.goal = () => {
    const g = +prof().goalKg, ws = B.weights(); if (!(g > 0) || !ws.length) return null;
    const cur = +ws[ws.length - 1].kg, togo = cur - g, pts = B.series(), sl = B.slope(pts);
    const out = { goal: g, cur, togo, slope: sl, reached: Math.abs(togo) < 0.05 };
    if (!out.reached && sl && Math.sign(sl) === -Math.sign(togo) && Math.abs(sl) > 0.001) {
      const days = Math.ceil(Math.abs(togo / sl)); if (days <= 3 * 365) out.eta = addDays(today(), days);
    }
    return out;
  };
  const TF = { '1M': 31, '3M': 92, '1Y': 366, All: 0 };
  B.chart = (pts, tf, goal) => {
    const days = TF[tf] || 0, end = today(), from = days ? iso(addDays(end, -days)) : (pts[0] ? pts[0].date : iso(end));
    const tr = B.trend(pts);
    const vis = pts.filter(p => p.date >= from), vtr = tr.filter(p => p.date >= from);
    if (!vis.length) return `<div class="small muted">No weight in this timeframe.</div>`;
    const W = 320, H = 170, l = 38, r = 10, t = 12, b = 22;
    const x0 = parseD(from) - 0, x1 = Math.max(end - 0, parseD(vis[vis.length - 1].date) - 0), span = Math.max(x1 - x0, 864e5);
    const vals = vis.map(p => p.kg).concat(vtr.map(p => p.kg)); if (goal > 0) vals.push(goal);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.5, (hi - lo) * 0.08); lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
    const X = d => l + (parseD(d) - x0) / span * (W - l - r), Y = v => t + (hi - v) / (hi - lo) * (H - t - b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight, ${esc(tf)}: ${vis.length} measurements${goal > 0 ? ', goal ' + PF.num(goal) + ' kg' : ''}">`;
    const step = [0.5, 1, 2, 5, 10, 20, 50].find(x => (hi - lo) / x <= 5) || 100;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { const y = Y(v); s += `<line x1="${l}" x2="${W - r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/><text x="${l - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end">${PF.num(v, 1)}</text>`; }
    const lab = d => parseD(d).toLocaleDateString('en-GB', days && days <= 92 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' });
    s += `<text x="${l}" y="${H - 6}">${lab(from)}</text><text x="${W - r}" y="${H - 6}" text-anchor="end">${lab(iso(new Date(x1)))}</text>`;
    if (goal > 0) s += `<line x1="${l}" x2="${W - r}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - r - 2}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end" fill="var(--gold)">goal ${PF.num(goal)}</text>`;
    if (vtr.length > 1) s += `<polyline fill="none" stroke="var(--muted)" stroke-opacity=".75" stroke-width="1.2" points="${vtr.map(p => `${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ')}"/>`;
    if (vis.length > 1) s += `<polyline fill="none" stroke="var(--sect)" stroke-width="2.6" stroke-linejoin="round" points="${vis.map(p => `${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ')}"/>`;
    if (tf === '1M' || tf === '3M' || vis.length === 1) vis.forEach(p => { s += `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3.2" fill="var(--sect)"><title>${fmtD(p.date)}: ${PF.num(p.kg)} kg${p.start ? ' (start)' : ''}</title></circle>`; });
    return s + '</svg>';
  };
  B.weightCard = () => {
    const ws = B.weights(), pts = B.series(), st = B.start(), last = ws[ws.length - 1], g = B.goal(), p = prof();
    const tf = TF[PF.db.ui.wtf] !== undefined ? PF.db.ui.wtf : '3M';
    let facts = '';
    if (last) {
      const ch = st ? +last.kg - st.kg : null;
      facts = `<div class="tiles"><div class="tile"><div class="eyebrow">Now</div><div class="v">${PF.num(last.kg, 1)}<span class="u">kg · ${fmtD(last.date)}</span></div></div>
        <div class="tile"><div class="eyebrow">Since start</div><div class="v">${ch == null ? '–' : (ch > 0 ? '+' : ch < 0 ? '−' : '±') + PF.num(Math.abs(ch), 1)}<span class="u">kg${st && st.date ? ' · ' + fmtD(st.date) : ''}</span></div></div></div>`;
    } else if (st) facts = `<div class="small muted">Start: ${kg(st.kg)}${st.date ? ' on ' + fmtDY(st.date) : ''}. Log your weight to see the graph.</div>`;
    let goalTxt = '';
    if (g) goalTxt = g.reached ? `Goal ${kg(g.goal)} reached.` : `Goal ${kg(g.goal)}: ${PF.num(Math.abs(g.togo), 1)} kg to go. ${g.eta ? 'At the current trend about ' + fmtDY(g.eta) + '.' : g.slope == null ? 'An estimated date shows after a week of entries.' : 'The trend is not moving toward the goal at the moment.'}`;
    else if (!(+p.goalKg > 0)) goalTxt = 'No goal set.';
    return `<div class="card stack" id="weight"><div class="row"><h3>Weight</h3><span class="spacer"></span><button type="button" class="btn sm primary" data-logw="1">Log weight</button></div>
      ${facts}
      ${pts.length ? `<div class="seg" role="group" aria-label="Timeframe">${Object.keys(TF).map(k => `<button type="button" data-wtf="${k}" class="${tf === k ? 'on' : ''}" aria-pressed="${tf === k}">${k}</button>`).join('')}</div>
        <div class="chart">${B.chart(pts, tf, +p.goalKg)}</div>
        <div class="legend"><span><i style="background:var(--sect)"></i>Measured</span><span><i style="background:var(--muted)"></i>7-day average</span>${+p.goalKg > 0 ? '<span><i style="background:var(--gold)"></i>Goal</span>' : ''}</div>` : '<div class="small muted">No weight logged yet. Your start weight and goal go under Settings › User profile.</div>'}
      <div class="row wrap"><span class="small spacer">${esc(goalTxt)}</span><button type="button" class="btn xs" data-setgoal="1">${+p.goalKg > 0 ? 'Change goal' : 'Set goal'}</button></div>
      ${ws.length ? `<details data-wdet ${PF.ui.wOpen ? 'open' : ''}><summary class="small">All entries (${ws.length})</summary><div class="stack" style="gap:4px;margin-top:6px">${ws.slice().reverse().map(w => `<div class="row"><span class="spacer small">${fmtDY(w.date)} · <b>${kg(w.kg)}</b>${w.note ? ' · ' + esc(w.note) : ''}</span><button type="button" class="btn xs" data-logw="${esc(w.date)}">Edit</button><button type="button" class="btn xs" data-delw="${esc(w.id)}" aria-label="Delete ${fmtD(w.date)}">✕</button></div>`).join('')}</div></details>` : ''}</div>`;
  };
  document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('[data-wdet]')) PF.ui.wOpen = e.target.open; }, true);
  PF.on.wtf = v => { if (TF[v] === undefined) return; PF.db.ui.wtf = v; if (!PF.readOnly) PF.save(); PF.rerender(); };
  /** saves the weight of a day: the same date updates that day's entry (one per day) */
  B.logWeight = (date, v, note) => {
    if (!PF.guard()) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { PF.toast('Pick a date.', true); return null; }
    if (!(v >= 20 && v <= 400)) { PF.toast('Enter your weight in kg (20–400).', true); return null; }
    const ex = B.weights().find(w => w.date === date);
    const row = ex ? Object.assign(PF.clone(ex), { kg: Math.round(v * 10) / 10, note: note ?? ex.note ?? '' }) : { date, kg: Math.round(v * 10) / 10, note: note || '' };
    return PF.put('weights', row);
  };
  PF.on.logw = v => {
    const date = /^\d{4}/.test(v || '') ? v : PF.todayIso();
    const ws = B.weights(), ex = ws.find(w => w.date === date), last = ws[ws.length - 1], st = B.start();
    PF.sheet(`<div class="mhead"><h3>Log weight</h3><button class="ib" data-x="1" aria-label="Close">✕</button></div>
      <div class="field"><label for="wDate">Date</label><input class="inp" type="date" id="wDate" value="${esc(date)}" max="${PF.todayIso()}"></div>
      <div class="field"><label for="wKg">Weight (kg)</label><input class="inp" id="wKg" inputmode="decimal" value="${esc(ex ? ex.kg : '')}" placeholder="${esc(last ? last.kg : st ? st.kg : '')}"></div>
      <div class="field"><label for="wNote">Note (optional)</label><input class="inp" id="wNote" value="${esc(ex && ex.note || '')}"></div>
      <div class="small muted">One entry per day: a second entry for the same date replaces that day's weight.</div>
      <div class="row"><button class="btn primary" data-wsave="1">Save</button><button class="btn" data-x="1">Cancel</button></div>`,
      (e, close) => {
        if (e.target.closest('[data-x]')) return close();
        if (!e.target.closest('[data-wsave]')) return;
        const d = document.getElementById('wDate').value, k = numIn(document.getElementById('wKg').value), n = document.getElementById('wNote').value.trim();
        if (B.logWeight(d, k, n)) { close(); PF.toast(`Weight saved: ${PF.num(k, 1)} kg`); PF.rerender(); }
      });
    setTimeout(() => { const i = document.getElementById('wKg'); if (i) i.focus(); }, 50);
  };
  PF.on.delw = async id => {
    if (!PF.guard()) return; const w = PF.db.weights.find(x => x.id === id); if (!w) return;
    if (!(await PF.confirm('Delete this weight?', `${esc(fmtDY(w.date))}: ${esc(kg(w.kg))}. You can undo it for 30 days under Settings › Recently deleted.`, 'Delete', true))) return;
    PF.del('weights', id, `Weight ${kg(w.kg)}, ${fmtDY(w.date)}`); PF.rerender();
  };
  B.setProfile = (k, v) => {
    if (!PF.guard()) return false;
    const p = PF.db.settings.profile = Object.assign(PF.DEFAULT_PROFILE(), PF.db.settings.profile || {});
    p[k] = v; PF.db.settings.at = PF.now(); PF.save(); return true;
  };
  PF.on.setgoal = () => {
    const p = prof();
    PF.sheet(`<div class="mhead"><h3>Weight goal</h3><button class="ib" data-x="1" aria-label="Close">✕</button></div>
      <div class="field"><label for="gKg">Goal (kg)</label><input class="inp" id="gKg" inputmode="decimal" value="${esc(p.goalKg ?? '')}"></div>
      <div class="small muted">Shown as a dashed line on the graph. Leave empty for no goal.</div>
      <div class="row"><button class="btn primary" data-gsave="1">Save</button><button class="btn" data-x="1">Cancel</button></div>`,
      (e, close) => {
        if (e.target.closest('[data-x]')) return close();
        if (!e.target.closest('[data-gsave]')) return;
        const v = numIn(document.getElementById('gKg').value);
        if (v != null && !(v >= 20 && v <= 400)) return PF.toast('Enter the goal in kg (20–400).', true);
        if (B.setProfile('goalKg', v)) { close(); PF.rerender(); }
      });
  };

  /* =========================== Settings › User profile =========================== */
  const PF_FIELDS = [['startKg', 'Start weight', 'kg', 'decimal', 20, 400], ['startDate', 'Start date', '', 'date'], ['heightCm', 'Height', 'cm', 'numeric', 80, 250],
    ['goalKg', 'Weight goal', 'kg', 'decimal', 20, 400], ['drinkMl', 'Drinking goal per day', 'ml', 'numeric', 100, 10000]];
  B.profileCard = () => {
    const p = prof();
    return `<div class="card stack" id="profile"><h3>User profile</h3><div class="small muted">The start weight is the first point of the weight graph and the base for "since start". Metric units.</div>
      ${PF_FIELDS.map(([k, l, u, mode]) => `<div class="field"><label for="pf-${k}">${l}${u ? ` (${u})` : ''}</label><input class="inp" id="pf-${k}" ${mode === 'date' ? 'type="date"' : `inputmode="${mode}"`} data-ch="prof" data-k="${k}" value="${esc(p[k] ?? '')}"></div>`).join('')}</div>`;
  };
  PF.onChange.prof = el => {
    const f = PF_FIELDS.find(x => x[0] === el.dataset.k); if (!f) return;
    let v;
    if (f[3] === 'date') v = el.value || '';
    else { v = numIn(el.value); if (v != null && !(v >= f[4] && v <= f[5])) { PF.toast(`${f[1]}: ${f[4]}–${f[5]} ${f[2]}.`, true); el.value = prof()[f[0]] ?? ''; return; } }
    if (B.setProfile(f[0], v)) PF.toast('Saved');
  };

  /* =========================== Settings › Recently deleted =========================== */
  B.trashCard = () => {
    const l = PF.db.trash.map((x, i) => ({ x, i })).sort((a, b) => String(b.x.at).localeCompare(String(a.x.at)));
    return `<div class="card stack" id="trash"><h3>Recently deleted</h3><div class="small muted">What you deleted on this phone in the last 30 days. A delete reaches your other devices with the next sync; Undo brings the entry back everywhere.</div>
      ${l.length ? l.map(({ x, i }) => `<div class="row"><span class="spacer small">${esc(x.label)}<div class="muted">deleted ${new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></span><button type="button" class="btn xs" data-undel="${i}">Undo</button></div>`).join('') : '<div class="small muted">Nothing deleted.</div>'}</div>`;
  };
  PF.on.undel = v => { if (PF.undel(+v)) { PF.toast('Brought back.'); PF.rerender(); } };
})();
