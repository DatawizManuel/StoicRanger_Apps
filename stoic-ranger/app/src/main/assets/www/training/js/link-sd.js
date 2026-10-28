/* Stoic Ranger - Training Log — link with Stoic Ranger - Shooting Drills (Manuel 2026-10-26).
   Here the Training Log is the one asked: its LinkProvider (authority at.stoicranger.traininglog.link, same
   signature permission as the Gun Database link) answers only while this switch is on:
   - status / shared: shooters and guns, so Shooting Drills uses the same ones (no double entry),
   - trainings {date}: the trainings of a day, so a drill result logged that day links to its training,
   - putResults: Shooting Drills sends its linked results (full list each time); they are shown on the training.
   Switching off keeps every entry in both apps as it is. */
'use strict';
(() => {
const { esc } = TL;
const SD_PACKAGES = ['at.stoicranger.shootingdrills', 'at.stoicranger.shootingdrills.debug'];
const apps = () => (TL.db.settings.link.apps = TL.db.settings.link.apps || {});
TL.sdOn = () => !!(apps().shootingDrills && apps().shootingDrills.enabled);
TL.sdInstalled = () => { try { const N = window.TLNative; return !!(N && N.appInstalled && SD_PACKAGES.some(p => N.appInstalled(p))); } catch (e) { return false; } };

/** Results sent by Shooting Drills: kept as a read-only list (Shooting Drills owns them). */
TL.sdSync = () => {
  if (!TL.sdOn() || TL.readOnly) return false;
  let j = null;
  try { const N = window.TLNative; const txt = N && N.readInbox ? N.readInbox('link-sd-inbox.json') : (window.__sdInbox || ''); j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  const L = TL.db.linked = TL.db.linked || {};
  if (!j || !Array.isArray(j.results) || !(+j.received > (+L.sdReceived || 0))) return false;
  L.drillResults = j.results.filter(r => r && r.uid && (r.trainingUid || r.trainingId)).map(r => ({
    uid: String(r.uid), trainingUid: String(r.trainingUid || ''), trainingId: String(r.trainingId || ''), date: String(r.date || ''),
    drill: String(r.drill || r.drillName || r.drillId || ''), drillId: String(r.drillId || ''), result: String(r.result ?? ''),
    time: String(r.time ?? ''), note: String(r.note || ''), shooter: String(r.shooter || ''), gun: String(r.gun || '') }));
  L.sdReceived = +j.received; L.sdVersion = String(j.version || '');
  TL.save(true);
  return true;
};

TL.drillResultsOf = t => ((TL.db.linked || {}).drillResults || []).filter(r => (r.trainingUid && r.trainingUid === t.uid) || (!r.trainingUid && r.trainingId === t.id));
/** Card on the training page with the drill results Shooting Drills linked to it. */
TL.drillResultsFor = t => {
  const L = TL.drillResultsOf(t);
  if (!L.length) return '';
  return `<div class="card"><h3>Drill results <small class="note">from SR_Shooting Drills</small></h3><div class="sdres">${L.map(r => `<div><span style="color:var(--fg);font-family:var(--f-body);font-size:14px;white-space:normal"><b>${esc(r.drill)}</b>${r.gun ? ' · ' + esc(r.gun) : ''}${r.note ? `<br><small class="note">${esc(r.note)}</small>` : ''}</span><span>${esc([r.result, r.time].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>
    <p class="note" style="margin:6px 0 0">Edit or delete these in Shooting Drills.</p></div>`;
};

TL.sdStatusText = () => {
  if (!TL.sdOn()) return 'Not linked. Each app keeps its own data.';
  const L = TL.db.linked || {}, n = (L.drillResults || []).length;
  if (!TL.native) return 'Linking only works in the Android app.';
  if (!TL.sdInstalled()) return 'Stoic Ranger - Shooting Drills is not installed on this phone. Your data here stays as it is.';
  return `Linked: Shooting Drills can use the shooters and guns of this app and link drill results to the trainings of the same day. Switch linking on in Shooting Drills too (More › Stoic Ranger apps).`
    + (L.sdReceived ? ` ${n} linked drill result${n === 1 ? '' : 's'} received · ${TL.fmtDate(new Date(L.sdReceived).toISOString().slice(0, 10))}` : '');
};

/** More › Stoic Ranger apps: the switch for this link. */
TL.sdCard = () => `<div class="card"><h3>Link with Shooting Drills</h3>
  <label class="inl"><input type="checkbox" id="mSd"${TL.sdOn() ? ' checked' : ''}>Link with Stoic Ranger - Shooting Drills</label>
  <p class="note">When linked, Shooting Drills uses the shooters and guns of this app (and through it the Gun Database, if that is linked), and a drill result logged on the day of a training is linked to that training. Drill results Shooting Drills sends back are shown on the training here. Needs both apps on this phone and the switch on in both. Switching off keeps everything in each app.</p>
  <p class="msg">${TL.sdStatusText()}</p></div>`;
TL.sdWire = el => {
  const c = TL.$('#mSd', el); if (!c) return;
  c.onchange = () => {
    if (TL.readOnly) { TL.toast('Read-only: update the app first.', true); c.checked = !c.checked; return; }
    apps().shootingDrills = Object.assign(apps().shootingDrills || {}, { enabled: c.checked, at: new Date().toISOString() });
    TL.save(true); if (c.checked) TL.sdSync();
    TL.toast(c.checked ? 'Linking with Shooting Drills switched on.' : 'Link switched off. All entries stay in this app.');
    TL.route();
  };
};

document.addEventListener('DOMContentLoaded', () => setTimeout(() => { if (TL.sdSync() && /^#\/(dash|trainings)?$/.test(location.hash || '#/')) TL.route(); }, 450));
})();
