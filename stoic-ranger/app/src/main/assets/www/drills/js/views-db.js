/* Stoic Ranger - Shooting Drills — own lookup databases: shooters and guns (same keys as the other Stoic Ranger apps).
   One generic list + form per table (fields in SD.TABLES), also used for "+" quick-add from the result form. */
'use strict';
(() => {
const { $, $$, esc, fmtInt } = SD;
const TABS = ['shooters', 'weapons'];   // SD.lockedKeys / SD.isLinked: js/link.js

SD.recordForm = (table, r) => { const lock = SD.lockedKeys(table, r); return `<div class="fg">${SD.TABLES[table].fields.map(([k, label, type, o = {}]) => {
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

SD.readRecord = (table, root) => {
  const v = {};   // numbers: stored as numbers (empty = null)
  $$('[data-k]', root).forEach(i => { v[i.dataset.k] = i.value.trim(); });
  SD.TABLES[table].fields.forEach(([k, , type]) => { if (type === 'num' && k in v) v[k] = SD.num(v[k]); });
  const missing = SD.TABLES[table].fields.filter(([k, , , o = {}]) => o.req && !v[k]).map(f => f[1]);
  const dup = v.name && SD.db[table].find(r => r.name.trim().toLowerCase() === v.name.toLowerCase());
  return { v, missing, dup };
};
SD.addRecord = (table, v) => {
  const now = new Date().toISOString();
  const rec = Object.assign({ id: SD.nextId(SD.db[table], SD.TABLES[table].prefix), uid: SD.uuid(), created: now, updated: now }, v);
  SD.db[table].push(rec);
  SD.save(true);
  return rec;
};

/** Add a shooter / gun without leaving the result form. */
SD.quickAdd = (table, done) => {
  if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
  const T = SD.TABLES[table];
  const m = SD.sheet('New ' + T.one, SD.recordForm(table, {}) + '<p class="msg err" id="qMsg"></p><div class="stack"><button class="btn pri big" id="qSave">Add new ' + esc(T.one) + '</button></div>');
  setTimeout(() => { const i = $('[data-k=name]', m.body); i && i.focus(); }, 60);
  $('#qSave', m.body).onclick = () => {
    const { v, missing, dup } = SD.readRecord(table, m.body);
    if (missing.length) { $('#qMsg', m.body).textContent = 'Please fill in: ' + missing.join(', ') + '.'; return; }
    if (dup) { m.close(); SD.toast(`"${dup.name}" already exists and was selected.`); done(dup); return; }
    const rec = SD.addRecord(table, v);
    m.close(); SD.toast(`${rec.name} added.`); done(rec);
  };
};

SD.views.db = {
  render(el, [table = 'shooters', id]) {
    if (!SD.TABLES[table]) table = 'shooters';
    if (id) return editView(el, table, id);
    const T = SD.TABLES[table];
    SD.header('Database', { back: true, actions: `<a class="ib" href="#/db/${table}/new" aria-label="Add new ${esc(T.one)}">＋</a>` });
    const list = SD.sorted(table);
    el.innerHTML = `
      <div class="tabs2">${TABS.map(t => `<a href="#/db/${t}" class="${t === table ? 'on' : ''}">${SD.TABLES[t].title} <small class="mono">${SD.db[t].length}</small></a>`).join('')}</div>
      <div class="list">${list.map(r => {
        const used = SD.usage(table, r.id);
        const kv = table === 'weapons' ? [r.type, r.caliber, r.zeroM != null && r.zeroM !== '' && 'Zero ' + r.zeroM + ' m'] : [];
        return `<div class="item" data-href="#/db/${table}/${encodeURIComponent(r.id)}">
          <div class="main"><div class="t">${esc(r.name)}<span class="id">${esc(r.id)}</span>${SD.isLinked(r) ? '<span class="pill linked">Training Log</span>' : ''}${r.example ? '<span class="pill example">Example</span>' : ''}${SD.isLinked(r) ? '<span class="pill linked">Gun DB</span>' : ''}${r.status && r.status !== 'Active' ? `<span class="pill">${esc(r.status)}</span>` : ''}</div>
            ${kv.filter(Boolean).length ? `<div class="kvs">${kv.filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="side"><div class="big">${used.length}</div><div class="u">result${used.length === 1 ? '' : 's'}</div></div>
        </div>`;
      }).join('') || `<div class="empty">No ${esc(T.title.toLowerCase())} yet.</div>`}</div>
      <div class="stack"><a class="btn pri" href="#/db/${table}/new">Add new ${esc(T.one)}</a></div>`;
    $$('.item[data-href]', el).forEach(it => it.addEventListener('click', e => { if (!e.target.closest('a')) SD.go(it.dataset.href); }));
  },
};

function editView(el, table, id) {
  const T = SD.TABLES[table], isNew = id === 'new', r = isNew ? {} : SD.byId(SD.db[table], id);
  SD.header(isNew ? 'New ' + T.one : T.title.replace(/s$/, ''), { back: true, actions: '<button class="ib" id="rSaveTop" aria-label="Save">✓</button>' });
  if (!r) { el.innerHTML = '<div class="empty">This entry no longer exists.</div>'; return; }
  const used = isNew ? [] : SD.usage(table, id);
  el.innerHTML = `
    ${isNew ? '' : `<div class="idline">${esc(r.id)}${r.example ? ' · <span class="pill example">Example</span>' : ''} · used in ${used.length} result${used.length === 1 ? '' : 's'}</div>`}
    ${SD.isLinked(r) ? `<div class="banner">Linked with the <b>Training Log</b> (${esc(r.source.id)}): the greyed fields are changed there and follow here on the next sync. Notes stay in this app.</div>` : ''}
    <div class="card">${SD.recordForm(table, r)}</div>
    <p class="msg err" id="rMsg"></p>
    <div class="stack"><button class="btn pri big" id="rSave">Save</button>
      ${isNew || used.length ? '' : SD.isLinked(r) ? '<p class="note">Delete it in the Training Log; here it is kept while the apps are linked.</p>' : '<button class="btn warn" id="rDel">Delete</button>'}</div>
    ${!isNew && used.length ? '<p class="note">Entries used in results cannot be deleted. Set the status to Inactive / Sold / Retired instead: they then no longer show up when logging a new result.</p>' : ''}
    ${isNew ? '' : `<div class="uid">Permanent ID ${esc(r.uid || '')}</div>`}`;
  const save = () => {
    if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
    const { v, missing, dup } = SD.readRecord(table, el);
    if (missing.length) { $('#rMsg', el).textContent = 'Please fill in: ' + missing.join(', ') + '.'; return; }
    if (dup && dup !== r) { $('#rMsg', el).textContent = `"${dup.name}" already exists (${dup.id}).`; return; }
    if (isNew) SD.addRecord(table, v);
    else { Object.assign(r, v, { updated: new Date().toISOString() }); delete r.example; SD.save(true); }
    SD.toast('Saved.'); SD.back();
  };
  $('#rSave', el).onclick = save; $('#rSaveTop').onclick = save;
  const del = $('#rDel', el);
  if (del) SD.armed(del, () => { SD.db[table] = SD.db[table].filter(x => x !== r); SD.save(true); SD.toast('Deleted.'); SD.back(); });
}
})();
