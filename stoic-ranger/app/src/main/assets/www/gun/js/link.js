/* Stoic Ranger — link with SR_Training Log (same signing key, switched on by the user in both apps).
   The Training Log reads shooters and weapons through LinkProvider and sends the rounds of its trainings, which
   land in files/link-inbox.json. Here they become rounds log entries (link.app = 'training-log'), counted towards
   the barrel fitted on that date. The inbox always holds the full list, so a training changed or deleted there
   updates or removes its entries here. Switching the link off keeps everything received so far. */
'use strict';
(() => {
RB.linkOn = () => !!(RB.db.settings.link && RB.db.settings.link.enabled);
RB.linkApplyInbox = inbox => {
  if (!inbox || !Array.isArray(inbox.entries) || RB.readOnly || !RB.linkOn()) return 0;
  const L = RB.db.settings.link;
  if (inbox.received && L.lastInbox === inbox.received) return 0;
  const seen = new Set(); let changed = 0;
  inbox.entries.forEach(e => {
    const n = Math.round(+e.rounds || 0);
    if (!e.uid || !RB.weapon(e.weaponId) || n <= 0) return;
    seen.add(e.uid);
    const v = { date: e.date || '', rounds: n, weaponId: e.weaponId, note: 'SR_Training Log: ' + (e.note || '') };
    const r = RB.db.roundsLog.find(x => x.link && x.link.uid === e.uid);
    if (!r) { RB.db.roundsLog.push(Object.assign({ id: RB.nextId(RB.db.roundsLog, 'R'), barrelId: '' }, v, { link: { app: 'training-log', uid: e.uid, trainingId: e.trainingId || '' } })); changed++; }
    else if (r.date !== v.date || +r.rounds !== v.rounds || r.weaponId !== v.weaponId || r.note !== v.note) { Object.assign(r, v); changed++; }
  });
  if (inbox.full) {
    const before = RB.db.roundsLog.length;
    RB.db.roundsLog = RB.db.roundsLog.filter(x => !(x.link && x.link.app === 'training-log' && !seen.has(x.link.uid)));
    changed += before - RB.db.roundsLog.length;
  }
  L.lastInbox = inbox.received || Date.now();
  L.lastRounds = new Date().toISOString();
  RB.save(true);
  return changed;
};
RB.linkMerge = () => {
  if (!window.RBNative || !RBNative.linkInbox || !RB.linkOn()) return;
  let inbox = null;
  try { inbox = JSON.parse(RBNative.linkInbox() || 'null'); } catch (e) { return; }
  const n = RB.linkApplyInbox(inbox);
  if (n) RB.toast(`Rounds log updated from SR_Training Log (${n} change${n === 1 ? '' : 's'}).`);
};
document.addEventListener('DOMContentLoaded', () => setTimeout(RB.linkMerge, 500));
})();
