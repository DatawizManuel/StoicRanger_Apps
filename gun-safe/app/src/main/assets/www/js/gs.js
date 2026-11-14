/* SR GunSafe — phone Back, the Daily Thoughts way (project rule, Manuel 2026-11-06). Loaded first and depends on no
   other script, so Back keeps working even if a later script fails.
   MainActivity.onBackPressed → evaluateJavascript("(window.GS && GS.back) ? GS.back() : false"); only false closes.
   Order: close what is open (a confirm box, a dialog) → back through the pages visited → home → on home
   "Press back again to close", and only a second Back within 2 s closes the app.
   Script errors are kept (GS.errors) and shown under ⋯ › About, to find problems on the phone. */
'use strict';
(function () {
  var GS = window.GS = window.GS || {};
  GS.errors = [];
  window.addEventListener('error', function (e) {
    GS.errors.push((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || ''));
    if (GS.errors.length > 10) GS.errors.shift();
  });
  var stack = [location.hash || '#home'];
  window.addEventListener('hashchange', function () {
    var h = location.hash || '#home';
    if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
    else stack.push(h);
    if (stack.length > 60) stack.splice(1, 1);
  });
  var byId = function (id) { return document.getElementById(id); };
  var backAt = 0, toastT = null;
  GS.toast = function (t) {
    var e = byId('toast'); if (!e) return;
    e.textContent = t; e.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(function () { e.hidden = true; }, 2200);
  };
  /** Pages go "forward" with GS.go(hash); a form that is saved goes back with GS.done(). */
  GS.go = function (h) { location.hash = h; };
  GS.done = function () { if (stack.length > 1) history.back(); else location.replace('#home'); };
  GS.overlay = null;          // function that closes what is open on top of the page (set by app.js)
  GS.back = function () {
    try {
      if (typeof GS.overlay === 'function') { var f = GS.overlay; GS.overlay = null; f(); return true; }
      var h = (location.hash || '#home').slice(1) || 'home';
      if (h !== 'home') {
        if (stack.length > 1) history.back(); else { location.replace('#home'); stack = ['#home']; }
        backAt = 0; return true;
      }
      stack = ['#home'];
      if (Date.now() - backAt < 2000) { backAt = 0; try { if (window.GSStore) GSStore.flush(); } catch (e) { } return false; }
      backAt = Date.now(); GS.toast('Press back again to close'); return true;
    } catch (e) {
      GS.errors.push('back: ' + e);
      return (location.hash || '#home') !== '#home' ? (location.replace('#home'), true) : false;
    }
  };
})();
