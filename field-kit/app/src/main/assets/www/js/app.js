/* SR Field Kit — app shell: header band, light/dark, settings, About, delete data, printables, phone Back,
   and the window.FK API that MainActivity calls (back, pause, resume, setSysDark, printDoc). */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const store = window.FKStore, N = window.FKNative || null;
  const root = document.documentElement;
  const parse = t => { try { return JSON.parse(t); } catch(e){ return null; } };
  const TITLES = { home: "SR Field Kit", breathe: "Breathe", nav: "Navigate", cards: "Field cards", shoot: "Shooting helpers", print: "Printables" };
  const settings = Object.assign({ units: "metric", theme: "" }, store.get("settings", {}));
  const saveSettings = () => store.set("settings", settings);

  // ---------- light / dark: phone setting unless the user picked one ----------
  let sysDark = N && N.isNight ? !!N.isNight() : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  function theme(){
    root.dataset.theme = settings.theme || (sysDark ? "dark" : "light");
    document.querySelectorAll("[data-th]").forEach(b => b.setAttribute("aria-pressed", b.dataset.th === (settings.theme || "")));
  }
  document.querySelectorAll("[data-th]").forEach(b => b.onclick = () => { settings.theme = b.dataset.th; saveSettings(); theme(); });
  if (!N && window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => { sysDark = e.matches; theme(); });
  theme();

  // ---------- header band ----------
  if (window.SR_EMBLEM) $("hHome").innerHTML = SR_EMBLEM;
  const key = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  function homeLines(){
    const L = store.get("sr-breath", {}), now = new Date();
    const today = Math.floor((L[key(now)] || 0) / 60);
    let streak = 0; const d = new Date(now); if ((L[key(d)] || 0) < 60) d.setDate(d.getDate() - 1);
    while ((L[key(d)] || 0) >= 60){ streak++; d.setDate(d.getDate() - 1); }
    const pts = store.get("sr-points", []).length, pos = store.get("sr-pos", null);
    const cards = document.querySelectorAll("#cardGrid .fcard").length;
    $("hBr").textContent = "Today " + today + " min · streak " + streak + " day" + (streak === 1 ? "" : "s");
    $("hNv").textContent = pts + " saved point" + (pts === 1 ? "" : "s") + (pos ? " · last position kept" : " · no position yet");
    $("hSh").textContent = "6 tools · DOPE card";
    $("hFc").textContent = cards + " cards · 5 categories";
  }
  const view = () => { const h = (location.hash || "#home").slice(1); return TITLES[h] ? h : "home"; };
  // pages visited, so the phone's Back goes to the last page (not straight home, and never closes the app there)
  const trail = []; let cur = view(), goingBack = false;
  function sync(){
    const h = view();
    if (h !== cur){ if (goingBack) goingBack = false; else { trail.push(cur); if (trail.length > 30) trail.shift(); } cur = h; }
    $("hTitle").textContent = TITLES[h];
    $("appbar").dataset.sec = h;
    if (h === "home") homeLines();
  }
  window.addEventListener("hashchange", sync);

  // ---------- read-only / damaged data notice ----------
  if (store.notice){ $("roBanner").textContent = store.notice; $("roBanner").hidden = false; }

  // ---------- units ----------
  const ubtn = document.querySelectorAll("[data-u]");
  function setUnits(u, save){
    settings.units = u === "imp" ? "imp" : "metric";
    ubtn.forEach(b => b.setAttribute("aria-pressed", b.dataset.u === settings.units));
    if (window.__setUnits) window.__setUnits(settings.units === "imp");
    if (save) saveSettings();
  }
  ubtn.forEach(b => b.onclick = () => setUnits(b.dataset.u, true));

  // ---------- Drop & wind inputs: kept in db.json (metric) ----------
  const BALL = ["bModel","bBC","bMV","bMass","bSH","bZero","bWind","bClock","bAlt","bTemp","bMax","bStep","bMove"];
  const UNIT = ["bMV","bMass","bSH","bZero","bWind","bAlt","bTemp","bMove"];
  const saved = store.get("sr-ball", null);
  if (saved && typeof saved === "object"){
    if (saved.pre && [...$("bPre").options].some(o => o.value === saved.pre)) $("bPre").value = saved.pre;
    BALL.forEach(id => { const v = saved[id]; if (v == null || v === "") return; if (UNIT.includes(id)) window.__writeM(id, v); else $(id).value = v; });
  }
  setUnits(settings.units, false);           // also redraws the table in the chosen units
  if (window.__srRender) window.__srRender();  // linked: Stoic Ranger values win over the saved ones
  if (window.__ball) window.__ball();
  function saveBall(){
    const o = { pre: $("bPre").value };
    BALL.forEach(id => { const e = $(id); o[id] = UNIT.includes(id) ? (e.value === "" ? null : +window.__readM(id).toFixed(4)) : e.value; });
    store.set("sr-ball", o);
  }
  ["input","change"].forEach(ev => $("v-shoot").addEventListener(ev, e => { if (e.target.closest("[data-pane='ball']") && !e.target.closest("#srLink")) saveBall(); }));

  // ---------- About and settings ----------
  const A = $("about");
  const info = N && N.appInfo ? parse(N.appInfo()) || {} : {};
  if (info.version) $("aboutVer").textContent = info.version + (info.code ? " (" + info.code + ")" : "");
  if (!N) $("aboutData").textContent = "This browser's storage";
  $("aboutBtn").onclick = () => { A.hidden = false; A.scrollTop = 0; $("wipeMsg").textContent = "";
    if (N && N.backLog){ $("backLog").textContent = N.backLog(); $("backLogBox").hidden = false; } };
  const closeAbout = () => { A.hidden = true; $("wipeAsk").hidden = true; };
  $("aboutClose").onclick = closeAbout;
  $("wipeBtn").onclick = () => { $("wipeAsk").hidden = false; };
  $("wipeNo").onclick = () => { $("wipeAsk").hidden = true; };
  $("wipeYes").onclick = () => {
    $("wipeAsk").hidden = true;
    if (store.readOnly){ $("wipeMsg").textContent = "Nothing deleted: the data is read-only until the app is updated."; return; }
    const ok = store.clear();
    $("wipeMsg").textContent = ok === false ? "Could not delete. Your data is unchanged." : "Deleted. A backup copy is kept on the phone. The app restarts fresh now.";
    if (ok !== false) setTimeout(() => { location.hash = "#home"; location.reload(); }, 1200);
  };
  if (store.readOnly){ $("wipeBtn").disabled = true; }
  window.addEventListener("hashchange", closeAbout);

  // ---------- Printables: print or share the PDFs that ship with the app ----------
  $("v-print").addEventListener("click", e => {
    const p = e.target.closest("[data-print]"), s = e.target.closest("[data-share]");
    const file = p ? p.dataset.print : s ? s.dataset.share : null; if (!file) return;
    const name = "SR " + file.replace(/\.pdf$/, "").replace(/-/g, " ");
    if (N && p && N.printAsset) N.printAsset("www/printables/" + file, name);
    else if (N && s && N.shareAsset) N.shareAsset("www/printables/" + file, "SR-" + file);
    else window.open("printables/" + file, "_blank");
  });

  // ---------- window.FK: called by MainActivity ----------
  const FK = window.FK = window.FK || {};
  /** Phone Back: close what is open (About, wind sheet, card viewer), then the last page visited, then home.
   *  On home the first Back shows "Press back again to close"; only a second Back within 2 s closes the app. */
  let backAt = 0, toastT = null;
  function toast(t){ const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 2000); }
  FK.back = () => {
    try {
      const ws = $("wsView"), pv = $("preview");
      if (!A.hidden){ closeAbout(); return true; }
      if (ws && !ws.hidden){ ws.hidden = true; return true; }
      if (pv && pv.classList.contains("open")){ const c = $("vClose"); if (c) c.click(); else pv.classList.remove("open"); return true; }
      if (view() !== "home"){
        let to = trail.pop(); while (to === view() && trail.length) to = trail.pop();
        goingBack = true; location.hash = "#" + (to && to !== view() ? to : "home"); backAt = 0; return true;
      }
      if (Date.now() - backAt < 2000){ backAt = 0; store.flush(); return false; }
      backAt = Date.now(); toast("Press back again to close"); return true;
    } catch (e) { return view() !== "home" ? (location.hash = "#home", true) : false; }
  };
  FK.pause = () => { store.flush(); };
  FK.resume = () => { if (window.__SR) window.__SR.refresh(); if (view() === "home") homeLines(); };
  FK.setSysDark = d => { sysDark = !!d; theme(); };
  /** A full HTML page for the print WebView: same fonts and styles, light paper colours. */
  FK.printDoc = body => `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="css/kit.css"><link rel="stylesheet" href="css/app.css"></head><body>${body}</body></html>`;

  sync();
})();
