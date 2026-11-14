/* SR GunSafe — the screens. One page per hash (#home, #gun/G1, #service/W2 …); GS.back (js/gs.js) walks back
   through them. Every change goes through GSStore.changed(), which saves the data file and (with Nextcloud on)
   syncs a few seconds later. Mockup v5 (2026-11-07) is the reference for look and wording. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const D = () => GSStore.data;
  const M = GSModel;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => Math.round(+n || 0).toLocaleString('de-AT');
  const eur = n => '€ ' + (+n || 0).toFixed(2).replace('.', ',');
  const eur0 = n => '€ ' + Math.round(+n || 0).toLocaleString('de-AT');
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const dShow = d => d ? String(d).slice(8, 10) + '.' + String(d).slice(5, 7) + '.' + String(d).slice(0, 4) : '–';
  const num = s => { const n = parseFloat(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
  const byDateDesc = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0);
  const ro = () => GSStore.readOnly;
  let ownerFilter = 'all', ammoTab = 'ammo', draft = null, msg = null;

  const ICON = {
    svc: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M21 4a7 7 0 0 0-6.6 9.3L4.5 23.2a3 3 0 0 0 4.3 4.3l9.9-9.9A7 7 0 0 0 28 11l-4.2 4.2-4.2-1.4-1.4-4.2L22.4 5.4A7 7 0 0 0 21 4z"/></svg>',
    ammo: '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M8 30V14c0-4 2-8 3-10 1 2 3 6 3 10v16z"/><path d="M15.5 30V14c0-4 2-8 3-10 1 2 3 6 3 10v16z"/><path d="M23 30V14c0-4 2-8 3-10 1 2 3 6 3 10v16z"/><path d="M8 24h6M15.5 24h6M23 24h6"/></svg>',
  };
  const TITLES = { home: 'SR GunSafe', svclog: 'Service & cleaning', ammo: 'Ammo stock', clean: 'Log cleaning', service: 'Log service', fire: 'Log rounds fired',
    buy: 'Add purchase', out: 'Take out', settings: 'Settings & data', gunedit: 'Gun', munedit: 'Ammunition', mun: 'Ammunition', gun: 'Gun' };
  const SEC = { clean: 'svc', service: 'svc', svclog: 'svc', ammo: 'ammo', mun: 'ammo', buy: 'ammo', out: 'ammo', munedit: 'ammo' };
  const route = () => { const h = (location.hash || '#home').slice(1).split('/'); return { v: TITLES[h[0]] ? h[0] : 'home', id: decodeURIComponent(h[1] || '') }; };

  /* ---------- confirm sheet (closed by Back first) ---------- */
  function confirmBox(title, text, okLabel, onOk, danger, onCancel) {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${text}</p>
      <div class="actions" style="margin:0"><button type="button" class="button ghost" data-x="no">Cancel</button><button type="button" class="button ${danger ? 'ammo' : 'svc'}" data-x="ok">${esc(okLabel)}</button></div></div>`;
    const close = () => { o.remove(); if (GS.overlay === cancel) GS.overlay = null; };
    const cancel = () => { close(); if (onCancel) onCancel(); };
    o.addEventListener('click', e => { const x = e.target.getAttribute && e.target.getAttribute('data-x'); if (e.target === o || x === 'no') cancel(); if (x === 'ok') { close(); onOk(); } });
    document.body.appendChild(o);
    GS.overlay = cancel;
  }
  /* Delete on all devices (contract section E): each deleted row gets a tombstone in the shared _Deleted list (synced
     through database.xlsx) and a copy in "Recently deleted" for 30 days. Undo saves it again, which wins. */
  function labelOf(t, r) {
    const g = id => { const x = M.gun(id); return x ? x.name : id; }, m = id => { const x = M.mun(id); return x ? x.name : id; };
    return t === 'service' ? r.kind + ' ' + dShow(r.date) + ' · ' + g(r.weaponId) : t === 'moves' ? (r.kind === 'Purchase' ? 'Purchase ' : 'Take-out ') + Math.abs(r.qty || 0) + ' rds · ' + m(r.munitionId) + ' · ' + dShow(r.date)
      : t === 'rounds' ? (r.rounds || 0) + ' rds · ' + g(r.weaponId) + ' · ' + dShow(r.date) : t === 'components' ? (r.type || '') + ': ' + (r.name || '') + ' · ' + g(r.weaponId)
      : t === 'barrels' ? 'Barrel ' + (r.name || '') + ' · ' + g(r.weaponId) : t === 'gunInfo' ? 'Owners of ' + g(r.id) : (r.name || r.id);
  }
  function kill(t, ids, at) {
    const d = D(), set = new Set(ids); at = at || GSStore.now();
    d[t].filter(r => set.has(r.id)).forEach(r => {
      if (t !== 'gunInfo') d.tombs.push({ app: 'GS', table: GSX.sheetOfTable(t), id: r.id, uid: '', label: labelOf(t, r), at, by: 'SR GunSafe' });
      d.trash.push({ table: t, row: JSON.parse(JSON.stringify(r)), at, by: 'this phone' });
    });
    d[t] = d[t].filter(r => !set.has(r.id));
    d.tombs = GSX.mergeTombs(d.tombs, []);
  }
  const TRASH_DAYS = 30;
  function purgeTrash() { const cut = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString(); const d = D(); const n = d.trash.length; d.trash = d.trash.filter(x => x && x.at >= cut); if (d.trash.length !== n && !ro()) GSStore.changed('link'); }
  function undo(i) {
    const d = D(), x = d.trash[i]; if (!x) return;
    const row = Object.assign({}, x.row, { updated: GSStore.now() });            // newer than the delete: it wins everywhere
    if (!d[x.table].some(r => r.id === row.id)) d[x.table].push(row);
    d.trash.splice(i, 1);
  }

  /* ---------- home ---------- */
  function storeLine() {
    const st = GSSync.state();
    if (st.on) {
      const l = st.last || {};
      return `<button type="button" class="linkbar${l.ok === false ? ' off' : ''}" data-go="#settings"><span class="dot"${l.ok === false ? ' style="background:var(--bad)"' : ''}></span><span>${st.busy ? 'Syncing with <b>Nextcloud</b> …' : l.at ? (l.ok ? 'Synced with <b>Nextcloud</b> · ' : '<b>Sync failed</b> · ') + esc(l.ok ? dShow(l.at.slice(0, 10)) + ' ' + l.at.slice(11, 16) + ' UTC' : l.msg) : 'Nextcloud is set up · not synced yet'}</span></button>`;
    }
    if (st.setting.mode === 'nextcloud' && !st.setting.pwSet) return '<button type="button" class="linkbar off" data-go="#settings"><span class="dot" style="background:var(--bad)"></span><span><b>Nextcloud</b> is chosen' + (M.linked() ? ' (set in SR Shooting)' : '') + ': enter your app password once in Settings to sync.</span></button>';
    return '<button type="button" class="linkbar off" data-go="#settings"><span class="dot"></span><span>Stored <b>on this phone</b> only.</span></button>';
  }
  function linkBox() {
    const st = GSLink.status, s = GSLink.state();
    if (s === 'allowed') {
      const p = GSLink.problem;
      return p ? `<div class="linkbox"><p>${esc(GSLink.problemText(p))}</p></div>` : '<button type="button" class="linkbar" data-go="#settings"><span class="dot"></span><span>Linked with <b>SR Shooting</b> · its guns, ammunition and rounds fired are used.</span></button>';
    }
    if (s === 'ask' && st.installed && !D().link.dismissed && !ro()) {
      return `<div class="linkbox"><p><b>SR Shooting is installed.</b> Use its guns, ammunition and rounds fired? Both apps then share one database file. Nothing is read without your OK.</p>
        <div class="actions" style="margin:0"><button type="button" class="button ghost" id="lnNo">Not now</button><button type="button" class="button svc" id="lnYes">Allow link</button></div></div>`;
    }
    return '';
  }
  function vHome() {
    const guns = M.guns().filter(g => ownerFilter === 'all' || M.gunOwners(g.id).includes(ownerFilter));
    const muns = M.munitions();
    const totStock = muns.reduce((s, m) => s + Math.max(0, M.munFig(m.id).stock), 0);
    const value = muns.reduce((s, m) => { const f = M.munFig(m.id); return s + Math.max(0, f.stock) * f.avg; }, 0);
    const lastEv = D().service.slice().sort(byDateDesc)[0];
    let h = (GSStore.notice ? `<p class="banner">${esc(GSStore.notice)}</p>` : '') + storeLine() + linkBox();
    h += `<button type="button" class="choice svc" data-go="#svclog"><div class="ic">${ICON.svc}</div><div><h3>Service &amp; cleaning</h3><p>Log a cleaning or a service, change parts, swap barrels</p><p class="mono">${D().service.length} entr${D().service.length === 1 ? 'y' : 'ies'} · last ${lastEv ? dShow(lastEv.date) : '–'}</p></div></button>`;
    h += `<button type="button" class="choice ammo" data-go="#ammo"><div class="ic">${ICON.ammo}</div><div><h3>Ammo stock</h3><p>Stock per ammo and per gun, purchases, prices, take-outs</p><p class="mono">${fmtN(totStock)} rds · ${muns.length} type${muns.length === 1 ? '' : 's'} · value ${eur0(value)}</p></div></button>`;
    h += `<h2 class="sec">Inventory <small>${guns.length} of ${M.guns().length} guns</small></h2>`;
    if (M.owners().length) h += `<div class="chips" role="group" aria-label="Filter by owner"><button type="button" class="chip" data-own="all" aria-pressed="${ownerFilter === 'all'}">All</button>${M.owners().map(o => `<button type="button" class="chip" data-own="${esc(o.id)}" aria-pressed="${ownerFilter === o.id}">${esc(o.name)}</button>`).join('')}</div>`;
    h += guns.map(g => {
      const f = M.gunFig(g.id), own = M.gunOwners(g.id);
      return `<button type="button" class="gun" data-go="#gun/${esc(g.id)}"${/sold|retired/i.test(g.status || '') ? ' style="opacity:.6"' : ''}><div class="top"><h3>${esc(g.name)}</h3><span class="cal">${esc(g.caliber || '')}</span></div>
        <div class="owners">${own.length ? own.map(o => `<span class="own">${esc(M.owner(o).name)}</span>`).join('') : '<span class="own" style="opacity:.7">No owner yet</span>'}${g.src === 'sr' ? '<span class="own">SR Shooting</span>' : ''}${g.status && !/active/i.test(g.status) ? `<span class="own">${esc(g.status)}</span>` : ''}</div>
        <div class="nums"><div><div class="l">Total rounds</div><div class="v">${fmtN(f.total)}</div></div><div><div class="l">Since cleaning</div><div class="v since">${fmtN(f.since)}</div></div><div><div class="l">Cleaned</div><div class="v" style="font-size:14px;padding-top:3px">${dShow(f.lastClean)}</div></div></div></button>`;
    }).join('') || `<p class="empty">${M.guns().length ? 'No guns for this owner.' : 'No guns yet. Add your first gun' + (GSLink.status.installed ? ', or link SR Shooting to use its guns' : '') + '.'}</p>`;
    if (!ro()) h += '<div class="actions one"><button type="button" class="button ghost" data-go="#gunedit/new">+ Add a gun</button></div>';
    h += '<p class="note">Your data stays on this phone' + (GSSync.state().on ? ' and in your own Nextcloud.' : '. Nothing is sent anywhere.') + '</p>';
    return h;
  }

  /* ---------- guns ---------- */
  function evRow(e, withGun) {
    const g = M.gun(e.weaponId);
    const tag = e.kind === 'Service' ? '<span class="tag svc">Service</span>' : '<span class="tag cln">Cleaning</span>';
    const extra = e.kind === 'Service' ? (e.cleaningDone ? ' · cleaning done' : ' · not cleaned') : '';
    const ch = (e.changes || []).map(c => `<div class="sub">• ${esc(c)}</div>`).join('');
    return `<div class="row"><div>${tag}${withGun ? '<b>' + esc(g ? g.name : e.weaponId) + '</b>' : ''}<div class="sub">${dShow(e.date)}${extra}${e.note ? ' · ' + esc(e.note) : ''}</div>${ch}</div>${ro() ? '' : `<button type="button" class="del" data-del="service|${esc(e.id)}" aria-label="Delete entry">×</button>`}</div>`;
  }
  function vGun(p) {
    const g = M.gun(p.id);
    if (!g) return '<p class="empty">This gun is not in the database (any more).</p>';
    const f = M.gunFig(g.id), b = M.currentBarrel(g.id), comps = M.components(g.id);
    const fits = M.munitions().filter(m => M.fitsGun(g, m));
    const stock = fits.reduce((s, m) => s + Math.max(0, M.munFig(m.id).stock), 0);
    const info = M.info(g.id);
    let h = `<h2 class="sec">${esc(g.name)} <small>${esc(g.caliber || '')}</small></h2>`;
    h += `<div class="chips" role="group" aria-label="Owners">${M.owners().map(o => `<button type="button" class="chip" data-gown="${esc(o.id)}" aria-pressed="${M.gunOwners(g.id).includes(o.id)}">${esc(o.name)}</button>`).join('')}${M.owners().length ? '' : '<button type="button" class="chip" data-go="#settings">+ Add owners in Settings</button>'}</div>`;
    h += `<div class="tiles"><div class="tile"><div class="l">Total rounds</div><div class="v">${fmtN(f.total)}</div><div class="s">${fmtN(g.roundsBeforeLog || 0)} before the log</div></div>
      <div class="tile svc"><div class="l">Since cleaning</div><div class="v">${fmtN(f.since)}</div><div class="s">Cleaned ${dShow(f.lastClean)}</div></div>
      <div class="tile"><div class="l">Barrel fitted</div><div class="v" style="font-size:18px">${esc(b ? b.name : '–')}</div><div class="s">${b ? (b.lengthMm ? b.lengthMm + ' mm · ' : '') + 'since ' + dShow(b.installed) : ''}</div></div>
      <div class="tile ammo"><div class="l">Ammo in stock</div><div class="v">${fmtN(stock)}</div><div class="s">${fits.length} type${fits.length === 1 ? '' : 's'} fit this gun</div></div></div>`;
    if (!ro()) {
      h += `<div class="actions"><button type="button" class="button svc" data-go="#clean/${esc(g.id)}">Log cleaning</button><button type="button" class="button ghost" data-go="#service/${esc(g.id)}">Log service</button></div>`;
      if (g.src === 'own') h += `<div class="actions one"><button type="button" class="button ghost" data-go="#fire/${esc(g.id)}">Log rounds fired</button></div>`;
    }
    h += `<h2 class="sec">Build <small>${comps.length} part${comps.length === 1 ? '' : 's'}</small></h2>`;
    h += comps.map(c => `<div class="comp"><span class="t">${esc(c.type)}</span><span class="n">${esc(c.name)}</span></div>`).join('') || '<p class="empty">No parts recorded. Add them with Log service.</p>';
    h += `<h2 class="sec">Ammunition calibres</h2><p class="sub" style="margin:0 0 6px">Ammo of these calibres counts as stock for this gun.</p>
      <div class="form"><label class="field span2"><span>Also takes (besides ${esc(g.caliber || 'its calibre')})</span><input id="gFits" placeholder="e.g. 5.56x45" value="${esc((info.fits || []).join('; '))}"${ro() ? ' disabled' : ''}></label></div>`;
    h += '<h2 class="sec">History</h2>';
    const items = [];
    D().service.filter(e => e.weaponId === g.id).forEach(e => items.push({ d: e.date, s: e.seq || 0, html: evRow(e) }));
    M.rounds().filter(r => r.weaponId === g.id).forEach(r => {
      const m = M.mun(r.munitionId);
      items.push({ d: r.date, s: r.seq || 0, html: `<div class="row"><div><span class="tag ${r.source === 'SR Shooting' ? 'sr' : 'rnd'}">${r.source === 'SR Shooting' ? 'SR Shooting' : 'Rounds'}</span>${esc(m ? m.name : '')}<div class="sub">${dShow(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><div class="r">${fmtN(r.rounds)} rds</div>${r.source === 'GunSafe' && !ro() ? `<button type="button" class="del" data-del="rounds|${esc(r.id)}" aria-label="Delete entry">×</button>` : ''}</div>` });
    });
    items.sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : b.s - a.s);
    h += items.slice(0, 40).map(i => i.html).join('') || '<p class="empty">Nothing logged yet.</p>';
    if (g.src === 'own' && !ro()) h += `<div class="actions"><button type="button" class="button ghost" data-go="#gunedit/${esc(g.id)}">Edit gun</button><button type="button" class="button ghost" id="gDel">Delete gun</button></div>`;
    else if (g.src === 'sr') h += '<p class="note">Name, calibre and barrels of this gun come from SR Shooting; change them there.</p>';
    return h;
  }
  function vGunEdit(p) {
    const g = p.id === 'new' ? { type: 'Rifle', status: 'Active' } : D().guns.find(x => x.id === p.id);
    if (!g) return '<p class="empty">This gun can only be edited in SR Shooting.</p>';
    const b = p.id === 'new' ? null : M.currentBarrel(g.id);
    return `<form class="form" id="fGun">
      <label class="field span2"><span>Name</span><input id="gName" value="${esc(g.name || '')}" placeholder="e.g. Tikka T3x TAC A1"></label>
      <label class="field"><span>Type</span><select id="gType">${['Rifle', 'Pistol', 'Shotgun', 'Other'].map(t => `<option${g.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Calibre</span><input id="gCal" list="cals" value="${esc(g.caliber || '')}" placeholder="6.5 Creedmoor"></label>
      <label class="field"><span>Make</span><input id="gMake" value="${esc(g.make || '')}"></label>
      <label class="field"><span>Model</span><input id="gModel" value="${esc(g.model || '')}"></label>
      <label class="field"><span>Rounds before this log</span><input id="gBefore" inputmode="numeric" value="${esc(g.roundsBeforeLog == null ? '' : g.roundsBeforeLog)}" placeholder="0"></label>
      <label class="field"><span>Status</span><select id="gStatus">${['Active', 'Sold', 'Retired'].map(t => `<option${(g.status || 'Active') === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      ${p.id === 'new' ? `<label class="field"><span>Barrel (optional)</span><input id="gBarrel" placeholder="e.g. Factory"></label><label class="field"><span>Barrel length mm</span><input id="gBLen" inputmode="decimal"></label>` : `<p class="sub span2" style="grid-column:span 2;margin:0">Barrel: ${esc(b ? b.name : '–')}. Change it with Log service.</p>`}
      <label class="field span2"><span>Notes</span><textarea id="gNotes">${esc(g.notes || '')}</textarea></label>
      <datalist id="cals">${[...new Set(M.guns().map(x => x.caliber).concat(M.munitions().map(x => x.caliber)).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <p class="err" id="gErr" hidden></p>
      <button class="button" style="grid-column:span 2" type="submit">Save gun</button></form>
      <p class="note">Serial numbers and purchase details are not stored yet: that is decided later together with the app lock.</p>`;
  }

  /* ---------- service & cleaning ---------- */
  function vSvcLog() {
    let h = '<p class="lede">Every cleaning and service across all guns.</p>';
    if (!ro() && M.guns().length) h += '<div class="actions"><button type="button" class="button svc" data-go="#clean/">Log cleaning</button><button type="button" class="button ghost" data-go="#service/">Log service</button></div>';
    h += `<h2 class="sec">Log <small>${D().service.length} entr${D().service.length === 1 ? 'y' : 'ies'}</small></h2>`;
    h += D().service.slice().sort(byDateDesc).map(e => evRow(e, true)).join('') || '<p class="empty">Nothing logged yet.</p>';
    return h;
  }
  const gunSelect = (id, sel, filter) => `<label class="field span2"><span>Gun</span><select id="${id}">${M.guns().filter(filter || (() => true)).map(g => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)} · ${esc(g.caliber || '')}</option>`).join('')}</select></label>`;
  function vClean(p) {
    if (!M.guns().length) return '<p class="empty">Add a gun first.</p>';
    const gid = p.id || M.guns()[0].id, f = M.gunFig(gid);
    return `<p class="lede">A cleaning only records the date. Rounds since cleaning go back to 0.</p>
    <form class="form" id="fClean">${gunSelect('cGun', gid)}
    <label class="field"><span>Date</span><input type="date" id="cDate" value="${today()}"></label><div></div>
    <label class="field span2"><span>Note (optional)</span><input id="cNote" placeholder="e.g. bore, bolt, 20 patches"></label>
    <div class="box" style="grid-column:span 2">Rounds since last cleaning: <b>${fmtN(f.since)}</b> → <b>0</b></div>
    <button class="button svc" style="grid-column:span 2" type="submit">Save cleaning</button></form>`;
  }
  const PART_TYPES = ['Optic', 'Mount', 'Trigger', 'Stock / chassis', 'Muzzle', 'Suppressor', 'Bipod', 'Light', 'Magazine', 'Other'];
  function vService(p) {
    if (!M.guns().length) return '<p class="empty">Add a gun first.</p>';
    const gid = (draft && draft.gid) || p.id || M.guns()[0].id;
    if (!draft || draft.gid !== gid) draft = { gid, remove: [], add: [], barrel: 'keep', cleaningDone: true, adding: false, date: today(), note: '' };
    const g = M.gun(gid), b = M.currentBarrel(gid), comps = M.components(gid);
    const spare = M.barrels(gid).filter(x => x.removed);
    let h = `<p class="lede">A service can change the build and swap the barrel. Tick <b>Cleaning done</b> if you also cleaned the gun.</p><form class="form" id="fSvc">${gunSelect('sGun', gid)}
    <label class="field"><span>Date</span><input type="date" id="sDate" value="${esc(draft.date)}"></label><div></div>
    <label class="field span2"><span>What was done</span><textarea id="sNote" placeholder="e.g. new trigger, torque check, scope re-zeroed">${esc(draft.note)}</textarea></label></form>`;
    h += '<h2 class="sec">Build <small>tap Remove or add a part</small></h2>';
    h += comps.map(c => { const rm = draft.remove.includes(c.id); return `<div class="comp${rm ? ' removed' : ''}"><span class="t">${esc(c.type)}</span><span class="n">${esc(c.name)}</span><button type="button" class="mini" data-rm="${esc(c.id)}">${rm ? 'Keep' : 'Remove'}</button></div>`; }).join('');
    h += draft.add.map((a, i) => `<div class="comp added"><span class="t">${esc(a.type)}</span><span class="n">${esc(a.name)}</span><button type="button" class="mini" data-unadd="${i}">Undo</button></div>`).join('');
    if (!comps.length && !draft.add.length) h += '<p class="empty">No parts recorded yet.</p>';
    if (draft.adding) h += `<div class="form" style="margin-top:10px"><label class="field"><span>Part type</span><select id="aType">${PART_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Name</span><input id="aName" placeholder="e.g. TriggerTech Diamond"></label>
      <button type="button" class="button ghost" id="aCancel">Cancel</button><button type="button" class="button svc" id="aOk">Add part</button></div>`;
    else h += '<div class="actions one"><button type="button" class="button ghost" id="aOpen">+ Add a part</button></div>';
    h += `<h2 class="sec">Barrel <small>fitted: ${esc(b ? b.name : '–')}</small></h2><div class="form"><div class="radio" role="radiogroup" aria-label="Barrel">
      <label><input type="radio" name="brl" value="keep"${draft.barrel === 'keep' ? ' checked' : ''}> Keep ${esc(b ? b.name : 'the current barrel')}</label>
      ${spare.length ? `<label><input type="radio" name="brl" value="swap"${draft.barrel === 'swap' ? ' checked' : ''}> Switch to a barrel I already have</label>` : ''}
      <label><input type="radio" name="brl" value="new"${draft.barrel === 'new' ? ' checked' : ''}> Fit a new barrel (adds it to the database)</label></div>`;
    if (draft.barrel === 'swap') h += `<label class="field span2"><span>Barrel</span><select id="bSwap">${spare.map(x => `<option value="${esc(x.id)}">${esc(x.name)}${x.lengthMm ? ' · ' + x.lengthMm + ' mm' : ''}${x.twist ? ' · ' + esc(x.twist) : ''}</option>`).join('')}</select></label>`;
    if (draft.barrel === 'new') h += `<label class="field span2"><span>Barrel name</span><input id="bName" placeholder="e.g. Bartlein #2" value="${esc(draft.bName || '')}"></label>
      <label class="field"><span>Length mm</span><input id="bLen" inputmode="decimal" value="${esc(draft.bLen || '')}"></label>
      <label class="field"><span>Twist</span><input id="bTwist" placeholder='1:8"' value="${esc(draft.bTwist || '')}"></label>`;
    if (g.src === 'sr' && draft.barrel !== 'keep') h += '<p class="sub span2" style="grid-column:span 2;margin:0">This gun belongs to SR Shooting: the barrel change is saved there.</p>';
    h += `<label class="check" for="sClean"><input type="checkbox" id="sClean"${draft.cleaningDone ? ' checked' : ''}><span><b>Cleaning done</b><small>${draft.cleaningDone ? 'Rounds since cleaning go back to 0' : 'Rounds since cleaning stay as they are'} (now ${fmtN(M.gunFig(gid).since)})</small></span></label>
      <p class="err" id="sErr" hidden></p>
      <button class="button svc" style="grid-column:span 2" type="button" id="sSave">Save service</button></div>`;
    return h;
  }
  function vFire(p) {
    const g = M.gun(p.id);
    if (!g) return '<p class="empty">Gun not found.</p>';
    const fits = M.munitions().filter(m => M.fitsGun(g, m));
    return `<p class="lede">Rounds fired with a gun entered in GunSafe. They count for the gun and come off the ammo stock.${M.linked() ? ' Guns from SR Shooting get their rounds from your trainings there.' : ''}</p><form class="form" id="fFire">${gunSelect('fGun', g.id, x => x.src === 'own')}
    <label class="field span2"><span>Ammunition</span><select id="fMun"><option value="">– not from the stock –</option>${fits.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Date</span><input type="date" id="fDate" value="${today()}"></label>
    <label class="field"><span>Rounds</span><input id="fQty" inputmode="numeric" value="50"></label>
    <label class="field span2"><span>Note</span><input id="fNote" placeholder="e.g. hunting, fouling shots"></label><p class="err" id="fErr" hidden></p>
    <button class="button svc" style="grid-column:span 2" type="submit">Save rounds</button></form>`;
  }

  /* ---------- ammunition ---------- */
  function vAmmo() {
    const muns = M.munitions();
    let h = `<div class="seg" role="group" aria-label="Group stock"><button type="button" data-tab="ammo" aria-pressed="${ammoTab === 'ammo'}">By ammo</button><button type="button" data-tab="gun" aria-pressed="${ammoTab === 'gun'}">By gun</button></div>`;
    if (!muns.length) h += '<p class="empty">No ammunition yet. Add a purchase to start the stock.</p>';
    else if (ammoTab === 'ammo') {
      const byCal = {};
      muns.forEach(m => { const c = m.caliber || 'Other'; (byCal[c] = byCal[c] || []).push(m); });
      Object.keys(byCal).sort().forEach(cal => {
        const list = byCal[cal], sum = list.reduce((s, m) => s + Math.max(0, M.munFig(m.id).stock), 0);
        h += `<h2 class="sec">${esc(cal)} <small>${fmtN(sum)} rds</small></h2>`;
        h += list.map(m => { const f = M.munFig(m.id); return `<button type="button" class="row btn" data-go="#mun/${esc(m.id)}"><div><b>${esc(m.name)}</b><div class="sub">${f.bought ? 'avg ' + eur(f.avg) + ' / rd · last ' + eur(f.last) : 'no purchase recorded'}</div></div><div class="r">${fmtN(f.stock)} rds</div></button>`; }).join('');
      });
    } else {
      M.guns().forEach(g => {
        const fits = muns.filter(m => M.fitsGun(g, m));
        const sum = fits.reduce((s, m) => s + Math.max(0, M.munFig(m.id).stock), 0);
        h += `<h2 class="sec">${esc(g.name)} <small>${fmtN(sum)} rds</small></h2>`;
        h += fits.map(m => { const f = M.munFig(m.id), pct = sum ? Math.max(0, f.stock) / sum * 100 : 0; return `<button type="button" class="row btn" data-go="#mun/${esc(m.id)}"><div style="flex:1"><b>${esc(m.name)}</b><div class="sub">${esc(m.caliber || '')}</div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></div><div class="r">${fmtN(f.stock)}</div></button>`; }).join('') || `<p class="empty">No ammo for ${esc(g.caliber || 'this calibre')} yet.</p>`;
      });
    }
    if (!ro()) h += '<div class="actions"><button type="button" class="button ammo" data-go="#buy/">Add purchase</button><button type="button" class="button ghost" data-go="#out/">Take out</button></div>';
    if (M.linked()) h += '<p class="note">Rounds fired in SR Shooting are taken off the stock automatically.</p>';
    return h;
  }
  function priceChart(mid) {
    const buys = D().moves.filter(m => m.munitionId === mid && m.kind === 'Purchase' && m.qty > 0).sort((a, b) => a.date < b.date ? -1 : 1);
    if (buys.length < 2) return '<p class="empty">The price chart appears after the second purchase.</p>';
    const W = 340, H = 150, L = 46, R = 12, T = 14, B = 26;
    const t = d => new Date(d + 'T00:00:00').getTime();
    const xs = buys.map(b => t(b.date)), ys = buys.map(b => b.price / b.qty);
    let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * .25 || y1 * .1 || .1; y0 = Math.max(0, y0 - pad); y1 = y1 + pad;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = v => L + (v - x0) / (x1 - x0 || 1) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
    const pts = buys.map((b, i) => [X(xs[i]), Y(ys[i])]);
    const mono = 'font-size="10" fill="var(--muted)" font-family="JetBrains Mono, monospace"';
    let g = '';
    [y0, (y0 + y1) / 2, y1].forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--hair)" stroke-width="1"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" ${mono}>${v.toFixed(2).replace('.', ',')}</text>`; });
    g += `<path d="M${pts[0][0]},${H - B} ${pts.map(p => `L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length - 1][0]},${H - B} Z" fill="var(--s-ammo)" fill-opacity=".14" stroke="none"/>`;
    g += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--s-ammo)" stroke-width="2"/>`;
    g += pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${i === pts.length - 1 ? 'var(--s-ammo)' : 'var(--surface)'}" stroke="var(--s-ammo)" stroke-width="2"/>`).join('');
    g += `<text x="${L}" y="${H - 8}" ${mono}>${dShow(buys[0].date)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end" ${mono}>${dShow(buys[buys.length - 1].date)}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price per round over time">${g}</svg><p class="sub" style="margin:4px 0 0">€ per round at each purchase</p>`;
  }
  function vMun(p) {
    const m = M.mun(p.id);
    if (!m) return '<p class="empty">This ammunition is not in the database (any more).</p>';
    const f = M.munFig(m.id), guns = M.guns().filter(g => M.fitsGun(g, m)).map(g => g.name).join(', ') || 'no gun yet';
    let h = `<h2 class="sec">${esc(m.name)} <small>${esc(m.caliber || '')}</small></h2><p class="lede" style="margin-bottom:10px">Fits: ${esc(guns)}</p>`;
    h += `<div class="tiles"><div class="tile ammo"><div class="l">In stock</div><div class="v">${fmtN(f.stock)}</div><div class="s">${fmtN(f.bought)} bought · ${fmtN(f.fired)} fired${f.out ? ' · ' + fmtN(f.out) + ' out' : ''}</div></div>
      <div class="tile ammo"><div class="l">Cost per round</div><div class="v">${f.bought ? eur(f.avg) : '–'}</div><div class="s">average${f.bought ? ' · last ' + eur(f.last) : ''}</div></div></div>`;
    if (!ro()) h += `<div class="actions"><button type="button" class="button ammo" data-go="#buy/${esc(m.id)}">Add purchase</button><button type="button" class="button ghost" data-go="#out/${esc(m.id)}">Take out</button></div>`;
    h += '<h2 class="sec">Price over time</h2>' + priceChart(m.id);
    h += '<h2 class="sec">Movements</h2>';
    const del = x => ro() ? '' : `<button type="button" class="del" data-del="moves|${esc(x.id)}" aria-label="Delete entry">×</button>`;
    const items = D().moves.filter(x => x.munitionId === m.id).map(x => ({ d: x.date, html: x.kind === 'Purchase'
      ? `<div class="row"><div><span class="tag ammo">Purchase</span>${esc(x.shop || '')}<div class="sub">${dShow(x.date)} · ${eur(x.price)} · ${x.qty ? eur(x.price / x.qty) : '–'} / rd</div></div><div class="r plus">+${fmtN(x.qty)}</div>${del(x)}</div>`
      : `<div class="row"><div><span class="tag rnd">Taken out</span>${esc(x.purpose || '')}<div class="sub">${dShow(x.date)}</div></div><div class="r minus">${fmtN(x.qty)}</div>${del(x)}</div>` }));
    M.rounds().filter(r => r.munitionId === m.id).forEach(r => { const g = M.gun(r.weaponId); items.push({ d: r.date, html: `<div class="row"><div><span class="tag ${r.source === 'SR Shooting' ? 'sr' : 'rnd'}">${r.source === 'SR Shooting' ? 'SR Shooting' : 'Fired'}</span>${esc(g ? g.name : r.weaponId)}<div class="sub">${dShow(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><div class="r minus">−${fmtN(r.rounds)}</div></div>` }); });
    items.sort((a, b) => a.d < b.d ? 1 : -1);
    h += items.map(i => i.html).join('') || '<p class="empty">No movements yet.</p>';
    if (m.src === 'own' && !ro()) h += `<div class="actions"><button type="button" class="button ghost" data-go="#munedit/${esc(m.id)}">Edit ammunition</button><button type="button" class="button ghost" id="mDel">Delete ammunition</button></div>`;
    else if (m.src === 'sr') h += '<p class="note">Name and calibre of this ammunition come from SR Shooting; change them there.</p>';
    return h;
  }
  function vMunEdit(p) {
    const m = D().munitions.find(x => x.id === p.id);
    if (!m) return '<p class="empty">This ammunition can only be edited in SR Shooting.</p>';
    return `<form class="form" id="fMunE"><label class="field span2"><span>Name</span><input id="eName" value="${esc(m.name || '')}"></label>
      <label class="field"><span>Calibre</span><input id="eCal" value="${esc(m.caliber || '')}"></label><label class="field"><span>Manufacturer</span><input id="eMfr" value="${esc(m.manufacturer || '')}"></label>
      <label class="field span2"><span>Notes</span><textarea id="eNotes">${esc(m.notes || '')}</textarea></label><p class="err" id="eErr" hidden></p>
      <button class="button ammo" style="grid-column:span 2" type="submit">Save ammunition</button></form>`;
  }
  const munSelect = (id, sel, withNew) => `<label class="field span2"><span>Ammunition</span><select id="${id}">${M.munitions().map(m => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>${esc(m.name)} · ${esc(m.caliber || '')}</option>`).join('')}${withNew ? '<option value="new"' + (M.munitions().length ? '' : ' selected') + '>+ New ammunition …</option>' : ''}</select></label>`;
  function vBuy(p) {
    const cals = [...new Set(M.guns().flatMap(g => [g.caliber].concat(M.info(g.id).fits || [])).concat(M.munitions().map(m => m.caliber)).filter(Boolean))];
    return `<p class="lede">Record what you bought. The cost per round and the price history follow from it.</p><form class="form" id="fBuy">${munSelect('bMun', p.id || (M.munitions()[0] || {}).id, true)}
    <div class="form" id="newMun" hidden style="grid-column:span 2"><label class="field span2"><span>Name</span><input id="nName" placeholder="e.g. RWS Target Elite 140 gr"></label>
      <label class="field"><span>Calibre</span><input id="nCal" list="cals" placeholder="6.5 Creedmoor"></label><label class="field"><span>Manufacturer</span><input id="nMfr"></label>
      <datalist id="cals">${cals.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <label class="field"><span>Date</span><input type="date" id="bDate" value="${today()}"></label>
    <label class="field"><span>Rounds</span><input id="bQty" inputmode="numeric" value="200"></label>
    <label class="field"><span>Total price €</span><input id="bPrice" inputmode="decimal" placeholder="e.g. 420,00"></label>
    <label class="field"><span>Shop</span><input id="bShop" list="shops" placeholder="Where you bought it"><datalist id="shops">${[...new Set(D().moves.filter(x => x.shop).map(x => x.shop))].map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <div class="box" style="grid-column:span 2" id="bBox">Cost per round: <b>–</b></div><p class="err" id="bErr" hidden></p>
    <button class="button ammo" style="grid-column:span 2" type="submit">Save purchase</button></form>`;
  }
  function vOut(p) {
    if (!M.munitions().length) return '<p class="empty">No ammunition yet.</p>';
    return `<p class="lede">Take rounds out of stock that were not shot in a logged training, for example when you hand them over.</p><form class="form" id="fOut">${munSelect('oMun', p.id || M.munitions()[0].id)}
    <label class="field"><span>Date</span><input type="date" id="oDate" value="${today()}"></label>
    <label class="field"><span>Rounds</span><input id="oQty" inputmode="numeric" value="200"></label>
    <label class="field span2"><span>Purpose</span><input id="oPurp" placeholder="e.g. Handed over to Ines for training xy"></label>
    <div class="box" style="grid-column:span 2" id="oBox"></div><p class="err" id="oErr" hidden></p>
    <button class="button ammo" style="grid-column:span 2" type="submit">Take out of stock</button></form>`;
  }

  /* ---------- settings ---------- */
  function vSettings() {
    const st = GSSync.state(), s = st.setting, nc = s.mode === 'nextcloud';
    let h = '<h2 class="sec">Where your data is stored</h2>';
    if (M.linked()) h += '<div class="box" style="margin-top:0">One database for all linked apps. This setting is shared with <b style="font-family:var(--f-body)">SR Shooting</b>: change it here or there and both apps follow.</div>';
    h += `<div class="form"><div class="radio" role="radiogroup" aria-label="Storage">
      <label><input type="radio" name="stm" value="local"${!nc ? ' checked' : ''}${ro() ? ' disabled' : ''}> <span><b>On this phone only</b><br><small class="sub">Works offline. Back up with "Save database file" below.</small></span></label>
      <label><input type="radio" name="stm" value="nextcloud"${nc ? ' checked' : ''}${ro() ? ' disabled' : ''}> <span><b>On this phone, synced to my Nextcloud</b><br><small class="sub">The phone keeps working offline and syncs when it is online.</small></span></label></div>`;
    if (nc) {
      h += `<label class="field span2"><span>Nextcloud address</span><input id="ncUrl" inputmode="url" autocapitalize="off" placeholder="https://cloud.example.com" value="${esc(s.url)}"></label>
        <label class="field"><span>User name</span><input id="ncUser" autocapitalize="off" autocomplete="username" value="${esc(s.user)}"></label>
        <label class="field"><span>App password</span><input id="ncPw" type="password" autocomplete="current-password" placeholder="${s.pwSet ? '•••••• (saved)' : 'xxxxx-xxxxx-…'}"></label>
        <p class="sub span2" style="grid-column:span 2;margin:0">Make an app password in Nextcloud under Settings › Security › Devices &amp; sessions. It is kept encrypted on this phone only and is used only to log in to your Nextcloud.${M.linked() && !s.pwSet ? ' Each linked app asks for it once; the apps never pass it on.' : ''}</p>
        <label class="field span2"><span>Folder on Nextcloud</span><input id="ncFolder" value="${esc(s.folder || '/Stoic Ranger/')}"></label>
        <div class="box span2" style="grid-column:span 2;margin:0">File: <b>${esc((s.folder || '/Stoic Ranger/') + st.file)}</b>${M.linked() ? '<br>Shared with SR Shooting, so both apps use this file.' : ''}<br>${st.last && st.last.at ? 'Last sync: <b>' + esc(dShow(st.last.at.slice(0, 10)) + ' ' + st.last.at.slice(11, 16)) + ' UTC</b> · ' + esc(st.last.msg) : 'Not synced yet.'}<br>Syncs when the app opens, after each change and with Sync now.</div>
        ${msg ? `<p class="err" style="color:${msg.ok ? 'var(--ok)' : 'var(--bad)'}">${esc(msg.t)}</p>` : ''}
        <button type="button" class="button ghost" id="ncTest"${st.busy ? ' disabled' : ''}>Test connection</button><button type="button" class="button svc" id="ncSync"${st.busy ? ' disabled' : ''}>${st.busy ? 'Syncing …' : 'Save and sync now'}</button>
        <button type="button" class="button ghost span2" style="grid-column:span 2" id="ncReplace"${st.busy || !st.on ? ' disabled' : ''}>Replace this phone's data with the Nextcloud copy</button>
        <p class="sub span2" style="grid-column:span 2;margin:0">If the file was changed somewhere else (PC, Excel, another phone), both sets of changes are merged. Nothing is overwritten: before each upload a copy is kept in ${esc(s.folder || '/Stoic Ranger/')}backups/ (the newest 30).</p>`;
      if (!st.native) h += '<p class="err">Nextcloud sync works in the Android app.</p>';
    }
    h += '</div>';
    h += `<h2 class="sec">Link with SR Shooting</h2>
      <div class="setrow"><div><b>Use the SR Shooting database</b><div class="sub">Reads guns, barrels, ammunition and rounds fired from SR Shooting, and shares one database file and storage setting with it. Only with your permission.</div></div><label class="switch"><input type="checkbox" id="linkSw" aria-label="Use the SR Shooting database"${GSLink.state() === 'allowed' ? ' checked' : ''}${ro() ? ' disabled' : ''}><span></span></label></div>`;
    if (GSLink.state() === 'allowed' && GSLink.problem) h += `<p class="sub">${esc(GSLink.problemText(GSLink.problem))}</p>`;
    else if (GSLink.state() === 'allowed' && D().srCache) h += `<p class="sub">Read from SR Shooting ${esc(D().srCache.version || '')}: ${(D().srCache.weapons || []).length} guns, ${(D().srCache.munitions || []).length} ammunition, ${(D().srCache.rounds || []).length} rounds entries.</p>`;
    else if (!GSLink.status.installed) h += '<p class="sub">SR Shooting is not installed on this phone.</p>';
    h += '<h2 class="sec">Owners <small>a gun can have several</small></h2>';
    h += M.owners().map(o => { const n = M.guns().filter(g => M.gunOwners(g.id).includes(o.id)).length; return `<div class="row"><div><b>${esc(o.name)}</b></div><div class="r">${n} gun${n === 1 ? '' : 's'}</div>${ro() ? '' : `<button type="button" class="del" data-delown="${esc(o.id)}" aria-label="Delete owner">×</button>`}</div>`; }).join('') || '<p class="empty">No owners yet.</p>';
    if (!ro()) h += '<div class="form" style="margin-top:10px"><label class="field"><span>New owner</span><input id="owName" placeholder="Name"></label><button type="button" class="button ghost" id="owAdd" style="align-self:end">Add owner</button></div>';
    // what went with a deleted gun or ammunition is listed under it (Undo brings it all back)
    const heads = D().trash.filter(x => x && (x.table === 'guns' || x.table === 'munitions')).map(x => x.at + '|' + x.by);
    const tr = D().trash.map((x, i) => ({ x, i })).filter(o => o.x && o.x.row && (o.x.table === 'guns' || o.x.table === 'munitions' || !heads.includes(o.x.at + '|' + o.x.by))).sort((a, b) => a.x.at < b.x.at ? 1 : -1);
    h += `<h2 class="sec">Recently deleted <small>kept ${TRASH_DAYS} days</small></h2><p class="sub" style="margin:0 0 6px">A delete is passed to all your devices and the PC with the next sync. Undo brings an entry back everywhere.</p>`;
    h += tr.slice(0, 50).map(({ x, i }) => `<div class="row"><div><b>${esc(labelOf(x.table, x.row))}</b><div class="sub">${dShow(x.at.slice(0, 10))} ${esc(x.at.slice(11, 16))} UTC · ${esc(x.by || '')}</div></div>${ro() ? '' : `<button type="button" class="mini" data-undo="${i}">Undo</button>`}</div>`).join('') || '<p class="empty">Nothing deleted in the last 30 days.</p>';
    h += `<h2 class="sec">Database file</h2><p class="sub" style="margin:0 0 8px">${esc(st.file)}: the GS_ sheets can be opened and edited in Excel. Opening a file merges it into the app; nothing is deleted.</p>
      <div class="actions"><button type="button" class="button ghost" id="xSave">Save database file</button><button type="button" class="button ghost" id="xOpen"${ro() ? ' disabled' : ''}>Open a file</button></div>`;
    const info = (() => { try { return window.GSNative ? JSON.parse(GSNative.appInfo()) : {}; } catch (e) { return {}; } })();
    h += `<h2 class="sec">About</h2><dl class="kv"><dt>App</dt><dd>SR GunSafe ${esc(info.version || '0.1.3')}</dd><dt>Units</dt><dd>Metric (mm, m, g), prices in EUR</dd><dt>Data</dt><dd>On this phone${s.mode === 'nextcloud' ? ' and in your Nextcloud' : ''}. No accounts, no tracking.</dd></dl>`;
    h += '<details><summary class="sub">Back button log and errors</summary><pre class="log" id="backLog"></pre></details>';
    return h;
  }

  /* ---------- render ---------- */
  function render(keepScroll) {
    const r = route();
    if (r.v !== 'service') draft = null;
    if (r.v !== 'settings') msg = null;
    const sc = $('screen'), y = sc.scrollTop;
    const g = (r.v === 'gun' || r.v === 'gunedit') && r.id !== 'new' ? M.gun(r.id) : null;
    $('hTitle').textContent = g ? g.name : r.v === 'gunedit' ? 'Add a gun' : TITLES[r.v];
    $('appbar').dataset.sec = SEC[r.v] || '';
    const hb = $('hHome'); hb.dataset.home = r.v === 'home' ? '' : '1'; hb.setAttribute('aria-label', r.v === 'home' ? 'SR GunSafe' : 'Home');
    if (!hb.querySelector('.hl')) { const l = document.createElement('span'); l.className = 'hl'; l.textContent = 'Home'; hb.appendChild(l); }
    hb.querySelector('.hl').hidden = r.v === 'home';
    $('menuBtn').hidden = r.v === 'settings';
    const fn = { home: vHome, gun: vGun, gunedit: vGunEdit, svclog: vSvcLog, clean: vClean, service: vService, fire: vFire, ammo: vAmmo, mun: vMun, munedit: vMunEdit, buy: vBuy, out: vOut, settings: vSettings }[r.v];
    try { sc.innerHTML = fn(r); } catch (e) { GS.errors.push('render ' + r.v + ': ' + e); sc.innerHTML = '<p class="banner">This page could not be shown: ' + esc(e.message) + '</p>'; }
    sc.scrollTop = keepScroll ? y : 0;
    wire(r);
  }
  const err = (id, t) => { const e = $(id); if (e) { e.textContent = t; e.hidden = false; } };
  function save(why, toastText) { GSStore.changed(why || 'edit'); if (toastText) GS.toast(toastText); }

  function wire(r) {
    const sc = $('screen');
    sc.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => GS.go(b.dataset.go); });
    sc.querySelectorAll('[data-own]').forEach(b => { b.onclick = () => { ownerFilter = b.dataset.own; render(true); }; });
    sc.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { ammoTab = b.dataset.tab; render(true); }; });
    sc.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => {
      const [t, id] = b.dataset.del.split('|');
      const what = { service: 'this service or cleaning entry', moves: 'this stock movement', rounds: 'these rounds' }[t];
      confirmBox('Delete entry?', 'Delete ' + what + '? A copy of your data is kept in the backups.', 'Delete', () => {
        GSStore.backup('before-delete-' + GSStore.stamp() + '.json');
        kill(t, [id]); save('delete', 'Deleted · on all devices at the next sync'); render(true);
      }, true);
    }; });
    if ($('lnYes')) $('lnYes').onclick = () => { const p = GSLink.allow(); render(true); GS.toast(p ? GSLink.problemText(p) : 'Linked with SR Shooting'); };
    if ($('lnNo')) $('lnNo').onclick = () => { D().link.dismissed = true; GSStore.changed('link'); render(true); };
    const v = r.v;
    if (v === 'gun') {
      const g = M.gun(r.id); if (!g) return;
      sc.querySelectorAll('[data-gown]').forEach(b => { b.onclick = () => {
        if (ro()) return;
        const id = b.dataset.gown, cur = M.gunOwners(g.id);
        M.setInfo(g.id, { owners: cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id) }); save('owners'); render(true);
      }; });
      if ($('gFits')) $('gFits').onchange = () => { M.setInfo(g.id, { fits: $('gFits').value.split(/[;,]/).map(s => s.trim()).filter(Boolean) }); save('fits', 'Saved'); };
      if ($('gDel')) $('gDel').onclick = () => confirmBox('Delete gun?', `Delete <b>${esc(g.name)}</b> with its parts, barrels and history? A copy of your data is kept in the backups.`, 'Delete gun', () => {
        GSStore.backup('before-delete-' + GSStore.stamp() + '.json');
        const d = D(), mine = t => d[t].filter(x => x.weaponId === g.id).map(x => x.id);
        const at = GSStore.now();
        ['barrels', 'components', 'service', 'rounds'].forEach(t => kill(t, mine(t), at));
        kill('gunInfo', [g.id], at); kill('guns', [g.id], at);
        save('delete', 'Gun deleted · on all devices at the next sync'); location.replace('#home');
      }, true);
    }
    if (v === 'gunedit') {
      $('fGun').onsubmit = e => {
        e.preventDefault();
        const name = $('gName').value.trim(); if (!name) { err('gErr', 'Give the gun a name.'); return; }
        const before = $('gBefore').value.trim() === '' ? 0 : num($('gBefore').value);
        if (!(before >= 0)) { err('gErr', 'Rounds before this log: a whole number, or leave it empty.'); return; }
        const d = D();
        let g = d.guns.find(x => x.id === r.id);
        const isNew = !g;
        if (isNew) { g = { id: GSStore.nid('guns', 'G') }; d.guns.push(g); }
        Object.assign(g, { name, type: $('gType').value, caliber: $('gCal').value.trim(), make: $('gMake').value.trim(), model: $('gModel').value.trim(), roundsBeforeLog: Math.round(before), status: $('gStatus').value, notes: $('gNotes').value.trim() });
        if (isNew && $('gBarrel') && $('gBarrel').value.trim()) d.barrels.push({ id: GSStore.nid('barrels', 'GB'), weaponId: g.id, name: $('gBarrel').value.trim(), lengthMm: num($('gBLen').value) || '', twist: '', installed: today(), removed: '', notes: '' });
        if (isNew && ownerFilter !== 'all' && M.owner(ownerFilter)) M.setInfo(g.id, { owners: [ownerFilter] });
        save('gun', isNew ? 'Gun added' : 'Gun saved');
        if (isNew) location.replace('#gun/' + g.id); else GS.done();
      };
    }
    if (v === 'clean') {
      if (!$('fClean')) return;
      $('cGun').onchange = () => location.replace('#clean/' + $('cGun').value);
      $('fClean').onsubmit = e => {
        e.preventDefault();
        D().service.push({ id: GSStore.nid('service', 'E'), date: $('cDate').value || today(), weaponId: $('cGun').value, kind: 'Cleaning', cleaningDone: true, note: $('cNote').value.trim(), changes: [], seq: GSStore.seq() });
        save('clean', 'Cleaning saved · count back to 0'); GS.done();
      };
    }
    if (v === 'service') {
      if (!$('sSave')) return;
      const keep = () => { draft.date = $('sDate').value; draft.note = $('sNote').value; if ($('bName')) { draft.bName = $('bName').value; draft.bLen = $('bLen').value; draft.bTwist = $('bTwist').value; } };
      $('sGun').onchange = () => { draft = null; location.replace('#service/' + $('sGun').value); };
      sc.querySelectorAll('[data-rm]').forEach(b => { b.onclick = () => { keep(); const id = b.dataset.rm; draft.remove = draft.remove.includes(id) ? draft.remove.filter(x => x !== id) : draft.remove.concat(id); render(true); }; });
      sc.querySelectorAll('[data-unadd]').forEach(b => { b.onclick = () => { keep(); draft.add.splice(+b.dataset.unadd, 1); render(true); }; });
      if ($('aOpen')) $('aOpen').onclick = () => { keep(); draft.adding = true; render(true); setTimeout(() => { if ($('aName')) $('aName').focus(); }, 0); };
      if ($('aCancel')) $('aCancel').onclick = () => { keep(); draft.adding = false; render(true); };
      if ($('aOk')) $('aOk').onclick = () => { const n = $('aName').value.trim(); if (!n) { $('aName').focus(); return; } keep(); draft.add.push({ type: $('aType').value, name: n }); draft.adding = false; render(true); };
      sc.querySelectorAll('input[name="brl"]').forEach(x => { x.onchange = () => { keep(); draft.barrel = x.value; render(true); }; });
      $('sClean').onchange = () => { keep(); draft.cleaningDone = $('sClean').checked; render(true); };
      $('sSave').onclick = () => {
        keep();
        const gid = draft.gid, g = M.gun(gid), date = draft.date || today(), changes = [], d = D();
        if (draft.barrel === 'new' && !(draft.bName || '').trim()) { err('sErr', 'Give the new barrel a name, or choose Keep.'); return; }
        if (!draft.remove.length && !draft.add.length && draft.barrel === 'keep' && !draft.note.trim() && !draft.cleaningDone) { err('sErr', 'Write what was done, change a part or the barrel, or tick Cleaning done.'); return; }
        const cur = M.currentBarrel(gid);
        let barrelChange = null;
        if (draft.barrel === 'swap') {
          const nb = M.barrels(gid).find(x => x.id === $('bSwap').value);
          barrelChange = { off: cur, on: Object.assign({}, nb, { removed: '', installed: date }) };
          changes.push('Barrel switched: ' + (cur ? cur.name : '–') + ' → ' + nb.name);
        }
        if (draft.barrel === 'new') {
          const nb = { id: g.src === 'sr' ? '' : GSStore.nid('barrels', 'GB'), weaponId: gid, name: draft.bName.trim(), lengthMm: num(draft.bLen) || '', twist: (draft.bTwist || '').trim(), installed: date, removed: '', notes: '' };
          barrelChange = { off: cur, on: nb, isNew: true };
          changes.push('New barrel fitted: ' + nb.name + (cur ? ' (replaces ' + cur.name + ')' : ''));
        }
        if (barrelChange) {
          if (g.src === 'sr') {
            const list = [barrelChange.on].concat(barrelChange.off ? [Object.assign({}, barrelChange.off, { removed: date })] : []);
            const p = GSLink.putBarrels(list);
            if (p) { err('sErr', p); return; }
          } else {
            if (barrelChange.off) { const o = d.barrels.find(x => x.id === barrelChange.off.id); if (o) o.removed = date; }
            if (barrelChange.isNew) d.barrels.push(barrelChange.on);
            else { const o = d.barrels.find(x => x.id === barrelChange.on.id); if (o) { o.removed = ''; o.installed = date; } }
          }
        }
        draft.remove.forEach(id => { const c = d.components.find(x => x.id === id); if (c) { c.removed = date; changes.push('Removed ' + c.type.toLowerCase() + ': ' + c.name); } });
        draft.add.forEach(a => { d.components.push({ id: GSStore.nid('components', 'C'), weaponId: gid, type: a.type, name: a.name, fitted: date, removed: '' }); changes.push('Added ' + a.type.toLowerCase() + ': ' + a.name); });
        d.service.push({ id: GSStore.nid('service', 'E'), date, weaponId: gid, kind: 'Service', cleaningDone: draft.cleaningDone, note: draft.note.trim(), changes, seq: GSStore.seq() });
        const cd = draft.cleaningDone; draft = null;
        save('service', (cd ? 'Service saved · count back to 0' : 'Service saved') + (barrelChange && g.src === 'sr' ? ' · SR Shooting takes the barrel at its next start' : '')); GS.done();
      };
    }
    if (v === 'fire' && $('fFire')) {
      $('fGun').onchange = () => location.replace('#fire/' + $('fGun').value);
      $('fFire').onsubmit = e => {
        e.preventDefault();
        const q = Math.round(num($('fQty').value));
        if (!(q > 0)) { err('fErr', 'Enter the number of rounds.'); return; }
        D().rounds.push({ id: GSStore.nid('rounds', 'R'), date: $('fDate').value || today(), weaponId: $('fGun').value, munitionId: $('fMun').value, rounds: q, note: $('fNote').value.trim(), seq: GSStore.seq() });
        save('rounds', fmtN(q) + ' rounds logged'); GS.done();
      };
    }
    if (v === 'mun' && $('mDel')) {
      const m = M.mun(r.id);
      $('mDel').onclick = () => confirmBox('Delete ammunition?', `Delete <b>${esc(m.name)}</b> with its purchases and take-outs? A copy of your data is kept in the backups.`, 'Delete', () => {
        GSStore.backup('before-delete-' + GSStore.stamp() + '.json');
        const at = GSStore.now();
        kill('moves', D().moves.filter(x => x.munitionId === m.id).map(x => x.id), at); kill('munitions', [m.id], at);
        save('delete', 'Ammunition deleted · on all devices at the next sync'); location.replace('#ammo');
      }, true);
    }
    if (v === 'munedit' && $('fMunE')) {
      $('fMunE').onsubmit = e => {
        e.preventDefault();
        const m = D().munitions.find(x => x.id === r.id), n = $('eName').value.trim();
        if (!n) { err('eErr', 'Give the ammunition a name.'); return; }
        Object.assign(m, { name: n, caliber: $('eCal').value.trim(), manufacturer: $('eMfr').value.trim(), notes: $('eNotes').value.trim() });
        save('munition', 'Saved'); GS.done();
      };
    }
    if (v === 'buy') {
      const upd = () => { const q = num($('bQty').value), pr = num($('bPrice').value); $('bBox').innerHTML = 'Cost per round: <b>' + (q > 0 && pr >= 0 ? eur(pr / q) : '–') + '</b>'; $('newMun').hidden = $('bMun').value !== 'new'; };
      ['bQty', 'bPrice'].forEach(id => { $(id).oninput = upd; }); $('bMun').onchange = upd; upd();
      $('fBuy').onsubmit = e => {
        e.preventDefault();
        const q = Math.round(num($('bQty').value)), pr = num($('bPrice').value); let mid = $('bMun').value;
        if (mid === 'new' && !$('nName').value.trim()) { err('bErr', 'Give the new ammunition a name.'); return; }
        if (!(q > 0)) { err('bErr', 'Enter how many rounds you bought.'); return; }
        if (!(pr >= 0)) { err('bErr', 'Enter the total price, for example 420,00.'); return; }
        if (mid === 'new') { mid = GSStore.nid('munitions', 'GM'); D().munitions.push({ id: mid, name: $('nName').value.trim(), caliber: $('nCal').value.trim(), manufacturer: $('nMfr').value.trim(), notes: '' }); }
        D().moves.push({ id: GSStore.nid('moves', 'A'), date: $('bDate').value || today(), munitionId: mid, kind: 'Purchase', qty: q, price: Math.round(pr * 100) / 100, shop: $('bShop').value.trim(), purpose: '' });
        save('buy', 'Purchase saved · ' + eur(pr / q) + ' per round'); GS.done();
      };
    }
    if (v === 'out' && $('fOut')) {
      const upd = () => { const f = M.munFig($('oMun').value), q = num($('oQty').value) || 0; $('oBox').innerHTML = 'In stock: <b>' + fmtN(f.stock) + '</b> → <b>' + fmtN(f.stock - q) + '</b>'; };
      $('oMun').onchange = upd; $('oQty').oninput = upd; upd();
      $('fOut').onsubmit = e => {
        e.preventDefault();
        const q = Math.round(num($('oQty').value)), mid = $('oMun').value;
        if (!(q > 0)) { err('oErr', 'Enter how many rounds you take out.'); return; }
        if (!$('oPurp').value.trim()) { err('oErr', 'Write the purpose, for example who got them and why.'); return; }
        if (q > M.munFig(mid).stock) { err('oErr', 'Only ' + fmtN(M.munFig(mid).stock) + ' rounds are in stock.'); return; }
        D().moves.push({ id: GSStore.nid('moves', 'A'), date: $('oDate').value || today(), munitionId: mid, kind: 'Withdrawal', qty: -q, price: null, shop: '', purpose: $('oPurp').value.trim() });
        save('out', fmtN(q) + ' rounds taken out'); GS.done();
      };
    }
    if (v === 'settings') wireSettings();
  }

  function wireSettings() {
    const sc = $('screen');
    const ncFields = () => $('ncUrl') ? { url: $('ncUrl').value.trim(), user: $('ncUser').value.trim(), folder: $('ncFolder').value.trim() || '/Stoic Ranger/', password: $('ncPw').value } : {};
    sc.querySelectorAll('input[name="stm"]').forEach(x => { x.onchange = () => {
      if (x.value === 'local') {
        confirmBox('Keep the data on this phone only?', 'Syncing stops' + (M.linked() ? ' for SR Shooting as well (one setting for all linked apps)' : '') + '. Your data stays on this phone, and nothing is deleted on Nextcloud.', 'Phone only', () => {
          GSSync.save({ mode: 'local' }); msg = null; render(true); GS.toast(M.linked() ? 'Phone only · SR Shooting switched too' : 'Data stays on this phone only');
        }, false, () => render(true));
        return;
      }
      GSSync.save({ mode: 'nextcloud' }); msg = null; render(true);
    }; });
    const check = f => {
      if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(f.url)) return 'Enter the address of your Nextcloud, starting with https://';
      if (!f.user) return 'Enter your Nextcloud user name.';
      if (!f.password && !GSSync.setting().pwSet) return 'Enter an app password from your Nextcloud.';
      return '';
    };
    const apply = () => { const f = ncFields(), c = check(f); if (c) { msg = { ok: false, t: c }; render(true); return false; } const p = Object.assign({ mode: 'nextcloud' }, f); if (!p.password) delete p.password; GSSync.save(p); return true; };
    if ($('ncTest')) $('ncTest').onclick = async () => { if (!apply()) return; msg = { ok: true, t: 'Testing …' }; render(true); const t = await GSSync.test(); msg = { ok: t.ok, t: t.msg }; render(true); };
    if ($('ncSync')) $('ncSync').onclick = async () => { if (!apply()) return; msg = { ok: true, t: 'Syncing …' }; render(true); const s = await GSSync.sync('now'); msg = { ok: s.ok, t: s.msg }; render(true); if (s.ok) GS.toast(M.linked() ? 'Synced · SR Shooting uses the same file' : 'Synced with Nextcloud'); };
    if ($('ncReplace')) $('ncReplace').onclick = () => confirmBox('Replace this phone\'s data?', 'GunSafe\'s data on this phone is replaced by the copy in <b>' + esc(GSSync.fileName()) + '</b> on Nextcloud. Nothing is merged. A backup of the phone\'s data is made first.', 'Replace', async () => {
      msg = { ok: true, t: 'Loading the Nextcloud copy …' }; render(true);
      const r = await GSSync.replaceFromRemote(); msg = { ok: r.ok, t: r.msg }; render(true); if (r.ok) GS.toast('Nextcloud copy loaded');
    }, true);
    if ($('linkSw')) $('linkSw').onchange = () => {
      if ($('linkSw').checked) {
        $('linkSw').checked = false;
        confirmBox('Link SR GunSafe with SR Shooting?', 'GunSafe then reads guns, barrels, ammunition and rounds fired from SR Shooting, and both apps use one database file and one storage setting. Everything entered in GunSafe stays.', 'Allow link', () => {
          const p = GSLink.allow(); render(true); GS.toast(p ? GSLink.problemText(p) : 'Linked with SR Shooting');
        }, false, () => render(true));
      } else { GSLink.off(); render(true); GS.toast('Link turned off · your GunSafe data stays'); }
    };
    if ($('owAdd')) $('owAdd').onclick = () => { const n = $('owName').value.trim(); if (!n) { $('owName').focus(); return; } D().owners.push({ id: GSStore.nid('owners', 'O'), name: n, notes: '' }); save('owner', 'Owner added'); render(true); };
    sc.querySelectorAll('[data-delown]').forEach(b => { b.onclick = () => {
      const o = M.owner(b.dataset.delown), used = M.guns().filter(g => M.gunOwners(g.id).includes(o.id)).length;
      confirmBox('Delete owner?', `Delete <b>${esc(o.name)}</b>?${used ? ' The owner is taken off ' + used + ' gun' + (used === 1 ? '' : 's') + '.' : ''}`, 'Delete', () => {
        D().gunInfo.forEach(i => { i.owners = (i.owners || []).filter(x => x !== o.id); }); kill('owners', [o.id]); save('delete', 'Owner deleted'); render(true);
      }, true);
    }; });
    sc.querySelectorAll('[data-undo]').forEach(b => { b.onclick = () => {
      const x = D().trash[+b.dataset.undo]; if (!x) return;
      // a gun or ammunition comes back with what was deleted with it at the same moment
      const group = D().trash.map((y, i) => ({ y, i })).filter(o => o.y.at === x.at && o.y.by === x.by && (o.i === +b.dataset.undo || ((x.table === 'guns' || x.table === 'munitions') && o.y.table !== x.table)));
      group.map(o => o.i).sort((a, c) => c - a).forEach(undo);
      save('undo', 'Restored · on all devices at the next sync'); render(true);
    }; });
    if ($('xSave')) $('xSave').onclick = () => {
      try {
        const bytes = GSX.write(D(), null, 'SR GunSafe'), name = GSSync.fileName();
        if (window.GSNative) { GSSync.native('saveFile', name, GSX.MIME, GSSync.b64(bytes)).then(o => GS.toast(o.ok ? 'Saved ' + o.msg : o.msg === 'cancelled' ? 'Not saved' : 'Could not save: ' + o.msg)); }
        else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: GSX.MIME })); a.download = name; a.click(); }
      } catch (e) { GS.toast('Could not make the file: ' + e.message); }
    };
    if ($('xOpen')) $('xOpen').onclick = () => {
      const doImport = bytes => {
        let file; try { file = GSX.read(bytes); } catch (e) { GS.toast('This is not a readable xlsx file.'); return; }
        if (!file.data) { GS.toast('This file has no SR GunSafe sheets (GS_…).'); return; }
        const tombs = GSX.mergeTombs(D().tombs, file.tombs);
        const m = GSX.merge(null, GSX.tablesOf(D()), file.data, tombs, D().trash);
        GSStore.backup('before-import-' + GSStore.stamp() + '.json');
        const at = GSStore.now();
        GSX.TABLES.forEach(t => { D()[t] = m.data[t]; }); D().tombs = tombs; m.removed.forEach(x => D().trash.push({ table: x.table, row: x.row, at, by: 'opened file' }));
        save('import', `Opened: ${m.added} new, ${m.changed} filled in` + (m.removed.length ? `, ${m.removed.length} deleted elsewhere` : '')); render(true);
      };
      if (window.GSNative) GSSync.native('openFile').then(o => { if (o.ok && o.data) doImport(GSSync.unb64(o.data)); else if (o.msg !== 'cancelled') GS.toast('Could not open: ' + o.msg); });
      else { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx'; i.onchange = () => { const f = i.files[0]; if (f) f.arrayBuffer().then(b => doImport(new Uint8Array(b))); }; i.click(); }
    };
    const bl = $('backLog');
    if (bl) bl.textContent = (window.GSNative && GSNative.backLog ? GSNative.backLog() : 'Browser') + (GS.errors.length ? '\nErrors:\n' + GS.errors.join('\n') : '\nNo script errors.');
  }

  /* ---------- start ---------- */
  GS.resume = night => {
    if (typeof night === 'boolean') document.documentElement.dataset.theme = night ? 'dark' : 'light';
    GSLink.check();
    if (GSLink.state() === 'allowed') GSLink.refresh();
    GSSync.pull();
    if (GSSync.state().on) GSSync.sync('open');
    // forms keep what was typed; only the overview pages are drawn again
    if (['home', 'gun', 'svclog', 'ammo', 'mun', 'settings'].includes(route().v) && !document.querySelector('.overlay')) render(true);
  };
  GS.pause = () => GSStore.flush();
  purgeTrash();
  if (window.SR_EMBLEM) $('hHome').innerHTML = SR_EMBLEM;
  $('hHome').onclick = () => { if ((location.hash || '#home') !== '#home') location.hash = '#home'; };
  $('menuBtn').onclick = () => { if (route().v !== 'settings') GS.go('#settings'); };
  window.addEventListener('hashchange', () => render(false));
  GSSync.onState(() => { const v = route().v; if (v === 'home' || v === 'settings') render(true); });
  if (window.GSNative && GSNative.isNight) document.documentElement.dataset.theme = GSNative.isNight() ? 'dark' : 'light';
  GSLink.check();
  if (GSLink.state() === 'allowed') GSLink.refresh();
  GSSync.pull();
  render(false);
  if (GSSync.state().on) GSSync.sync('open');
})();
