/* SR Field Kit — link to the Stoic Ranger app (Drop & wind, wind cheat sheet).
   Standing rule (Manuel): apps and data are linked only with the user's consent. Nothing is read from Stoic Ranger
   until the user taps Allow; it is read-only (guns, ammunition, measured muzzle velocities) and never written.

   Android: FKNative.srStatus() → {installed, version}; FKNative.srCall("ballistics") → JSON from Stoic Ranger's
   link provider (content://at.rangebook.app.link, signature permission at.stoicranger.permission.LINK):
     { weapons:[{id,name,caliber,sightHeightMm,zeroM,scopeUnit,clickValue,optic,twist}],
       munitions:[{id,name,caliber,bulletWeightG,bcG1,bcG7,nominalV0}], v0:{"<weaponId>|<munitionId>":{v,n}} }
   or {error:"no-provider"} when the installed Stoic Ranger is older than the link (1.1.0 has none yet).
   State lives in db.json under "link": {linked, dismissed, w, m}. */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const store = window.FKStore, N = window.FKNative || null;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const parse = t => { try { return JSON.parse(t); } catch(e){ return null; } };
  let st = Object.assign({ linked: false, dismissed: false, w: null, m: null }, store.get("link", {}));
  let asking = false, data = null, err = null, sr = { installed: false };
  const save = () => store.set("link", st);

  function status(){ sr = (N && N.srStatus && parse(N.srStatus())) || { installed: false }; return sr; }
  function fetchData(){
    data = null; err = null;
    if (!N || !N.srCall){ err = "no-provider"; return; }
    const j = parse(N.srCall("ballistics"));
    if (!j) { err = "failed"; return; }
    if (j.error){ err = j.error; return; }
    data = { weapons: Array.isArray(j.weapons) ? j.weapons : [], munitions: Array.isArray(j.munitions) ? j.munitions : [], v0: j.v0 && typeof j.v0 === "object" ? j.v0 : {} };
  }
  const ammoFor = w => { const all = data.munitions, same = all.filter(m => w && m.caliber && m.caliber === w.caliber); return same.length ? same : all; };
  const v0Of = (w, m) => { const meas = data.v0[w.id + "|" + m.id]; return { meas, v: meas && meas.v > 0 ? meas.v : (m.nominalV0 > 0 ? m.nominalV0 : null) }; };

  window.__SR = {
    linked: () => st.linked && !!data,
    get data(){ return data; },
    v0Of: (w, m) => v0Of(w, m),
    refresh(){ if (st.linked){ fetchData(); render(); } },
  };

  function apply(){
    const w = data.weapons.find(x => x.id === st.w) || data.weapons[0]; st.w = w.id;
    const list = ammoFor(w); if (!list.some(m => m.id === st.m)) st.m = list[0] ? list[0].id : null;
    const m = list.find(x => x.id === st.m);
    if (!m) return { w, list, m: null };
    const { meas, v } = v0Of(w, m);
    $("bPre").value = "own";
    $("bModel").value = m.bcG7 > 0 ? "G7" : "G1";
    if (m.bcG7 > 0 || m.bcG1 > 0) $("bBC").value = m.bcG7 > 0 ? m.bcG7 : m.bcG1;
    if (v) __writeM("bMV", v);
    if (m.bulletWeightG > 0) __writeM("bMass", m.bulletWeightG);
    if (w.sightHeightMm > 0) __writeM("bSH", +(w.sightHeightMm / 10).toFixed(1));
    if (w.zeroM > 0) __writeM("bZero", w.zeroM);
    ["bMV","bMass","bSH","bZero"].forEach(id => { delete $(id).dataset.m; });
    window.__srLoad = w.name + " · " + m.name;
    if (window.__ball) window.__ball();
    return { w, m, meas, v, list };
  }

  const box = $("srLink");
  function render(){
    status();
    $("aboutLink").textContent = st.linked ? "Stoic Ranger (read-only: guns, ammunition, measured V0)" : (sr.installed ? "None (Stoic Ranger " + (sr.version || "") + " is on this phone)" : "None");
    $("setLink").checked = !st.dismissed;
    if (!sr.installed || (st.dismissed && !st.linked) || store.readOnly && !st.linked){ box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    if (!st.linked){
      box.className = "srlink off";
      box.innerHTML = asking
        ? `<b>Link with Stoic Ranger?</b><p>SR Field Kit may then read your guns, ammunition and the muzzle velocities measured on your datasheets. It only reads; it never changes anything in Stoic Ranger. You can unlink any time here or under ⋯ › Settings.</p>
           <div class="row2"><button type="button" class="button" id="lkYes">Allow</button><button type="button" class="button ghost" id="lkNo">Not now</button></div>`
        : `<p><b>Stoic Ranger is on this phone.</b> Fill this table from your own guns and ammunition instead of typing them.</p>
           <div class="row2"><button type="button" class="button ghost" id="lkAsk">Use Stoic Ranger data</button><button type="button" class="button ghost" id="lkDis">Dismiss</button></div>
           <p class="note">Dismiss hides this box. You can bring it back under ⋯ › Settings.</p>`;
      if (asking){
        $("lkYes").onclick = () => { st.linked = true; asking = false; save(); fetchData(); render(); };
        $("lkNo").onclick = () => { asking = false; render(); };
      } else {
        $("lkAsk").onclick = () => { asking = true; render(); };
        $("lkDis").onclick = () => { st.dismissed = true; save(); render(); };
      }
      return;
    }
    if (!data && !err) fetchData();
    const head = `<div class="srhead"><span>From Stoic Ranger</span><button type="button" class="lnk" id="lkOff">Unlink</button></div>`;
    let body;
    if (err){
      body = err === "no-provider"
        ? `<p>Linking is allowed, but Stoic Ranger ${esc(sr.version || "")} on this phone can't share its data yet. It works as soon as Stoic Ranger is updated to a version with linking. Until then, type the values below.</p>`
        : err === "not-permitted"
          ? `<p>Stoic Ranger on this phone was installed from a different source, so Android does not let the two apps share data. Type the values below.</p>`
          : `<p>Stoic Ranger's data could not be read (${esc(err)}). Type the values below, or try again later.</p>`;
    } else if (!data.weapons.length){
      body = `<p>No guns in Stoic Ranger yet. Add a gun and ammunition there, then come back here.</p>`;
    } else {
      const r = apply();
      body = `<div class="form srform">
        <div class="field"><label for="srW">Gun</label><select id="srW">${data.weapons.map(w => `<option value="${esc(w.id)}"${w.id === st.w ? " selected" : ""}>${esc(w.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="srM">Ammunition</label><select id="srM">${r.list.length ? r.list.map(m => `<option value="${esc(m.id)}"${m.id === st.m ? " selected" : ""}>${esc(m.name)}</option>`).join("") : `<option value="">No ammunition in Stoic Ranger</option>`}</select></div>
      </div>` + (r.m ? `<p class="srsrc">${r.v ? "V0 " + esc(FKUnits.imp() ? Math.round(r.v * 3.28084) + " fps" : r.v + " m/s") + " " + (r.meas ? "measured, average of " + r.meas.n + " datasheet" + (r.meas.n === 1 ? "" : "s") : "from the maker") : "No V0 in Stoic Ranger: type it below"} · BC ${r.m.bcG7 > 0 ? "G7 " + r.m.bcG7 + (r.m.bcG1 > 0 ? " (G1 " + r.m.bcG1 + ")" : "") : (r.m.bcG1 > 0 ? "G1 " + r.m.bcG1 : "none: type it below")} · ${esc(r.m.bulletWeightG)} g · sight height ${esc(r.w.sightHeightMm)} mm · zero ${esc(r.w.zeroM)} m</p>
        <p class="note">Change any field below to try something else; the values in Stoic Ranger stay as they are.</p>` : "");
      save();
    }
    box.className = "srlink on";
    box.innerHTML = head + body;
    if ($("srW")) $("srW").onchange = e => { st.w = e.target.value; st.m = null; save(); render(); };
    if ($("srM")) $("srM").onchange = e => { st.m = e.target.value; save(); render(); };
    $("lkOff").onclick = () => { st.linked = false; data = null; err = null; save(); window.__srLoad = null; render(); };
  }
  window.__srRender = render;
  window.__srClear = () => {};
  $("setLink").addEventListener("change", e => {
    if (e.target.checked) st.dismissed = false;
    else { st.dismissed = true; st.linked = false; data = null; window.__srLoad = null; }
    save(); render();
  });
  render();
})();
