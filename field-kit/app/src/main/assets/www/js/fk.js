/* SR Field Kit — loaded first. The minimum the phone's Back button needs, even if a later script fails:
   window.FK.back() returns true when it handled Back, false only when the app may close. js/app.js replaces it
   with the full version (overlays, previous page, double Back on home). */
'use strict';
window.FK = window.FK || {};
window.FK.back = function () {
  try {
    var h = (location.hash || '#home').slice(1);
    if (h && h !== 'home') { location.hash = '#home'; return true; }
  } catch (e) { }
  return false;
};
