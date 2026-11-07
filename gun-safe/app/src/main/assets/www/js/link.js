/* SR GunSafe — link with SR Shooting (standing rule: only with the user's consent).
   After "Allow", guns, barrels, ammunition and the rounds fired are read from SR Shooting's link provider
   (content://at.rangebook.app.link, signature permission at.stoicranger.permission.LINK):
     call("gunsafe")          → {weapons, barrels, munitions, rounds:[{date, weaponId, barrelId, munitionId, rounds, source, ref}]}
     call("putBarrels", json) → a barrel switch / new barrel on an SR Shooting gun ({barrels:[…]}) → {ok}
   (shared contract, section D). The copy read last is kept (data.srCache), so the screens work without SR Shooting
   running. SR Shooting versions without these calls → "SR Shooting needs an update". */
'use strict';
window.GSLink = (() => {
  const N = window.GSNative || null;
  const D = () => GSStore.data;
  let status = { installed: false }, problem = '';
  const parse = t => { try { return JSON.parse(t); } catch (e) { return { error: 'failed' }; } };

  const SR_PKG = 'at.rangebook.app';
  /** The native side keeps the consent too, so SR Shooting's provider calls are answered only after "Allow". */
  const tellNative = () => { if (N && N.setLinked) { try { N.setLinked(SR_PKG, state() === 'allowed'); } catch (e) { } } };
  function check() {
    tellNative();
    status = N && N.srStatus ? parse(N.srStatus()) : { installed: false };
    return status;
  }
  const state = () => D().link.sr || 'ask';              // ask | allowed | no
  /** Reads SR Shooting again (only when allowed). Returns '' or a reason. */
  function refresh() {
    problem = '';
    if (state() !== 'allowed') return '';
    if (!N || !N.srCall) { problem = 'browser'; return problem; }
    check();
    if (!status.installed) { problem = 'not-installed'; return problem; }
    const r = parse(N.srCall('gunsafe', ''));
    if (r.error) { problem = r.error === 'unknown method' || r.error === 'no-provider' ? 'needs-update' : r.error; return problem; }
    // a pending barrel change is done once SR Shooting reports the barrel the same way
    if (Array.isArray(D().srPending)) D().srPending = D().srPending.filter(p => !(r.barrels || []).some(b => b.id === p.id && (b.removed || '') === (p.removed || '') && (b.installed || '') === (p.installed || '')));
    D().srCache = { weapons: r.weapons || [], barrels: r.barrels || [], munitions: r.munitions || [], rounds: r.rounds || [], at: new Date().toISOString(), version: status.version || '' };
    GSStore.changed('link');
    return '';
  }
  function allow() { D().link.sr = 'allowed'; GSStore.changed('link'); tellNative(); const p = refresh(); if (window.GSSync) GSSync.pull(); return p; }
  function refuse() { D().link.sr = 'no'; GSStore.changed('link'); tellNative(); }
  /** Turning the link off keeps everything entered in GunSafe; SR Shooting's guns just stop showing. */
  function off() { D().link.sr = 'no'; GSStore.changed('link'); tellNative(); }
  /** Barrel switch on an SR Shooting gun. Returns '' or a readable reason. */
  function putBarrels(barrels) {
    if (!N || !N.srCall) return 'Barrel changes on SR Shooting guns need the Android app.';
    const r = parse(N.srCall('putBarrels', JSON.stringify({ barrels })));
    if (r.error) return r.error === 'unknown method' ? 'SR Shooting needs an update before GunSafe can change its barrels. Change the barrel in SR Shooting for now.' : 'SR Shooting did not accept the barrel change (' + r.error + ').';
    // new barrels get their ids from SR Shooting (ok.ids, same order as sent); keep them until SR Shooting shows them
    const ids = Array.isArray(r.ids) ? r.ids : [];
    const pend = barrels.map((b, i) => Object.assign({}, b, { id: b.id || ids[i] || ('B-new-' + Date.now() + '-' + i) }));
    D().srPending = (Array.isArray(D().srPending) ? D().srPending : []).filter(p => !pend.some(x => x.id === p.id)).concat(pend);
    GSStore.changed('link');
    refresh();
    return '';
  }
  const problemText = p => ({
    'not-installed': 'SR Shooting is not installed on this phone. The guns and ammunition read last are still shown.',
    'needs-update': 'SR Shooting needs an update (version with the SR GunSafe link). Until then GunSafe works with its own guns and ammunition.',
    'not-permitted': 'SR Shooting is signed with a different key, so the apps cannot link.',
    browser: 'The link works in the Android app.',
  }[p] || (p ? 'SR Shooting could not be read (' + p + ').' : ''));
  return { check, state, refresh, allow, refuse, off, putBarrels, get problem() { return problem; }, problemText, get status() { return status; } };
})();
