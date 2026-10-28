/* Stoic Ranger - Shooting Drills — router, header, navigation, "New" chooser, theme, boot, welcome. */
'use strict';
(() => {
const { $, $$, esc } = SD;
SD.views = {};
let stack = [location.hash];   // in-app history, so the Android back button walks back before closing

SD.go = (hash, replace) => { if (replace) location.replace(hash); else location.hash = hash; };
SD.back = () => {
  if (SD._modal) { SD._modal(); return true; }
  if (stack.length > 1) { history.back(); return true; }
  const r = location.hash.split('/')[1] || 'home';
  if (r !== 'home') { SD.go('#/home', true); return true; }
  return false;
};

SD.header = (title, { back = false, actions = '' } = {}) => {
  $('#hTitle').textContent = title;
  $('#hBack').hidden = !back;
  $('#hActions').innerHTML = actions;
};

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const name = parts[0] || 'home';
  const v = SD.views[name] || SD.views.home;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === (v.tab || name)));
  const el = $('#view'); el.scrollTop = 0; window.scrollTo(0, 0);
  el.innerHTML = '';
  if (SD._modal) SD._modal();
  try { v.render(el, parts.slice(1), q); if (SD.readOnly) el.insertAdjacentHTML('afterbegin', dataNotice()); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="note">${esc(e.message)}</p></div>`; }
}
SD.route = route;
window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (/^#\/(home|drills|printables|more)$/.test(h)) stack = [h];   // a main tab starts a new trail
  else stack.push(h);
  route();
});

/* ---------- central "New" button ---------- */
SD.newChooser = () => {
  if (SD.readOnly) { SD.toast('Read-only: update the app first.', true); return; }
  const dod = SD.drillOfDay();
  const opts = [
    ['#/result/new', '⏱', 'Log a drill result', 'Time, hits, points and whether you met the standard.'],
    ['#/drill/' + dod.id, '◎', 'Drill of the day', dod.name],
    ['#/random', '⚄', 'Random drill', 'From the drills that match your library filter.'],
    ['#/db/shooters/new', '☺', 'Add new shooter', 'A person whose results you log.'],
    ['#/db/weapons/new', '⌖', 'Add new gun', 'Pistol or rifle, caliber and zero distance.'],
  ];
  const m = SD.sheet('New', opts.map(([h, ic, t, d]) => `<a class="choice sm" href="${h}" data-go><div class="ic">${ic}</div><div><h3>${t}</h3><p>${SD.esc(d)}</p></div></a>`).join(''));
  SD.$$('[data-go]', m.body).forEach(a => a.onclick = e => {
    e.preventDefault(); m.close();
    const h = a.getAttribute('href');
    if (h === '#/random') { const l = SD.DRILLS.filter(d => SD.matches(d, SD.db.settings.filter)); const pick = (l.length ? l : SD.DRILLS)[Math.floor(Math.random() * (l.length || SD.DRILLS.length))]; SD.go('#/drill/' + pick.id); }
    else SD.go(h);
  });
};

function dataNotice() {
  if (SD.readOnly) return `<div class="banner warn">This data was saved by a newer version of Shooting Drills (data format ${SD.dataSchema}, this app reads up to ${SD.SCHEMA}). Nothing is changed or saved until you update the app.</div>`;
  return '';
}

/* ---------- theme ---------- */
// "Follow phone": Android tells us directly (the WebView's prefers-color-scheme is not reliable).
SD.setSysDark = on => { document.documentElement.dataset.sys = on ? 'dark' : 'light'; };
try { if (window.SDNative && SDNative.isNight) SD.setSysDark(SDNative.isNight()); } catch (e) { }
SD.applyTheme = () => {
  const t = SD.db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style'); st.textContent = SD.FONTS_CSS; document.head.appendChild(st);
  $('#hBack').onclick = () => SD.back();
  $('#navAdd').onclick = SD.newChooser;
  SD.applyTheme();
  if (SD.firstRun && !location.hash) location.replace('#/welcome');
  route();
  if (SD.migrated) { SD.save(true); setTimeout(() => SD.toast(`Data updated to the new app version (${SD.db.results.length} results kept, a copy of the old file was saved).`), 300); }
  else if (SD.recovered) setTimeout(() => SD.toast(SD.db.results.length ? 'The data file was damaged: the previous saved copy was restored.' : 'The data file was damaged and no copy could be read. Restore a backup under More.', true), 300);
  else if (SD.readOnly) setTimeout(() => SD.toast('Data from a newer app version: read-only.', true), 300);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const v = SD._onResize; v && v(); }, 200); });
});

/* ---------- first run ---------- */
SD.views.welcome = {
  tab: 'home',
  render(el) {
    SD.header('Shooting Drills');
    el.innerHTML = `
      <div class="hero">
        <div class="wlogo">${SD.logo('hlogo')}</div>
        <div class="kicker">Stoic Ranger // Shooting Drills</div>
        <h1>Welcome</h1>
        <p>${SD.DRILLS.length} pistol and rifle drills for live and dry fire, sorted by static or dynamic and timed or not timed. Every drill has a one-page view with setup diagram, steps and standard, plus printable targets with the Stoic Ranger emblem where a special target is needed. Log your results to see your progress. Everything stays on this phone.</p>
      </div>
      <div class="stack">
        <button class="btn pri big" id="wStart">Open the drill library</button>
        <button class="btn big" id="wImport">Restore a backup</button>
      </div>`;
    $('#wStart').onclick = () => { SD.firstRun = false; SD.save(true); SD.go('#/drills'); };
    $('#wImport').onclick = () => { SD.firstRun = false; SD.save(true); SD.go('#/more'); setTimeout(() => SD.restoreBackup && SD.restoreBackup(), 50); };
  },
};
})();
