/* Stoic Ranger - Shooting Drills — link with Stoic Ranger - Training Log (Manuel 2026-10-26).
   Both apps are signed with the same key; the Training Log answers through a signature-protected provider and only
   while linking with Shooting Drills is switched on there too. When linked:
   - shooters and guns come from the Training Log (matched by its id, or by name the first time); the fields it
     sends are edited there, notes stay local. (The Training Log may itself get them from the Gun Database.)
   - a drill result logged on a date with a training in the Training Log can be linked to that training.
   Switching off (here or there) keeps every entry here as a local copy. Without consent, or with only one app
   installed, nothing is exchanged. */
'use strict';
(() => {
const { esc } = SD;
const APP = 'training-log';
SD.LINK_LOCKED = { shooters: ['name', 'status'], weapons: ['name', 'type', 'caliber', 'zeroM', 'status'] };

SD.linkOn = () => !!(SD.db.settings.link && SD.db.settings.link.enabled);
SD.isLinked = r => !!(r && r.source && r.source.app === APP && !r.source.missing && SD.linkOn());
/** Fields of a linked entry that the Training Log manages (only those it actually sends). */
SD.lockedKeys = (table, r) => SD.isLinked(r) ? (SD.LINK_LOCKED[table] || []).filter(k => !r.source.keys || r.source.keys.includes(k)) : [];

SD.linkCall = (method, arg) => {
  try {
    const N = window.SDNative;
    if (N && N.linkCall) return JSON.parse(N.linkCall(method, arg == null ? '' : JSON.stringify(arg)) || '{}');
    if (window.__linkMock) return window.__linkMock(method, arg);   // browser tests
  } catch (e) { return { error: e.message }; }
  return { error: 'unavailable' };
};
const tlInstalled = () => { try { return !!(window.SDNative && SDNative.isInstalled && SDNative.isInstalled('training-log')); } catch (e) { return false; } };

function merge(table, list, map) {
  let n = 0; const seen = new Set();
  (list || []).forEach(g => {
    if (!g || !g.id || !g.name) return;
    seen.add(g.id);
    const L = SD.db[table];
    let r = L.find(x => x.source && x.source.app === APP && x.source.id === g.id)
      || L.find(x => !x.source && String(x.name).trim().toLowerCase() === String(g.name).trim().toLowerCase());
    if (!r) {
      const now = new Date().toISOString();
      r = { id: SD.nextId(L, SD.TABLES[table].prefix), uid: SD.uuid(), created: now };
      L.push(r);
    }
    const before = JSON.stringify(r);
    const keys = (SD.LINK_LOCKED[table] || []).filter(k => k in g);
    Object.assign(r, map(g, r), { source: { app: APP, id: g.id, uid: g.uid || '', keys } });
    if (JSON.stringify(r) !== before) { r.updated = new Date().toISOString(); n++; }
  });
  SD.db[table].forEach(r => {   // gone in the Training Log: keep the local copy, editable again
    if (!r.source || r.source.app !== APP) return;
    const miss = !seen.has(r.source.id);
    if (!!r.source.missing !== miss) { if (miss) r.source.missing = true; else delete r.source.missing; n++; }
  });
  return n;
}

/** Pull shooters + guns from the Training Log. Quiet unless something changed; returns the stored status. */
SD.linkSync = () => {
  if (!SD.linkOn() || SD.readOnly) return null;
  const L = SD.db.settings.link, st = SD.linkCall('status');
  let state, changes = 0, detail = '';
  if (st.error === 'not-installed') state = tlInstalled() ? 'too-old' : 'missing';
  else if (st.error) { state = 'error'; detail = st.error; }
  else if (!st.enabled) state = 'off-there';
  else {
    const sh = SD.linkCall('shared');
    if (sh.error) { state = sh.error === 'disabled' ? 'off-there' : 'error'; detail = sh.error; }
    else {
      const pick = (g, r, keys) => Object.fromEntries(keys.map(k => [k, k in g ? (g[k] ?? '') : (r[k] ?? '')]));
      changes += merge('shooters', sh.shooters, (g, r) => ({ name: g.name, status: 'status' in g ? (g.status === 'Inactive' ? 'Inactive' : 'Active') : (r.status || 'Active') }));
      changes += merge('weapons', sh.weapons, (g, r) => Object.assign(pick(g, r, ['name', 'type', 'caliber']), {
        status: 'status' in g ? (['Sold', 'Retired'].includes(g.status) ? g.status : 'Active') : (r.status || 'Active'),
        zeroM: 'zeroM' in g ? SD.num(g.zeroM) : (r.zeroM ?? null) }));
      L.counts = { shooters: (sh.shooters || []).length, weapons: (sh.weapons || []).length };
      state = 'ok';
    }
  }
  L.status = { state, detail, at: new Date().toISOString(), version: st.version || '' };
  SD.save(true);
  if (changes && /^#\/(home|db\/\w+|more)?$/.test(location.hash || '#/')) SD.route();   // never a form being typed in
  return L.status;
};

/** Trainings logged in the Training Log on a date (YYYY-MM-DD); [] when not linked or none. */
SD.linkTrainings = date => {
  if (!SD.linkOn() || !date) return [];
  const r = SD.linkCall('trainings', { date });
  return Array.isArray(r.trainings) ? r.trainings : [];
};
/** Local shooter / gun that stands for a Training Log id. */
SD.fromLinked = (table, tlId) => tlId ? SD.db[table].find(x => x.source && x.source.app === APP && x.source.id === tlId) || null : null;
SD.trainingLabel = t => [t.id, t.start, t.desc].filter(Boolean).join(' · ');

SD.linkStatusText = () => {
  const L = SD.db.settings.link || {}, s = L.status;
  if (!L.enabled) return 'Not linked. Each app keeps its own data.';
  if (!s) return 'Linked, not synced yet.';
  const when = `${SD.fmtDate(s.at.slice(0, 10))} ${s.at.slice(11, 16)}`;
  return {
    ok: `Linked with Training Log ${esc(s.version)} · ${L.counts ? `${L.counts.shooters} shooters, ${L.counts.weapons} guns` : ''} · ${when}`,
    missing: 'Stoic Ranger - Training Log is not installed on this phone. Your data here stays as it is.',
    'too-old': 'The Training Log on this phone is an older version without the Shooting Drills link. Update it, then sync again.',
    'off-there': 'The Training Log is installed, but linking with Shooting Drills is off there: switch it on under More › Stoic Ranger apps in the Training Log.',
    unavailable: 'Linking only works in the Android app.',
    permission: 'The Training Log was not signed with the same key as this app, so they cannot be linked.',
  }[s.state === 'error' ? s.detail : s.state] || `Sync failed: ${esc(s.detail)} (${when})`;
};

document.addEventListener('DOMContentLoaded', () => setTimeout(() => SD.linkSync(), 400));
})();
