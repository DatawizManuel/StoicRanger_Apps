/* Stoic Ranger — router, header, navigation, demo mode, boot. */
'use strict';
(() => {
const { $, $$, esc } = RB;
RB.views = {};
let stack = [location.hash];   // in-app history, so the Android back button walks back before closing

RB.go = (hash, replace) => { if (replace) location.replace(hash); else location.hash = hash; };
RB.back = () => {
  if (RB._modal) { RB._modal(); return true; }
  if (stack.length > 1) { history.back(); return true; }
  const r = location.hash.split('/')[1] || 'dash';
  if (r !== 'dash') { RB.go('#/dash', true); return true; }
  return false;
};

RB.header = (title, { back = false, actions = '' } = {}) => {
  $('#hTitle').textContent = title;
  $('#hBack').hidden = !back;
  $('#hActions').innerHTML = actions;
};

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const name = parts[0] || 'dash';
  const v = RB.views[name] || RB.views.dash;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === (v.tab || name)));
  const el = $('#view'); el.scrollTop = 0; window.scrollTo(0, 0);
  el.innerHTML = '';
  if (RB._modal) RB._modal();
  try { v.render(el, parts.slice(1), q); if (RB.readOnly) el.insertAdjacentHTML('afterbegin', dataNotice()); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="note">${esc(e.message)}</p></div>`; }
  demoBanner();
}
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (/^#\/(dash|sheets|analyse|db\/\w+|more)$/.test(h)) stack = [h];   // a main tab starts a new trail
  else stack.push(h);
  route();
});

/* ---------- example data: lives in the real database, flagged example:true ----------
   The first real entry in a table (weapon, barrel, ammo, shooter, sheet, rounds log) removes that table's examples. */
const REF = ['weaponId', 'barrelId', 'munitionId', 'shooterId'];
RB.loadExamples = async () => {
  const r = await fetch('data/demo.json'); const d = RB.migrate(await r.json());
  const id = x => x ? 'EX-' + String(x).replace(/^EX-/, '') : x;
  let n = 0;
  for (const t of RB.EX_TABLES) (d[t] || []).forEach(rec => {
    const c = Object.assign({}, rec, { id: id(rec.id), example: true });
    REF.forEach(k => { if (c[k]) c[k] = id(c[k]); });
    if (!RB.byId(RB.db[t], c.id)) { RB.db[t].push(c); n++; }
  });
  RB.save(true);
  return n;
};
RB.clearExamples = () => { RB.EX_TABLES.forEach(t => RB.db[t] = RB.db[t].filter(r => !r.example)); RB.save(true); };
const realSave = RB.save;
RB.save = now => {
  const gone = RB.purgeExamples(RB.db);
  if (gone.length) setTimeout(() => RB.toast('Example ' + gone.map(t => RB.TABLES[t] ? RB.TABLES[t].title.toLowerCase() : t).join(', ') + ' removed: your own entries take over.'), 50);
  realSave(gone.length ? true : now);
};
function demoBanner() {
  $('#demo').hidden = !RB.hasExamples();
}

/* ---------- quick "Add new …" buttons (dashboard front, New chooser) ---------- */
RB.QUICK_ADD = [['shooters', 'shooter'], ['weapons', 'gun'], ['barrels', 'barrel'], ['munitions', 'ammunition'], ['trainers', 'trainer']];
RB.quickAddHTML = (withSheet = true) => `<div class="qa">${withSheet ? '<button class="btn pri" data-qsheet>Create new training dataset</button>' : ''}${RB.QUICK_ADD.map(([t, n]) => `<a class="btn" href="#/db/${t}/new">Add new ${n}</a>`).join('')}</div>`;
RB.wireQuickAdd = el => { const b = $('[data-qsheet]', el); if (b) b.onclick = () => { const s = RB.newSheet(); RB.db.sheets.push(s); RB.save(true); RB.go(`#/sheet/${encodeURIComponent(s.id)}`); }; };

/* ---------- "New" button in the bottom bar: every way to add a set of results ---------- */
RB.addChooser = () => {
  const opts = [
    ['newsheet', '✎', 'Create new training dataset', 'Type in the results of a session (carries over gun, ammo and shooter from your last sheet).'],
    ['target', '◎', 'Score a target photo', 'Photograph the shot target: hits, group size and correction are calculated.'],
    ['scan', '▤', 'Read a filled sheet photo', 'A hand-filled printed sheet, read in by Claude for you to check.'],
    ['vel', '⚡', 'Velocities from Xero C1 Pro', 'New datasheet, starting with pasting or importing the shot speeds.'],
    ['rounds', '#', 'Rounds without a sheet', 'Hunting, fouling or practice rounds that count towards the barrel.'],
    ['file', '⇪', 'Import a file', 'Backup (.json), database.xlsx or datasheet records.'],
  ];
  const m = RB.sheet('Add new', opts.map(([k, ic, t, d]) => `<a class="choice sm" href="javascript:void 0" data-add="${k}"><div class="ic">${ic}</div><div><h3>${t}</h3><p>${d}</p></div></a>`).join('')
    + `<h3 class="qah">Add to the database</h3>${RB.quickAddHTML(false)}`);
  $$('.qa a', m.body).forEach(a => a.addEventListener('click', () => m.close()));
  $$('[data-add]', m.body).forEach(a => a.onclick = () => {
    const k = a.dataset.add; m.close();
    const sheet = () => { const s = RB.newSheet(); RB.db.sheets.push(s); RB.save(true); return `#/sheet/${encodeURIComponent(s.id)}`; };
    if (k === 'newsheet') RB.go(sheet());
    else if (k === 'vel') RB.go(sheet() + '?vel=1');
    else if (k === 'target') RB.go('#/analyse/target');
    else if (k === 'scan') RB.go('#/analyse/scan');
    else if (k === 'rounds') RB.go('#/db/roundsLog/new');
    else if (k === 'file') RB.importAny && RB.importAny();
  });
};

/* ---------- notices about the stored data (update / recovery / newer app) ---------- */
function dataNotice() {
  if (RB.readOnly) return `<div class="banner warn">This data was saved by a newer version of Stoic Ranger (data format ${RB.dataSchema}, this app reads up to ${RB.SCHEMA}). Nothing is changed or saved until you update the app.</div>`;
  return '';
}
RB.dataNotice = dataNotice;

/* ---------- theme ---------- */
// "Follow phone": Android tells us directly (the WebView's prefers-color-scheme is not reliable).
RB.setSysDark = on => { document.documentElement.dataset.sys = on ? 'dark' : 'light'; };
try { if (window.RBNative && RBNative.isNight) RB.setSysDark(RBNative.isNight()); } catch (e) { }
RB.applyTheme = () => {
  const t = RB.db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style'); st.textContent = RB.FONTS_CSS + RB.SHEET_CSS; document.head.appendChild(st);
  $('#hBack').onclick = () => RB.back();
  $('#demo').onclick = () => RB.go('#/more');
  $('#navAdd').onclick = () => { if (RB.readOnly) { RB.toast('Read-only: update the app first.', true); return; } RB.addChooser(); };
  RB.applyTheme();
  if (RB.firstRun && !location.hash) location.replace('#/welcome');
  route();
  if (RB.migrated) { RB.save(true); setTimeout(() => RB.toast(`Data updated to the new app version (${RB.db.sheets.length} sheets kept, a copy of the old file was saved).`), 300); }
  else if (RB.recovered) setTimeout(() => RB.toast(RB.db.sheets.length || RB.db.weapons.length ? 'The data file was damaged: the previous saved copy was restored.' : 'The data file was damaged and no copy could be read. Import a backup under More.', true), 300);
  else if (RB.readOnly) setTimeout(() => RB.toast('Data from a newer app version: read-only.', true), 300);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = RB._onResize; v && v(); }, 200); });
});

/* ---------- first run ---------- */
RB.views.welcome = {
  tab: 'dash',
  render(el) {
    RB.header("Stoic Ranger");
    el.innerHTML = `
      <div class="hero">
        <div class="wlogo">${RB.logo('hlogo')}</div>
        <div class="kicker">Stoic Ranger // Gun Database</div>
        <h1>Welcome</h1>
        <p>Keep your guns, barrels, ammunition and shooters in one place, fill in training datasheets, score targets from a photo and follow barrel wear and ammo performance on the dashboard. Everything stays on this phone.</p>
      </div>
      <div class="stack">
        <button class="btn pri big" id="wStart">Start with an empty database</button>
        <button class="btn big" id="wImport">Import a backup or database.xlsx</button>
      </div>
      <p class="note">Metric by default (m, mm, mrad, m/s, g, °C, hPa). Switch to imperial under More › Settings › Units.</p>`;
    $('#wStart').onclick = () => { RB.firstRun = false; RB.save(true); RB.go('#/dash'); };
    $('#wImport').onclick = () => { RB.firstRun = false; RB.go('#/more'); setTimeout(() => RB.importAny && RB.importAny(), 50); };
  },
};
})();
