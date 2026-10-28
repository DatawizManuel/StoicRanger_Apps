/* Stoic Ranger - Training Log — link with Stoic Ranger - Gun Database.
   Both apps are signed with the same key; the Gun Database answers through a signature-protected provider and
   only while linking is switched on there too. When linked:
   - shooters, guns and (Gun Database 0.6.0+) trainers come from the Gun Database (matched by its id, or by name
     the first time); the fields it sends are edited there, notes stay local,
   - the rounds of each training (per linked gun) go to the Gun Database's rounds log, so they count towards
     the barrel. The full list is sent each time, so changed or deleted trainings follow.
   Switching off (here or there) keeps every entry in both apps as a local copy. */
'use strict';
(() => {
const { esc } = TL;
TL.LINK_LOCKED = { shooters: ['name', 'status'], weapons: ['name', 'type', 'make', 'model', 'caliber', 'zeroM', 'serial', 'status'],
  trainers: ['name', 'contact', 'phone', 'email', 'website'] };
/** Fields of a linked entry that the Gun Database manages (only those it actually sends: older versions send fewer). */
TL.lockedKeys = (table, r) => TL.isLinked(r) ? (TL.LINK_LOCKED[table] || []).filter(k => !r.source.keys || r.source.keys.includes(k)) : [];

TL.linkCall = (method, arg) => {
  try {
    const N = window.TLNative;
    if (N && N.linkCall) return JSON.parse(N.linkCall(method, arg == null ? '' : JSON.stringify(arg)) || '{}');
    if (window.__linkMock) return window.__linkMock(method, arg);   // browser tests
  } catch (e) { return { error: e.message }; }
  return { error: 'unavailable' };
};
TL.linkOn = () => !!(TL.db.settings.link && TL.db.settings.link.enabled);
TL.isLinked = r => !!(r && r.source && r.source.app === 'gundb' && !r.source.missing && TL.linkOn());

function merge(table, list, map) {
  let n = 0; const seen = new Set();
  (list || []).forEach(g => {
    if (!g || !g.id || !g.name) return;
    seen.add(g.id);
    const L = TL.db[table];
    let r = L.find(x => x.source && x.source.app === 'gundb' && x.source.id === g.id)
      || L.find(x => !x.source && !x.example && String(x.name).trim().toLowerCase() === String(g.name).trim().toLowerCase());
    if (!r) {
      const now = new Date().toISOString();
      r = { id: TL.nextId(L, TL.TABLES[table].prefix), uid: TL.uuid(), created: now };
      L.push(r);
    }
    const before = JSON.stringify(r);
    const keys = (TL.LINK_LOCKED[table] || []).filter(k => k in g);
    Object.assign(r, map(g, r), { source: { app: 'gundb', id: g.id, keys } });
    if (JSON.stringify(r) !== before) { r.updated = new Date().toISOString(); n++; }
  });
  TL.db[table].forEach(r => {   // gone in the Gun Database: keep the local copy, editable again
    if (!r.source || r.source.app !== 'gundb') return;
    const miss = !seen.has(r.source.id);
    if (!!r.source.missing !== miss) { if (miss) r.source.missing = true; else delete r.source.missing; n++; }
  });
  return n;
}

/** Rounds per training and linked gun, as the Gun Database's rounds log needs them. */
TL.linkEntries = () => TL.db.trainings.filter(t => !t.example && !TL.isDry(t) && t.sendRounds !== false)   // dry fire: no rounds
  .flatMap(t => t.weapons.map(w => {
  const wr = TL.weapon(w.weaponId), n = TL.num(w.rounds);
  if (!wr || !wr.source || wr.source.app !== 'gundb' || wr.source.missing || !(n > 0)) return null;
  const sh = TL.shooter(t.shooterId);
  return { uid: t.uid + ':' + wr.uid, date: t.date, weaponId: wr.source.id, shooterId: sh && sh.source ? sh.source.id : '', rounds: n, note: t.desc || '', trainingId: t.id };
}).filter(Boolean));

/** Pull shooters + guns, push rounds. Quiet unless something changed; returns the stored status. */
TL.linkSync = () => {
  if (!TL.linkOn() || TL.readOnly) return null;
  const L = TL.db.settings.link, st = TL.linkCall('status');
  let state, changes = 0, detail = '';
  if (st.error === 'not-installed') state = 'missing';
  else if (st.error) { state = 'error'; detail = st.error; }
  else if (!st.enabled) state = 'off-there';
  else {
    const sh = TL.linkCall('shared');
    if (sh.error) { state = sh.error === 'disabled' ? 'off-there' : 'error'; detail = sh.error; }
    else {
      changes += merge('shooters', sh.shooters, (g, r) => ({ name: g.name, status: 'status' in g ? (g.status === 'Inactive' ? 'Inactive' : 'Active') : (r.status || 'Active') }));
      // a field the Gun Database does not send (empty there, or an older version) keeps the local value
      const pick = (g, r, keys) => Object.fromEntries(keys.map(k => [k, k in g ? (g[k] ?? '') : (r[k] ?? '')]));
      changes += merge('weapons', sh.weapons, (g, r) => Object.assign(pick(g, r, ['name', 'type', 'make', 'model', 'caliber', 'serial']), {
        status: 'status' in g ? (['Sold', 'Retired'].includes(g.status) ? g.status : 'Active') : (r.status || 'Active'),
        zeroM: 'zeroM' in g ? TL.num(g.zeroM) : (r.zeroM ?? null) }));
      if (Array.isArray(sh.trainers))   // Gun Database 0.6.0 and newer
        changes += merge('trainers', sh.trainers, (g, r) => pick(g, r, ['name', 'contact', 'phone', 'email', 'website']));
      const entries = TL.linkEntries();
      const p = TL.linkCall('putRounds', { from: 'training-log', full: true, sent: new Date().toISOString(), entries });
      if (p.ok) { state = 'ok'; L.sentEntries = entries.length; L.sentRounds = entries.reduce((a, e) => a + e.rounds, 0); }
      else { state = 'error'; detail = p.error || 'not stored'; }
      L.counts = { shooters: (sh.shooters || []).length, weapons: (sh.weapons || []).length, trainers: Array.isArray(sh.trainers) ? sh.trainers.length : null };
    }
  }
  L.status = { state, detail, at: new Date().toISOString(), version: st.version || '' };
  TL.save(true);
  // refresh lists, never a form the user is typing in
  if (changes && /^#\/(dash|trainings|db\/\w+)?$/.test(location.hash || '#/')) TL.route();
  return L.status;
};

TL.linkStatusText = () => {
  const L = TL.db.settings.link || {}, s = L.status;
  if (!L.enabled) return 'Not linked. Each app keeps its own data.';
  if (!s) return 'Linked, not synced yet.';
  const when = `${TL.fmtDate(s.at.slice(0, 10))} ${s.at.slice(11, 16)}`;
  return {
    ok: `Linked with Gun Database ${esc(s.version)} · ${L.counts ? `${L.counts.shooters} shooters, ${L.counts.weapons} guns${L.counts.trainers != null ? `, ${L.counts.trainers} trainers` : ''}` : ''} · ${TL.fmtInt(L.sentRounds || 0)} rounds from ${L.sentEntries || 0} entries sent · ${when}`,
    missing: 'Stoic Ranger - Gun Database is not installed on this phone. Your data here stays as it is.',
    'off-there': 'The Gun Database is installed, but linking is off there: switch it on under More › Stoic Ranger apps in the Gun Database.',
    unavailable: 'Linking only works in the Android app.',
    permission: 'The Gun Database was not signed with the same key as this app, so they cannot be linked.',
  }[s.state === 'error' ? s.detail : s.state] || `Sync failed: ${esc(s.detail)} (${when})`;
};

document.addEventListener('DOMContentLoaded', () => setTimeout(() => TL.linkSync(), 400));
})();
