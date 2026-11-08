/* Stoic Ranger Map Manager — the page: Maps, Add a region, Routes, Settings. Talks to the computer only via window.mm. */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mb = b => b == null ? "–" : b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  const G = FKMap.geo;
  let S = null, latest = null, outdated = [], est = {}, selected = new Set(), job = null;
  const toastEl = $("toast"); let tt;
  const toast = (t, ms) => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(tt); tt = setTimeout(() => toastEl.hidden = true, ms || 3500); };
  async function call(p){ const r = await p; if (!r.ok) throw new Error(r.error); return r.v; }

  // ---------- tabs ----------
  const TABS = ["maps", "add", "routes", "settings"];
  function tab(){ const t = (location.hash || "#maps").slice(1); return TABS.includes(t) ? t : "maps"; }
  function showTab(){
    const t = tab();
    TABS.forEach(x => { $("v-" + x).hidden = x !== t; });
    document.querySelectorAll("nav a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === t ? "page" : "false"));
    if (t === "routes") initRoutes();
    if (t === "settings") fillSettings();
    if (t === "add") estimateVisible();
  }
  window.addEventListener("hashchange", showTab);

  // ---------- state ----------
  async function refresh(){
    S = await call(mm.state());
    if (S.job) job = S.job;
    renderMaps(); renderRegions(); renderJob();
    $("verLine").textContent = "Stoic Ranger Map Manager " + S.version;
    const f = S.folder;
    $("notice").hidden = f.exists;
    $("notice").textContent = f.exists ? "" : "The maps folder " + (f.folder || "") + " does not exist yet. Choose it under Settings (inside your Nextcloud folder); it is created when the first map is saved.";
  }

  // ---------- Maps ----------
  function renderMaps(){
    const maps = S.catalog.maps, f = S.folder;
    $("catN").textContent = maps.length;
    $("mapsSub").textContent = maps.length ? maps.length + " region" + (maps.length === 1 ? "" : "s") + (outdated.length ? " · " + outdated.length + " update" + (outdated.length === 1 ? "" : "s") + " available" : "") + " · all in format FK-1" : "No maps yet. Add a region to start.";
    $("updAll").hidden = !outdated.length || !!job;
    const rows = maps.map(m => {
      const busy = job && (job.current === m.id || (job.queue || []).includes(m.id)), upd = outdated.includes(m.id);
      let st = `<span class="pill okp">Ready for the phone</span>`, act = `<button type="button" class="btn ghost small" data-rm="${esc(m.id)}">Remove</button>`;
      if (busy){ const p = job.current === m.id && job.progress; st = p ? `<div class="small muted">${esc(p.phase)} · ${p.total ? Math.floor(p.done / p.total * 100) : 0} %</div><div class="bar" style="width:150px"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>` : `<span class="pill">Waiting</span>`; act = ""; }
      else if (upd){ st = `<span class="pill upd">Update available</span>`; act = `<button type="button" class="btn small" data-up="${esc(m.id)}">Update</button> ` + act; }
      return `<tr><td><div class="nm">${esc(m.name)}</div></td><td><span class="mono small">${esc(m.date || "")}</span>${upd && latest ? `<div class="small" style="color:#7a5f22;font-weight:600">newer: ${esc(latest)}</div>` : ""}</td>
        <td><span class="mono small">${mb((m.base ? m.base.bytes : 0) + (m.terrain ? m.terrain.bytes : 0))}</span></td><td>${st}</td><td class="r">${act}</td></tr>`;
    });
    // regions that are downloading but not yet in the catalog
    if (job) [job.current, ...(job.queue || [])].filter(id => id && !maps.some(m => m.id === id)).forEach(id => {
      const r = S.regions.find(x => x.id === id), p = job.current === id && job.progress;
      rows.push(`<tr><td><div class="nm">${esc(r ? r.name : id)}</div></td><td>–</td><td>${est[id] ? "≈ " + mb(est[id].bytes) : "–"}</td><td>${p ? `<div class="small muted">${esc(p.phase)} · ${p.total ? Math.floor(p.done / p.total * 100) : 0} %</div><div class="bar" style="width:150px"><i style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div>` : `<span class="pill">Waiting</span>`}</td><td class="r"><button type="button" class="btn ghost small" data-cancel="1">Stop</button></td></tr>`);
    });
    $("mapRows").innerHTML = rows.join("") || `<tr><td colspan="5" class="empty">No maps yet. <a href="#add">Add a region</a>.</td></tr>`;
    $("fState").innerHTML = f.exists ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${f.synced ? "#4b5320" : "#b08d3c"}"></span> ${f.synced ? "Inside your Nextcloud folder" : "Folder found (is it inside your Nextcloud folder?)"}` : `<span class="bad">Folder not found</span>`;
    $("fPath").textContent = f.folder || "";
    let used = 0; maps.forEach(m => used += (m.base ? m.base.bytes : 0) + (m.terrain ? m.terrain.bytes : 0));
    $("fFree").textContent = "Maps: " + mb(used) + (f.free != null ? " · free on this drive: " + mb(f.free) : "");
  }
  $("mapRows").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rm){ const m = S.catalog.maps.find(x => x.id === b.dataset.rm);
      if (!confirm("Remove " + m.name + "?\n\nThe map files are deleted from the Nextcloud folder, so they are removed from Nextcloud too. Phones keep their copy until it is deleted there.")) return;
      await call(mm.remove(m.id)); toast(m.name + " removed."); refresh(); }
    if (b.dataset.up) startDownload([b.dataset.up]);
    if (b.dataset.cancel) mm.cancel();
  });
  $("updAll").onclick = () => startDownload(outdated.slice());
  $("openF").onclick = async () => { try { await call(mm.openFolder()); } catch(e){ toast(e.message); } };

  // ---------- Add a region ----------
  function renderRegions(){
    const q = $("q").value.trim().toLowerCase(), have = new Set(S.catalog.maps.map(m => m.id)), groups = {};
    S.regions.filter(r => !q || r.name.toLowerCase().includes(q)).forEach(r => (groups[r.group] = groups[r.group] || []).push(r));
    $("regionCols").innerHTML = Object.keys(groups).map(g => `<div class="card"><div class="glbl">${esc(g)}</div>${groups[g].map(r => {
      const h = have.has(r.id), e = est[r.id];
      return `<label class="reg${h ? " have" : ""}"><input type="checkbox" data-r="${esc(r.id)}"${selected.has(r.id) ? " checked" : ""}${job ? " disabled" : ""}>${esc(r.name)}<span class="sz">${h ? "have it · " : ""}${e ? (e.error ? "?" : "≈ " + mb(e.bytes)) : "…"}</span></label>`; }).join("")}</div>`).join("") || `<p class="empty">No region matches.</p>`;
    renderSel();
  }
  function renderSel(){
    const ids = [...selected];
    $("selList").innerHTML = ids.length ? ids.map(id => { const r = S.regions.find(x => x.id === id), e = est[id]; return `<div class="sel"><span>${esc(r.name)}</span><span class="mono">${e && !e.error ? "≈ " + mb(e.bytes) : "…"}</span></div>`; }).join("") : "Nothing selected yet.";
    let t = 0, all = true; ids.forEach(id => { if (est[id] && !est[id].error) t += est[id].bytes; else all = false; });
    $("selTotal").textContent = ids.length ? (all ? "≈ " : "≥ ") + mb(t) : "–";
    $("dlBtn").disabled = !ids.length || !!job;
    $("dlBtn").textContent = ids.length > 1 ? "Download " + ids.length + " regions" : "Download";
  }
  $("q").addEventListener("input", renderRegions);
  $("regionCols").addEventListener("change", e => { const c = e.target.closest("[data-r]"); if (!c) return; if (c.checked) selected.add(c.dataset.r); else selected.delete(c.dataset.r); renderSel(); estimateOne(c.dataset.r); });
  let estRunning = false;
  async function estimateOne(id){
    if (est[id]) return;
    est[id] = null;
    try { est[id] = await call(mm.estimate(id)); } catch(e){ est[id] = { error: e.message }; if (!estRunning) toast("Size not available: " + e.message, 6000); }
    if (tab() === "add") renderRegions();
  }
  async function estimateVisible(){
    if (estRunning) return; estRunning = true;
    try { for (const r of S.regions){ if (tab() !== "add") break; if (!(r.id in est)) await estimateOne(r.id); if (est[r.id] && est[r.id].error) break; } }
    finally { estRunning = false; }
  }
  $("dlBtn").onclick = () => { startDownload([...selected]); selected.clear(); renderRegions(); };
  async function startDownload(ids){
    if (!S.folder.exists && !confirm("The maps folder\n" + S.folder.folder + "\ndoes not exist yet. Create it there?\n\n(Cancel = choose another folder under Settings.)")) { location.hash = "#settings"; return; }
    try { await call(mm.download(ids)); job = { current: null, queue: ids, done: [], failed: [] }; renderJob(); renderMaps(); toast("Download started. You can keep working; the map appears under Maps when it is ready."); }
    catch(e){ toast(e.message, 6000); }
  }
  function renderJob(){
    $("jobBox").hidden = !job;
    if (!job) return;
    const p = job.progress, r = S.regions.find(x => x.id === job.current);
    $("jobText").textContent = r ? r.name + " · " + (p ? p.phase + " · " + mb(p.done) + " of " + mb(p.total) : "starting") + (job.queue.length ? " · then " + job.queue.length + " more" : "") : "Starting …";
    $("jobBar").style.width = p && p.total ? (p.done / p.total * 100) + "%" : "0";
  }
  $("cancelBtn").onclick = () => mm.cancel();
  mm.onProgress(st => {
    job = st.finished ? null : st;
    if (st.finished){
      const ok = st.done.length, bad = st.failed;
      toast(bad.length ? (ok ? ok + " map(s) ready. " : "") + bad.map(f => (S.regions.find(r => r.id === f.id) || {}).name + ": " + f.error).join(" · ") : ok + " map" + (ok === 1 ? " is" : "s are") + " ready for the phone.", 8000);
      outdated = outdated.filter(id => !st.done.includes(id));
      refresh(); if (mapReady) loadRegions();
    } else { renderJob(); renderMaps(); }
  });

  // ---------- Routes ----------
  let map = null, mapReady = false, routes = [], cur = null, dirty = false, drag = null;
  const decl = () => +(S && S.cfg.decl) || 0;
  function blank(){ return { file: null, name: "New route", wps: [] }; }
  async function loadRoutes(){
    const list = await call(mm.routes()); routes = [];
    list.forEach(r => { try { const p = FKGpx.parseGpx(r.gpx, r.file.replace(/\.gpx$/i, "")); if (p[0]) routes.push({ file: r.file, name: p[0].name, wps: p[0].wps }); } catch(e){} });
  }
  async function loadRegions(){
    const maps = S.catalog.maps.filter(m => m.base);
    const info = await FKMap.setRegions(maps.map(m => ({ key: m.id, name: m.name, base: (o, l) => mm.mapRead(m.base.file, o, l), dem: m.terrain ? (o, l) => mm.mapRead(m.terrain.file, o, l) : null })));
    $("noMap").hidden = maps.length > 0;
    if (map){ FKMap.restyle(map, false); }
    return info;
  }
  async function initRoutes(){
    if (map){ map.resize(); return; }
    await loadRoutes();
    const info = await loadRegions();
    const b = info.find(i => i.bbox);
    map = FKMap.create($("map"), { center: b ? [(b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2] : [13.33, 47.6], zoom: b ? 7 : 6 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => { mapReady = true; drawRoute(); });
    map.on("click", e => {
      if (drag && drag.moved) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["fk-wp"] });
      if (f.length) return;
      cur.wps.push({ lat: e.lngLat.lat, lon: e.lngLat.lng, name: "WP" + (cur.wps.length + 1) }); changed();
    });
    map.on("contextmenu", e => { const f = map.queryRenderedFeatures(e.point, { layers: ["fk-wp"] }); if (f.length){ cur.wps.splice(f[0].properties.n - 1, 1); changed(); } });
    map.on("mousedown", "fk-wp", e => { e.preventDefault(); drag = { i: e.features[0].properties.n - 1, moved: false }; map.getCanvas().style.cursor = "grabbing"; });
    map.on("mousemove", e => { if (!drag) return; drag.moved = true; cur.wps[drag.i].lat = e.lngLat.lat; cur.wps[drag.i].lon = e.lngLat.lng; drawRoute(); });
    map.on("mouseup", () => { if (!drag) return; const d = drag; map.getCanvas().style.cursor = ""; if (d.moved){ changed(); } setTimeout(() => { drag = null; }, 0); });
    map.on("mouseenter", "fk-wp", () => { if (!drag) map.getCanvas().style.cursor = "grab"; });
    map.on("mouseleave", "fk-wp", () => { if (!drag) map.getCanvas().style.cursor = ""; });
    select(routes[0] ? 0 : -1);
  }
  function select(i){
    if (dirty && cur && !confirm("Discard the changes to \"" + cur.name + "\"?")) return;
    cur = i >= 0 ? JSON.parse(JSON.stringify(routes[i])) : blank(); cur.idx = i; dirty = false; render(); fit();
  }
  function changed(){ dirty = true; render(); }
  function fit(){ if (!map || cur.wps.length < 1) return; const b = new maplibregl.LngLatBounds(); cur.wps.forEach(w => b.extend([w.lon, w.lat])); map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 0 }); }
  function drawRoute(){ if (map) FKMap.setRoute(map, cur.wps, 0); }
  function render(){
    $("routeList").innerHTML = routes.map((r, i) => { let d = 0; for (let k = 1; k < r.wps.length; k++) d += G.dist(r.wps[k - 1], r.wps[k]);
      return `<button type="button" class="ritem" data-i="${i}" aria-current="${i === cur.idx}"><b>${esc(r.name)}</b><span>${r.wps.length} waypoints · ${G.fmtDist(d)}</span></button>`; }).join("") + (cur.idx < 0 ? `<button type="button" class="ritem" aria-current="true"><b>${esc(cur.name)}</b><span>not saved yet</span></button>` : "") || `<p class="empty">No routes yet.</p>`;
    if (document.activeElement !== $("rName")) $("rName").value = cur.name;
    let tot = 0; const dd = decl();
    const rows = cur.wps.map((w, i) => {
      let leg = "";
      if (i > 0){ const p = cur.wps[i - 1], d = G.dist(p, w), b = G.bearing(p, w), m = (b - dd + 360) % 360; tot += d;
        leg = `<div class="leg">${G.fmtDist(d)} · ${Math.round(m).toString().padStart(3, "0")}° · ${G.mils(m)} mil${dd ? " magnetic" : ""}</div>`; }
      return leg + `<div class="wp"><span class="num">${i + 1}</span><div class="wpm"><input data-n="${i}" value="${esc(w.name)}" aria-label="Name of waypoint ${i + 1}" maxlength="40"><div class="co">${esc(FKCoord.toMgrs(w.lat, w.lon) || (w.lat.toFixed(5) + ", " + w.lon.toFixed(5)))}</div></div>
        <button type="button" class="ib" data-up="${i}" aria-label="Move up"${i ? "" : " disabled"}>▲</button><button type="button" class="ib" data-dn="${i}" aria-label="Move down"${i < cur.wps.length - 1 ? "" : " disabled"}>▼</button><button type="button" class="ib" data-del="${i}" aria-label="Remove waypoint">✕</button></div>`;
    });
    $("wpList").innerHTML = rows.join("") || `<p class="empty">Click the map to add the first waypoint, or add one by coordinates below.</p>`;
    $("rTotals").innerHTML = `Total <b class="mono">${G.fmtDist(tot)}</b> · ${cur.wps.length} waypoints · bearings ${dd ? "magnetic (declination " + dd + "°)" : "true north"}`;
    $("saveRoute").disabled = cur.wps.length < 2; $("expRoute").disabled = cur.wps.length < 2; $("delRoute").disabled = cur.idx < 0;
    $("saveRoute").textContent = dirty || cur.idx < 0 ? "Save for the phone (StoicRanger_Maps/Routes)" : "Saved for the phone ✓";
    drawRoute();
  }
  $("routeList").addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) select(+b.dataset.i); });
  $("rName").addEventListener("input", e => { cur.name = e.target.value || "Route"; dirty = true; $("saveRoute").textContent = "Save for the phone (StoicRanger_Maps/Routes)"; });
  $("wpList").addEventListener("change", e => { const n = e.target.dataset.n; if (n != null){ cur.wps[+n].name = e.target.value.trim() || "WP" + (+n + 1); changed(); } });
  $("wpList").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; const w = cur.wps;
    if (b.dataset.up){ const i = +b.dataset.up; [w[i - 1], w[i]] = [w[i], w[i - 1]]; }
    else if (b.dataset.dn){ const i = +b.dataset.dn; [w[i + 1], w[i]] = [w[i], w[i + 1]]; }
    else if (b.dataset.del) w.splice(+b.dataset.del, 1);
    changed();
  });
  $("addCoord").onsubmit = e => { e.preventDefault(); $("cErr").textContent = "";
    try { const p = FKCoord.parse($("cIn").value); cur.wps.push({ lat: p.lat, lon: p.lon, name: "WP" + (cur.wps.length + 1) }); $("cIn").value = ""; changed(); if (map) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 12) }); }
    catch(err){ $("cErr").textContent = err.message; } };
  $("newRoute").onclick = () => select(-1);
  $("revRoute").onclick = () => { cur.wps.reverse(); changed(); };
  $("saveRoute").onclick = async () => {
    try { const f = await call(mm.saveRoute(cur.name, FKGpx.toGpx(cur), cur.file)); cur.file = f; dirty = false; await loadRoutes(); const i = routes.findIndex(r => r.file === f); cur.idx = i; render(); toast("Saved as Routes/" + f + ". The phone lists it after the next Nextcloud sync."); }
    catch(e){ toast(e.message, 6000); } };
  $("expRoute").onclick = async () => { try { const p = await call(mm.exportRoute(cur.name, FKGpx.toGpx(cur))); if (p) toast("Exported: " + p); } catch(e){ toast(e.message, 6000); } };
  $("delRoute").onclick = async () => { if (!cur.file || !confirm("Delete the route \"" + cur.name + "\"? It is removed from the Nextcloud Routes folder.")) return; await call(mm.deleteRoute(cur.file)); dirty = false; await loadRoutes(); select(routes[0] ? 0 : -1); toast("Route deleted."); };
  $("impRoute").onclick = async () => {
    try { const r = await call(mm.importRoute()); if (!r) return; const p = FKGpx.parseGpx(r.gpx, r.name); if (!p.length) throw new Error("No route or waypoints in this file.");
      if (dirty && !confirm("Discard the changes to \"" + cur.name + "\"?")) return; dirty = false;
      cur = { file: null, name: p[0].name, wps: p[0].wps, idx: -1 }; dirty = true; render(); fit(); toast("Imported " + p[0].wps.length + " waypoints. Save it to put it on the phone."); }
    catch(e){ toast(e.message, 6000); } };

  // ---------- Settings ----------
  function fillSettings(){
    if (!S) return; const c = S.cfg;
    $("sFolder").value = c.folder || ""; $("sCheck").checked = !!c.checkUpdates; $("sKeep").checked = !!c.keepOld; $("sDecl").value = c.decl || 0;
    $("sBase").value = c.baseUrl || ""; $("sTerr").value = c.terrainUrl || ""; $("sSaved").textContent = "";
    $("sFolderState").innerHTML = S.folder.exists ? (S.folder.synced ? "Folder found, inside your Nextcloud folder." : "Folder found. Make sure it is inside the folder the Nextcloud client syncs.") : '<span class="bad">This folder does not exist yet; it is created when the first map is saved.</span>';
  }
  $("pickF").onclick = async () => { const f = await call(mm.pickFolder()); if (f) $("sFolder").value = f; };
  $("saveS").onclick = async () => {
    const base = $("sBase").value.trim(), terr = $("sTerr").value.trim();
    if ((base && !/^https:\/\/\S+\.pmtiles$/i.test(base)) || (terr && !/^https:\/\/\S+\.pmtiles$/i.test(terr))){ $("sSaved").textContent = ""; toast("Map data addresses must start with https:// and end with .pmtiles.", 6000); return; }
    await call(mm.saveSettings({ folder: $("sFolder").value.trim(), checkUpdates: $("sCheck").checked, keepOld: $("sKeep").checked, decl: Math.max(-30, Math.min(30, +$("sDecl").value || 0)), baseUrl: base, terrainUrl: terr || "https://download.mapterhorn.com/planet.pmtiles" }));
    est = {}; await refresh(); fillSettings(); $("sSaved").textContent = "Saved"; if (map){ await loadRegions(); render(); }
  };

  // ---------- start ----------
  (async () => {
    try { await refresh(); } catch(e){ toast("Could not start: " + e.message, 10000); return; }
    showTab();
    if (S.cfg.checkUpdates && S.catalog.maps.length){ try { const u = await call(mm.updates()); latest = u.latest; outdated = u.outdated; renderMaps(); } catch(e){ /* offline: no update check */ } }
  })();
})();
