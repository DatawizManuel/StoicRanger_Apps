/* Stoic Ranger — training datasheets: list, editor (data, hits, A4 sheet). */
'use strict';
(() => {
const { $, $$, esc, fx, num } = RB;

RB.sheetById = id => RB.db.sheets.find(s => s.id === id) || null;
RB.nextSheetNo = () => {
  const yy = RB.today().slice(2, 4), p = RB.db.settings.sheetPrefix || 'ST';
  let n = 0; RB.db.sheets.forEach(s => { const m = new RegExp('^' + p + '-(\\d+)/' + yy + '$').exec(s.no || ''); if (m) n = Math.max(n, +m[1]); });
  return `${p}-${String(n + 1).padStart(3, '0')}/${yy}`;
};
/** New sheet, carrying over gun, ammo, shooter and range from the most recent sheet. */
RB.newSheet = () => {
  const s = RB.blankSheet();
  const real = RB.db.sheets.filter(x => !x.example);
  const last = [...(real.length ? real : [])].sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')))[0];
  const keep = ['weaponId', 'barrelId', 'munitionId', 'shooterId', 'gun', 'barrel', 'optic', 'caliber', 'ammo', 'bullet', 'zero', 'preset', 'bd', 'd10', 'w', 'shooter', 'range', 'coords', 'elev', 'setting', 'position', 'discipline', 'purpose'];
  if (last) keep.forEach(k => { if (last[k] != null && last[k] !== '') s[k] = last[k]; });
  else {
    const W = RB.db.weapons.filter(x => !x.example).concat(RB.db.weapons.filter(x => x.example));
    const w = W.find(x => x.status !== 'Sold' && x.status !== 'Retired') || W[0];
    if (w) linkWeapon(s, w);
    const sh = RB.db.shooters.find(x => !x.example) || RB.db.shooters[0]; if (sh) { s.shooterId = sh.id; s.shooter = sh.name; }
  }
  if (!s.preset) { s.preset = RB.PRESETS[RB.db.settings.preset] ? RB.db.settings.preset : 'T-ISSF300'; const p = RB.PRESETS[s.preset] || {}; if (p.d10) { s.d10 = String(p.d10); s.w = String(p.w); } }
  Object.assign(s, { id: RB.uid('SH'), no: RB.nextSheetNo(), date: RB.today(), time: RB.nowTime(), created: new Date().toISOString() });
  if (s.weaponId) { const b = RB.barrelAt(s.weaponId, s.date); if (b) { s.barrelId = b.id; s.barrel = b.name; } }
  return s;
};
function linkWeapon(s, w) {
  s.weaponId = w.id; s.gun = w.name; if (w.caliber) s.caliber = w.caliber;
  s.optic = [w.optic, w.mount].filter(Boolean).join(' · ');
  const bd = RB.bulletDia(w.caliber); if (bd) s.bd = String(bd);
  const b = RB.barrelAt(w.id, s.date || RB.today()); s.barrelId = b ? b.id : ''; s.barrel = b ? b.name : '';
}
function linkMunition(s, m) { s.munitionId = m.id; s.ammo = m.name; if (m.bulletWeightG) s.bullet = String(m.bulletWeightG); }
/** Link free text on a sheet (typed, imported or read from a photo) to database entries by Name / Aliases. */
RB.autoLink = s => {
  let n = 0;
  if (!s.weaponId && s.gun) { const w = RB.matchName(RB.db.weapons, s.gun); if (w) { s.weaponId = w.id; s.gun = w.name; n++; } }
  if (s.weaponId && !s.barrelId) { const b = (s.barrel && RB.db.barrels.find(x => x.weaponId === s.weaponId && x.name.toLowerCase() === s.barrel.toLowerCase())) || RB.barrelAt(s.weaponId, s.date); if (b) { s.barrelId = b.id; s.barrel = b.name; } }
  if (!s.munitionId && s.ammo) { const m = RB.matchName(RB.db.munitions, s.ammo); if (m) { s.munitionId = m.id; s.ammo = m.name; n++; } }
  if (!s.shooterId && s.shooter) { const p = RB.matchName(RB.db.shooters, s.shooter); if (p) { s.shooterId = p.id; s.shooter = p.name; n++; } }
  return n;
};

/* ---------- list ---------- */
RB.views.sheets = {
  render(el, parts, q) {
    RB.header('Datasheets', { actions: `<button class="ib" id="shPrint" aria-label="Print blank sheet" title="Print blank sheet">⎙</button><button class="ib" id="shAdd" aria-label="New sheet">＋</button>` });
    const f = RB._sheetFilter || (RB._sheetFilter = { purpose: '', q: '' });
    const D = RB.build(); const by = new Map(D.sessions.map(s => [s.id, s]));
    const draw = () => {
      const needle = f.q.toLowerCase();
      const rows = RB.db.sheets.filter(s => (!f.purpose || s.purpose === f.purpose) && (!needle || [s.no, s.date, s.gun, s.ammo, s.shooter, s.range, s.remarks].join(' ').toLowerCase().includes(needle)))
        .sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
      $('#shList').innerHTML = rows.length ? rows.map(s => {
        const d = by.get(s.id) || {};
        return `<a class="item" href="#/sheet/${encodeURIComponent(s.id)}"><div class="main"><div class="t">${esc(RB.fmtDate(s.date))} <span class="id">${esc(s.no || '')}</span>${s.purpose ? `<span class="pill ${RB.evalAs(s.purpose)}">${esc(RB.purposeName(s.purpose))}</span>` : ''}${s.example ? '<span class="pill example">example</span>' : ''}</div>
          <div class="kvs"><span>${esc(s.gun || '–')}</span><span>${esc(s.ammo || '')}</span>${s.dist ? `<span>${RB.U.fmt('dist', num(s.dist))}</span>` : ''}${s.shooter ? `<span>${esc(s.shooter)}</span>` : ''}</div></div>
          <div class="side">${d.mrM != null ? `<div class="big">${RB.U.num('ang', d.mrM)}</div><div class="u">MR ${RB.U.label('ang')} · ${d.hits} sh</div>` : d.hits ? `<div class="big">${d.hits}</div><div class="u">hits</div>` : '<div class="u">no hits</div>'}</div></a>`;
      }).join('') : `<div class="empty">${RB.db.sheets.length ? 'No sheet matches.' : 'No datasheets yet. Start one at the range, or print blank sheets and read them in later from a photo.'}</div>`;
    };
    el.innerHTML = `
      <div class="row"><input type="search" id="shQ" placeholder="Search date, gun, ammo, range …" value="${esc(f.q)}" style="flex:1"></div>
      <div class="seg scroll">${[['', 'All']].concat(RB.purposes().filter(p => RB.db.sheets.some(x => x.purpose === p.id)).map(p => [p.id, p.name])).map(([v, l]) => `<a href="javascript:void 0" data-p="${v}" class="${f.purpose === v ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="list" id="shList"></div>
      <div class="row"><button class="btn pri wide" id="shNew">New datasheet</button></div>
      <div class="row"><a class="btn" href="#/analyse/scan">Read a filled sheet from a photo</a><button class="btn" id="shBlank">Print blank sheets</button></div>`;
    draw();
    $('#shQ').oninput = e => { f.q = e.target.value; draw(); };
    $$('[data-p]', el).forEach(a => a.onclick = () => { f.purpose = a.dataset.p; $$('[data-p]', el).forEach(x => x.classList.toggle('on', x === a)); draw(); });
    const add = () => { const s = RB.newSheet(); RB.db.sheets.push(s); RB.save(true); RB.go(`#/sheet/${encodeURIComponent(s.id)}`); };
    $('#shAdd').onclick = add; $('#shNew').onclick = add;
    const blank = () => RB.printBlank(1);
    $('#shPrint').onclick = blank; $('#shBlank').onclick = blank;
  },
};

/* ---------- editor ---------- */
const TABS = [['data', 'Data'], ['hits', 'Hits'], ['a4', 'A4 sheet']];
RB.views.sheet = {
  tab: 'sheets',
  render(el, [id, tab = 'data'], q) {
    const s = RB.sheetById(id);
    if (!s) { RB.header('Datasheet', { back: true }); el.innerHTML = '<div class="empty">This sheet no longer exists.</div>'; return; }
    if (RB.autoLink(s)) RB.save();
    RB.header(`${RB.fmtDate(s.date)}${s.no ? ' · ' + s.no : ''}`, { back: true, actions: `<button class="ib" id="sMenu" aria-label="More">⋮</button>` });
    el.innerHTML = `<div class="tabs2">${TABS.map(([k, l]) => `<a href="#/sheet/${encodeURIComponent(id)}/${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</div><div id="sBody"></div>`;
    const body = $('#sBody');
    // switching tabs replaces the history entry so Back leaves the sheet
    $$('.tabs2 a', el).forEach(a => a.onclick = e => { e.preventDefault(); location.replace(a.getAttribute('href')); });
    ({ data: dataTab, hits: hitsTab, a4: a4Tab }[tab] || dataTab)(body, s);
    $('#sMenu').onclick = () => menu(s);
    if (q.vel && (tab === 'data')) { location.replace(`#/sheet/${encodeURIComponent(id)}`); setTimeout(() => $('#vel') && $('#vel').click(), 0); }
  },
};

function menu(s) {
  const m = RB.sheet('Datasheet', `<div class="stack">
    <button class="btn" data-a="print">Print / save as PDF</button>
    <button class="btn" data-a="share">Share record (.json)</button>
    <button class="btn" data-a="dup">Duplicate as new sheet</button>
    <button class="btn warn" data-a="del">Delete this sheet</button></div>`);
  $('[data-a=print]', m.body).onclick = () => { m.close(); RB.printSheets([s], `${s.date}_datasheet${s.no ? '_' + s.no.replace(/[^\w-]+/g, '-') : ''}`); };
  $('[data-a=share]', m.body).onclick = () => { m.close(); RB.shareFile(archiveName(s), 'application/json', JSON.stringify(toArchive(s), null, 1)); };
  $('[data-a=dup]', m.body).onclick = () => {
    const n = Object.assign(RB.clone(s), { example: undefined, id: RB.uid('SH'), no: RB.nextSheetNo(), date: RB.today(), time: RB.nowTime(), hits: [], remarks: '', created: new Date().toISOString() });
    RB.db.sheets.push(n); RB.save(true); m.close(); RB.go(`#/sheet/${encodeURIComponent(n.id)}`);
  };
  RB.armed($('[data-a=del]', m.body), () => { RB.db.sheets = RB.db.sheets.filter(x => x.id !== s.id); RB.save(true); m.close(); RB.toast('Sheet deleted.'); history.back(); });
}
const archiveName = s => `${s.date || 'undated'}_${(s.no || s.time || 'x').replace(/[\/:\s]+/g, '-')}.json`;
/** Same keys as the datasheet page / 02_archive files. */
const toArchive = s => { const o = { schema: 1 }; RB.SHEET_KEYS.forEach(k => o[k] = s[k] ?? ''); o.hits = (s.hits || []).map(h => ({ x: +h.x, y: +h.y })); if (s.vel && s.vel.length) o.velocities = s.vel; o.source = { kind: 'app', file: '' }; return o; };
RB.toArchive = toArchive; RB.archiveName = archiveName;

/* --- Data tab --- */
function dataTab(body, s) {
  const opt = (list, cur, lab = r => r.name) => list.map(r => `<option value="${esc(r.id)}" ${r.id === cur ? 'selected' : ''}>${esc(lab(r))}</option>`).join('');
  const unmatched = (txt, id) => !id && txt ? `<option value="" selected>${esc(txt)} (not in database)</option>` : '<option value=""></option>';
  const bars = RB.db.barrels.filter(b => b.weaponId === s.weaponId);
  const mun = [...RB.db.munitions].sort((a, b) => ((b.caliber || '') === s.caliber) - ((a.caliber || '') === s.caliber));
  const I = (k, label, span = 3, type = 'text', extra = '') => { const u = RB.SHEET_UNITS[k];
    return `<label class="s${span}"><span>${u ? RB.U.lab(label, u) : label}</span><input data-k="${k}"${u ? ` data-u="${u}"` : ''} type="${type}" value="${esc(u ? RB.U.inp(u, s[k]) : (s[k] ?? ''))}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${extra}></label>`; };
  const warn = [];
  if (!s.weaponId && s.gun) warn.push(['weapons', s.gun]);
  if (!s.munitionId && s.ammo) warn.push(['munitions', s.ammo]);
  if (!s.shooterId && s.shooter) warn.push(['shooters', s.shooter]);
  body.innerHTML = `
    ${warn.length ? `<div class="msg">${warn.map(([t, n]) => `“${esc(n)}” is not in your ${RB.TABLES[t].title.toLowerCase()}. Pick an entry below, or <a href="#/db/${t}/new?name=${encodeURIComponent(n)}">add it to the database</a>.`).join('<br>')}</div>` : ''}
    <div class="card"><h3>Session</h3><div class="fg">
      ${I('no', 'Sheet no.', 2)}${I('date', 'Date', 2, 'date')}${I('time', 'Time', 2, 'time')}
      <label class="s3"><span>Shooter</span><select data-ref="shooter">${unmatched(s.shooter, s.shooterId)}${opt(RB.db.shooters, s.shooterId)}</select></label>
      <label class="s3"><span>Purpose</span><select data-k="purpose"><option value=""></option>${RB.purposes().map(p => `<option value="${esc(p.id)}" ${s.purpose === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}${s.purpose && !RB.purpose(s.purpose) ? `<option value="${esc(s.purpose)}" selected>${esc(s.purpose)}</option>` : ''}</select></label>
      ${I('discipline', 'Discipline', 3, 'text', 'placeholder="Group, zeroing, DOPE …"')}${I('position', 'Position / support', 3, 'text', 'placeholder="Prone · bipod + rear bag"')}
      ${I('series', 'Series', 3, 'text', 'placeholder="1 / 3"')}${I('rounds', 'Rounds fired (incl. sighters)', 3, 'number')}
    </div><p class="note">The purpose decides the evaluation: gun/ammo purposes (Test, Load development …) feed barrel wear and ammo precision, shooter purposes (Training, Competition …) the shooter's progress. Set them up under More.</p></div>
    <div class="card"><h3><span class="n">1</span>Gun &amp; ammunition</h3><div class="fg">
      <label class="s4"><span>Gun</span><select data-ref="weapon">${unmatched(s.gun, s.weaponId)}${opt(RB.db.weapons, s.weaponId)}</select></label>
      <label class="s2"><span>Barrel</span><select data-ref="barrel">${!s.barrelId && s.barrel ? `<option value="" selected>${esc(s.barrel)}</option>` : '<option value=""></option>'}${opt(bars, s.barrelId)}</select></label>
      ${I('optic', 'Optic / mount', 6)}${I('caliber', 'Caliber', 2, 'text', 'list="dl-cal"')}
      <label class="s4"><span>Ammunition (load / lot)</span><select data-ref="munition">${unmatched(s.ammo, s.munitionId)}${opt(mun, s.munitionId, r => r.name + (r.caliber && r.caliber !== s.caliber ? ` (${r.caliber})` : ''))}</select></label>
      ${I('bullet', 'Bullet g', 2, 'number')}${I('v0', 'V0 (Xero) m/s', 2, 'number')}${I('v0sd', 'V0 SD m/s', 2, 'number')}
      <div class="s6 row"><button class="btn sm" id="vel" type="button">Shot velocities${s.vel && s.vel.length ? ` (${s.vel.length})` : ''} …</button><small class="note">Paste the Xero C1 Pro speeds or import its CSV: V0 and SD are filled in.</small></div>
      ${I('zero', 'Zero m', 2, 'number')}${I('dialE', 'Dialed elev. mrad', 2, 'number')}${I('dialW', 'Dialed wind. mrad', 2, 'number')}
    </div></div>
    <div class="card"><h3><span class="n">2</span>Range &amp; conditions</h3><div class="fg">
      ${I('range', 'Range', 6)}${I('coords', 'Coordinates (WGS 84 / UTM)', 6, 'text', 'placeholder="47.3838° N 9.7381° E"')}
      <div class="s6 row"><button class="btn sm" id="gps" type="button">Use my location</button></div>
      ${I('elev', 'Elevation ASL m', 2, 'number')}${I('dist', 'Distance m', 2, 'number')}
      <label class="s2"><span>Setting</span><select data-k="setting"><option value=""></option><option value="indoor" ${s.setting === 'indoor' ? 'selected' : ''}>Indoor</option><option value="outdoor" ${s.setting === 'outdoor' ? 'selected' : ''}>Outdoor</option></select></label>
      ${I('temp', 'Temperature °C', 2, 'number')}${I('hum', 'Humidity %', 2, 'number')}${I('press', 'Pressure hPa', 2, 'number')}
      ${I('wind', 'Wind', 3, 'text', `placeholder="${RB.U.imperial() ? '5 mph' : '2 m/s'} from 9 o'clock"`)}${I('light', 'Light / weather', 3)}
    </div></div>
    <div class="card"><h3><span class="n">4</span>Remarks</h3><textarea data-k="remarks" rows="4">${esc(s.remarks)}</textarea></div>
    <datalist id="dl-cal">${RB.CALIBERS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row"><a class="btn pri" href="#/sheet/${encodeURIComponent(s.id)}/hits" id="toHits">Next: hits</a></div>`;
  $('#toHits').onclick = e => { e.preventDefault(); location.replace(e.target.getAttribute('href')); };
  $$('[data-k]', body).forEach(i => i.addEventListener('input', () => { s[i.dataset.k] = i.dataset.u ? RB.U.store(i.dataset.u, i.value) : i.value; s.modified = new Date().toISOString(); RB.save(); }));
  $('[data-ref=shooter]', body).onchange = e => { const p = RB.shooter(e.target.value); if (p) { s.shooterId = p.id; s.shooter = p.name; } RB.save(); };
  $('[data-ref=weapon]', body).onchange = e => { const w = RB.weapon(e.target.value); if (w) { linkWeapon(s, w); RB.save(); dataTab(body, s); } };
  $('[data-ref=barrel]', body).onchange = e => { const b = RB.barrel(e.target.value); if (b) { s.barrelId = b.id; s.barrel = b.name; RB.save(); } };
  $('[data-ref=munition]', body).onchange = e => { const m = RB.munition(e.target.value); if (m) { linkMunition(s, m); RB.save(); dataTab(body, s); } };
  $('#vel').onclick = () => velDialog(s, () => dataTab(body, s));
  $('#gps').onclick = () => {
    if (!navigator.geolocation) { RB.toast('Location is not available.', true); return; }
    RB.toast('Getting location …');
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: la, longitude: lo, altitude: al } = p.coords;
      s.coords = `${Math.abs(la).toFixed(4)}° ${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(4)}° ${lo >= 0 ? 'E' : 'W'}`;
      if (al != null && !s.elev) s.elev = String(Math.round(al));
      RB.save(); dataTab(body, s); RB.toast('Location added.');
    }, err => RB.toast('Location failed: ' + err.message, true), { enableHighAccuracy: true, timeout: 15000 });
  };
}

function velDialog(s, done) {
  const U = RB.U, imp = U.imperial(), V = U.label('vel'), show1 = v => U.num('vel', v, 1).replace(/\.0$/, '');
  const m = RB.sheet(`Shot velocities (${V})`, `
    <p class="note">One value per shot, from the Garmin Xero C1 Pro (or ShotView). Paste them in ${V}, or import the CSV export (fps or m/s, detected from the header). Stored in m/s.</p>
    <textarea id="vT" rows="6" placeholder="${imp ? '2700 2710 2695 2720 2705' : '823 826 821 829 824'}">${esc((s.vel || []).map(show1).join(' '))}</textarea>
    <div class="kv3" id="vS"></div>
    <div class="row"><button class="btn" id="vCsv">Import CSV</button><button class="btn pri" id="vOk">Apply to sheet</button></div>`);
  let res = RB.parseVelocities($('#vT').value, imp);
  const show = () => $('#vS').innerHTML = `<div><div class="l">Shots</div><div class="v">${res.n}</div></div><div><div class="l">Average ${V}</div><div class="v">${res.n ? U.num('vel', res.avg, 1) : '–'}</div></div><div><div class="l">SD · ES</div><div class="v">${res.sd != null ? U.num('vel', res.sd, 1) + ' · ' + U.num('vel', res.es, 0) : '–'}</div></div>`;
  show();
  $('#vT').oninput = () => { res = RB.parseVelocities($('#vT').value, imp); show(); };
  $('#vCsv').onclick = async () => {
    const f = await RB.openFile('text/csv,text/comma-separated-values,text/plain,application/vnd.ms-excel'); if (!f.ok) return;
    const txt = new TextDecoder().decode(f.bytes), hdr = /speed|velocity|geschw|v0/i.test(txt);
    res = hdr ? RB.parseXeroCsv(txt) : RB.parseVelocities(txt, imp);
    $('#vT').value = res.vals.map(show1).join(' '); show();
    if (res.converted && !imp) RB.toast('Converted from fps to m/s.');
  };
  $('#vOk').onclick = () => {
    if (!res.n) { RB.toast('No velocities found.', true); return; }
    s.vel = res.vals.map(v => Math.round(v * 10) / 10); s.v0 = fx(res.avg, 0); s.v0sd = res.sd != null ? fx(res.sd, 1) : '';
    RB.save(); m.close(); done();
  };
}

/* --- Hits tab --- */
function hitsTab(body, s) {
  const st = RB.sheetStats(s), t = RB.tgtOf(s), z = RB.tZoom(t), U = RB.U, L = U.label('len'), A = U.label('ang');
  const lenD = U.imperial() ? 2 : 0, cust = !RB.target(s.preset);
  const N = (k, lab, dis) => `<label class="s2"><span>${lab} ${L}</span><input data-k="${k}" type="number" step="any" inputmode="decimal" value="${esc(U.inp('len', s[k]))}" ${dis ? 'disabled' : ''}></label>`;
  body.innerHTML = `
    <div class="card"><h3><span class="n">3</span>Target</h3><div class="fg">
      <label class="s6"><span>Target <a href="#/db/targets" class="note">· edit targets</a></span><select data-k="preset">${Object.entries(RB.PRESETS).map(([k, p]) => `<option value="${k}" ${s.preset === k || (k === 'custom' && cust) ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      ${N('bd', 'Bullet Ø')}${N('d10', t.rings == 1 ? 'Plate Ø' : '10-ring Ø', !cust)}${t.rings == 1 && !cust ? '' : N('w', 'Ring width', !cust)}
    </div></div>
    <div class="card"><div class="tgtbox">${RB.targetSVG(s, { live: true })}</div>
      <p class="note">Tap the target to add a hit, tap a hit to remove it. X right, Y up, ${L} from the centre of the real target.</p>
      <div class="row"><a class="btn pri" href="#/analyse/target?sheet=${encodeURIComponent(s.id)}">Score a target photo</a><a class="btn" href="#/analyse/scan?sheet=${encodeURIComponent(s.id)}">Read a filled sheet photo</a></div></div>
    <div class="card"><div class="kv3">
      <div><div class="l">Shots · total</div><div class="v">${st.n ? st.n + ' · ' + st.total : '–'}</div></div>
      <div><div class="l">Avg ring</div><div class="v">${st.n ? fx(st.avg, 2) : '–'}</div></div>
      <div><div class="l">Group ES</div><div class="v">${st.n > 1 ? U.num('len', st.es, lenD) + `<small> ${L}</small>` : '–'}${st.esM != null ? `<small> · ${U.num('ang', st.esM)} ${A}</small>` : ''}</div></div>
      <div><div class="l">Mean radius</div><div class="v">${st.n > 1 ? U.num('len', st.mr, lenD) + `<small> ${L}</small>` : '–'}${st.mrM != null ? `<small> · ${U.num('ang', st.mrM)} ${A}</small>` : ''}</div></div>
      <div><div class="l">MPI X / Y</div><div class="v">${st.n ? U.num('len', st.mx, lenD) + ' / ' + U.num('len', st.my, lenD) + `<small> ${L}</small>` : '–'}</div></div>
      <div><div class="l">Correction</div><div class="v">${st.n && st.corrE != null ? RB.corrText(st) + `<small> ${A}</small>` : (st.n ? '<small>set distance</small>' : '–')}</div></div></div></div>
    <div class="card"><table class="hits"><thead><tr><th>#</th><th>X ${L}</th><th>Y ${L}</th><th>Ring</th><th></th></tr></thead><tbody>
      ${(s.hits || []).map((h, i) => `<tr><td>${i + 1}</td><td><input type="number" step="any" inputmode="decimal" data-i="${i}" data-c="x" value="${U.num('len', h.x, lenD + 1)}"></td><td><input type="number" step="any" inputmode="decimal" data-i="${i}" data-c="y" value="${U.num('len', h.y, lenD + 1)}"></td><td class="mono">${st.rings[i]}</td><td><button class="ib sm" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="note">No hits yet.</td></tr>'}
    </tbody></table>
    <div class="row"><button class="btn" id="hAdd">Add hit</button><button class="btn warn" id="hClr">Clear hits</button></div></div>`;
  const redraw = () => { hitsTab(body, s); };
  $$('[data-k]', body).forEach(i => i.addEventListener('change', () => {
    const k = i.dataset.k;
    if (k === 'preset') { s.preset = i.value; const p = RB.PRESETS[i.value]; if (p && p.d10) { s.d10 = String(p.d10); s.w = String(p.w); } }
    else s[k] = U.store('len', i.value);
    RB.save(); redraw();
  }));
  const svg = $('svg.tsvg', body);
  svg.addEventListener('click', e => {
    const g = e.target.closest('g[data-i]'); if (g) { s.hits.splice(+g.dataset.i, 1); RB.save(); redraw(); return; }
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse());
    const d = Math.hypot(q.x, q.y); if (d > 11) return; const f = d / z, r = RB.fToMm(f, t);
    s.hits.push({ x: d ? Math.round(q.x / d * r * 10) / 10 : 0, y: d ? Math.round(-q.y / d * r * 10) / 10 : 0 }); RB.save(); redraw();
  });
  $$('input[data-i]', body).forEach(i => i.addEventListener('change', () => { s.hits[+i.dataset.i][i.dataset.c] = Math.round((U.to('len', i.value) || 0) * 10) / 10; RB.save(); redraw(); }));
  $$('[data-del]', body).forEach(b => b.onclick = () => { s.hits.splice(+b.dataset.del, 1); RB.save(); redraw(); });
  $('#hAdd').onclick = () => { s.hits.push({ x: 0, y: 0 }); RB.save(); redraw(); };
  RB.armed($('#hClr'), () => { s.hits = []; RB.save(); redraw(); });
}

/* --- A4 tab --- */
function a4Tab(body, s) {
  body.innerHTML = `<div class="row"><button class="btn pri" id="pPrint">Print / save as PDF</button><button class="btn" id="pShare">Share record</button></div>
    <div class="stage"><div class="fit"><div class="sheet">${RB.sheetHTML(s)}</div></div></div>
    <p class="note">In the print dialog choose “Save as PDF” to keep a PDF, or a printer. The sheet is always the light print version.</p>`;
  const fit = $('.fit', body), sh = $('.sheet', body);
  const lay = () => { const w = fit.parentElement.clientWidth - 16, pw = sh.offsetWidth || 793.7, sc = Math.min(1, w / pw); sh.style.transform = `scale(${sc})`; fit.style.width = pw * sc + 'px'; fit.style.height = (sh.offsetHeight || 1122.5) * sc + 'px'; };
  lay(); RB._onResize = lay; if (document.fonts) document.fonts.ready.then(lay);
  $('#pPrint').onclick = () => RB.printSheets([s], `${s.date}_datasheet${s.no ? '_' + s.no.replace(/[^\w-]+/g, '-') : ''}`);
  $('#pShare').onclick = () => RB.shareFile(archiveName(s), 'application/json', JSON.stringify(toArchive(s), null, 1));
}
})();
