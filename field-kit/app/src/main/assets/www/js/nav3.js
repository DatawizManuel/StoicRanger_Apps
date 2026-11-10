/* SR Field Kit 0.4.0 — Navigate: offline map, routes with tick-off, position from two bearings, map downloads from
   the user's Nextcloud (remarks #7, #9) and the coordinate converter (#3).
   Map files: files/maps/*.pmtiles on the phone (MainActivity serves pieces at /maps/<name>?o=&l=), made by the
   Stoic Ranger Map Manager (maps.json catalog, format FK-1, or FK-2 when a file is split into parts: remark #13) in
   <map folder>/ on Nextcloud. Routes: GPX 1.1.
   db.json keys (add-only): sr-routes [{id, name, wps:[{lat,lon,name}], ticked, file, updated}], sr-route-cur,
   sr-maps [{id, name, date, bbox, base:{file,bytes,sha256}, terrain:{…}}], sr-maps-nc {fetched, catalog},
   sr-maps-cfg {folder, wifi}, sr-map-view {c, z}, sr-decl. The map libraries load only when the Map tab opens. */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const store = window.FKStore, N = window.FKNative || null, nav = window.__nav;
  if (!nav) return;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const R = 6371008.8, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const norm = x => ((x % 360) + 360) % 360;
  const geoDist = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
  const geoBrg = (a, b) => { const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon)); return norm(deg(Math.atan2(y, x))); };
  const mils = d => Math.round(norm(d) * 6400 / 360) % 6400;
  const fmtD = m => window.FKUnits ? FKUnits.dist(m) : (m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(2) + " km");
  const mag = trueBrg => norm(trueBrg - nav.decl());
  const brgTxt = t => { const m = mag(t); return `${String(Math.round(m) % 360).padStart(3, "0")}° · ${mils(m)} mil`; };
  const mgrs = (lat, lon, d) => (window.FKCoord && FKCoord.toMgrs(lat, lon, d)) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const toast = t => window.FK && FK.toast ? FK.toast(t) : null;
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- native calls with a callback (Nextcloud, file picker) ----------
  const cbs = {}; let cbn = 0;
  const prevCb = window.FKNativeCallback;
  window.FKNativeCallback = (id, res) => { if (cbs[id]){ const f = cbs[id]; delete cbs[id]; f(res); return; } if (prevCb) prevCb(id, res); };
  const call = fn => new Promise(res => { const id = "n3-" + (++cbn); cbs[id] = res; fn(id); });
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const unb64 = b => { const s = atob(b || ""); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const nc = (method, path, body, depth) => call(id => N.ncRequest(method, path, body ? b64(body) : "", "", depth || "", id));
  const ncText = r => new TextDecoder().decode(unb64(r.body));
  const ncReady = () => { if (!N || !N.ncRequest) return "Nextcloud works in the Android app."; const C = window.FKSync ? FKSync.cfg() : {}; return C.url && C.user && C.hasPassword ? "" : "Set up your Nextcloud first: ⋯ › Where your data is stored (address, user name, app password)."; };
  const ncWhy = r => r.status === 401 ? "Nextcloud refused the login. Check the app password." : r.status === 404 ? "Not found on Nextcloud." : r.status ? "Nextcloud answered " + r.status + "." : (r.error || "No connection to Nextcloud.");
  const mapsCfg = () => Object.assign({ folder: "/StoicRanger_Maps/", wifi: true }, store.get("sr-maps-cfg", {}));
  const folder = () => { let f = (mapsCfg().folder || "/StoicRanger_Maps/").trim(); if (!f.startsWith("/")) f = "/" + f; if (!f.endsWith("/")) f += "/"; return f; };

  // ================= COORDINATE CONVERTER (#3) =================
  const CP = document.querySelector('[data-npane="conv"]');
  CP.innerHTML = `
    <div class="form"><div class="field span2"><label for="cvIn">Coordinates (MGRS, UTM, lat/lon, degrees-minutes-seconds)</label><input id="cvIn" type="text" autocomplete="off" spellcheck="false" placeholder="32T PT 80467 35932 · 47.2692, 11.4041"></div></div>
    <p class="note" id="cvMsg" aria-live="polite">Type or paste coordinates from a map or a radio message.</p>
    <div class="results" id="cvOut"></div>
    <div class="savebar"><div class="field grow"><label for="cvName">Name</label><input id="cvName" type="text" maxlength="40" placeholder="RV 2, hut, target"></div><button class="button ghost" id="cvSave" type="button" disabled>Save as point</button></div>
    <div class="actions start wrap"><button class="button ghost" id="cvTgt" type="button" disabled>Use as target</button><button class="button ghost" id="cvMapB" type="button" disabled>Show on map</button><button class="button ghost" id="cvHere" type="button" disabled>Set as my position</button></div>
    <p class="formula">All on the WGS84 datum (GPS, most modern maps). Examples: <code>32T PT 8046 3593</code> · <code>32T 680467 5235932</code> · <code>47.2692, 11.4041</code> · <code>47°16'09"N 11°24'15"E</code> · <code>47 16.15 N 11 24.25 E</code>. A 4-, 6- or 8-figure MGRS gives the south-west corner of its square.</p>`;
  let cvPos = null;
  function convert(){
    const t = $("cvIn").value; cvPos = null;
    ["cvSave", "cvTgt", "cvMapB", "cvHere"].forEach(id => $(id).disabled = true);
    if (!t.trim()){ $("cvOut").innerHTML = ""; $("cvMsg").textContent = "Type or paste coordinates from a map or a radio message."; $("cvMsg").classList.remove("bad"); return; }
    try { cvPos = FKCoord.parse(t); } catch (e){ $("cvOut").innerHTML = ""; $("cvMsg").textContent = e.message; $("cvMsg").classList.add("bad"); return; }
    const f = FKCoord.format(cvPos.lat, cvPos.lon);
    $("cvMsg").classList.remove("bad"); $("cvMsg").textContent = "Read as " + f.dd;
    $("cvOut").innerHTML = [["MGRS (1 m)", f.mgrs], ["MGRS 8-figure (10 m)", mgrs(cvPos.lat, cvPos.lon, 4)], ["MGRS 6-figure (100 m)", mgrs(cvPos.lat, cvPos.lon, 3)], ["UTM", f.utm],
      ["Decimal degrees", f.dd], ["Degrees, decimal minutes", f.ddm.replace("  ", "<br>")], ["Degrees, min, sec", f.dms.replace("  ", "<br>")],
      ["From your position", nav.here() ? fmtD(geoDist(nav.here(), cvPos)) + " · " + brgTxt(geoBrg(nav.here(), cvPos)) : "–"]]
      .map(([k, v]) => `<div><small>${k}</small><span class="val">${v}</span></div>`).join("");
    ["cvSave", "cvTgt", "cvMapB", "cvHere"].forEach(id => $(id).disabled = false);
  }
  $("cvIn").addEventListener("input", convert);
  $("cvSave").onclick = () => { if (!cvPos) return; nav.addPoint($("cvName").value.trim(), cvPos.lat, cvPos.lon); toast("Saved as point"); $("cvName").value = ""; };
  $("cvTgt").onclick = () => { if (!cvPos) return; nav.setTarget(cvPos.lat, cvPos.lon); ntab("pos"); };
  $("cvHere").onclick = () => { if (!cvPos) return; nav.setHere(cvPos, "typed"); toast("Set as your position"); };
  $("cvMapB").onclick = () => { if (!cvPos) return; const p = cvPos; ntab("map"); ensureMap().then(m => { if (m){ m.jumpTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 14) }); showPin(p); } }); };
  const ntab = t => { const b = document.querySelector(`[data-ntab="${t}"]`); if (b) b.click(); };

  // ================= MAP & ROUTES =================
  const MP = document.querySelector('[data-npane="map"]');
  MP.innerHTML = `
    <div class="mapbox" id="mapBox">
      <div class="fkmap" id="fkMap"></div>
      <div class="mapmsg" id="mapMsg" hidden></div>
      <div class="mapbtns"><button type="button" id="mMe" aria-label="My position">◎</button><button type="button" id="mFull" aria-label="Full screen">⤢</button></div>
      <div class="maphint" id="mapHint" hidden></div>
    </div>
    <div class="seg mseg" role="group" aria-label="Map tool">
      <button type="button" data-mtab="route" aria-pressed="true">Route</button>
      <button type="button" data-mtab="fix" aria-pressed="false">Position from bearings</button>
      <button type="button" data-mtab="maps" aria-pressed="false">Maps</button>
    </div>

    <div class="field decl3"><label for="mDecl">Declination (° east +, from your map or a calculator)</label><input id="mDecl" type="number" step="0.1"></div>
    <div data-mpane="route">
      <div class="routebar"><div class="field grow"><label for="rtPick">Route</label><select id="rtPick"></select></div><button class="button ghost" id="rtNew" type="button">New route</button></div>
      <div id="rtBody">
        <div class="navbox" id="rtNav" aria-live="polite"></div>
        <div class="actions start wrap"><button class="button" id="rtTick" type="button">✓ Passed</button><button class="button ghost" id="rtUndo" type="button">Undo</button><button class="button ghost" id="rtGps" type="button" aria-pressed="false">Follow GPS</button></div>
        <label class="check"><input type="checkbox" id="rtAuto"> With GPS: tick off a waypoint automatically within 25 m</label>
        <div class="subhead"><h3 class="m0">Waypoints</h3><span class="note" id="rtTotal"></span></div>
        <label class="check"><input type="checkbox" id="rtEdit"> Edit the route: tap the map to add waypoints</label>
        <div id="rtList"></div>
        <div class="addwp" id="rtAdd" hidden>
          <div class="savebar"><div class="field grow"><label for="rtCo">Add by coordinates</label><input id="rtCo" type="text" autocomplete="off" spellcheck="false" placeholder="32T PT 8046 3593 or 47.26, 11.39"></div><button class="button ghost" id="rtCoAdd" type="button">Add</button></div>
          <p class="note bad" id="rtCoErr"></p>
          <div class="savebar"><div class="field grow"><label for="rtPt">Add a saved point</label><select id="rtPt"></select></div><button class="button ghost" id="rtHereAdd" type="button">Add my position</button></div>
          <div class="field"><label for="rtName">Route name</label><input id="rtName" type="text" maxlength="60"></div>
        </div>
        <div class="actions start wrap"><button class="button ghost" id="rtExport" type="button">Export GPX</button><button class="button ghost" id="rtNcUp" type="button">Save to Nextcloud</button><button class="button ghost" id="rtRev" type="button">Reverse</button><button class="button ghost" id="rtDel" type="button">Delete</button></div>
        <div class="confirm" id="rtDelAsk" hidden><p>Delete this route from the phone? A file on Nextcloud stays.</p><div class="actions start"><button type="button" class="button" id="rtDelYes">Delete</button><button type="button" class="button ghost" id="rtDelNo">Keep</button></div></div>
      </div>
      <div class="subhead"><h3 class="m0">Get routes</h3></div>
      <div class="actions start wrap"><button class="button ghost" id="rtImport" type="button">Import GPX file</button><button class="button ghost" id="rtNc" type="button">Routes on Nextcloud</button></div>
      <p class="note" id="rtMsg" aria-live="polite"></p>
      <div id="rtNcList"></div>
      <p class="formula">Tick off each waypoint as you pass it: the bearing and distance then run from that waypoint to the next one, so it works with a compass alone. Bearings are magnetic (declination from Position &amp; grid) in degrees and NATO mils. Routes are GPX files: plan them in the Stoic Ranger Map Manager on your PC (they appear under "Routes on Nextcloud") or in any map app.</p>
    </div>

    <div data-mpane="fix" hidden>
      <p class="note">Take a compass bearing to two landmarks you can see and find on the map (summit, mast, church). Your position is where the two back bearings cross. Best when the bearings are 60° to 120° apart.</p>
      <div class="fixrow" data-fx="0"><b class="fxn">1</b><div class="grow"><div class="fxwhat" id="fxW0">Landmark 1: not set</div>
        <div class="fxctl"><button class="button ghost" type="button" data-fxpick="0">Tap on map</button><select data-fxpt="0" aria-label="Landmark 1 from saved points"></select></div>
        <div class="field"><label for="fxB0">Bearing to it</label><input id="fxB0" type="number" step="any" inputmode="decimal"></div></div></div>
      <div class="fixrow" data-fx="1"><b class="fxn">2</b><div class="grow"><div class="fxwhat" id="fxW1">Landmark 2: not set</div>
        <div class="fxctl"><button class="button ghost" type="button" data-fxpick="1">Tap on map</button><select data-fxpt="1" aria-label="Landmark 2 from saved points"></select></div>
        <div class="field"><label for="fxB1">Bearing to it</label><input id="fxB1" type="number" step="any" inputmode="decimal"></div></div></div>
      <div class="field"><label for="fxUnit">Bearings in</label><select id="fxUnit"><option value="deg">degrees, magnetic (compass)</option><option value="mil">mils, magnetic (compass)</option><option value="degT">degrees, true (map)</option></select></div>
      <div class="results" id="fxOut"></div>
      <div class="actions start wrap"><button class="button" id="fxUse" type="button" disabled>Use as my position</button><button class="button ghost" id="fxSave" type="button" disabled>Save as point</button><button class="button ghost" id="fxClear" type="button">Clear</button></div>
      <p class="formula">Magnetic bearings are turned into true ones with the declination from Position &amp; grid. A bearing error of 2° moves the result by about 35 m per kilometre to the landmark.</p>
    </div>

    <div data-mpane="maps" hidden>
      <div class="form"><div class="field span2"><label for="mFolder">Map folder on Nextcloud</label><input id="mFolder" type="text" autocomplete="off" spellcheck="false" placeholder="/StoicRanger_Maps/"></div></div>
      <label class="check"><input type="checkbox" id="mWifi" checked> Download maps on Wi-Fi only</label>
      <div class="actions start wrap"><button class="button" id="mCheck" type="button">Check Nextcloud</button><button class="button ghost" id="mImport" type="button">Import a map file</button></div>
      <p class="note" id="mMsg" aria-live="polite"></p>
      <div class="dlbox" id="mDl" hidden><div class="dlbar"><i id="mDlBar"></i></div><div class="dlrow"><span id="mDlTxt"></span><button class="button ghost" id="mDlStop" type="button">Stop</button></div></div>
      <div id="mList"></div>
      <p class="note" id="mFree"></p>
      <p class="formula">Region maps are made with the Stoic Ranger Map Manager on your PC: map with roads, paths, names, plus terrain for hill shading and contour lines (one fixed format). It saves them into this folder of your Nextcloud; the phone downloads them from there and then works without signal. Map data © OpenStreetMap contributors (ODbL), layout Protomaps, terrain Mapterhorn.</p>
    </div>`;

  // ---------- map (lazy) ----------
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("could not load " + src)); document.head.appendChild(s); });
  let map = null, mapP = null, mode = "route", pickFor = -1, gps = null, watch = null, pin = null;
  const dark = () => document.documentElement.dataset.theme === "dark";
  function mapMsg(t){ $("mapMsg").innerHTML = t || ""; $("mapMsg").hidden = !t; }
  function hint(t){ $("mapHint").textContent = t || ""; $("mapHint").hidden = !t; }
  function ensureMap(){
    if (mapP) return mapP;
    mapP = (async () => {
      try {
        for (const f of ["maplibre-gl.js", "pmtiles.js", "maplibre-contour.js", "protomaps-basemaps.js"]) await loadScript("map/lib/" + f);
        await loadScript("map/fkmap.js");
        await loadRegions(true);
        const v = store.get("sr-map-view", null), h = nav.here();
        map = FKMap.create($("fkMap"), { dark: dark(), imperial: window.FKUnits && FKUnits.imp(), center: v ? v.c : h ? [h.lon, h.lat] : regionCenter() || undefined, zoom: v ? v.z : h ? 13 : regionCenter() ? 9 : undefined });
        map.on("moveend", () => { const c = map.getCenter(); store.put("sr-map-view", { c: [+c.lng.toFixed(5), +c.lat.toFixed(5)], z: +map.getZoom().toFixed(2) }); });
        map.on("click", e => onMapTap({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
        map.on("zoom", () => drawMe());
        map.on("load", () => { drawAll(); });
        new MutationObserver(() => { if (map && map.fkDark !== dark()){ FKMap.restyle(map, dark()); map.once("styledata", drawAll); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return map;
      } catch (e){
        mapMsg("The map can't be shown on this phone: " + esc(e.message) + ". Routes, bearings and the converter still work.");
        if (window.FK && FK.errors) FK.errors.push("map: " + e.message);
        return null;
      }
    })();
    return mapP;
  }
  let regionInfo = [];
  const regionCenter = () => { const r = regionInfo.find(x => x.bbox); return r ? [(r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2] : null; };

  // ---------- map files on the phone ----------
  const phoneFiles = () => { if (!N || !N.mapList) return window.__testMapFiles || []; try { return JSON.parse(N.mapList()) || []; } catch (e){ return []; } };
  const reader = file => async (o, l) => {
    try { const r = await fetch("/maps/" + encodeURIComponent(file) + "?o=" + o + "&l=" + l, { cache: "no-store" }); if (r.ok){ const b = await r.arrayBuffer(); if (b.byteLength || !l) return b; } } catch (e){ }
    if (N && N.mapRead){ const b = N.mapRead(file, o, l); if (b != null) return unb64(b).buffer; }
    throw new Error("Map file can't be read: " + file);
  };
  /** Phone catalog (sr-maps) brought in line with the files that are really there; loose files get an entry. */
  function phoneMaps(){
    const files = phoneFiles(), have = new Set(files.map(f => f.name)), size = n => (files.find(f => f.name === n) || {}).bytes || 0;
    let list = store.get("sr-maps", []), changed = false;
    files.forEach(f => {
      if (list.some(m => (m.base && m.base.file === f.name) || (m.terrain && m.terrain.file === f.name))) return;
      const terr = /-terrain\.pmtiles$/i.test(f.name), id = f.name.replace(/(-terrain)?\.pmtiles$/i, "");
      let m = list.find(x => x.id === id); if (!m){ m = { id, name: id, date: "", imported: true }; list.push(m); }
      m[terr ? "terrain" : "base"] = { file: f.name, bytes: f.bytes }; changed = true;
    });
    if (changed) store.set("sr-maps", list);
    return list.map(m => Object.assign({}, m, { hasBase: !!(m.base && have.has(m.base.file)), hasTerrain: !!(m.terrain && have.has(m.terrain.file)), bytes: (m.base ? size(m.base.file) : 0) + (m.terrain ? size(m.terrain.file) : 0) }));
  }
  async function loadRegions(first){
    if (!window.FKMap) return;
    const list = phoneMaps().filter(m => m.hasBase || m.hasTerrain);
    regionInfo = await FKMap.setRegions(list.map(m => ({ key: m.id, name: m.name, base: m.hasBase ? reader(m.base.file) : null, dem: m.hasTerrain ? reader(m.terrain.file) : null })));
    if (!list.length) mapMsg('No map on this phone yet. Open <b>Maps</b> below to download a region from your Nextcloud. Routes and bearings work without a map too.'); else mapMsg("");
    if (!first && map){ FKMap.restyle(map, dark()); map.once("styledata", drawAll); }
  }

  // ---------- drawing ----------
  function drawAll(){ if (!map) return; drawRoute(); drawPoints(); drawMe(); }
  function drawPoints(){
    if (!map) return;
    if (mode === "fix"){ const pts = fx.lm.map((p, i) => p && { lat: p.lat, lon: p.lon, name: "L" + (i + 1) + (p.name ? " " + p.name : "") }).filter(Boolean); if (fx.res) pts.push({ lat: fx.res.lat, lon: fx.res.lon, name: "You (from bearings)" }); FKMap.setPoints(map, pts); return; }
    FKMap.setPoints(map, nav.points.concat(pin ? [pin] : []));
  }
  function drawRoute(){ if (!map) return; const r = cur(); if (mode === "fix" || !r) FKMap.setRoute(map, [], 0); else FKMap.setRoute(map, r.wps, r.ticked || 0); }
  function drawMe(){ if (!map) return; const h = nav.here(); FKMap.setMe(map, gps || (h && h.src === "GPS" && Date.now() - (h.t || 0) < 3600e3 ? h : null)); }
  function showPin(p){ pin = { lat: p.lat, lon: p.lon, name: "⌖" }; drawPoints(); }
  nav.onPoints = () => { drawPoints(); fillPointSelects(); };

  $("mMe").onclick = () => {
    const go = p => { ensureMap().then(m => { if (m) m.flyTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 14) }); }); };
    if (gps) return go(gps);
    if (!("geolocation" in navigator)) return toast("No position available");
    toast("Getting a fix…");
    navigator.geolocation.getCurrentPosition(p => { gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; drawMe(); renderNav(); go(gps); },
      () => toast("No fix. Allow location, or try again in the open."), { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  };
  const box = $("mapBox");
  function setFull(on){ box.classList.toggle("full", on); box.classList.toggle("fkover", on); $("mFull").textContent = on ? "✕" : "⤢"; setTimeout(() => map && map.resize(), 50); }
  box.fkClose = () => setFull(false);
  $("mFull").onclick = () => setFull(!box.classList.contains("full"));

  function onMapTap(p){
    if (mode === "fix" && pickFor >= 0){ fx.lm[pickFor] = { lat: p.lat, lon: p.lon, name: "" }; pickFor = -1; hint(""); fixCalc(); return; }
    if (mode === "route" && $("rtEdit").checked){ let r = cur(); if (!r) r = newRoute(); r.wps.push({ lat: p.lat, lon: p.lon, name: "WP" + (r.wps.length + 1) }); saveRoutes(); renderRoute(); }
  }

  // ---------- map tool tabs ----------
  document.querySelectorAll("[data-mtab]").forEach(b => b.onclick = () => {
    mode = b.dataset.mtab;
    document.querySelectorAll("[data-mtab]").forEach(x => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-mpane]").forEach(p => p.hidden = p.dataset.mpane !== mode);
    pickFor = -1;
    hint(mode === "route" && $("rtEdit").checked ? "Tap the map to add a waypoint" : "");
    if (mode === "maps") renderMaps();
    drawAll();
  });
  window.addEventListener("fk-ntab", e => { if (e.detail === "map") ensureMap().then(m => m && setTimeout(() => m.resize(), 30)); else stopGps(); });
  window.addEventListener("hashchange", () => { if (location.hash !== "#nav"){ stopGps(); setFull(false); } });

  // ================= ROUTES (#9) =================
  let routes = store.get("sr-routes", []);
  if (!Array.isArray(routes)) routes = [];
  const cur = () => routes.find(r => r.id === store.get("sr-route-cur", "")) || null;
  const saveRoutes = () => { const r = cur(); if (r) r.updated = new Date().toISOString(); store.set("sr-routes", routes); };
  function newRoute(name, wps, extra){
    const r = Object.assign({ id: uid("r-"), name: name || "Route " + (routes.length + 1), wps: wps || [], ticked: 0, updated: new Date().toISOString() }, extra || {});
    routes.push(r); store.set("sr-route-cur", r.id); saveRoutes(); return r;
  }
  function fillPointSelects(){
    const opts = `<option value="">–</option>` + nav.points.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("");
    $("rtPt").innerHTML = opts; document.querySelectorAll("[data-fxpt]").forEach(s => s.innerHTML = opts.replace("–", "or a saved point"));
  }
  function renderPick(){
    const r = cur();
    $("rtPick").innerHTML = (routes.length ? "" : `<option value="">No routes yet</option>`) + routes.map(x => `<option value="${esc(x.id)}"${r && r.id === x.id ? " selected" : ""}>${esc(x.name)}${x.ticked ? " · " + Math.min(x.ticked, x.wps.length) + "/" + x.wps.length : ""}</option>`).join("");
    if (!r && routes.length){ store.set("sr-route-cur", routes[0].id); }
  }
  function legs(r){ const out = []; for (let i = 0; i + 1 < r.wps.length; i++) out.push({ d: geoDist(r.wps[i], r.wps[i + 1]), b: geoBrg(r.wps[i], r.wps[i + 1]) }); return out; }
  function renderNav(){
    const r = cur(), el = $("rtNav");
    if (!r || !r.wps.length){ el.innerHTML = `<p class="note">${r ? "No waypoints yet. Switch on Edit and tap the map, or add coordinates." : "Make a new route, import a GPX file or load one from Nextcloud."}</p>`; $("rtTick").disabled = $("rtUndo").disabled = true; return; }
    const t = Math.min(r.ticked || 0, r.wps.length), L = legs(r), next = r.wps[t];
    $("rtUndo").disabled = t === 0; $("rtTick").disabled = t >= r.wps.length;
    if (t >= r.wps.length){ el.innerHTML = `<div class="navnext done"><small>Route done</small><b>All ${r.wps.length} waypoints passed</b></div>`; $("rtTick").textContent = "✓ Passed"; return; }
    $("rtTick").textContent = "✓ Passed " + (t + 1);
    const left = L.slice(t).reduce((a, x) => a + x.d, 0);
    let from = "";
    if (t > 0){ const d = geoDist(r.wps[t - 1], next), b = geoBrg(r.wps[t - 1], next); from = `<div class="navleg"><small>From ${t} ${esc(r.wps[t - 1].name || "")} (passed)</small><b>${brgTxt(b)}</b><span>${fmtD(d)}</span></div>`; }
    else from = `<div class="navleg"><small>Start</small><span>Go to waypoint 1 and tap "Passed" there. Then the bearing to waypoint 2 shows here.</span></div>`;
    let me = "";
    if (gps){ const d = geoDist(gps, next), b = geoBrg(gps, next); me = `<div class="navleg gps"><small>From you (GPS ± ${Math.round(gps.acc || 0)} m)</small><b>${brgTxt(b)}</b><span>${fmtD(d)}</span></div>`; }
    el.innerHTML = `<div class="navnext"><small>Next: waypoint ${t + 1} of ${r.wps.length}</small><b>${esc(next.name || "WP" + (t + 1))}</b><span class="mono">${esc(mgrs(next.lat, next.lon, 4))}</span></div>${from}${me}<p class="note">Still to go: ${fmtD(left + (t > 0 ? geoDist(r.wps[t - 1], next) : 0))} (straight lines)</p>`;
  }
  function renderList(){
    const r = cur(), edit = $("rtEdit").checked;
    $("rtAdd").hidden = !edit || !r;
    if (!r){ $("rtList").innerHTML = ""; $("rtTotal").textContent = ""; return; }
    const L = legs(r), t = r.ticked || 0;
    $("rtTotal").textContent = r.wps.length + " waypoint" + (r.wps.length === 1 ? "" : "s") + " · " + fmtD(L.reduce((a, x) => a + x.d, 0));
    $("rtList").innerHTML = r.wps.map((w, i) => `<div class="wprow${i < t ? " ticked" : ""}${i === t ? " next" : ""}"><b class="wpn">${i < t ? "✓" : i + 1}</b><div class="wpm">${edit ? `<input type="text" value="${esc(w.name)}" data-wpname="${i}" aria-label="Name of waypoint ${i + 1}" maxlength="60">` : `<span class="wpname">${esc(w.name || "WP" + (i + 1))}</span>`}<span class="wpco">${esc(mgrs(w.lat, w.lon, 4))}</span></div>${edit ? `<span class="wpbtns"><button type="button" data-wpup="${i}" aria-label="Move up"${i ? "" : " disabled"}>↑</button><button type="button" data-wpdn="${i}" aria-label="Move down"${i + 1 < r.wps.length ? "" : " disabled"}>↓</button><button type="button" data-wpdel="${i}" aria-label="Delete waypoint">×</button></span>` : ""}</div>`
      + (L[i] ? `<div class="wpleg">${fmtD(L[i].d)} · ${brgTxt(L[i].b)}</div>` : "")).join("");
    if (edit) $("rtName").value = r.name;
  }
  function renderRoute(){ renderPick(); renderNav(); renderList(); drawRoute(); const r = cur(); ["rtExport", "rtNcUp", "rtRev", "rtDel"].forEach(id => $(id).disabled = !r || (!r.wps.length && id !== "rtDel")); }
  $("rtPick").onchange = () => { store.set("sr-route-cur", $("rtPick").value); $("rtDelAsk").hidden = true; renderRoute(); fitRoute(); };
  $("rtNew").onclick = () => { newRoute(); $("rtEdit").checked = true; hint("Tap the map to add a waypoint"); renderRoute(); };
  $("rtEdit").onchange = () => { hint($("rtEdit").checked && mode === "route" ? "Tap the map to add a waypoint" : ""); renderList(); };
  $("rtTick").onclick = () => tick(+1);
  $("rtUndo").onclick = () => tick(-1);
  function tick(d){ const r = cur(); if (!r) return; r.ticked = Math.max(0, Math.min(r.wps.length, (r.ticked || 0) + d)); saveRoutes(); store.flush(); renderRoute(); if (d > 0 && navigator.vibrate) navigator.vibrate(60); }
  $("rtList").addEventListener("click", e => {
    const r = cur(); if (!r) return; const b = e.target.closest("button"); if (!b) return;
    const i = +(b.dataset.wpup || b.dataset.wpdn || b.dataset.wpdel);
    if (b.dataset.wpup != null && i > 0) r.wps.splice(i - 1, 0, r.wps.splice(i, 1)[0]);
    else if (b.dataset.wpdn != null && i + 1 < r.wps.length) r.wps.splice(i + 1, 0, r.wps.splice(i, 1)[0]);
    else if (b.dataset.wpdel != null){ r.wps.splice(i, 1); if ((r.ticked || 0) > i) r.ticked--; }
    else return;
    saveRoutes(); renderRoute();
  });
  $("rtList").addEventListener("change", e => { const i = e.target.dataset.wpname; const r = cur(); if (i == null || !r) return; r.wps[+i].name = e.target.value.trim().slice(0, 60); saveRoutes(); renderNav(); drawRoute(); });
  $("rtName").addEventListener("change", () => { const r = cur(); if (!r) return; r.name = $("rtName").value.trim().slice(0, 60) || r.name; saveRoutes(); renderPick(); });
  const addWp = (p, name) => { let r = cur(); if (!r) r = newRoute(); r.wps.push({ lat: p.lat, lon: p.lon, name: name || "WP" + (r.wps.length + 1) }); saveRoutes(); renderRoute(); };
  $("rtCoAdd").onclick = () => { try { addWp(FKCoord.parse($("rtCo").value)); $("rtCo").value = ""; $("rtCoErr").textContent = ""; } catch (e){ $("rtCoErr").textContent = e.message; } };
  $("rtPt").onchange = () => { const p = nav.points[+$("rtPt").value]; if (p) addWp(p, p.name); $("rtPt").value = ""; };
  $("rtHereAdd").onclick = () => { const p = gps || nav.here(); if (!p) return toast("No position yet: tap ◎ on the map or use Position & grid"); addWp(p, "My position"); };
  $("rtRev").onclick = () => { const r = cur(); if (!r) return; r.wps.reverse(); r.ticked = 0; saveRoutes(); renderRoute(); toast("Route reversed; ticks cleared"); };
  $("rtDel").onclick = () => { $("rtDelAsk").hidden = false; };
  $("rtDelNo").onclick = () => { $("rtDelAsk").hidden = true; };
  $("rtDelYes").onclick = () => { const r = cur(); $("rtDelAsk").hidden = true; if (!r) return; routes = routes.filter(x => x !== r); store.set("sr-route-cur", routes[0] ? routes[0].id : ""); store.set("sr-routes", routes); renderRoute(); toast("Route deleted"); };
  function fitRoute(){ const r = cur(); if (!map || !r || !r.wps.length) return; if (r.wps.length === 1) return map.jumpTo({ center: [r.wps[0].lon, r.wps[0].lat], zoom: 14 });
    const lo = r.wps.map(w => w.lon), la = r.wps.map(w => w.lat); map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 40, maxZoom: 15, duration: 0 }); }
  const safeName = n => (String(n || "Route").replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Route");

  // import / export
  function importGpx(text, name, extra){
    const found = FKGpx.parseGpx(text, String(name || "Route").replace(/\.gpx$/i, ""));
    if (!found.length) throw new Error("No waypoints in this file.");
    let last = null;
    found.forEach(f => {
      const same = extra && extra.file ? routes.find(r => r.file === extra.file) : null;
      if (same){ const keep = same.wps.length === f.wps.length ? same.ticked : 0; Object.assign(same, { name: f.name, wps: f.wps, ticked: keep }); store.set("sr-route-cur", same.id); last = same; saveRoutes(); }
      else last = newRoute(f.name, f.wps, extra);
    });
    renderRoute(); fitRoute();
    return found.length === 1 ? `"${last.name}" with ${last.wps.length} waypoints` : found.length + " routes";
  }
  $("rtImport").onclick = async () => {
    let o;
    if (N && N.pickFile){ const r = await call(id => N.pickFile("gpx", id)); if (!r.ok){ if (r.msg !== "cancelled") $("rtMsg").textContent = r.msg; return; } try { o = JSON.parse(r.msg); } catch (e){ return; } }
    else if (N && N.openFile){ const r = await call(id => N.openFile("", id)); if (!r.ok){ if (r.msg !== "cancelled") $("rtMsg").textContent = r.msg; return; } o = { name: r.msg, text: new TextDecoder().decode(unb64(r.data)) }; }   // iPhone web app
    else return toast("Import works in the app");
    try { $("rtMsg").textContent = "Imported " + importGpx(o.text, o.name) + "."; } catch (e){ $("rtMsg").textContent = e.message; }
  };
  $("rtExport").onclick = async () => {
    const r = cur(); if (!r || !N || !N.saveFile) return;
    const res = await call(id => N.saveFile(safeName(r.name) + ".gpx", "application/gpx+xml", b64(FKGpx.toGpx(r)), id));
    if (res.ok) toast("Saved " + res.msg); else if (res.msg !== "cancelled") toast(res.msg);
  };
  $("rtNcUp").onclick = async () => {
    const r = cur(); if (!r) return; const why = ncReady(); if (why){ $("rtMsg").textContent = why; return; }
    $("rtMsg").textContent = "Saving to Nextcloud …";
    await nc("MKCOL", folder()); await nc("MKCOL", folder() + "Routes/");
    const file = r.file || safeName(r.name) + ".gpx", put = await nc("PUT", folder() + "Routes/" + file, FKGpx.toGpx(r));
    if (put.status >= 200 && put.status < 300){ r.file = file; saveRoutes(); $("rtMsg").textContent = "Saved as " + folder() + "Routes/" + file; }
    else $("rtMsg").textContent = "Not saved: " + ncWhy(put);
  };
  $("rtNc").onclick = async () => {
    const why = ncReady(); if (why){ $("rtMsg").textContent = why; return; }
    $("rtMsg").textContent = "Looking in " + folder() + "Routes/ …"; $("rtNcList").innerHTML = "";
    const r = await nc("PROPFIND", folder() + "Routes/", '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>', "1");
    if (r.status !== 207){ $("rtMsg").textContent = r.status === 404 ? "No Routes folder in " + folder() + " yet. Save a route from the Map Manager or from here first." : ncWhy(r); return; }
    const doc = new DOMParser().parseFromString(ncText(r), "application/xml");
    const files = [...doc.getElementsByTagNameNS("DAV:", "response")].map(x => { const h = x.getElementsByTagNameNS("DAV:", "href")[0]; const m = x.getElementsByTagNameNS("DAV:", "getlastmodified")[0]; return { name: decodeURIComponent((h ? h.textContent : "").replace(/\/$/, "").split("/").pop()), mod: m ? m.textContent : "" }; })
      .filter(f => /\.gpx$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    $("rtMsg").textContent = files.length ? files.length + " route" + (files.length === 1 ? "" : "s") + " on Nextcloud:" : "No GPX files in " + folder() + "Routes/.";
    $("rtNcList").innerHTML = files.map(f => { const have = routes.some(x => x.file === f.name); return `<div class="ncrow"><span>${esc(f.name.replace(/\.gpx$/i, ""))}<small>${f.mod ? esc(new Date(f.mod).toLocaleDateString()) : ""}${have ? " · on this phone" : ""}</small></span><button class="button ghost" type="button" data-ncget="${esc(f.name)}">${have ? "Update" : "Load"}</button></div>`; }).join("");
  };
  $("rtNcList").addEventListener("click", async e => {
    const b = e.target.closest("[data-ncget]"); if (!b) return; const f = b.dataset.ncget; b.disabled = true;
    const r = await nc("GET", folder() + "Routes/" + f);
    if (r.status !== 200){ $("rtMsg").textContent = ncWhy(r); b.disabled = false; return; }
    try { $("rtMsg").textContent = "Loaded " + importGpx(ncText(r), f, { file: f }) + "."; b.textContent = "Update"; } catch (x){ $("rtMsg").textContent = f + ": " + x.message; }
    b.disabled = false;
  });

  // GPS follow (+ auto tick-off within 25 m)
  function stopGps(){ if (watch != null){ navigator.geolocation.clearWatch(watch); watch = null; } $("rtGps").setAttribute("aria-pressed", "false"); $("rtGps").textContent = "Follow GPS"; }
  $("rtGps").onclick = () => {
    if (watch != null){ stopGps(); return; }
    if (!("geolocation" in navigator)) return toast("No GPS available");
    let first = true;
    $("rtGps").setAttribute("aria-pressed", "true"); $("rtGps").textContent = "Stop GPS";
    watch = navigator.geolocation.watchPosition(p => {
      gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      const r = cur();
      if (r && $("rtAuto").checked && (r.ticked || 0) < r.wps.length && geoDist(gps, r.wps[r.ticked || 0]) <= 25 && (gps.acc || 99) <= 30){ toast("Passed " + (r.wps[r.ticked || 0].name || "waypoint")); tick(+1); }
      drawMe(); renderNav();
      if (first && map){ first = false; map.easeTo({ center: [gps.lon, gps.lat], zoom: Math.max(map.getZoom(), 14) }); }
    }, e => { toast(e.code === 1 ? "Location permission refused" : "No GPS fix yet"); if (e.code === 1) stopGps(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  };
  $("rtAuto").checked = !!store.get("sr-route-auto", false);
  $("rtAuto").onchange = () => store.set("sr-route-auto", $("rtAuto").checked);
  const prevPause = window.FK && FK.pause;
  if (window.FK) FK.pause = () => { stopGps(); if (prevPause) prevPause(); };

  // ================= POSITION FROM TWO BEARINGS (#7) =================
  const fx = { lm: [null, null], res: null };
  document.querySelectorAll("[data-fxpick]").forEach(b => b.onclick = () => { pickFor = +b.dataset.fxpick; hint("Tap landmark " + (pickFor + 1) + " on the map"); ensureMap(); });
  document.querySelectorAll("[data-fxpt]").forEach(s => s.onchange = () => { const p = nav.points[+s.value]; if (p){ fx.lm[+s.dataset.fxpt] = { lat: p.lat, lon: p.lon, name: p.name }; fixCalc(); } s.value = ""; });
  ["fxB0", "fxB1", "fxUnit"].forEach(id => $(id).addEventListener("input", fixCalc));
  $("fxClear").onclick = () => { fx.lm = [null, null]; fx.res = null; $("fxB0").value = $("fxB1").value = ""; fixCalc(); };
  /** Position P from which landmark i is seen at true bearing b_i: the two back-bearing lines cross (local plane). */
  function resect(l1, b1, l2, b2){
    const k = Math.cos(rad((l1.lat + l2.lat) / 2)), X = p => rad(p.lon - l1.lon) * R * k, Y = p => rad(p.lat - l1.lat) * R;
    const d1 = [Math.sin(rad(b1)), Math.cos(rad(b1))], d2 = [Math.sin(rad(b2)), Math.cos(rad(b2))];
    const ex = X(l1) - X(l2), ey = Y(l1) - Y(l2), det = -d1[0] * d2[1] + d2[0] * d1[1];
    if (Math.abs(det) < Math.sin(rad(5))) return { err: "The two bearings are almost parallel: pick landmarks further apart in direction." };
    const t1 = (ex * -d2[1] + d2[0] * ey) / det, t2 = (d1[0] * ey - d1[1] * ex) / det;
    if (t1 <= 0 || t2 <= 0) return { err: "The bearings don't cross in front of the landmarks. Check the bearings and which landmark is which." };
    const x = X(l1) - t1 * d1[0], y = Y(l1) - t1 * d1[1];
    return { lat: l1.lat + deg(y / R), lon: l1.lon + deg(x / (R * k)), d1: t1, d2: t2 };
  }
  function fixCalc(){
    fx.lm.forEach((p, i) => $("fxW" + i).innerHTML = p ? `Landmark ${i + 1}${p.name ? ": " + esc(p.name) : ""} <span class="mono">${esc(mgrs(p.lat, p.lon, 4))}</span>` : `Landmark ${i + 1}: not set`);
    const u = $("fxUnit").value, raw = [$("fxB0").value, $("fxB1").value].map(v => v === "" ? NaN : +v);
    const toTrue = v => u === "mil" ? norm(v * 360 / 6400 + nav.decl()) : u === "degT" ? norm(v) : norm(v + nav.decl());
    fx.res = null; let out = "";
    if (!fx.lm[0] || !fx.lm[1]) out = `<div><small>Position</small><span class="val">Set both landmarks</span></div>`;
    else if (!isFinite(raw[0]) || !isFinite(raw[1])) out = `<div><small>Position</small><span class="val">Enter both bearings</span></div>`;
    else {
      const b1 = toTrue(raw[0]), b2 = toTrue(raw[1]), r = resect(fx.lm[0], b1, fx.lm[1], b2);
      if (r.err) out = `<div class="span2"><small>Position</small><span class="val bad">${r.err}</span></div>`;
      else {
        fx.res = r; let cut = Math.abs(b1 - b2) % 360; if (cut > 180) cut = 360 - cut;
        const q = cut < 30 || cut > 150 ? "poor: small errors move it a lot" : cut < 60 || cut > 120 ? "fair" : "good";
        out = [["Your position (MGRS)", mgrs(r.lat, r.lon, 4)], ["Lat / lon", r.lat.toFixed(5) + ", " + r.lon.toFixed(5)], ["Angle of cut", Math.round(cut) + "° · " + q], ["To landmarks", fmtD(r.d1) + " · " + fmtD(r.d2)]]
          .map(([k, v]) => `<div><small>${k}</small><span class="val">${v}</span></div>`).join("");
      }
    }
    $("fxOut").innerHTML = out; $("fxUse").disabled = $("fxSave").disabled = !fx.res;
    drawPoints();
    if (fx.res && map) map.easeTo({ center: [fx.res.lon, fx.res.lat] });
  }
  $("fxUse").onclick = () => { if (fx.res){ nav.setHere({ lat: fx.res.lat, lon: fx.res.lon }, "bearings"); toast("Set as your position"); } };
  $("fxSave").onclick = () => { if (fx.res){ nav.addPoint("From bearings " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), fx.res.lat, fx.res.lon); toast("Saved as point"); } };

  // ================= MAPS ON THE PHONE / ON NEXTCLOUD (#7) =================
  const MB = v => v >= 1e9 ? (v / 1e9).toFixed(2) + " GB" : Math.max(1, Math.round(v / 1e6)) + " MB";
  const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";
  $("mFolder").value = mapsCfg().folder; $("mWifi").checked = mapsCfg().wifi !== false;
  $("mFolder").addEventListener("change", () => { store.set("sr-maps-cfg", Object.assign(mapsCfg(), { folder: folder() === "/" ? "/StoicRanger_Maps/" : $("mFolder").value.trim() })); $("mFolder").value = folder(); });
  $("mWifi").onchange = () => store.set("sr-maps-cfg", Object.assign(mapsCfg(), { wifi: $("mWifi").checked }));
  let job = null;
  function renderMaps(){
    const ph = phoneMaps(), ncs = store.get("sr-maps-nc", null), cat = ncs && ncs.catalog && Array.isArray(ncs.catalog.maps) ? ncs.catalog.maps : [];
    const ids = [...new Set(cat.map(m => m.id).concat(ph.map(m => m.id)))];
    const rows = ids.map(id => {
      const p = ph.find(m => m.id === id), c = cat.find(m => m.id === id), on = p && (p.hasBase || p.hasTerrain);
      const full = p && p.hasBase && (!c || !c.terrain || p.hasTerrain);
      const newer = c && on && c.date && (!p.date || c.date > p.date);
      const st = !on ? "" : newer ? `<span class="pill upd">Update ${esc(fmtDate(c.date))}</span>` : !full ? `<span class="pill upd">Incomplete</span>` : `<span class="pill okp">On phone</span>`;
      const size = c ? (c.base ? c.base.bytes || 0 : 0) + (c.terrain ? c.terrain.bytes || 0 : 0) : p.bytes;
      const btn = job ? "" : c && (!on || newer || !full) ? `<button class="button${on ? " ghost" : ""}" type="button" data-mget="${esc(id)}">${on && !newer ? "Complete" : newer ? "Update" : "Download"}</button>` : "";
      return `<div class="maprow"><div class="grow"><b>${esc((c || p).name)}</b><small>${[fmtDate((on ? p : c).date), MB(size || 0), on ? "" : "on Nextcloud"].filter(Boolean).join(" · ")}${c && !c.terrain ? " · no terrain" : ""}</small>${st}</div><div class="mapbtns2">${btn}${on && !job ? `<button class="button ghost" type="button" data-mdel="${esc(id)}">Delete</button>` : ""}</div></div>`;
    });
    $("mList").innerHTML = rows.length ? rows.join("") : `<p class="note">No maps yet. Tap "Check Nextcloud" to see the regions in ${esc(folder())}.</p>`;
    const free = N && N.mapFree ? N.mapFree() : 0;
    $("mFree").textContent = (ph.length ? "On this phone: " + MB(ph.reduce((a, m) => a + (m.bytes || 0), 0)) + ". " : "") + (free ? "Free space: " + MB(free) + "." : "") + (ncs && ncs.fetched ? " Nextcloud checked " + new Date(ncs.fetched).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) + "." : "");
  }
  $("mCheck").onclick = async () => {
    const why = ncReady(); if (why){ $("mMsg").textContent = why; return; }
    $("mMsg").textContent = "Reading " + folder() + "maps.json …";
    const r = await nc("GET", folder() + "maps.json");
    if (r.status !== 200){ $("mMsg").textContent = r.status === 404 ? "No maps.json in " + folder() + ". Download regions with the Stoic Ranger Map Manager on your PC first, or check the folder name." : ncWhy(r); return; }
    let cat; try { cat = JSON.parse(ncText(r)); } catch (e){ $("mMsg").textContent = "maps.json on Nextcloud could not be read."; return; }
    if (cat.format !== "FK-1" && cat.format !== "FK-2"){ $("mMsg").textContent = "maps.json has the format " + esc(cat.format) + ", this app reads FK-1 and FK-2. Update the app or the Map Manager."; return; }
    store.set("sr-maps-nc", { fetched: new Date().toISOString(), catalog: cat });
    const n = (cat.maps || []).length; $("mMsg").textContent = n + " region" + (n === 1 ? "" : "s") + " on Nextcloud.";
    renderMaps();
  };
  /** Downloads map and terrain of one region; the phone entry is updated after each finished file. */
  window.FKMapProgress = (id, done, total, state, msg) => { if (!job || job.id !== id) return; if (state === "run") job.onRun(done, total); else job.finish(state === "done" ? null : msg || "failed"); };
  function dlFile(path, f, label, base, all){
    return new Promise(res => {
      job = { id: uid("dl-"), onRun: (d, t) => { const p = all ? (base + d) / all : 0; $("mDlBar").style.width = Math.round(p * 100) + "%"; $("mDlTxt").textContent = label + " · " + MB(base + d) + (all ? " of " + MB(all) : ""); }, finish: e => res(e) };
      if (Array.isArray(f.parts) && f.parts.length){
        if (!N.mapDownloadParts){ res("This map is saved in parts; update SR Field Kit."); return; }
        N.mapDownloadParts(folder(), f.file, JSON.stringify(f.parts.map(p => ({ file: String(p.file), bytes: +p.bytes || 0, sha256: String(p.sha256 || "") }))), f.sha256 || "", f.bytes || 0, job.id);
      } else N.mapDownload(path, f.file, f.sha256 || "", f.bytes || 0, job.id);
    });
  }
  $("mList").addEventListener("click", async e => {
    const g = e.target.closest("[data-mget]"), d = e.target.closest("[data-mdel]");
    if (d){
      const id = d.dataset.mdel; if (d.dataset.sure !== "1"){ d.dataset.sure = "1"; d.textContent = "Delete?"; setTimeout(() => { d.dataset.sure = ""; d.textContent = "Delete"; }, 3000); return; }
      let list = store.get("sr-maps", []); const m = list.find(x => x.id === id);
      if (m){ [m.base, m.terrain].forEach(f => { if (f && N && N.mapDelete) N.mapDelete(f.file); }); list = list.filter(x => x !== m); store.set("sr-maps", list); }
      renderMaps(); loadRegions(); toast("Map deleted from the phone"); return;
    }
    if (!g || job) return;
    if (!N || !N.mapDownload){ $("mMsg").textContent = "Downloads work in the Android app."; return; }
    const why = ncReady(); if (why){ $("mMsg").textContent = why; return; }
    if ($("mWifi").checked){ let ns = {}; try { ns = JSON.parse(N.netState()); } catch (x){ } if (!ns.wifi){ $("mMsg").textContent = "Not on Wi-Fi. Connect to Wi-Fi, or switch off \"Download maps on Wi-Fi only\"."; return; } }
    const cat = (store.get("sr-maps-nc", {}).catalog || {}).maps || [], c = cat.find(m => m.id === g.dataset.mget); if (!c) return;
    const files = [["Map", c.base], ["Terrain", c.terrain]].filter(x => x[1] && x[1].file);
    const all = files.reduce((a, x) => a + (x[1].bytes || 0), 0);
    $("mDl").hidden = false; $("mMsg").textContent = ""; let base = 0, err = null;
    job = { id: "" }; renderMaps();
    for (const [label, f] of files){
      err = await dlFile(folder() + f.file, f, c.name + " · " + label, base, all);
      if (err) break;
      base += f.bytes || 0;
      const list = store.get("sr-maps", []); let m = list.find(x => x.id === c.id); if (!m){ m = { id: c.id }; list.push(m); }
      Object.assign(m, { name: c.name, bbox: c.bbox, attribution: c.attribution, downloaded: new Date().toISOString() });
      m[label === "Map" ? "base" : "terrain"] = { file: f.file, bytes: f.bytes, sha256: f.sha256, date: c.date };
      if (files.every(x => (x[0] === "Map" ? m.base : m.terrain) && (x[0] === "Map" ? m.base : m.terrain).date === c.date)){ m.date = c.date; delete m.imported; }
      store.set("sr-maps", list); store.flush();
    }
    job = null; $("mDl").hidden = true;
    $("mMsg").textContent = err ? (err === "cancelled" ? "Download stopped. Nothing half-done was kept." : "Download failed: " + err) : c.name + " is on the phone now and works offline.";
    renderMaps(); loadRegions();
  });
  $("mDlStop").onclick = () => { if (N && N.mapCancel) N.mapCancel(); };
  $("mImport").onclick = async () => {
    if (!N || !N.pickFile) return toast("Import works in the Android app");
    const r = await call(id => N.pickFile("map", id));
    if (!r.ok){ if (r.msg !== "cancelled") $("mMsg").textContent = r.msg; return; }
    $("mMsg").textContent = "Imported " + r.msg + "."; renderMaps(); loadRegions();
  };

  // ---------- start ----------
  fillPointSelects(); renderRoute(); fixCalc();
  window.addEventListener("fk-units", () => { renderRoute(); convert(); fixCalc(); });
  $("decl").addEventListener("input", () => { if (document.activeElement !== $("mDecl")) $("mDecl").value = $("decl").value; renderRoute(); convert(); fixCalc(); });
  $("mDecl").value = $("decl").value;
  $("mDecl").addEventListener("input", () => { $("decl").value = $("mDecl").value; $("decl").dispatchEvent(new Event("input", { bubbles: true })); $("decl").dispatchEvent(new Event("change", { bubbles: true })); });
  window.__nav3 = { ensureMap, resect, routes: () => routes, loadRegions, renderMaps };
})();
