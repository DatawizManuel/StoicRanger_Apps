/* Stoic Ranger - Shooting Drills — drill library (filters), the one-page drill view and the result form. */
'use strict';
(() => {
const { $, $$, esc } = SD;

const AXES = [
  ['weapon', 'Gun', [['', 'All'], ['pistol', 'Pistol'], ['rifle', 'Rifle']]],
  ['fire', 'Fire', [['', 'All'], ['live', 'Live'], ['dry', 'Dry']]],
  ['motion', 'Motion', [['', 'All'], ['static', 'Static'], ['dynamic', 'Dynamic']]],
  ['timed', 'Timer', [['', 'All'], ['timed', 'Timed'], ['untimed', 'Not timed']]],
];
const LEVELS = [['', 'Any level'], ['1', 'Basic'], ['2', 'Intermediate'], ['3', 'Advanced']];
SD.levelName = l => (LEVELS.find(x => x[0] === String(l)) || [0, ''])[1];

const tagRow = d => `<span class="tag k">${d.weapon === 'pistol' ? 'Pistol' : 'Rifle'}</span><span class="tag">${d.motion === 'static' ? 'Static' : 'Dynamic'}</span><span class="tag">${d.timed ? 'Timed' : 'Not timed'}</span><span class="tag ${d.live && d.dry ? 'both' : d.live ? 'live' : 'dry'}">${SD.fireText(d)}</span>`;
SD.drillCard = d => {
  const n = SD.resultsOf(d.id).length;
  return `<a class="item drill" href="#/drill/${d.id}">
    <div class="main"><div class="t">${esc(d.name)}${SD.isFav(d.id) ? '<span class="star on" aria-label="Favourite">★</span>' : ''}</div>
      ${d.aka && d.aka.length ? `<div class="aka">aka ${esc(d.aka.join(', '))}</div>` : ''}
      <div class="kvs"><span>${esc(d.distance)}</span>${d.rounds ? `<span>${esc(d.rounds)} rds</span>` : '<span>no ammo</span>'}${d.par ? `<span>par ${esc(d.par.split(' (')[0].split(' / ')[0])}</span>` : ''}${d.printable ? '<span class="pr">⎙ target</span>' : ''}</div>
      <div class="tags sm">${tagRow(d)}</div></div>
    <div class="side"><div class="lvl" title="${SD.levelName(d.level)}">${'▮'.repeat(d.level)}<i>${'▮'.repeat(3 - d.level)}</i></div>${n ? `<div class="u">${n} result${n === 1 ? '' : 's'}</div>` : ''}</div>
  </a>`;
};

SD.views.drills = {
  render(el) {
    const f = SD.db.settings.filter;
    SD.header('Drills', { actions: `<button class="ib${f.fav ? ' on' : ''}" id="dFav" aria-label="Favourites only">${f.fav ? '★' : '☆'}</button>` });
    const list = SD.DRILLS.filter(d => SD.matches(d, f));
    el.innerHTML = `
      <input type="search" class="search" id="dQ" placeholder="Search ${SD.DRILLS.length} drills, e.g. Mozambique, malfunction, 1 to 5" value="${esc(f.q || '')}">
      ${AXES.map(([k, l, opts]) => `<div class="seg fseg" data-ax="${k}" aria-label="${l}">${opts.map(([v, t]) => `<a href="javascript:void 0" data-v="${v}" class="${(f[k] || '') === v ? 'on' : ''}">${t}</a>`).join('')}</div>`).join('')}
      <div class="fbar"><select id="dLvl" aria-label="Level">${LEVELS.map(([v, t]) => `<option value="${v}"${(f.level || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <button class="btn sm" id="dClear"${SD.filterActive(f) ? '' : ' disabled'}>✕ Clear selection</button></div>
      <div class="fnote"><b>${list.length}</b> of ${SD.DRILLS.length} drills${f.fav ? ' · favourites only' : ''}${SD.filterActive(f) ? '' : ' · no filter set'}</div>
      <div id="dList">${SD.GROUPS.map(([w, m, t]) => {
        const g = list.filter(d => d.weapon === w && d.motion === m && d.timed === t);
        return g.length ? `<div class="ytitle"><span>${SD.groupTitle(w, m, t)}</span><span>${g.length}</span></div><div class="list">${g.map(SD.drillCard).join('')}</div>` : '';
      }).join('') || `<div class="empty">No drill matches this filter.<br><a href="javascript:void 0" id="dReset">Show all drills</a></div>`}</div>`;
    const set = (k, v) => { f[k] = v; SD.save(); SD.route(); };
    $$('.fseg', el).forEach(s => $$('a', s).forEach(a => a.onclick = () => set(s.dataset.ax, a.dataset.v)));
    $('#dLvl', el).onchange = e => set('level', e.target.value);
    $('#dFav').onclick = () => set('fav', !f.fav);
    const q = $('#dQ', el);
    q.oninput = SD.debounce(() => { f.q = q.value.trim(); SD.save(); const pos = q.selectionStart; SD.route(); const n = $('#dQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
    const clear = () => { Object.assign(f, SD.emptyFilter()); SD.save(); SD.route(); SD.toast('Selection cleared: all drills.'); };
    $('#dClear', el).onclick = clear;
    const r = $('#dReset', el); if (r) r.onclick = clear;
  },
};

/* ---------- one-page drill view ---------- */
SD.views.drill = {
  tab: 'drills',
  render(el, [id]) {
    const d = SD.drill(id);
    if (!d) { SD.header('Drill', { back: true }); el.innerHTML = '<div class="empty">This drill is not in the library.</div>'; return; }
    const fav = SD.isFav(d.id), res = SD.resultsOf(d.id), best = SD.best(d, res), p = d.printable && SD.printable(d.printable);
    const dg = SD.diagram(d), st = SD.setup(d);
    SD.header(d.weapon === 'pistol' ? 'Pistol drill' : 'Rifle drill', { back: true, actions: `<button class="ib" id="dvFav" aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}">${fav ? '★' : '☆'}</button><button class="ib" id="dvPrint" aria-label="Print this drill">⎙</button>` });
    el.innerHTML = `
      <article class="onepager">
        <div class="opid">${esc(d.id)} · ${SD.levelName(d.level)}</div>
        <h1 class="optitle">${esc(d.name)}</h1>
        ${d.aka && d.aka.length ? `<div class="aka">Also known as ${esc(d.aka.join(', '))}</div>` : ''}
        <div class="tags">${tagRow(d)}${st.start ? `<span class="tag">Start: ${esc(st.start)}</span>` : ''}</div>
        <p class="lead">${esc(d.goal)}.</p>
        <div class="kv3 facts">
          <div><div class="l">Distance</div><div class="v">${esc(d.distance)}</div></div>
          <div><div class="l">Rounds</div><div class="v">${d.rounds ? esc(d.rounds) : '<small>none</small>'}</div></div>
          <div><div class="l">Par time</div><div class="v">${d.par ? esc(d.par) : '<small>not timed</small>'}</div></div>
        </div>
        <div class="kvt"><span class="l">Target</span> ${esc(d.target)}</div>
        ${dg ? `<h2>Setup</h2><div class="dgw">${dg}</div>` : ''}
        <h2>How to</h2>
        <ol class="steps">${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="std"><div class="l">Standard</div>${esc(d.standard)}</div>
        ${d.dryNote ? `<div class="drynote"><div class="l">Dry fire</div>${esc(d.dryNote)}</div>` : ''}
        ${d.credit ? `<p class="note">${esc(d.credit)}.</p>` : ''}
        ${p ? `<div class="card prt"><div class="pthumb">${SD.printableSvg(p.id, { cls: 'thumb' })}</div><div class="pmain"><h3>Printable target</h3><p><b>${esc(p.name)}</b> · ${esc(p.desc)}</p>
          <button class="btn pri" id="dvTarget">⎙ Print target</button></div></div>` : ''}
        <h2>Results <small class="mono">${res.length}</small></h2>
        ${best ? `<div class="best"><span class="l">Best</span> ${esc(SD.resultText(d, best))} <small>· ${esc(SD.fmtDate(best.date))}${best.shooterId ? ' · ' + esc(SD.nameOf('shooters', best.shooterId)) : ''}</small></div>` : ''}
        <div class="list">${res.slice(0, 8).map(r => resultItem(d, r)).join('') || '<div class="empty">No results yet. Run the drill and log how it went.</div>'}</div>
        <div class="stack"><a class="btn pri big" href="#/result/new?drill=${d.id}">Log a result</a>
          <button class="btn" id="dvPrint2">⎙ Print this drill as one page</button></div>
        <div class="safety"><div class="l">Safety</div>${d.live ? esc(SD.SAFETY_LIVE) + '<br>' : ''}${d.dry ? esc(SD.SAFETY_DRY) : ''}</div>
      </article>`;
    $('#dvFav').onclick = () => { SD.toggleFav(d.id); SD.toast(SD.isFav(d.id) ? 'Added to favourites.' : 'Removed from favourites.'); SD.route(); };
    $('#dvPrint').onclick = $('#dvPrint2', el).onclick = () => { SD.flush(); SD.printDrill(d); };
    const tb = $('#dvTarget', el); if (tb) tb.onclick = () => SD.printPrintable(p.id);
    $$('.item[data-href]', el).forEach(it => it.onclick = () => SD.go(it.dataset.href));
  },
};
function resultItem(d, r) {
  return `<div class="item" data-href="#/result/${encodeURIComponent(r.id)}"><div class="main">
    <div class="date">${esc(SD.fmtDate(r.date))} <span class="tag ${r.mode === 'dry' ? 'dry' : 'live'}">${r.mode === 'dry' ? 'Dry' : 'Live'}</span>${r.pass === true ? '<span class="tag ok">Passed</span>' : r.pass === false ? '<span class="tag no">Not passed</span>' : ''}</div>
    <div class="t">${esc(SD.resultText(d, r) || 'Result')}</div>
    <div class="kvs">${[SD.nameOf('shooters', r.shooterId), SD.nameOf('weapons', r.weaponId), r.distanceM != null && r.distanceM !== '' && r.distanceM + ' m'].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}${r.training ? `<span class="pill linked">Training ${esc(r.training.id)}</span>` : ''}</div>
    ${r.notes ? `<div class="desc">${esc(r.notes)}</div>` : ''}</div></div>`;
}
SD.resultItem = resultItem;

/* ---------- result form ---------- */
SD.views.result = {
  tab: 'drills',
  render(el, [id = 'new'], q) {
    const isNew = id === 'new', r = isNew ? null : SD.byId(SD.db.results, id);
    if (!isNew && !r) { SD.header('Result', { back: true }); el.innerHTML = '<div class="empty">This result no longer exists.</div>'; return; }
    const s = SD.db.settings;
    const v = r ? Object.assign({}, r) : { drillId: q.drill || '', date: SD.today(), shooterId: s.lastShooter || '', weaponId: s.lastWeapon || '', mode: '' };
    let d = SD.drill(v.drillId);
    if (isNew && d && !v.mode) v.mode = d.live ? 'live' : 'dry';
    SD.header(isNew ? 'Log result' : 'Result', { back: true, actions: '<button class="ib" id="rsTop" aria-label="Save">✓</button>' });
    const opts = (t, sel, wantType) => `<option value="">–</option>` + SD.sorted(t).filter(x => x.id === sel || !x.status || x.status === 'Active').map(x => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    el.innerHTML = `
      ${r ? `<div class="idline">${esc(r.id)}</div>` : ''}
      <div class="card"><div class="fg">
        <label class="s6"><span>Drill *</span><select id="rDrill"><option value="">Choose a drill</option>${SD.GROUPS.map(([w, m, t]) => `<optgroup label="${SD.groupTitle(w, m, t)}">${SD.DRILLS.filter(x => x.weapon === w && x.motion === m && x.timed === t).map(x => `<option value="${x.id}"${x.id === v.drillId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <div class="s6 note" id="rInfo"></div>
        <label class="s3"><span>Date *</span><input type="date" id="rDate" value="${esc(v.date || '')}"></label>
        <label class="s3"><span>Live / dry</span><select id="rMode"><option value="live"${v.mode !== 'dry' ? ' selected' : ''}>Live fire</option><option value="dry"${v.mode === 'dry' ? ' selected' : ''}>Dry fire</option></select></label>
        <div class="s6" id="rTrWrap"${SD.linkOn() || v.training ? '' : ' hidden'}><label><span class="flabel">Training (SR_Training Log)</span><select id="rTraining"></select></label><small class="note" id="rTrNote"></small></div>
        <label class="s3"><span>Shooter</span><div class="selrow"><select id="rShooter">${opts('shooters', v.shooterId)}</select><button class="btn sm" type="button" id="rAddS" aria-label="Add new shooter">＋</button></div></label>
        <label class="s3"><span>Gun</span><div class="selrow"><select id="rGun">${opts('weapons', v.weaponId)}</select><button class="btn sm" type="button" id="rAddW" aria-label="Add new gun">＋</button></div></label>
        <label class="s2"><span>Time s</span><input type="number" step="0.01" inputmode="decimal" id="rTime" value="${esc(v.timeS ?? '')}"></label>
        <label class="s2"><span>Hits</span><input type="number" inputmode="numeric" id="rHits" value="${esc(v.hits ?? '')}"></label>
        <label class="s2"><span>Shots</span><input type="number" inputmode="numeric" id="rShots" value="${esc(v.shots ?? '')}"></label>
        <label class="s3"><span>Points</span><input type="number" step="0.1" inputmode="decimal" id="rPts" value="${esc(v.points ?? '')}"></label>
        <label class="s3"><span>Distance m</span><input type="number" inputmode="decimal" id="rDist" value="${esc(v.distanceM ?? '')}"></label>
        <div class="s6"><span class="flabel">Standard met?</span><div class="seg" id="rPass">${[['', 'Not rated'], ['y', 'Passed'], ['n', 'Not passed']].map(([k, l]) => `<a href="javascript:void 0" data-p="${k}" class="${(v.pass === true ? 'y' : v.pass === false ? 'n' : '') === k ? 'on' : ''}">${l}</a>`).join('')}</div></div>
        <label class="s6"><span>Notes</span><textarea id="rNotes" rows="3">${esc(v.notes || '')}</textarea></label>
      </div></div>
      <p class="msg err" id="rMsg"></p>
      <div class="stack"><button class="btn pri big" id="rSave">Save result</button>${isNew ? '' : '<button class="btn warn" id="rDel">Delete</button>'}</div>
      ${r ? `<div class="uid">Permanent ID ${esc(r.uid || '')}</div>` : ''}`;
    let pass = v.pass, training = v.training || null;
    /** Trainings on the chosen date from the linked Training Log; one training that day is picked automatically. */
    const loadTrainings = auto => {
      if (!SD.linkOn() && !training) return;
      const date = $('#rDate', el).value, list = SD.linkTrainings(date), sel = $('#rTraining', el);
      if (training && training.date !== date) training = null;
      if (auto && !training && list.length === 1) training = { app: 'training-log', id: list[0].id, uid: list[0].uid, date, label: SD.trainingLabel(list[0]) };
      const opts = list.map(t => ({ id: t.id, uid: t.uid, label: SD.trainingLabel(t), shooterId: t.shooterId }));
      if (training && !opts.some(o => o.id === training.id)) opts.unshift({ id: training.id, uid: training.uid, label: training.label + ' (saved)' });
      sel.innerHTML = '<option value="">– not linked to a training –</option>' + opts.map(o => `<option value="${esc(o.id)}"${training && training.id === o.id ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      sel.onchange = () => {
        const o = opts.find(x => x.id === sel.value);
        training = o ? { app: 'training-log', id: o.id, uid: o.uid, date, label: o.label.replace(/ \(saved\)$/, '') } : null;
        const sh = o && SD.fromLinked('shooters', o.shooterId);
        if (sh && !$('#rShooter', el).value) $('#rShooter', el).value = sh.id;
      };
      if (training && auto) sel.onchange();
      $('#rTrNote', el).textContent = !SD.linkOn() ? 'Linking is off: the saved link is kept.' : list.length ? `${list.length} training${list.length === 1 ? '' : 's'} on this date in the Training Log.` : 'No training on this date in the Training Log.';
    };
    loadTrainings(isNew);
    $('#rDate', el).onchange = () => loadTrainings(true);
    const info = () => {
      d = SD.drill($('#rDrill', el).value);
      $('#rInfo', el).innerHTML = d ? `${esc(d.distance)} · ${d.rounds ? esc(d.rounds) + ' rds' : 'no ammo'} · ${d.par ? 'par ' + esc(d.par) : 'not timed'}<br><b>Standard:</b> ${esc(d.standard)}` : '';
      if (d && !d.live) $('#rMode', el).value = 'dry'; else if (d && !d.dry) $('#rMode', el).value = 'live';
    };
    info();
    $('#rDrill', el).onchange = info;
    $$('#rPass a', el).forEach(a => a.onclick = () => { pass = a.dataset.p === 'y' ? true : a.dataset.p === 'n' ? false : null; $$('#rPass a', el).forEach(b => b.classList.toggle('on', b === a)); });
    $('#rAddS', el).onclick = () => SD.quickAdd('shooters', rec => { $('#rShooter', el).insertAdjacentHTML('beforeend', `<option value="${esc(rec.id)}">${esc(rec.name)}</option>`); $('#rShooter', el).value = rec.id; });
    $('#rAddW', el).onclick = () => SD.quickAdd('weapons', rec => { $('#rGun', el).insertAdjacentHTML('beforeend', `<option value="${esc(rec.id)}">${esc(rec.name)}</option>`); $('#rGun', el).value = rec.id; });
    const save = () => {
      if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
      const drillId = $('#rDrill', el).value, date = $('#rDate', el).value;
      if (!drillId || !date) { $('#rMsg', el).textContent = 'Please choose the drill and the date.'; return; }
      const val = { drillId, date, mode: $('#rMode', el).value, shooterId: $('#rShooter', el).value, weaponId: $('#rGun', el).value,
        timeS: SD.num($('#rTime', el).value), hits: SD.num($('#rHits', el).value), shots: SD.num($('#rShots', el).value),
        points: SD.num($('#rPts', el).value), distanceM: SD.num($('#rDist', el).value), pass: pass == null ? null : pass, notes: $('#rNotes', el).value.trim(),
        training: training || null };
      const now = new Date().toISOString();
      if (r) Object.assign(r, val, { updated: now });
      else SD.db.results.push(Object.assign({ id: SD.nextId(SD.db.results, 'R', 4), uid: SD.uuid(), created: now, updated: now }, val));
      s.lastShooter = val.shooterId; s.lastWeapon = val.weaponId;
      SD.save(true); SD.toast('Result saved.');
      if (isNew) SD.go('#/drill/' + drillId, true); else SD.back();
    };
    $('#rSave', el).onclick = save; $('#rsTop').onclick = save;
    const del = $('#rDel', el);
    if (del) SD.armed(del, () => { SD.db.results = SD.db.results.filter(x => x !== r); SD.save(true); SD.toast('Result deleted.'); SD.back(); });
  },
};
})();
