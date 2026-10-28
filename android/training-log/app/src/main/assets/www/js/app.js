/* Stoic Ranger - Training Log — router, header, navigation, example data, theme, boot. */
'use strict';
(() => {
const { $, $$, esc } = TL;
TL.views = {};
let stack = [location.hash];   // in-app history, so the Android back button walks back before closing

TL.go = (hash, replace) => { if (replace) location.replace(hash); else location.hash = hash; };
TL.back = () => {
  if (TL._modal) { TL._modal(); return true; }
  if (stack.length > 1) { history.back(); return true; }
  const r = location.hash.split('/')[1] || 'dash';
  if (r !== 'dash') { TL.go('#/dash', true); return true; }
  return false;
};

TL.header = (title, { back = false, actions = '' } = {}) => {
  $('#hTitle').textContent = title;
  $('#hBack').hidden = !back;
  $('#hActions').innerHTML = actions;
};

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const name = parts[0] || 'dash';
  const v = TL.views[name] || TL.views.dash;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === (v.tab || name)));
  const el = $('#view'); el.scrollTop = 0; window.scrollTo(0, 0);
  el.innerHTML = '';
  if (TL._modal) TL._modal();
  try { v.render(el, parts.slice(1), q); if (TL.readOnly) el.insertAdjacentHTML('afterbegin', dataNotice()); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="note">${esc(e.message)}</p></div>`; }
  $('#demo').hidden = !TL.hasExamples();
}
TL.route = route;
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (/^#\/(dash|trainings|db\/\w+|more)$/.test(h)) stack = [h];   // a main tab starts a new trail
  else stack.push(h);
  route();
});

/* ---------- example data: none since 0.3.0 (the migration removes old examples); the hooks stay for safety ---------- */
TL.clearExamples = () => { TL.LISTS.forEach(t => TL.db[t] = TL.db[t].filter(r => !r.example)); TL.save(true); };
const realSave = TL.save;
TL.save = now => {
  const gone = TL.readOnly ? [] : TL.purgeExamples(TL.db);
  if (gone.length) setTimeout(() => TL.toast('Example data removed: your own entries take over.'), 50);
  realSave(gone.length ? true : now);
};

/* ---------- central "New" button: a new training dataset or a new database entry ---------- */
TL.newTraining = () => {
  if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); return; }
  const opts = [
    ['#/training/new', '✎', 'Create new training dataset', 'Date, duration, guns and rounds, trainer, remarks.'],
    ['#/db/shooters/new', '☺', 'Add new shooter', 'A person whose trainings you log.'],
    ['#/db/weapons/new', '⌖', 'Add new gun', 'Rifle, pistol, shotgun … with caliber and zero distance.'],
    ['#/db/trainers/new', '☎', 'Add new trainer', 'Trainer, club, school or range, with phone, e-mail and website.'],
  ];
  const m = TL.sheet('New', opts.map(([h, ic, t, d]) => `<a class="choice sm" href="${h}" data-go><div class="ic">${ic}</div><div><h3>${t}</h3><p>${d}</p></div></a>`).join('')
    + (TL.linkOn() ? '<p class="note">Linked with the Gun Database: shooters, guns and trainers you add there appear here on the next sync. Barrels and ammunition are kept in the Gun Database.</p>' : ''));
  TL.$$('[data-go]', m.body).forEach(a => a.onclick = e => { e.preventDefault(); m.close(); TL.go(a.getAttribute('href')); });
};

function dataNotice() {
  if (TL.readOnly) return `<div class="banner warn">This data was saved by a newer version of the Training Log (data format ${TL.dataSchema}, this app reads up to ${TL.SCHEMA}). Nothing is changed or saved until you update the app.</div>`;
  return '';
}

/* ---------- theme ---------- */
// "Follow phone": Android tells us directly (the WebView's prefers-color-scheme is not reliable).
TL.setSysDark = on => { document.documentElement.dataset.sys = on ? 'dark' : 'light'; };
try { if (window.TLNative && TLNative.isNight) TL.setSysDark(TLNative.isNight()); } catch (e) { }
TL.applyTheme = () => {
  const t = TL.db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style'); st.textContent = TL.FONTS_CSS; document.head.appendChild(st);
  $('#hBack').onclick = () => TL.back();
  $('#demo').onclick = () => TL.go('#/more');
  $('#navAdd').onclick = TL.newTraining;
  TL.applyTheme();
  if (TL.firstRun && !location.hash) location.replace('#/welcome');
  route();
  if (TL.migrated) { TL.save(true); setTimeout(() => TL.toast(`Data updated to the new app version (${TL.db.trainings.length} trainings kept, a copy of the old file was saved).`), 300); }
  else if (TL.recovered) setTimeout(() => TL.toast(TL.db.trainings.length ? 'The data file was damaged: the previous saved copy was restored.' : 'The data file was damaged and no copy could be read. Restore a backup under More.', true), 300);
  else if (TL.readOnly) setTimeout(() => TL.toast('Data from a newer app version: read-only.', true), 300);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = TL._onResize; v && v(); }, 200); });
});

/* ---------- first run ---------- */
TL.views.welcome = {
  tab: 'dash',
  render(el) {
    TL.header('Training Log');
    el.innerHTML = `
      <div class="hero">
        <div class="wlogo">${TL.logo('hlogo')}</div>
        <div class="kicker">Stoic Ranger // Training Log</div>
        <h1>Welcome</h1>
        <p>Log every shooting training: who trained, when and how long, with which guns and how many rounds, and with which trainer or organizer. The dashboard sums it up by shooter, year, gun and trainer, and prints a record sheet. Everything stays on this phone.</p>
      </div>
      <div class="stack">
        <button class="btn pri big" id="wStart">Start</button>
        <button class="btn big" id="wImport">Restore a backup</button>
        <button class="btn big" id="wXlsx">Import database.xlsx</button>
      </div>
      <p class="note">The logbook starts empty. Add your shooters, guns and trainers first (or link with the Gun Database under More), then enter trainings with the <b>New</b> button.</p>`;
    $('#wStart').onclick = () => { TL.firstRun = false; TL.save(true); TL.go('#/db/shooters'); };
    $('#wImport').onclick = () => { TL.firstRun = false; TL.go('#/more'); setTimeout(() => TL.restoreBackup && TL.restoreBackup(), 50); };
    $('#wXlsx').onclick = () => { TL.firstRun = false; TL.save(true); TL.go('#/more'); setTimeout(() => TL.importXlsx && TL.importXlsx(), 50); };
  },
};
})();
