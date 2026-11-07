/* SR GunSafe — what the screens show, worked out from the data (never stored, so it can't go stale).
   Guns and ammunition come from two places: entered in GunSafe (ids G…, GM…) and, when the user allowed the link,
   read from SR Shooting (ids W…, M…). Both lists are shown together; nothing is lost when the link is switched off. */
'use strict';
window.GSModel = (() => {
  const D = () => GSStore.data;
  const arr = a => Array.isArray(a) ? a : [];
  const linked = () => D().link && D().link.sr === 'allowed' && !!D().srCache;
  const sr = () => (linked() ? D().srCache : null) || { weapons: [], barrels: [], munitions: [], rounds: [] };
  const isSr = id => /^[WBM]-?\d/.test(String(id || ''));

  function guns() {
    const own = D().guns.map(g => Object.assign({ src: 'own' }, g));
    const fromSr = arr(sr().weapons).map(w => Object.assign({ src: 'sr' }, w));
    return fromSr.concat(own);
  }
  const gun = id => guns().find(g => g.id === id);
  function info(id) { return D().gunInfo.find(i => i.id === id) || { id, owners: [], fits: [] }; }
  function setInfo(id, patch) {
    let i = D().gunInfo.find(x => x.id === id);
    if (!i) { i = { id, owners: [], fits: [] }; D().gunInfo.push(i); }
    Object.assign(i, patch);
  }
  const owners = () => D().owners;
  const owner = id => D().owners.find(o => o.id === id);
  const gunOwners = id => arr(info(id).owners).filter(o => owner(o));
  const fits = g => [g.caliber].concat(arr(info(g.id).fits)).filter(Boolean).map(c => String(c).trim().toLowerCase());

  function munitions() {
    return arr(sr().munitions).map(m => Object.assign({ src: 'sr' }, m)).concat(D().munitions.map(m => Object.assign({ src: 'own' }, m)));
  }
  const mun = id => munitions().find(m => m.id === id);
  const fitsGun = (g, m) => fits(g).includes(String(m.caliber || '').trim().toLowerCase());

  function barrels(gid) {
    const g = gun(gid);
    let list = g && g.src === 'sr' ? arr(sr().barrels) : D().barrels;
    // barrel changes sent to SR Shooting show at once; SR Shooting applies them on its next start
    if (g && g.src === 'sr' && arr(D().srPending).length) {
      list = list.map(b => D().srPending.find(p => p.id === b.id) || b).concat(D().srPending.filter(p => !list.some(b => b.id === p.id)));
    }
    return list.filter(b => b.weaponId === gid);
  }
  const currentBarrel = gid => barrels(gid).filter(b => !b.removed).sort((a, b) => String(b.installed || '').localeCompare(String(a.installed || '')))[0];
  const components = gid => D().components.filter(c => c.weaponId === gid && !c.removed);

  /** Every rounds-fired entry: SR Shooting (datasheets + rounds log) when linked, plus those logged in GunSafe. */
  function rounds() {
    const a = arr(sr().rounds).map(r => Object.assign({ source: 'SR Shooting' }, r));
    const b = D().rounds.map(r => Object.assign({ source: 'GunSafe' }, r));
    return a.concat(b);
  }
  function lastCleaning(gid) {
    return D().service.filter(e => e.weaponId === gid && e.cleaningDone)
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0))[0] || null;
  }
  /** A round counts as "since cleaning" when it was fired after the cleaning day, or on that day but logged after it
   *  in GunSafe. SR Shooting trainings on the cleaning day count as before (you clean after shooting). */
  function gunFig(gid) {
    const g = gun(gid) || {}, rs = rounds().filter(r => r.weaponId === gid), ev = lastCleaning(gid);
    const n = v => { const x = +v; return isFinite(x) ? x : 0; };
    const after = r => !ev || r.date > ev.date || (r.date === ev.date && r.source === 'GunSafe' && ev.seq != null && (r.seq || 0) > ev.seq);
    const logged = rs.reduce((s, r) => s + n(r.rounds), 0);
    return { total: n(g.roundsBeforeLog) + logged, since: rs.filter(after).reduce((s, r) => s + n(r.rounds), 0), lastClean: ev ? ev.date : '' };
  }
  function munFig(mid) {
    const mv = D().moves.filter(m => m.munitionId === mid);
    const buys = mv.filter(m => m.kind === 'Purchase');
    const bought = buys.reduce((s, m) => s + (+m.qty || 0), 0), spent = buys.reduce((s, m) => s + (+m.price || 0), 0);
    const out = mv.filter(m => m.kind === 'Withdrawal').reduce((s, m) => s + (+m.qty || 0), 0);   // negative
    // the stock starts with the first purchase: rounds fired before it (older SR Shooting trainings) don't count
    const start = mv.reduce((d, m) => !d || m.date < d ? m.date : d, '');
    const fired = rounds().filter(r => r.munitionId === mid && (r.source === 'GunSafe' || (start && r.date >= start))).reduce((s, r) => s + (+r.rounds || 0), 0);
    const last = buys.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return { stock: bought + out - fired, bought, spent, avg: bought ? spent / bought : 0, last: last && last.qty ? last.price / last.qty : 0, fired, out: -out };
  }
  return { linked, isSr, guns, gun, info, setInfo, owners, owner, gunOwners, fits, munitions, mun, fitsGun, barrels, currentBarrel, components, rounds, lastCleaning, gunFig, munFig };
})();
