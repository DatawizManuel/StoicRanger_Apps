/* Stoic Ranger — database: weapons, barrels, ammunition, shooters, rounds log. */
'use strict';
(() => {
const { $, $$, esc, fx, num } = RB;
const ORDER = ['weapons', 'barrels', 'munitions', 'shooters', 'trainers', 'targets', 'roundsLog'];

function refLabel(table, id) {
  const r = RB.byId(RB.db[table], id); if (!r) return id ? `${id} (missing)` : '';
  if (table === 'barrels') { const w = RB.weapon(r.weaponId); return `${r.name}${w ? ' · ' + w.name : ''}`; }
  return r.name;
}

/** Form for one record; returns { el, read() } */
RB.form = (table, rec) => {
  const T = RB.TABLES[table];
  const isHand = table === 'munitions' && rec.type === 'Handload';
  let html = '<div class="fg">';
  for (const [k, label, type, o = {}] of T.fields) {
    if (type === 'id') continue;
    const v = o.u ? RB.U.inp(o.u, rec[k]) : (rec[k] ?? '');
    const span = 's' + (o.span || 6);
    const hide = o.hl && !isHand ? ' data-hl hidden' : (o.hl ? ' data-hl' : '');
    let input;
    if (type === 'area') input = `<textarea data-k="${k}" rows="3">${esc(v)}</textarea>`;
    else if (type === 'select') input = `<select data-k="${k}">${o.options.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    else if (type.startsWith('ref:')) {
      const rt = type.slice(4);
      let list = RB.db[rt];
      if (rt === 'barrels' && rec.weaponId) list = list.filter(b => b.weaponId === rec.weaponId);
      input = `<select data-k="${k}"><option value=""></option>${list.map(r => `<option value="${esc(r.id)}" ${r.id === v ? 'selected' : ''}>${esc(refLabel(rt, r.id))}</option>`).join('')}</select>`;
    } else {
      const it = type === 'date' ? 'date' : (type === 'num' || type === 'int') ? 'number' : 'text';
      const step = type === 'int' ? ' step="1" inputmode="numeric"' : type === 'num' ? ' step="any" inputmode="decimal"' : '';
      input = `<input type="${it}" data-k="${k}" value="${esc(v)}"${step}${o.list ? ` list="dl-${o.list}"` : ''}${o.req ? ' required' : ''}>`;
    }
    html += `<label class="${span}"${hide}><span>${esc(o.u ? RB.U.lab(label, o.u) : label.replace(/ \(as written on sheets\)/, ''))}${o.req ? ' *' : ''}</span>${input}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</label>`;
  }
  html += `</div><datalist id="dl-calibers">${RB.CALIBERS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const el = RB.h(`<div>${html}</div>`);
  const typeSel = $('[data-k=type]', el);
  if (typeSel && table === 'munitions') typeSel.onchange = () => $$('[data-hl]', el).forEach(l => l.hidden = typeSel.value !== 'Handload');
  const wSel = $('[data-k=weaponId]', el), bSel = $('[data-k=barrelId]', el);
  if (wSel && bSel) wSel.onchange = () => {
    const list = RB.db.barrels.filter(b => b.weaponId === wSel.value);
    bSel.innerHTML = '<option value=""></option>' + list.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
  };
  const read = () => {
    const out = {};
    for (const [k, , type, o = {}] of T.fields) {
      if (type === 'id') continue;
      const i = $(`[data-k="${k}"]`, el); if (!i) continue;
      let v = i.value.trim();
      if (type === 'num' && o.u && i.value === i.defaultValue) v = rec[k] ?? null;   // untouched: keep the stored metric value exactly
      else if (type === 'num' && o.u) v = v === '' ? null : +(RB.U.to(o.u, v) ?? 0).toFixed(6);
      else if (type === 'num') v = v === '' ? null : num(v);
      else if (type === 'int') v = v === '' ? null : Math.round(num(v) || 0);
      out[k] = v;
    }
    return out;
  };
  return { el, read };
};

function card(table, r, D) {
  const go = `#/db/${table}/${encodeURIComponent(r.id)}`;
  const b = (l, v) => v !== '' && v != null ? `<span><em>${l}</em> ${esc(v)}</span>` : '';
  let body = '', side = '';
  if (table === 'weapons') {
    const c = D.weapons.find(x => x.id === r.id) || {}; const f = c.fitted ? RB.barrel(c.fitted) : null;
    body = b('Type', r.type) + b('Calibre', r.caliber) + b('Barrel', f ? f.name : '') + b('Zero', r.zeroM ? RB.U.fmt('dist', r.zeroM) : '') + b('Optic', r.optic);
    side = `<div class="big">${RB.fmtInt(c.total)}</div><div class="u">rounds</div>`;
  } else if (table === 'barrels') {
    const c = D.barrels.find(x => x.id === r.id) || {};
    body = b('Gun', refLabel('weapons', r.weaponId)) + b('Fitted', RB.fmtDate(r.installed)) + (r.removed ? b('Removed', RB.fmtDate(r.removed)) : '');
    side = `<div class="big">${RB.fmtInt(c.total)}</div><div class="u">${c.lifePct != null ? fx(c.lifePct, 0) + ' % life' : 'rounds'}</div>`;
    if (c.lifePct != null) body += `<div class="meter"><i style="width:${Math.min(100, c.lifePct)}%" class="${c.lifePct > 85 ? 'hot' : ''}"></i></div>`;
  } else if (table === 'munitions') {
    const c = D.munitions.find(x => x.id === r.id) || {};
    body = b('Calibre', r.caliber) + b('Type', r.type) + b('Bullet', [r.bullet, r.bulletWeightG ? RB.U.fmt('mass', r.bulletWeightG) : ''].filter(Boolean).join(' · ')) + (r.type === 'Handload' ? b('Charge', r.chargeG ? RB.U.fmt('mass', r.chargeG) + ' ' + (r.powder || '') : '') : '');
    body += b('Maker V0', r.nominalV0 ? RB.U.fmt('vel', r.nominalV0) : '') + b('Measured V0', c.v0 != null ? RB.U.fmt('vel', c.v0) + (c.v0sd != null ? ' ±' + RB.U.num('vel', c.v0sd, 1) : '') : '');
    if (c.mrM != null) body += b('MR', RB.U.fmt('ang', c.mrM, 3));
    side = c.v0 != null ? `<div class="big">${RB.U.num('vel', c.v0)}</div><div class="u">${RB.U.label('vel')} measured · ${c.v0Shots} sh</div>` : (r.nominalV0 ? `<div class="big muted">${RB.U.num('vel', r.nominalV0)}</div><div class="u">${RB.U.label('vel')} maker</div>` : '');
  } else if (table === 'shooters') {
    const n = D.sessions.filter(s => s.shooterId === r.id); const tr = RB.enough(n.filter(s => s.mrM != null).map(s => s.hits)).ok ? n.filter(s => s.mrM != null) : [];
    body = b('Sheets', n.length) + (tr.length ? b('Avg MR', RB.U.fmt('ang', tr.reduce((a, s) => a + s.mrM, 0) / tr.length, 3)) : '') + b('Last', RB.fmtDate(n.length ? n[n.length - 1].date : ''));
  } else if (table === 'trainers') {
    body = b('Contact', r.contact) + b('Phone', r.phone) + b('E-mail', r.email);
  } else if (table === 'targets') {
    body = b('Type', r.type) + b(r.rings == 1 ? 'Ø' : '10 Ø', RB.U.fmt('len', r.d10)) + (r.rings != 1 ? b('Ring', RB.U.fmt('len', r.w)) : '') + b('Distance', r.distM ? RB.U.fmt('dist', r.distM) : '');
    side = `<div class="big">${RB.db.sheets.filter(x => x.preset === r.id).length}</div><div class="u">sheets</div>`;
  } else if (table === 'roundsLog') {
    body = b('Gun', refLabel('weapons', r.weaponId)) + b('Barrel', r.barrelId ? refLabel('barrels', r.barrelId) : 'fitted at date') + b('Note', r.note);
    side = `<div class="big">${RB.fmtInt(r.rounds)}</div><div class="u">rounds</div>`;
  }
  const title = table === 'roundsLog' ? RB.fmtDate(r.date) : r.name;
  const st = (r.status && r.status !== 'Active' ? `<span class="pill">${esc(r.status)}</span>` : (r.removed ? '<span class="pill">removed</span>' : '')) + (r.example ? '<span class="pill example">example</span>' : '') + (r.builtin ? '<span class="pill">built-in</span>' : '') + (r.link ? '<span class="pill training">Training Log</span>' : '');
  return `<a class="item" href="${go}"><div class="main"><div class="t">${esc(title)} ${st}<span class="id">${esc(r.id)}</span></div><div class="kvs">${body}</div></div><div class="side">${side}</div></a>`;
}

RB.views.db = {
  render(el, [table, id], q) {
    table = ORDER.includes(table) ? table : 'weapons';
    if (id) return editView(el, table, id, q);
    const T = RB.TABLES[table], D = RB.build();
    RB.header('Database', { actions: `<button class="ib" id="dbAdd" aria-label="Add">＋</button>` });
    let list = RB.db[table];
    if (table === 'roundsLog') list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    el.innerHTML = `
      <div class="seg scroll">${ORDER.map(t => `<a href="#/db/${t}" class="${t === table ? 'on' : ''}">${RB.TABLES[t].title}<b>${RB.db[t].length}</b></a>`).join('')}</div>
      <p class="note">${{ weapons: 'Each gun (rifle or pistol) keeps its round count: rounds before the log plus every sheet and rounds log entry.', barrels: 'A barrel change: set Removed on the old barrel and add the new one. Its count starts at Rounds at install.', munitions: 'V0 is pooled from the Xero C1 Pro values on your sheets, weighted by rounds fired. Nominal V0 is the maker\'s figure.', shooters: 'Shooters can be picked on each datasheet.', trainers: 'Trainers and clubs you train with. The Stoic Ranger Training Log uses the same list when the apps are linked.', targets: 'Targets can be picked on each datasheet. Built-in targets come with the app; add your own, or use Search online when adding one.', roundsLog: 'Rounds fired without a datasheet (hunting, fouling shots, practice). They count towards the barrel.' }[table]}</p>
      <div class="row"><button class="btn pri wide" id="dbAdd2">Add new ${esc(T.one)}</button></div>
      <div class="list">${list.length ? list.map(r => card(table, r, D)).join('') : `<div class="empty">No ${esc(T.title.toLowerCase())} yet.</div>`}</div>`;
    const add = () => RB.go(`#/db/${table}/new`);
    $('#dbAdd').onclick = add; $('#dbAdd2').onclick = add;
  },
};

function editView(el, table, id, q) {
  const T = RB.TABLES[table], isNew = id === 'new';
  let rec = isNew ? { status: (T.fields.find(f => f[0] === 'status') || [, , , { options: [''] }])[3].options[0], added: RB.today() } : RB.byId(RB.db[table], id);
  if (!rec) { el.innerHTML = '<div class="empty">Not found.</div>'; return; }
  if (isNew && table === 'barrels' && !RB.db.weapons.length) { RB.header('New barrel', { back: true }); el.innerHTML = '<div class="empty">A barrel belongs to a gun. Add the gun first.</div><div class="row"><a class="btn pri" href="#/db/weapons/new">Add new gun</a></div>'; return; }
  if (isNew) {
    if (table === 'barrels') Object.assign(rec, { weaponId: q.weapon || (RB.db.weapons.length === 1 ? RB.db.weapons[0].id : ''), installed: RB.today(), roundsAtInstall: 0 });
    if (table === 'roundsLog') Object.assign(rec, { date: RB.today(), weaponId: q.weapon || (RB.db.weapons[0] || {}).id || '' });
    if (table === 'munitions') rec.type = 'Factory';
    if (table === 'weapons') Object.assign(rec, { type: 'Rifle', roundsBeforeLog: 0, scopeUnit: 'mrad' });
    if (table === 'targets') Object.assign(rec, { type: 'Rings', rings: 10 });
    if (q.name) rec.name = q.name;
  }
  RB.header(isNew ? `New ${T.one}` : rec.name || RB.fmtDate(rec.date) || rec.id, { back: true, actions: `<button class="ib" id="fSave" aria-label="Save">✓</button>` });
  const F = RB.form(table, rec);
  const canLook = ['targets', 'weapons', 'munitions'].includes(table) && !rec.builtin;
  el.innerHTML = `${canLook ? `<div class="card look"><h3>Search online</h3>
      <p class="note">Type a name (e.g. ${{ targets: '“ISSF 50 m rifle target”', weapons: '“Tikka T3x TAC A1 6.5 Creedmoor 24 in”', munitions: '“Hornady 6.5 Creedmoor 140 gr ELD Match”' }[table]}). Claude searches the web and fills in what it finds. Everything stays editable; check it before saving.</p>
      <div class="row"><input id="lkQ" placeholder="Name to search for" style="flex:1;min-width:0" value="${esc(rec.name || '')}"><button class="btn" id="lkGo">Search</button></div><div class="msg" id="lkMsg" hidden></div></div>` : ''}
    <div class="card fcard"><div class="idline">${isNew ? 'New entry · ID ' + RB.nextId(RB.db[table], T.prefix) : 'ID ' + esc(rec.id)}</div></div>`;
  $('.fcard', el).appendChild(F.el);
  if (canLook) {
    const lm = $('#lkMsg'), say = (t, err) => { lm.hidden = false; lm.classList.toggle('err', !!err); lm.innerHTML = t; };
    const online = () => navigator.onLine !== false;
    if (!online()) { $('#lkGo').disabled = true; say('No internet connection: search is off. Fill the fields by hand.'); }
    else if (!RB.claude.ready()) say('Online search needs your Anthropic API key (More › Claude).');
    $('#lkGo').onclick = async () => {
      const qv = $('#lkQ').value.trim() || ($('[data-k=name]', F.el) || {}).value || '';
      if (!qv) { say('Type a name first.', true); return; }
      $('#lkGo').disabled = true; say('Searching the web …');
      try {
        const r = await RB.claude.lookup(table, qv), filled = [];
        T.fields.forEach(([k, l, t, o = {}]) => {
          const v = r.fields[k], i = $(`[data-k="${k}"]`, F.el); if (v == null || v === '' || !i) return;
          if (t === 'select') { const opt = [...i.options].find(x => x.value.toLowerCase() === String(v).toLowerCase()); if (!opt) return; i.value = opt.value; i.dispatchEvent(new Event('change')); }
          else if (t === 'num' || t === 'int') { const n = num(v); if (n == null) return; i.value = o.u ? RB.U.inp(o.u, n) : String(t === 'int' ? Math.round(n) : n); }
          else i.value = String(v);
          i.classList.add('filled'); filled.push(l.replace(/ (mm|m|g|kg|m\/s)$/, ''));
        });
        if (!($('[data-k=name]', F.el).value || '').trim()) $('[data-k=name]', F.el).value = qv;
        const src = r.sources.slice(0, 3);
        if (src.length) { const sf = $('[data-k=source]', F.el) || $('[data-k=notes]', F.el); const line = 'Source: ' + src.map(x => x.url).join(' ; ');
          if (sf && !sf.value.includes(src[0].url)) { sf.value = sf.tagName === 'TEXTAREA' && sf.value ? sf.value + '\n' + line : (sf.dataset.k === 'source' ? src.map(x => x.url).join(' ; ') : line); sf.classList.add('filled'); } }
        say(filled.length ? `Filled ${filled.length} fields: ${esc(filled.join(', '))}.${r.note ? ' ' + esc(r.note) : ''}${src.length ? '<br>Sources: ' + src.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a>`).join(' · ') : ''}` : 'Nothing reliable found. Fill the fields by hand.' + (r.note ? ' ' + esc(r.note) : ''), !filled.length);
      } catch (e) { say(esc(e.message), true); }
      $('#lkGo').disabled = !online();
    };
  }
  const extra = RB.h('<div></div>'); el.appendChild(extra);
  el.appendChild(RB.h(`<div class="row end"><button class="btn pri" id="fSave2">Save</button>${isNew ? '' : '<button class="btn warn" id="fDel">Delete</button>'}</div>`));

  const D = RB.build();
  if (!isNew && table === 'weapons') {
    const bars = RB.db.barrels.filter(b => b.weaponId === rec.id), c = D.weapons.find(x => x.id === rec.id) || {};
    extra.innerHTML = `<div class="card"><h3>Round count</h3><div class="kv3"><div><div class="l">Total</div><div class="v">${RB.fmtInt(c.total)}</div></div><div><div class="l">Sheets</div><div class="v">${c.sessions || 0}</div></div><div><div class="l">Last session</div><div class="v sm">${RB.fmtDate(c.last) || '–'}</div></div></div>
      <h3>Barrels</h3><div class="list">${bars.map(b => card('barrels', b, D)).join('') || '<div class="empty">No barrel yet.</div>'}</div>
      <div class="row"><a class="btn" href="#/db/barrels/new?weapon=${encodeURIComponent(rec.id)}">${bars.some(b => !b.removed) ? 'Change barrel' : 'Add barrel'}</a><a class="btn" href="#/db/roundsLog/new?weapon=${encodeURIComponent(rec.id)}">Log rounds without sheet</a></div></div>`;
  }
  if (!isNew && table === 'munitions') {
    const c = D.munitions.find(x => x.id === rec.id) || {};
    const mk = num(rec.nominalV0), diff = mk && c.v0 != null ? c.v0 - mk : null;
    const V = (l, v, u) => `<div><div class="l">${l}</div><div class="v">${v === '' || v == null ? '–' : v}${u && v !== '' && v != null ? `<small> ${u}</small>` : ''}</div></div>`;
    extra.innerHTML = `<div class="card"><h3>Velocity: manufacturer vs measured</h3><div class="kv3">
      ${V('Manufacturer V0', mk ? RB.U.num('vel', mk) : '', RB.U.label('vel'))}
      ${V('Maker test barrel', rec.mfrBarrelMm ? RB.U.num('len', rec.mfrBarrelMm) : '', RB.U.label('len'))}
      ${V('Measured V0 (Xero)', c.v0 != null ? RB.U.num('vel', c.v0) : '', RB.U.label('vel'))}
      ${V('Measured SD pooled', c.v0sd != null ? RB.U.num('vel', c.v0sd, 1) : '', RB.U.label('vel'))}
      ${V('Difference', diff != null ? (diff > 0 ? '+' : '') + RB.U.num('vel', diff) + ` · ${(diff > 0 ? '+' : '') + fx(diff / mk * 100, 1)} %` : '', diff != null ? RB.U.label('vel') : '')}
      ${V('Shots · sheets', `${c.v0Shots || 0} · ${c.v0Sheets || 0}`)}</div>
      ${c.vNeed && !c.vNeed.ok ? `<p class="need">Measured V0: ${c.vNeed.msg}</p>` : ''}
      <p class="note">Measured = Xero C1 Pro values on your sheets, pooled and weighted by rounds fired. A shorter barrel than the maker's usually gives less speed.</p></div>
      <div class="card"><h3>Precision from your sheets</h3><div class="kv3">
      ${V('Mean radius', c.mrM != null ? RB.U.num('ang', c.mrM, 3) : '', RB.U.label('ang'))}
      ${V('Avg ES', c.esAvg != null ? RB.U.num('ang', c.esAvg, 2) : '', RB.U.label('ang'))}
      ${V('Best ES', c.esBest != null ? RB.U.num('ang', c.esBest, 2) : '', RB.U.label('ang'))}
      ${V('Gun/ammo shots', c.testShots || 0)}${V('Sheets', c.testSessions || 0)}${V('Avg ring', c.avgRing != null ? fx(c.avgRing, 2) : '')}</div>
      ${c.precNeed && !c.precNeed.ok ? `<p class="need">Precision: ${c.precNeed.msg}</p>` : ''}
      <p class="note">Pooled SD combines the SD within each sheet and the spread between sheets. Precision uses sheets whose purpose is evaluated for gun and ammo.</p></div>`;
  }
  if (!isNew && table === 'barrels') {
    const c = D.barrels.find(x => x.id === rec.id) || {};
    extra.innerHTML = `<div class="card"><h3>Wear</h3><div class="kv3">
      <div><div class="l">Rounds</div><div class="v">${RB.fmtInt(c.total)}</div></div>
      <div><div class="l">Life used</div><div class="v">${c.lifePct != null ? fx(c.lifePct, 0) + ' %' : '–'}</div></div>
      <div><div class="l">Expected life</div><div class="v">${RB.fmtInt(c.life)}</div></div>
      <div><div class="l">Test sessions</div><div class="v">${c.testSessions || 0}</div></div>
      <div><div class="l">Group / 1,000 rds</div><div class="v">${c.precPer1000 != null ? (c.precPer1000 > 0 ? '+' : '') + fx(c.precPer1000, 0) + ' %' : '–'}</div></div>
      <div><div class="l">V0 / 1,000 rds</div><div class="v">${c.v0Per1000 != null ? RB.U.num('vel', c.v0Per1000, 1) + `<small> ${RB.U.label('vel')}</small>` : '–'}</div></div></div>
      ${c.precNeed && !c.precNeed.ok ? `<p class="need">Group trend: ${c.precNeed.msg}</p>` : ''}${c.vNeed && !c.vNeed.ok ? `<p class="need">V0 trend: ${c.vNeed.msg}</p>` : ''}
      <p class="note">Trends need at least ${RB.MIN_SETS} sets of ${RB.SET_ROUNDS} rounds. Expected life is a rough typical figure for the calibre; set your own above.</p></div>`;
  }

  if (!isNew && rec.link) {   // mirrored from SR_Training Log: changed there, not here
    el.insertAdjacentHTML('afterbegin', `<div class="banner">This entry comes from <b>SR_Training Log</b> (training ${esc(rec.link.trainingId || '')}). Change or delete the training there; the rounds here follow on the next sync.</div>`);
    ['#fSave', '#fSave2', '#fDel'].forEach(s => { const b = $(s); if (b) b.hidden = true; });
    $$('input,select,textarea', F.el).forEach(i => i.disabled = true);
  }
  const save = () => {
    const v = F.read();
    const missing = T.fields.filter(f => f[3] && f[3].req && (v[f[0]] === '' || v[f[0]] == null)).map(f => f[1]);
    if (missing.length) { RB.toast('Please fill in: ' + missing.join(', '), true); return; }
    if (table !== 'roundsLog' && RB.db[table].some(r => r.id !== rec.id && r.name && r.name.toLowerCase() === String(v.name).toLowerCase() && (table !== 'barrels' || r.weaponId === v.weaponId))) { RB.toast('That name already exists.', true); return; }
    if (isNew) {
      rec = Object.assign({ id: RB.nextId(RB.db[table], T.prefix) }, table === 'trainers' ? { uid: RB.uid('T') } : {}, v);
      RB.db[table].push(rec);
      if (table === 'barrels') {   // fitting a new barrel takes the previous one off
        RB.db.barrels.filter(b => b.weaponId === rec.weaponId && b.id !== rec.id && !b.removed).forEach(b => { b.removed = rec.installed || RB.today(); });
      }
      if (table === 'weapons') RB.db.barrels.push({ id: RB.nextId(RB.db.barrels, 'B'), weaponId: rec.id, name: 'Factory #1', installed: rec.countedOn || rec.added || '', removed: '', roundsAtInstall: rec.roundsBeforeLog || 0, notes: 'Created with the gun. Change the round count if the barrel has a different history.' });
    } else Object.assign(rec, v);
    RB.save(true); RB.toast('Saved.');
    history.back();
  };
  $('#fSave').onclick = save; $('#fSave2').onclick = save;
  const del = $('#fDel');
  if (del) RB.armed(del, () => {
    const used = RB.db.sheets.filter(s => s.weaponId === rec.id || s.barrelId === rec.id || s.munitionId === rec.id || s.shooterId === rec.id).length;
    RB.db[table] = RB.db[table].filter(r => r.id !== rec.id);
    if (table === 'weapons') RB.db.barrels = RB.db.barrels.filter(b => b.weaponId !== rec.id);
    RB.save(true); RB.toast(used ? `Deleted. ${used} sheet(s) keep the name as text.` : 'Deleted.');
    history.back();
  });
}
})();
