/* Stoic Ranger — dashboard ("Gun performance log"). */
'use strict';
(() => {
const { $, $$, esc, fx } = RB;

const pick = RB.pickSel = (id, label, none, opts, v) => `<label><span>${label}</span><select id="${id}" aria-label="${label}"><option value="">${none}</option>${opts.map(([k, n]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;

/** Shooter → gun → ammunition selection (each list narrowed by the choice before) and everything built for it. */
RB.selectData = f => {
    // optional selection under the header: shooter first, then gun, then ammunition. Each list only offers what
    // occurs together with the choice before it. Kept in settings, so it survives a restart.
    const sheets = RB.db.sheets;
    const kM = s => (RB.munition(s.munitionId) ? s.munitionId : 'n:' + (s.ammo || '')), kS = s => (RB.shooter(s.shooterId) ? s.shooterId : 'n:' + (s.shooter || ''));
    const shooterOpts = RB.db.shooters.map(p => [p.id, p.name]).concat([...new Set(sheets.filter(s => !RB.shooter(s.shooterId) && s.shooter).map(s => s.shooter))].map(n => ['n:' + n, n + ' (not in DB)']));
    if (f.shooter && !shooterOpts.some(o => o[0] === f.shooter)) f.shooter = '';
    const byShooter = sheets.filter(s => !f.shooter || kS(s) === f.shooter);
    const weaponOpts = RB.db.weapons.filter(w => !f.shooter || byShooter.some(s => s.weaponId === w.id)).map(w => [w.id, w.name]);
    if (f.weapon && !weaponOpts.some(o => o[0] === f.weapon)) f.weapon = '';
    const byWeapon = byShooter.filter(s => !f.weapon || s.weaponId === f.weapon);
    const narrowed = f.shooter || f.weapon;
    const ammoOpts = RB.db.munitions.filter(m => !narrowed || byWeapon.some(s => s.munitionId === m.id)).map(m => [m.id, m.name])
      .concat([...new Set(byWeapon.filter(s => !RB.munition(s.munitionId) && s.ammo).map(s => s.ammo))].map(n => ['n:' + n, n + ' (not in DB)']));
    if (f.munition && !ammoOpts.some(o => o[0] === f.munition)) f.munition = '';
    const W = f.weapon;
    const keyM = s => s.munitionId || 'n:' + s.ammo, keyS = s => s.shooterId || 'n:' + s.shooter;
    const keep = s => (!W || s.weaponId === W) && (!f.munition || keyM(s) === f.munition) && (!f.shooter || keyS(s) === f.shooter);
    const filtered = !!(W || f.munition || f.shooter);
    const all = RB.build(keep);
    const sessions = all.sessions.filter(keep);
    const usedBarrels = new Set(sessions.map(s => s.barrelId));
    const barrels = all.barrels.filter(b => W ? b.weaponId === W : !filtered || usedBarrels.has(b.id));
    const ammoIds = new Set(sessions.map(keyM));
    const ammo = all.munitions.filter(m => ammoIds.has(m.id || 'n:' + m.name));
    const ids = new Set(sessions.map(s => s.id));
    const shots = all.shots.filter(t => ids.has(t.sheetId));
    const data = { sessions, shots };

    return { sheets, shooterOpts, weaponOpts, ammoOpts, filtered, all, sessions, barrels, ammo, shots, data };
};

RB.views.dash = {
  render(el) {
    RB.header('Dashboard', { actions: `<a class="ib" href="#/analyse/dope?from=dash" aria-label="Dope cards" title="Dope cards">⌖</a><a class="ib" href="#/download" aria-label="Download" title="Download">⤓</a><a class="ib" href="#/sheets" aria-label="Datasheets">☰</a>` });
    const f = RB.db.settings.dashFilter || (RB.db.settings.dashFilter = { shooter: '', weapon: '', munition: '' });
    const { sheets, shooterOpts, weaponOpts, ammoOpts, filtered, all, sessions, barrels, ammo, shots, data } = RB.selectData(f);
    const W = f.weapon, U = RB.U, A = U.label('ang'), AD = U.imperial() ? 2 : 3;
    const mv = a => { const m = a.id ? RB.munition(a.id) : null; return m ? RB.num(m.nominalV0) : null; };
    const pairs = RB.pairRanking(sessions);

    if (!RB.db.sheets.length && !RB.db.weapons.length) {
      el.innerHTML = `<div class="hero"><div class="kicker">Gun performance log</div><h1>Nothing logged yet</h1>
        <p>Add your guns and ammunition, then fill in a datasheet after each series. The dashboard tracks barrel wear, muzzle velocity, ammo precision and your own progress.</p></div>
        ${RB.quickAddHTML()}<div class="stack"><a class="btn big" href="#/sheets">Datasheets</a><button class="btn big" id="dImp">Import a backup or database.xlsx</button></div>`;
      RB.wireQuickAdd(el); $('#dImp').onclick = () => RB.importAny && RB.importAny();
      return;
    }

    const fitted = barrels.filter(b => b.status === 'fitted').sort((a, b) => b.total - a.total)[0];
    const ranked = ammo.filter(a => a.mrM != null).sort((a, b) => a.mrM - b.mrM);
    const needOf = (list, key) => { const L = list.filter(x => x[key] && !x[key].ok).sort((a, b) => b[key].sets - a[key].sets); return L.length ? L[0][key].msg : ''; };
    const need = msg => `<div class="need">${esc(msg)}</div>`;
    const rounds = sessions.reduce((t, s) => t + (s.rounds || 0), 0);
    const dates = sessions.map(s => s.date).filter(Boolean).sort();
    const wpn = W && !f.munition && !f.shooter ? all.weapons.find(w => w.id === W) : null;
    const take = (() => {
      if (!sessions.length) return 'No datasheets yet for this selection.';
      const bits = [];
      if (fitted) bits.push(`${fitted.name} on the ${fitted.rifle} has ${RB.fmtInt(fitted.total)} rounds, about ${fx(fitted.lifePct, 0)} % of a typical ${RB.fmtInt(fitted.life)}-round life.`);
      if (fitted && fitted.precPer1000 != null) bits.push(`Gun/ammo groups ${fitted.precPer1000 > 0 ? 'grow' : 'shrink'} by ${fx(Math.abs(fitted.precPer1000), 0)} % per 1,000 rounds.`);
      if (ranked[0]) bits.push(`Most precise ammo: ${ranked[0].name}, ${U.fmt('ang', ranked[0].mrM, AD)} mean radius.`);
      return bits.join(' ') || `${sessions.length} sheets logged.`;
    })();

    el.innerHTML = `
      <div class="brandbar">${RB.logo('dlogo')}<div><div class="bt">Stoic Ranger</div><div class="bs">Gun Database · performance log</div></div></div>
      <div class="filters">
        ${pick('dS', 'Shooter', 'All shooters', shooterOpts, f.shooter)}
        ${pick('dW', 'Gun', 'All guns', weaponOpts, W)}
        ${pick('dM', 'Ammunition', 'All ammunition', ammoOpts, f.munition)}
      </div>
      <div class="fbar"><span class="fnote">${filtered ? `Showing ${sessions.length} of ${sheets.length} sheets` : `All ${sheets.length} sheets`}</span><button class="btn sm" id="dClear" ${filtered ? '' : 'disabled'}>Clear selection</button></div>
      ${RB.quickAddHTML()}
      <div class="qa"><a class="btn" href="#/analyse/dope?from=dash">Dope cards</a><a class="btn" href="#/download">Download / print</a></div>
      <p class="lead">${esc(take)}</p>
      <div class="tiles">
        <div class="tile"><div class="l">Rounds on fitted barrel</div><div class="v">${fitted ? RB.fmtInt(fitted.total) : '–'}</div><div class="s">${fitted ? esc(fitted.name + ' · ' + fitted.rifle) : 'No barrel registered'}</div></div>
        <div class="tile"><div class="l">Barrel life used</div><div class="v">${fitted && fitted.lifePct != null ? fx(fitted.lifePct, 0) + ' %' : '–'}</div><div class="s">${fitted ? 'of a typical ' + RB.fmtInt(fitted.life) + ' rounds' : ''}</div></div>
        <div class="tile"><div class="l">Best ammo, mean radius</div><div class="v">${ranked[0] ? U.num('ang', ranked[0].mrM, AD) : '–'}<small>${ranked[0] ? ' ' + A : ''}</small></div><div class="s">${ranked[0] ? esc(ranked[0].name) : esc(needOf(ammo, 'precNeed') || 'No gun/ammo sheets yet')}</div></div>
        <div class="tile"><div class="l">${wpn ? 'Gun total' : 'Sheets · rounds'}</div><div class="v">${wpn ? RB.fmtInt(wpn.total) : sessions.length + ' · ' + RB.fmtInt(rounds)}</div><div class="s">${dates.length ? RB.fmtDate(dates[0]) + ' – ' + RB.fmtDate(dates[dates.length - 1]) : 'No sheets yet'}</div></div>
      </div>

      <h2>Barrel wear and round count</h2>
      <p class="sec">Wear is judged only from sheets whose purpose is evaluated for gun and ammo (Test, Load development …). Each such group is compared with the median group of the same ammo, so switching ammo or a bad training day doesn't count against the barrel.</p>
      <div class="card"><h3>Test-group size vs rounds through the barrel</h3><div class="note">Mean radius relative to that ammo's median (1.0 = normal). Lines: trend per barrel.</div><div id="cWear"></div></div>
      <div class="card"><h3>Muzzle velocity vs rounds through the barrel</h3><div class="note">V0 per sheet (Xero C1 Pro), one colour per ammo. Throat erosion shows as a slow drop with the same load.</div><div id="cV0"></div></div>
      <div class="card"><h3>Barrels</h3><div class="tw"><table class="tbl"><thead><tr><th class="t">Barrel</th><th class="t">Gun</th><th>Rounds</th><th>Life</th><th>Tests</th><th>Group /1k</th><th>V0 /1k ${U.label('vel')}</th></tr></thead><tbody>
        ${barrels.map(b => `<tr data-href="#/db/barrels/${encodeURIComponent(b.id)}"><td class="t">${esc(b.name)}${b.status === 'removed' ? ' <span class="pill">removed</span>' : ''}</td><td class="t">${esc(b.rifle)}</td><td>${RB.fmtInt(b.total)}</td><td>${b.lifePct != null ? `<span class="bar ${b.lifePct > 85 ? 'hot' : ''}" style="width:${Math.min(40, b.lifePct * .4)}px"></span>${fx(b.lifePct, 0)} %` : ''}</td><td>${b.testSessions}</td><td>${b.precPer1000 != null ? (b.precPer1000 > 0 ? '+' : '') + fx(b.precPer1000, 0) + ' %' : '–'}</td><td>${b.v0Per1000 != null ? U.num('vel', b.v0Per1000, 1) : '–'}</td></tr>`).join('') || '<tr><td colspan="7" class="note">No barrels.</td></tr>'}
      </tbody></table></div><div class="note">Round count includes sighters and the rounds log. Trends need at least ${RB.MIN_SETS} sets of ${RB.SET_ROUNDS} rounds per barrel.</div>${barrels.filter(b => !b.precNeed.ok).map(b => need(b.name + ' (' + b.rifle + '): ' + b.precNeed.msg)).join('')}</div>

      <h2>Ammunition and loads</h2>
      <p class="sec">Precision per ammo uses gun/ammo sheets only, pooled by shot count. Nothing is calculated before ${RB.MIN_SETS} sets of ${RB.SET_ROUNDS} rounds. Mean radius is the steadiest measure for small groups.</p>
      <div class="card"><h3>Ammo comparison</h3><div class="tw"><table class="tbl"><thead><tr><th class="t">Ammo</th><th>Tests</th><th>Shots</th><th>MR ${A}</th><th>Avg ES</th><th>Best ES</th><th>Maker V0</th><th>Measured V0</th><th>SD</th></tr></thead><tbody>
        ${ammo.map(a => `<tr ${a.id ? `data-href="#/db/munitions/${encodeURIComponent(a.id)}"` : ''}><td class="t">${esc(a.name)}${a.loose ? ' <span class="pill">not in DB</span>' : ''}</td><td>${a.testSessions}</td><td>${a.testShots}</td><td>${a.mrM != null ? `<span class="bar" style="width:${Math.min(40, a.mrM * 200)}px"></span>${U.num('ang', a.mrM, AD)}` : '–'}</td><td>${a.esAvg != null ? U.num('ang', a.esAvg) : '–'}</td><td>${a.esBest != null ? U.num('ang', a.esBest) : '–'}</td><td>${mv(a) != null ? U.num('vel', mv(a)) : '–'}</td><td>${a.v0 != null ? U.num('vel', a.v0) : '–'}</td><td>${a.v0sd != null ? U.num('vel', a.v0sd, 1) : '–'}</td></tr>`).join('') || '<tr><td colspan="9" class="note">No ammo on sheets yet.</td></tr>'}
      </tbody></table></div><div class="note">${U.imperial() ? '1 MOA ≈ 1.05 in at 100 yd' : '1 mrad = 10 cm at 100 m'}. ES in ${A}. Maker V0 from the ammo database; measured V0 and SD pooled from the sheets, in ${U.label('vel')}.</div>${ammo.filter(a => !a.precNeed.ok || !a.vNeed.ok).map(a => need(a.name + ': ' + (!a.precNeed.ok ? 'precision – ' + a.precNeed.msg.replace('Not enough data to evaluate – ', '') : '') + (!a.precNeed.ok && !a.vNeed.ok ? ' · ' : '') + (!a.vNeed.ok ? 'V0 – ' + a.vNeed.msg.replace('Not enough data to evaluate – ', '') : ''))).join('')}</div>
      <div class="card"><h3>Most precise ammo per barrel</h3><div class="note">Gun/ammo sheets only, pooled mean radius per barrel and ammo. Each pair needs ${RB.MIN_SETS} sets of ${RB.SET_ROUNDS} rounds before it is ranked. ★ = best on that barrel.</div>
        ${pairs.length ? pairs.map(B => `<div class="rk"><div class="rkh">${esc(B.barrel)} <span class="note">· ${esc(B.rifle)}</span></div><div class="tw"><table class="tbl"><thead><tr><th>#</th><th class="t">Ammo</th><th>MR ${A}</th><th>Avg ES</th><th>Shots · sets</th><th>V0 ${U.label('vel')}</th></tr></thead><tbody>
          ${B.rows.map((r, i) => `<tr ${r.munitionId ? `data-href="#/db/munitions/${encodeURIComponent(r.munitionId)}"` : ''} class="${r.ok && i === 0 ? 'best' : ''}"><td>${r.ok ? (i === 0 ? '★' : i + 1) : '–'}</td><td class="t">${esc(r.ammo)}</td><td>${r.mrM != null ? U.num('ang', r.mrM, AD) : '–'}</td><td>${r.esAvg != null ? U.num('ang', r.esAvg) : '–'}</td><td>${r.shots} · ${r.sets}</td><td>${r.v0 != null ? U.num('vel', r.v0) + (r.v0sd != null ? ' ± ' + U.num('vel', r.v0sd, 1) : '') : '–'}</td></tr>${r.ok ? '' : `<tr class="nr"><td></td><td colspan="5" class="note">${esc(r.need.msg)}</td></tr>`}`).join('')}
          </tbody></table></div></div>`).join('') : need('No gun/ammo sheets with groups yet.')}</div>
      <div class="card"><h3>All test shots, each group centred</h3><div class="note">Every shot relative to its own group centre, so aim and zero don't matter. A tighter cloud is a more precise ammo.</div><div id="cCloud"></div></div>
      <div class="card"><h3>Load development</h3><div class="note">Handloads with a charge weight. Bars: mean radius. Dots: V0. Look for a charge where velocity flattens and groups stay small.</div><div id="cLadder"></div></div>

      <h2>Shooter</h2>
      <p class="sec">Shooter sheets (Training, Competition …) measure the shooter; gun/ammo sheets show what gun and ammo can do. The gap between the two lines is the shooter's share of the group.</p>
      <div class="card"><h3>Group size over time</h3><div class="note">Mean radius in ${A} per sheet.</div><div id="cTrend"></div></div>
      <div class="card"><h3>Average ring per shooter sheet</h3><div class="note">Ring 1–10, scored to the bullet edge.</div><div id="cRing"></div></div>`;

    [['dW', 'weapon'], ['dM', 'munition'], ['dS', 'shooter']].forEach(([id, k]) => $('#' + id).onchange = e => { f[k] = e.target.value; RB.save(); RB.views.dash.render(el); });
    RB.wireQuickAdd(el);
    $('#dClear').onclick = () => { Object.assign(f, { shooter: '', weapon: '', munition: '' }); RB.save(); RB.views.dash.render(el); };
    $$('tr[data-href]', el).forEach(tr => tr.onclick = () => RB.go(tr.dataset.href));

    const draw = () => {
      if (!$("#cWear")) return;               // view was left before the frame
      const okBarrels = barrels.filter(b => b.precNeed.ok).map(b => b.id);
      const byBarrel = [...new Set(sessions.filter(s => s.mrRel != null && okBarrels.includes(s.barrelId)).map(s => s.barrelId))];
      const wearSeries = byBarrel.map(b => ({ name: (RB.barrel(b) || {}).name || b, pts: sessions.filter(s => s.barrelId === b && s.mrRel != null).map(s => ({ x: s.barrelRoundsBefore, y: s.mrRel, tip: `${RB.fmtDate(s.date)} · ${esc(s.ammo)}<br>${fx(s.mrRel, 2)} × median · ${RB.fmtInt(s.barrelRoundsBefore)} rds` })) }));
      const lines = byBarrel.map((b, i) => { const L = RB.fitLine(sessions.filter(s => s.barrelId === b && s.mrRel != null).map(s => [s.barrelRoundsBefore, s.mrRel])); return L ? Object.assign(L, { color: RB.color(i) }) : null; }).filter(Boolean);
      RB.chart.scatter($('#cWear'), { series: wearSeries, lines, refY: 1, x0: true, xLabel: 'Rounds through the barrel', yLabel: '× median MR', empty: needOf(barrels, 'precNeed') || 'No gun/ammo sheets yet.' });
      const vAmmo = ammo.filter(a => a.vNeed.ok).map(a => a.name);
      RB.chart.scatter($('#cV0'), { series: vAmmo.map(a => ({ name: a, pts: sessions.filter(s => s.ammo === a && s.v0).map(s => ({ x: s.barrelRoundsBefore, y: U.from('vel', s.v0), tip: `${RB.fmtDate(s.date)} · ${esc(a)}<br>${U.fmt('vel', s.v0)}${s.v0sd ? ' ± ' + U.num('vel', s.v0sd, 1) : ''}` })) })).filter(x => x.pts.length), x0: true, xLabel: 'Rounds through the barrel', yLabel: 'V0 ' + U.label('vel'), empty: needOf(ammo, 'vNeed') || 'No V0 on the sheets yet.' });
      const pAmmo = ammo.filter(a => a.precNeed.ok).map(a => a.name);
      const cen = RB.centred(data).filter(c => pAmmo.includes(c.ammo)), cams = [...new Set(cen.map(c => c.ammo))];
      if (cen.length) RB.chart.cloud($('#cCloud'), { series: cams.map(a => ({ name: a, pts: cen.filter(c => c.ammo === a).map(c => ({ dx: U.from('ang', c.dx), dy: U.from('ang', c.dy) })) })) });
      else $('#cCloud').innerHTML = need(needOf(ammo, 'precNeed') || 'No gun/ammo sheets with hits yet.');
      RB.chart.ladder($('#cLadder'), ammo.filter(a => a.chargeG && a.mrM != null).sort((a, b) => a.chargeG - b.chargeG).map(a => ({ name: a.name, chargeG: U.from('mass', a.chargeG), mrM: U.from('ang', a.mrM), v0: a.v0 != null ? U.from('vel', a.v0) : null })));
      const kinds = [['rifle', 'Gun / ammo sheets'], ['shooter', 'Shooter sheets']];
      const tSets = kinds.map(([k]) => RB.enough(sessions.filter(s => s.evalAs === k && s.mrM != null && s.date).map(s => s.hits)));
      RB.chart.scatter($('#cTrend'), { dates: true, series: kinds.map(([k, n], i) => ({ name: n, join: true, pts: tSets[i].ok ? sessions.filter(s => s.evalAs === k && s.mrM != null && s.date).map(s => ({ x: s.date, y: U.from('ang', s.mrM), tip: `${RB.fmtDate(s.date)} · ${esc(RB.purposeName(s.purpose))}<br>${U.fmt('ang', s.mrM, AD)} · ${s.dist ? U.fmt('dist', s.dist) : '?'}` })) : [] })).filter(s => s.pts.length), y0: true, yLabel: 'MR ' + A, empty: tSets.find(t => !t.ok) ? tSets.sort((a, b) => b.sets - a.sets)[0].msg : 'No groups with a distance yet.' });
      const tr = sessions.filter(s => s.evalAs === 'shooter' && s.avgRing != null), rNeed = RB.enough(tr.map(s => s.hits));
      RB.chart.bars($('#cRing'), { items: rNeed.ok ? tr.map(s => ({ label: RB.fmtDate(s.date).slice(0, 5), value: s.avgRing, tip: `${RB.fmtDate(s.date)} · ${esc(RB.purposeName(s.purpose))}<br>avg ring ${fx(s.avgRing, 2)} · ${s.hits} shots` })) : [], yDomain: [0, 10], yLabel: 'Avg ring', empty: rNeed.ok ? 'No shooter sheets with hits yet.' : rNeed.msg });
    };
    requestAnimationFrame(draw);
    RB._onResize = draw;
  },
};
})();
