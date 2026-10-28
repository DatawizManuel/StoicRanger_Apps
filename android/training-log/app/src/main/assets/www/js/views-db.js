/* Stoic Ranger - Training Log — the three lookup databases: shooters, guns, trainers / organizers.
   One generic list + form per table (fields in TL.TABLES), also used for "+" quick-add from the training form. */
'use strict';
(() => {
const { $, $$, esc, fmtInt } = TL;
const TABS = ['shooters', 'weapons', 'trainers'];

TL.recordForm = (table, r) => { const lock = TL.lockedKeys(table, r); return `<div class="fg">${TL.TABLES[table].fields.map(([k, label, type, o = {}]) => {
  const v = r[k] ?? '', span = 's' + (o.span || 6), req = o.req ? ' *' : '', dis = lock.includes(k) ? ' disabled' : '';
  let input;
  if (type === 'select') input = `<select data-k="${k}"${dis}>${o.options.map(x => `<option value="${esc(x)}"${x === (v || o.options[0]) ? ' selected' : ''}>${esc(x || '–')}</option>`).join('')}</select>`;
  else if (type === 'area') input = `<textarea data-k="${k}" rows="3">${esc(v)}</textarea>`;
  else {
    const t = { tel: 'tel', email: 'email', url: 'url' }[type] || 'text';
    const im = { num: ' inputmode="decimal"', tel: ' inputmode="tel"', email: ' inputmode="email" autocapitalize="off"', url: ' inputmode="url" autocapitalize="off" placeholder="www.example.at"' }[type] || '';
    input = `<input type="${t}" data-k="${k}" value="${esc(v)}"${im}${dis}>`;
  }
  return `<label class="${span}"><span>${esc(label)}${req}</span>${input}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</label>`;
}).join('')}</div>`; };

TL.readRecord = (table, root) => {
  const v = {};   // numbers: stored as numbers (empty = null)
  $$('[data-k]', root).forEach(i => { v[i.dataset.k] = i.value.trim(); });
  TL.TABLES[table].fields.forEach(([k, , type]) => { if (type === 'num' && k in v) v[k] = TL.num(v[k]); });
  const missing = TL.TABLES[table].fields.filter(([k, , , o = {}]) => o.req && !v[k]).map(f => f[1]);
  const dup = v.name && TL.db[table].find(r => r.name.trim().toLowerCase() === v.name.toLowerCase());
  return { v, missing, dup };
};
TL.addRecord = (table, v) => {
  const now = new Date().toISOString();
  const rec = Object.assign({ id: TL.nextId(TL.db[table], TL.TABLES[table].prefix), uid: TL.uuid(), created: now, updated: now }, v);
  TL.db[table].push(rec);
  TL.save(true);
  return rec;
};

/** Add a shooter / gun / trainer without leaving the training form. */
TL.quickAdd = (table, done) => {
  if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
  const T = TL.TABLES[table];
  const m = TL.sheet('New ' + T.one, TL.recordForm(table, {}) + '<p class="msg err" id="qMsg"></p><div class="stack"><button class="btn pri big" id="qSave">Add new ' + esc(T.one) + '</button></div>');
  setTimeout(() => { const i = $('[data-k=name]', m.body); i && i.focus(); }, 60);
  $('#qSave', m.body).onclick = () => {
    const { v, missing, dup } = TL.readRecord(table, m.body);
    if (missing.length) { $('#qMsg', m.body).textContent = 'Please fill in: ' + missing.join(', ') + '.'; return; }
    if (dup) { m.close(); TL.toast(`"${dup.name}" already exists and was selected.`); done(dup); return; }
    const rec = TL.addRecord(table, v);
    m.close(); TL.toast(`${rec.name} added.`); done(rec);
  };
};

const contactLinks = t => [
  t.phone && `<a href="tel:${esc(t.phone.replace(/[^\d+]/g, ''))}">☎ ${esc(t.phone)}</a>`,
  t.email && `<a href="mailto:${esc(t.email)}">✉ ${esc(t.email)}</a>`,
  t.website && `<a href="${esc(TL.webUrl(t.website))}">↗ ${esc(t.website.replace(/^https?:\/\//, ''))}</a>`,
].filter(Boolean).join('');

TL.views.db = {
  render(el, [table = 'shooters', id]) {
    if (!TL.TABLES[table]) table = 'shooters';
    if (id) return editView(el, table, id);
    const T = TL.TABLES[table];
    TL.header('Database', { actions: `<a class="ib" href="#/db/${table}/new" aria-label="Add new ${esc(T.one)}">＋</a>` });
    const list = TL.sorted(table);
    el.innerHTML = `
      <div class="tabs2">${TABS.map(t => `<a href="#/db/${t}" class="${t === table ? 'on' : ''}">${TL.TABLES[t].title} <small class="mono">${TL.db[t].length}</small></a>`).join('')}</div>
      <div class="list">${list.map(r => {
        const used = TL.usage(table, r.id);
        const rounds = table === 'weapons' ? used.reduce((a, t) => a + t.weapons.filter(w => w.weaponId === r.id).reduce((b, w) => b + (TL.num(w.rounds) || 0), 0), 0) : used.reduce((a, t) => a + TL.rounds(t), 0);
        const hours = used.reduce((a, t) => a + (TL.num(t.durationH) || 0), 0);
        const kv = table === 'weapons' ? [r.type, r.caliber, r.zeroM != null && r.zeroM !== '' && 'Zero ' + r.zeroM + ' m', r.serial && 'No. ' + r.serial] : table === 'trainers' ? [r.contact] : [];
        return `<div class="item" data-href="#/db/${table}/${encodeURIComponent(r.id)}">
          <div class="main"><div class="t">${esc(r.name)}<span class="id">${esc(r.id)}</span>${r.example ? '<span class="pill example">Example</span>' : ''}${TL.isLinked(r) ? '<span class="pill linked">Gun DB</span>' : ''}${r.status && r.status !== 'Active' ? `<span class="pill">${esc(r.status)}</span>` : ''}</div>
            ${kv.filter(Boolean).length ? `<div class="kvs">${kv.filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
            ${table === 'trainers' ? `<div class="contact">${contactLinks(r)}</div>` : ''}</div>
          <div class="side"><div class="big">${fmtInt(rounds) || 0}</div><div class="u">rds · ${used.length} tr. · ${TL.fh(hours) || 0} h</div></div>
        </div>`;
      }).join('') || `<div class="empty">No ${esc(T.title.toLowerCase())} yet.</div>`}</div>
      <div class="stack"><a class="btn pri" href="#/db/${table}/new">Add new ${esc(T.one)}</a></div>`;
    $$('.item[data-href]', el).forEach(it => it.addEventListener('click', e => { if (!e.target.closest('a')) TL.go(it.dataset.href); }));
  },
};

function editView(el, table, id) {
  const T = TL.TABLES[table], isNew = id === 'new', r = isNew ? {} : TL.byId(TL.db[table], id);
  TL.header(isNew ? 'New ' + T.one : T.title.replace(/s$/, ''), { back: true, actions: '<button class="ib" id="rSaveTop" aria-label="Save">✓</button>' });
  if (!r) { el.innerHTML = '<div class="empty">This entry no longer exists.</div>'; return; }
  const used = isNew ? [] : TL.usage(table, id);
  el.innerHTML = `
    ${isNew ? '' : `<div class="idline">${esc(r.id)}${r.example ? ' · <span class="pill example">Example</span>' : ''} · used in ${used.length} training${used.length === 1 ? '' : 's'}</div>`}
    ${TL.isLinked(r) ? `<div class="banner">Linked with the <b>Gun Database</b> (${esc(r.source.id)}): the greyed fields are changed there and follow here on the next sync. Everything else is kept in this app.</div>` : ''}
    <div class="card">${TL.recordForm(table, r)}</div>
    ${table === 'trainers' && !isNew && contactLinks(r) ? `<div class="contact">${contactLinks(r)}</div>` : ''}
    <p class="msg err" id="rMsg"></p>
    <div class="stack"><button class="btn pri big" id="rSave">Save</button>
      ${isNew ? '' : TL.isLinked(r) && !used.length ? '<p class="note">Delete it in the Gun Database; here it is kept while the apps are linked.</p>' : used.length ? `<a class="btn" href="#/dash" id="rShow">Show its ${used.length} training${used.length === 1 ? '' : 's'} on the dashboard</a>` : '<button class="btn warn" id="rDel">Delete</button>'}</div>
    ${!isNew && used.length ? '<p class="note">Entries used in trainings cannot be deleted. Set the status to Inactive / Sold / Retired instead: they then no longer show up when entering a new training.</p>' : ''}
    ${isNew ? '' : `<div class="uid">Permanent ID ${esc(r.uid || '')}</div>`}`;
  const save = () => {
    if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
    const { v, missing, dup } = TL.readRecord(table, el);
    if (missing.length) { $('#rMsg', el).textContent = 'Please fill in: ' + missing.join(', ') + '.'; return; }
    if (dup && dup !== r) { $('#rMsg', el).textContent = `"${dup.name}" already exists (${dup.id}).`; return; }
    if (isNew) TL.addRecord(table, v);
    else { Object.assign(r, v, { updated: new Date().toISOString() }); delete r.example; TL.save(true); }
    TL.toast('Saved.'); TL.back();
  };
  $('#rSave', el).onclick = save; $('#rSaveTop').onclick = save;
  const show = $('#rShow', el);
  if (show) show.onclick = e => {
    e.preventDefault();
    const f = TL.db.settings.dashFilter; Object.keys(f).forEach(k => f[k] = '');
    f[{ shooters: 'shooter', weapons: 'weapon', trainers: 'trainer' }[table]] = id; TL.save(); TL.go('#/dash');
  };
  const del = $('#rDel', el);
  if (del) TL.armed(del, () => { TL.db[table] = TL.db[table].filter(x => x !== r); TL.save(true); TL.toast('Deleted.'); TL.back(); });
}
})();
