/* SR Field Kit — phone Back, the Daily Thoughts way (the one Stoic Ranger app where Back works on Manuel's phone).
   Loaded first and depends on no other script, so Back keeps working even if a later script fails.
   MainActivity: onBackPressed → evaluateJavascript("(window.FK && FK.back) ? FK.back() : false"); only false closes.
   Order: close what is open (About, wind sheet, card viewer) → history.back() through the pages visited →
   home → on home "Press back again to close", and a second Back within 2 s closes the app.
   Script errors are kept (FK.errors) and shown under ⋯ › About, to find problems on the phone. */
'use strict';
(function () {
  var FK = window.FK = window.FK || {};
  FK.errors = [];
  window.addEventListener('error', function (e) { FK.errors.push((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')); if (FK.errors.length > 10) FK.errors.shift(); });
  var stack = [location.hash || '#home'];      // in-app history, so Back walks back before closing
  window.addEventListener('hashchange', function () {
    var h = location.hash || '#home';
    if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();   // went back
    else stack.push(h);
    if (stack.length > 50) stack.splice(1, 1);
  });
  var byId = function (id) { return document.getElementById(id); };
  var backAt = 0, toastT = null;
  FK.toast = function (t) {
    var e = byId('toast'); if (!e) return;
    e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { e.hidden = true; }, 2000);
  };
  FK.back = function () {
    try {
      var about = byId('about'), ws = byId('wsView'), pv = byId('preview');
      var ov = document.querySelector('.fkover:not([hidden])');   // red screen, signal flash, map full screen
      if (ov) { if (ov.fkClose) ov.fkClose(); else ov.hidden = true; return true; }
      if (about && !about.hidden) { var ac = byId('aboutClose'); if (ac) ac.click(); else about.hidden = true; return true; }
      if (ws && !ws.hidden) { ws.hidden = true; return true; }
      if (pv && pv.classList.contains('open')) { var vc = byId('vClose'); if (vc) vc.click(); else pv.classList.remove('open', 'showb'); return true; }
      var h = (location.hash || '#home').slice(1) || 'home';
      if (h !== 'home') {
        if (stack.length > 1) history.back(); else { location.replace('#home'); stack = ['#home']; }
        backAt = 0; return true;
      }
      stack = ['#home'];                         // home is the root: older pages are not walked again
      if (Date.now() - backAt < 2000) { backAt = 0; try { if (window.FKStore) FKStore.flush(); } catch (e) { } return false; }
      backAt = Date.now(); FK.toast('Press back again to close'); return true;
    } catch (e) {
      FK.errors.push('back: ' + e);
      return (location.hash || '#home') !== '#home' ? (location.replace('#home'), true) : false;
    }
  };
})();
