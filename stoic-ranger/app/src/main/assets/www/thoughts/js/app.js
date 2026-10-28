/* Stoic Ranger - Daily Thoughts — router, header, theme, boot, welcome. */
'use strict';
(() => {
const { $, $$, esc } = DT;
DT.views = {};
DT.indexContent();
let stack = [location.hash];   // in-app history, so the Android back button walks back before closing

DT.go = (hash, replace) => { if (replace) location.replace(hash); else location.hash = hash; };
DT.back = () => {
  if (DT._modal) { DT._modal(); return true; }
  if (stack.length > 1) { history.back(); return true; }
  const r = location.hash.split('/')[1] || 'today';
  if (r !== 'today') { DT.go('#/today', true); return true; }
  return false;
};

DT.header = (title, { back = false, actions = '' } = {}) => {
  $('#hTitle').textContent = title;
  $('#hBack').hidden = !back;
  $('#hMark').hidden = back;
  $('#hActions').innerHTML = actions;
};

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  const name = parts[0] || 'today';
  const v = DT.views[name] || DT.views.today;
  const el = $('#view'); el.scrollTop = 0; window.scrollTo(0, 0);
  el.innerHTML = '';
  if (DT._modal) DT._modal();
  try { v.render(el, parts.slice(1), q); if (DT.readOnly) el.insertAdjacentHTML('afterbegin', dataNotice()); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="note">${esc(e.message)}</p></div>`; }
  const tab = DT.tabNow || v.tab || name; DT.tabNow = null;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === tab));
  DT.prevHash = location.hash;
}
DT.route = route;
window.addEventListener('hashchange', () => {
  if (!DT.isUnlocked()) return;
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (/^#\/(today|authors|favourites|more)$/.test(h)) stack = [h];   // a main tab starts a new trail
  else stack.push(h);
  route();
});

function dataNotice() {
  if (DT.readOnly) return `<div class="banner warn">These favourites were saved by a newer version of Daily Thoughts (data format ${DT.dataSchema}, this app reads up to ${DT.SCHEMA}). Nothing is changed or saved until you update the app.</div>`;
  return '';
}

/* ---------- theme ---------- */
// "Follow phone": Android tells us directly (the WebView's prefers-color-scheme is not reliable).
DT.setSysDark = on => { document.documentElement.dataset.sys = on ? 'dark' : 'light'; };
try { if (window.DTNative && DTNative.isNight) DT.setSysDark(DTNative.isNight()); } catch (e) { }
DT.applyTheme = () => {
  const t = DT.db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};

/* ---------- boot ---------- */
/* ---------- web app password (iPhone / iPad only; the Android app has no lock) ----------
   One-time entry per device: a correct password sets the marker 'dt.unlocked' in the page storage. It is kept
   separate from the favourites (db) and the service worker cache, so app updates, backups and restores never touch
   it, and a later password change does not lock out people who already got in. Only the SHA-256 of the password is
   in the code. This keeps casual visitors out; the files themselves stay public on GitHub Pages. */
DT.PASS_SHA256 = '5096644aada20e45d5b3394e28e169b6cfb634657d697851e61aaaabed2eb402';
const UNLOCK = 'dt.unlocked';
DT.isUnlocked = () => { if (DT.native) return true; try { return !!localStorage.getItem(UNLOCK); } catch (e) { return false; } };
const sha256 = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(b => b.toString(16).padStart(2, '0')).join('');
function lockScreen(done) {
  DT.header('Daily Thoughts');
  $('#nav').hidden = true;
  $('#view').innerHTML = `<div class="hero lock">
      <div class="wlogo">${DT.logo('hlogo')}</div>
      <div class="kicker">Stoic Ranger // Daily Thoughts</div>
      <h1>Password</h1>
      <p>Enter the password you were given. You only need it once on this device.</p>
    </div>
    <form class="stack" id="lForm"><input type="password" id="lPass" autocomplete="current-password" placeholder="Password" required>
      <button class="btn pri big">Open Daily Thoughts</button><p class="note" id="lMsg"></p></form>`;
  $('#lForm').onsubmit = async e => {
    e.preventDefault();
    if (await sha256($('#lPass').value.trim()) === DT.PASS_SHA256) {
      try { localStorage.setItem(UNLOCK, new Date().toISOString()); } catch (x) { }
      $('#nav').hidden = false; done();
    } else { $('#lMsg').textContent = 'That is not the password.'; $('#lPass').select(); }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  $('#sprite').innerHTML = DT.SPRITE;
  $('#hBack').onclick = () => DT.back();
  DT.applyTheme();
  if (!DT.isUnlocked()) { lockScreen(start); return; }
  start();
});
function start() {
  if (DT.firstRun && !location.hash) location.replace('#/welcome');
  route();
  // web app (iPhone / iPad): the service worker keeps every file on the device, so it works offline
  if (!DT.native && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (DT.migrated) { DT.save(true); setTimeout(() => DT.toast(`Data updated to the new app version (${DT.db.favs.length} favourites kept, a copy of the old file was saved).`), 300); }
  else if (DT.recovered) setTimeout(() => DT.toast(DT.db.favs.length ? 'The data file was damaged: the previous saved copy was restored.' : 'The data file was damaged and no copy could be read. Restore a backup under More.', true), 300);
  else if (DT.readOnly) setTimeout(() => DT.toast('Data from a newer app version: read-only.', true), 300);
  // the day changes while the app stays open: show the new Quote of the day when it comes back to the front
  let day = DT.dayNo();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DT.dayNo() !== day) { day = DT.dayNo(); if (/^#\/(today)?$|^$/.test(location.hash)) route(); } });
}

/* ---------- first run ---------- */
DT.views.welcome = {
  tab: 'today',
  render(el) {
    DT.header('Daily Thoughts');
    const st = DT.AUTHORS.filter(a => a.group === 'Stoics').length;
    el.innerHTML = `
      <div class="hero">
        <div class="wlogo">${DT.logo('hlogo')}</div>
        <div class="kicker">Stoic Ranger // Daily Thoughts</div>
        <h1>Welcome</h1>
        <p>One thought to carry through the day. Every morning a new quote from the Stoics and the thinkers around them, with the story behind it and one thing to practise. ${DT.QUOTES.length} quotes from ${DT.AUTHORS.length} authors (${st} Stoics), each with their own Stoic Ranger challenge coin and life story. Mark the quotes you want to keep as favourites. Everything stays on this phone.</p>
      </div>
      <div class="stack">
        <button class="btn pri big" id="wStart">Read today's thought</button>
        <button class="btn big" id="wImport">Restore a backup</button>
      </div>`;
    $('#wStart').onclick = () => { DT.firstRun = false; DT.save(true); DT.go('#/today', true); };
    $('#wImport').onclick = () => { DT.firstRun = false; DT.save(true); DT.go('#/more'); setTimeout(() => DT.restoreBackup && DT.restoreBackup(), 50); };
  },
};
})();
