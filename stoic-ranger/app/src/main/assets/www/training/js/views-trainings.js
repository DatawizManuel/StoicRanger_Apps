/* Stoic Ranger - Training Log — list of all trainings and the form to enter or edit one. */
'use strict';
(() => {
const { $, $$, esc, num, fmtInt } = TL;

/* ---------- list ---------- */
TL.views.trainings = {
  render(el, parts, q) {
    TL.header('Trainings');
    const term = (q.q || '').toLowerCase();
    const hay = t => [t.desc, t.remarks, t.date, TL.FIRE[t.fire], TL.nameOf('shooters', t.shooterId), TL.nameOf('trainers', t.trainerId), ...t.weapons.map(w => TL.nameOf('weapons', w.weaponId))].join(' ').toLowerCase();
    const list = TL.filtered({}).filter(t => !term || hay(t).includes(term));
    const byYear = {};
    list.forEach(t => (byYear[(t.date || '????').slice(0, 4)] = byYear[(t.date || '????').slice(0, 4)] || []).push(t));
    el.innerHTML = `
      <input class="search" type="search" id="tq" placeholder="Search description, shooter, gun, trainer …" value="${esc(q.q || '')}">
      ${Object.keys(byYear).sort().reverse().map(y => {
        const L = byYear[y], s = TL.summary(L, {});
        return `<div class="ytitle"><span>${esc(y)}</span><span>${L.length}${s.nDry ? ` (${s.nDry} dry)` : ''} · ${TL.fh(s.hours) || 0} h · ${fmtInt(s.rounds) || 0} rds</span></div><div class="list">${L.map(t => TL.trainingItem(t)).join('')}</div>`;
      }).join('') || `<div class="empty">${TL.db.trainings.length ? 'Nothing found.' : 'No trainings yet. Tap <b>New</b> below to enter your first one.'}</div>`}`;
    const inp = $('#tq', el);
    inp.oninput = TL.debounce(() => { history.replaceState(null, '', '#/trainings' + (inp.value ? '?q=' + encodeURIComponent(inp.value) : '')); TL.views.trainings.render(el, [], { q: inp.value }); const i2 = $('#tq', el); i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); }, 300);
  },
};

/* ---------- entry form ---------- */
const optList = (t, cur, empty) => `<option value="">${esc(empty)}</option>` +
  TL.sorted(t).filter(r => r.status !== 'Inactive' && r.status !== 'Sold' && r.status !== 'Retired' || r.id === cur)
    .map(r => `<option value="${esc(r.id)}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}</option>`).join('');

function weaponRows(sel, dry) {
  const used = new Map(sel.map(w => [w.weaponId, w]));
  const ws = TL.sorted('weapons').filter(w => (w.status || 'Active') === 'Active' || used.has(w.id));
  if (!ws.length) return `<p class="note">No guns in the database yet.</p>`;
  return ws.map(w => {
    const on = used.has(w.id), r = on ? used.get(w.id).rounds : '';
    return `<label class="wrow${on ? '' : ' off'}" data-w="${esc(w.id)}"><input type="checkbox"${on ? ' checked' : ''}>
      <span class="wn">${esc(w.name)}<small>${esc([w.type, w.caliber].filter(Boolean).join(' · '))}</small></span>
      <input type="number" inputmode="numeric" min="0" step="1" placeholder="${dry ? 'Reps' : 'Rounds'}" value="${r ?? ''}" aria-label="${dry ? 'Dry-fire reps' : 'Rounds'} ${esc(w.name)}"></label>`;
  }).join('');
}

TL.views.training = {
  tab: 'trainings',
  render(el, [id]) {
    const isNew = id === 'new' || !id;
    const src = isNew ? null : TL.training(id);
    if (!isNew && !src) { el.innerHTML = '<div class="empty">This training no longer exists.</div>'; TL.header('Training', { back: true }); return; }
    const db = TL.db;
    const lastShooter = TL.shooter(db.settings.lastShooter) ? db.settings.lastShooter : (db.shooters.length === 1 ? db.shooters[0].id : '');
    const t = src ? TL.clone(src) : { shooterId: lastShooter, date: TL.today(), start: '', durationH: null, fire: db.settings.lastFire === 'dry' ? 'dry' : 'live', desc: '', weapons: [], trainerId: '', remarks: '' };
    let fire = t.fire === 'dry' ? 'dry' : 'live';
    TL.header(isNew ? 'New training dataset' : 'Edit training', { back: true, actions: '<button class="ib" id="tSaveTop" aria-label="Save">✓</button>' });
    el.innerHTML = `
      ${src ? `<div class="idline">${esc(src.id)}${src.example ? ' · <span class="pill example">Example</span>' : ''}</div>` : ''}
      <div class="seg" id="fFire">${Object.entries(TL.FIRE).map(([k, l]) => `<a href="javascript:void 0" data-k="${k}" class="${fire === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="card"><div class="fg">
        <label class="s6"><span>Shooter *</span><div class="selrow"><select id="fShooter">${optList('shooters', t.shooterId, '– choose –')}</select><button type="button" class="btn sm" data-add="shooters" aria-label="Add shooter">+</button></div></label>
        <label class="s2"><span>Date *</span><input type="date" id="fDate" value="${esc(t.date)}"></label>
        <label class="s2"><span>Start time</span><input type="time" id="fStart" value="${esc(t.start)}"></label>
        <label class="s2"><span>Duration [h]</span><input type="text" inputmode="decimal" id="fDur" placeholder="e.g. 2.5" value="${esc(TL.fh(t.durationH))}"></label>
        <label class="s6"><span>Short description *</span><input type="text" id="fDesc" maxlength="160" placeholder="e.g. Long range course 300–800 m, prone" value="${esc(t.desc)}"></label>
        <label class="s6"><span>Trainer / organizer</span><div class="selrow"><select id="fTrainer">${optList('trainers', t.trainerId, '– none –')}</select><button type="button" class="btn sm" data-add="trainers" aria-label="Add trainer">+</button></div></label>
      </div></div>
      <div class="card">
        <h3>Guns used <small class="note" id="fWHint"></small></h3>
        <div id="fWeapons">${weaponRows(t.weapons, fire === 'dry')}</div>
        <div class="wtot"><span id="fTotL">Total rounds</span><span id="fTot" class="mono">0</span></div>
        <p class="note" id="fDryNote" style="margin:4px 0 0"${fire === 'dry' ? '' : ' hidden'}>Dry fire: the count is kept as dry-fire reps and never added to rounds (totals, record sheet, Gun Database).</p>
        <div class="row"><button type="button" class="btn sm" data-add="weapons">+ Add gun</button></div>
        ${TL.linkOn() ? `<div id="fSendBox"${fire === 'dry' ? ' hidden' : ''}><label class="inl" style="margin-top:6px"><input type="checkbox" id="fSend"${t.sendRounds !== false ? ' checked' : ''}>Count these rounds in the Gun Database (barrel use)</label>
        <p class="note" style="margin:2px 0 0">Only for guns linked with the Gun Database. Untick if the same rounds are already on a datasheet there.</p></div>` : ''}
      </div>
      <div class="card"><div class="fg">
        <label class="s6"><span>Remarks</span><textarea id="fRem" rows="4" placeholder="Drills, distances, conditions, what to work on next …">${esc(t.remarks)}</textarea></label>
      </div></div>
      ${src && TL.drillResultsFor ? TL.drillResultsFor(src) : ''}
      <p class="msg err" id="fMsg"></p>
      <div class="stack">
        <button class="btn pri big" id="tSave">Save training</button>
        ${src ? '<button class="btn warn" id="tDel">Delete training</button>' : ''}
      </div>`;

    const wbox = $('#fWeapons', el);
    const readWeapons = () => $$('.wrow', wbox).filter(r => $('input[type=checkbox]', r).checked).map(r => ({ weaponId: r.dataset.w, rounds: num($('input[type=number]', r).value) }));
    const total = () => {
      $('#fTot', el).textContent = fmtInt(readWeapons().reduce((a, w) => a + (w.rounds || 0), 0)) || '0';
      $('#fTotL', el).textContent = fire === 'dry' ? 'Dry-fire reps (no rounds)' : 'Total rounds';
      $('#fWHint', el).textContent = fire === 'dry' ? 'tick one or more, dry-fire reps per gun (optional)' : 'tick one or more, rounds per gun';
    };
    const wire = () => $$('.wrow', wbox).forEach(r => {
      const cb = $('input[type=checkbox]', r), n = $('input[type=number]', r);
      cb.onchange = () => { r.classList.toggle('off', !cb.checked); if (cb.checked) setTimeout(() => n.focus(), 30); total(); };
      n.oninput = total;
    });
    wire(); total();
    $$('#fFire a', el).forEach(a => a.onclick = () => {
      fire = a.dataset.k;
      $$('#fFire a', el).forEach(x => x.classList.toggle('on', x === a));
      $$('.wrow input[type=number]', wbox).forEach(n => { n.placeholder = fire === 'dry' ? 'Reps' : 'Rounds'; });
      $('#fDryNote', el).hidden = fire !== 'dry';
      const sb = $('#fSendBox', el); if (sb) sb.hidden = fire === 'dry';
      total();
    });
    // the whole remark is readable here: the box grows with its text
    const rem = $('#fRem', el), grow = () => { rem.style.height = 'auto'; rem.style.height = Math.max(rem.scrollHeight + 4, 110) + 'px'; };
    rem.addEventListener('input', grow); setTimeout(grow, 0);

    $$('[data-add]', el).forEach(b => b.onclick = () => TL.quickAdd(b.dataset.add, rec => {
      if (b.dataset.add === 'shooters') { $('#fShooter', el).innerHTML = optList('shooters', rec.id, '– choose –'); }
      else if (b.dataset.add === 'trainers') { $('#fTrainer', el).innerHTML = optList('trainers', rec.id, '– none –'); }
      else { const cur = readWeapons(); cur.push({ weaponId: rec.id, rounds: null }); wbox.innerHTML = weaponRows(cur, fire === 'dry'); wire(); total(); }
    }));

    const save = () => {
      if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
      const v = {
        shooterId: $('#fShooter', el).value, date: $('#fDate', el).value, start: $('#fStart', el).value,
        durationH: num($('#fDur', el).value), fire, desc: $('#fDesc', el).value.trim(), weapons: readWeapons(),
        trainerId: $('#fTrainer', el).value, remarks: $('#fRem', el).value.trim(),
      };
      const send = $('#fSend', el);
      if (send && !send.checked) v.sendRounds = false;   // default (absent) = rounds are sent
      const err = [];
      if (!v.shooterId) err.push('choose a shooter');
      if (!v.date) err.push('enter the date');
      if (!v.desc) err.push('add a short description');
      if ($('#fDur', el).value.trim() && (v.durationH == null || v.durationH < 0 || v.durationH > 24)) err.push('duration must be a number of hours (e.g. 2.5)');
      if (v.weapons.some(w => w.rounds != null && (w.rounds < 0 || !Number.isInteger(w.rounds)))) err.push(fire === 'dry' ? 'reps must be whole numbers' : 'rounds must be whole numbers');
      if (err.length) { $('#fMsg', el).textContent = 'Please ' + err.join(', ') + '.'; $('#fMsg', el).scrollIntoView({ block: 'center' }); return; }
      const now = new Date().toISOString();
      if (src) { Object.assign(src, v, { updated: now }); delete src.example; }
      else db.trainings.push(Object.assign({ id: TL.nextId(db.trainings, 'TR', 4), uid: TL.uuid(), created: now, updated: now }, v));
      db.settings.lastShooter = v.shooterId; db.settings.lastFire = fire;
      if (send && send.checked && src) delete src.sendRounds;
      TL.save(true);
      TL.linkSync();
      TL.toast(src ? 'Training saved.' : 'Training added.');
      TL.back();
    };
    $('#tSave', el).onclick = save; $('#tSaveTop').onclick = save;
    const del = $('#tDel', el);
    if (del) TL.armed(del, () => { db.trainings = db.trainings.filter(x => x !== src); TL.save(true); TL.linkSync(); TL.toast('Training deleted.'); TL.back(); });
  },
};
})();
