/* SR Field Kit 0.1.0 — the tools. Based on the web Field Kit (stoic-ranger.com, Release 1.5), with:
   home screen of tools, Stoic Ranger solver (js/ballistics.js), metric/imperial, Printables, link to Stoic Ranger
   (js/link.js), native printing and location (MainActivity). Everything runs on the phone; nothing is sent anywhere. */
(function(){
  const $ = id => document.getElementById(id);
  const store = window.FKStore;   // db.json on the phone (js/store.js)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmtN = (x,d=0) => isFinite(x) ? (Math.abs(x) < 0.5*Math.pow(10,-d) ? 0 : x).toLocaleString("en",{maximumFractionDigits:d,minimumFractionDigits:d}) : "–";

  // ---------- routing ----------
  const views = ["home","breathe","shoot","nav","cards","print"];
  let onShow = {};
  function route(){
    let h = (location.hash || "#home").slice(1); if (!views.includes(h)) h = "home"; const v = h;
    views.forEach(n => $("v-"+n).hidden = n !== v);
    document.querySelectorAll(".nav a").forEach(a => a.setAttribute("aria-current", a.getAttribute("href") === "#"+v ? "page" : "false"));
    if (onShow[v]) onShow[v]();
    const sc = document.querySelector(".screen"); if (sc) sc.scrollTop = 0;
    const pv = $("preview"); if (pv) pv.classList.remove("open");
  }
  window.addEventListener("hashchange", route);

  // ---------- audio ----------
  let ac = null;
  function audio(){ try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch(e){} return ac; }
  function tone(freq, dur, vol=0.18, type="sine"){
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  let lock = null;
  async function wake(on){
    if (window.FKNative && FKNative.keepScreenOn){ FKNative.keepScreenOn(!!on); return; }
    try { if (on && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen"); else if (!on && lock) { await lock.release(); lock = null; } } catch(e){} }

  // ================= BREATHE =================
  // phase: [label, seconds, kind in|hold|out, lung level at end 0..1]
  const PATS = {
    box:   { name: "Box", sub: "In 4 · hold 4 · out 4 · hold 4", why: "Equal sides slow the breath to about 4 a minute and give the mind a simple job.", use: "Before a stage, a hard call, a briefing. The classic for stress under load.",
             ph: [["Breathe in",4,"in",1],["Hold",4,"hold",1],["Breathe out",4,"out",0],["Hold",4,"hold",0]] },
    sigh:  { name: "Physiological sigh", sub: "In 2 · top up 1 · long out 6", why: "A double inhale reopens the lungs fully; the long exhale is the fastest known way to drop arousal.", use: "Right now, in one to three breaths. Adrenaline dump, after a scare.",
             ph: [["Breathe in",2,"in",.75],["Top up",1,"in",1],["Breathe out",6,"out",0]] },
    shot:  { name: "Pre-shot", sub: "In 4 · out 6 · pause 3", why: "The natural respiratory pause after the exhale is when the body is stillest.", use: "Behind the rifle. Press the shot inside the pause; if it doesn't break, breathe again.",
             ph: [["Breathe in",4,"in",1],["Breathe out",6,"out",.1],["Pause · press",3,"hold",.1]] },
    coh:   { name: "Coherent", sub: "In 5.5 · out 5.5", why: "About 5.5 breaths a minute lines heart rate up with the breath and steadies it.", use: "Daily practice, 10 to 20 minutes. Builds the baseline you fall back to.",
             ph: [["Breathe in",5.5,"in",1],["Breathe out",5.5,"out",0]] },
    down:  { name: "Down-shift", sub: "In 4 · hold 7 · out 8", why: "The long hold and longer exhale push the body toward rest.", use: "At night, after a long day, before sleep in the field.",
             ph: [["Breathe in",4,"in",1],["Hold",7,"hold",1],["Breathe out",8,"out",0]] },
    custom:{ name: "Your own", sub: "Set every side yourself", why: "Build a pattern you were taught, or lengthen the exhale step by step.", use: "Any time. Sides set to 0 are skipped.",
             ph: null }
  };
  const GUIDE = {
    box:    ["Calm and focus under pressure.", "Before a stressful task, such as a match stage, a briefing or a hard conversation."],
    sigh:   ["Fast stress relief, in one to three breaths.", "Right after a scare or an adrenaline spike, with no time for more."],
    shot:   ["Body stillness for a precise shot.", "Behind the rifle or pistol, in dry fire, or before any fine hand work."],
    coh:    ["Your stress resilience and recovery over time.", "As daily training, 10 to 20 minutes, or to recover after hard exercise."],
    down:   ["Relaxation and falling asleep.", "At night, after a long day or a shift, before sleeping in the field."],
    custom: ["Whatever you train it for. A longer exhale calms, a longer inhale wakes you up.", "You follow a pattern you were taught, or build up step by step."]
  };
  const custom = store.get("sr-custom", {in:4, h1:2, out:6, h2:0});
  $("patterns").innerHTML = Object.entries(PATS).map(([k,p],i) =>
    `<label><input type="radio" name="pat" value="${k}" ${i===0?"checked":""}><span><strong>${p.name}</strong><em>${p.sub}</em></span></label>`).join("");
  $("guide").innerHTML = Object.entries(PATS).map(([k,p]) => { const g = GUIDE[k];
    return `<article data-g="${k}"><h4>${p.name}</h4><p class="pat">${p.sub}</p><dl><dt>Improves</dt><dd>${g[0]}</dd><dt>Use when</dt><dd>${g[1]}</dd></dl></article>`; }).join("");
  const CUST = [["in","Breathe in"],["h1","Hold"],["out","Breathe out"],["h2","Hold"]];
  $("customBox").innerHTML = CUST.map(([k,l]) => `<div class="field"><label for="cu-${k}">${l}</label><input type="range" id="cu-${k}" min="0" max="12" step="1" value="${custom[k]}"><output id="cuo-${k}">${custom[k]} s</output></div>`).join("");
  const patKey = () => document.querySelector('input[name="pat"]:checked').value;
  function phases(){
    const k = patKey();
    if (k !== "custom") return PATS[k].ph;
    const ph = [];
    if (custom.in) ph.push(["Breathe in",custom.in,"in",1]);
    if (custom.h1) ph.push(["Hold",custom.h1,"hold",1]);
    if (custom.out) ph.push(["Breathe out",custom.out,"out",0]);
    if (custom.h2) ph.push(["Hold",custom.h2,"hold",0]);
    return ph.length ? ph : [["Breathe in",4,"in",1],["Breathe out",4,"out",0]];
  }
  const COL = { in: "var(--fg)", hold: "var(--muted)", out: "var(--bronze)" };
  function drawSegs(){
    const ph = phases(), total = ph.reduce((a,p)=>a+p[1],0); let acc = 0;
    const C = 2*Math.PI*92;
    $("segs").innerHTML = ph.map(p => {
      const len = p[1]/total*C, gap = 3;
      const s = `<circle cx="110" cy="110" r="92" fill="none" stroke="${COL[p[2]]}" stroke-opacity="${p[2]==="hold"?.5:1}" stroke-width="10" stroke-dasharray="${Math.max(len-gap,1)} ${C}" stroke-dashoffset="${-acc - gap/2}"/>`;
      acc += len; return s;
    }).join("");
    const k = patKey();
    document.querySelectorAll("#guide [data-g]").forEach(g => g.setAttribute("aria-current", g.dataset.g === k ? "true" : "false"));
    $("customBox").hidden = k !== "custom";
  }
  let running = false, t0 = 0, acc = 0, raf = 0, lastPhase = -1, credited = 0;
  const fmt = s => Math.floor(s/60) + ":" + String(Math.floor(s%60)).padStart(2,"0");
  function cue(kind){
    if (!$("sound").checked) return;
    if (kind === "in") tone(523, .5, .14); else if (kind === "out") tone(330, .7, .14); else tone(415, .18, .08, "triangle");
  }
  function frame(el){
    const ph = phases(), cycle = ph.reduce((a,p)=>a+p[1],0), dur = +$("dur").value;
    const tc = el % cycle; let a = 0, i = 0;
    while (i < ph.length-1 && tc >= a + ph[i][1]) { a += ph[i][1]; i++; }
    const inP = tc - a, f = Math.min(inP/ph[i][1],1);
    const pos = (a + inP)/cycle, ang = pos*2*Math.PI - Math.PI/2;
    $("dot").setAttribute("cx", 110 + 92*Math.cos(ang)); $("dot").setAttribute("cy", 110 + 92*Math.sin(ang));
    const prevLvl = ph[(i-1+ph.length)%ph.length][3], lvl = prevLvl + (ph[i][3]-prevLvl)*(0.5-0.5*Math.cos(Math.PI*f));
    $("core").setAttribute("r", 26 + lvl*48);
    $("phaseName").textContent = ph[i][0];
    $("phaseCount").textContent = Math.ceil(ph[i][1] - inP - 1e-6) || 1;
    if (running && (i !== lastPhase)) { cue(ph[i][2]); lastPhase = i; }
    $("rounds").textContent = Math.floor(el/cycle);
    $("left").textContent = fmt(Math.max(0, dur - el));
    if (el >= dur) finish();
  }
  function loop(now){ if (!running) return; frame((now - t0)/1000 + acc); raf = requestAnimationFrame(loop); }
  function credit(){ const el = running ? (performance.now()-t0)/1000 + acc : acc; const add = Math.max(0, el - credited); credited = el; log(add); }
  function start(){ audio(); running = true; lastPhase = -1; t0 = performance.now(); $("bStart").textContent = "Pause"; if ($("awake").checked) wake(true); raf = requestAnimationFrame(loop); }
  function pause(){ credit(); acc += (performance.now()-t0)/1000; running = false; cancelAnimationFrame(raf); $("bStart").textContent = "Resume"; wake(false); }
  function finish(){ credit(); running = false; cancelAnimationFrame(raf); $("bStart").textContent = "Start"; acc = 0; credited = 0; wake(false);
    $("phaseName").textContent = "Done"; $("phaseCount").textContent = "✓"; if ($("sound").checked) { tone(392,.3,.12); setTimeout(()=>tone(523,.6,.12),300); } }
  function reset(){ if (running) credit(); running = false; cancelAnimationFrame(raf); acc = 0; credited = 0; wake(false); $("bStart").textContent = "Start"; drawSegs(); frame(0); $("phaseName").textContent = "Ready"; $("phaseCount").textContent = "–"; $("rounds").textContent = 0; }
  // daily log: { "2026-11-05": seconds }
  function dayKey(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function log(sec){ const L = store.get("sr-breath", {}), k = dayKey(new Date()); L[k] = (L[k]||0) + sec; store.set("sr-breath", L); showLog(L); }
  function showLog(L){
    L = L || store.get("sr-breath", {});
    const d = new Date(); $("today").textContent = Math.floor((L[dayKey(d)]||0)/60);
    let s = 0; if (!((L[dayKey(d)]||0) >= 60)) d.setDate(d.getDate()-1);
    while ((L[dayKey(d)]||0) >= 60) { s++; d.setDate(d.getDate()-1); }
    $("streak").textContent = s;
  }
  $("bStart").onclick = () => running ? pause() : start();
  $("bStop").onclick = reset;
  $("patterns").onchange = reset;
  $("dur").onchange = reset;
  CUST.forEach(([k]) => $("cu-"+k).addEventListener("input", e => { custom[k] = +e.target.value; $("cuo-"+k).textContent = custom[k]+" s"; store.set("sr-custom", custom); reset(); }));
  reset(); showLog();

  // ================= SHOOTING =================
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-pressed", x===b));
    document.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  });
  const MOA_CM_100 = 2.90888;
  const n = id => parseFloat($(id).value);
  const cell = (v,l,extra="") => `<div><b>${v}</b><small>${l}</small>${extra}</div>`;

  // --- ballistic solver: the Stoic Ranger solver (assets/ballistics.js, RB.dope), G1 or G7 drag tables, RK4 ---
function solve(o){
  const air = RB.air({ temp: o.temp, alt: o.alt });
  const windMs = o.wind/3.6*Math.abs(Math.sin(o.clock*Math.PI/6));
  const d = RB.dope({ v0: o.mv, bc: o.bc, model: o.model || "G1", sightMm: o.sh*10, zeroM: o.zero, air, maxM: o.max, stepM: o.step, windMs, massG: o.mass });
  return d.rows.filter(r => r.x > 0).map(r => ({ R: r.x, dropcm: r.dropM*100, drift: r.driftM*100, tof: r.t, vms: r.v, J: r.e }));
}
window.__solve = solve;

  const LOADS = [
    ["308a", ".308 Win · 175 gr match", .505, 790, 11.3],
    ["308b", ".308 Win · 150 gr hunting", .420, 860, 9.7],
    ["65cm", "6.5 Creedmoor · 140 gr match", .646, 820, 9.1],
    ["223",  ".223 Rem · 77 gr match", .372, 840, 5.0],
    ["223b", ".223 Rem · 55 gr FMJ", .243, 990, 3.6],
    ["300wm",".300 Win Mag · 190 gr", .533, 880, 12.3],
    ["30-06",".30-06 · 165 gr hunting", .447, 850, 10.7],
    ["8x57", "8x57 IS · 196 gr", .360, 780, 12.7],
    ["22lr", ".22 LR · 40 gr standard", .138, 330, 2.6],
    ["9mm",  "9 mm Luger · 124 gr (carbine)", .150, 400, 8.0],
    ["own",  "My own load", null, null, null]
  ];
  $("bPre").innerHTML = LOADS.map(l => `<option value="${l[0]}">${l[1]}</option>`).join("");
  function applyLoad(){ const l = LOADS.find(x => x[0] === $("bPre").value); if (l[2] == null) return; $("bModel").value = "G1"; $("bBC").value = l[2]; writeM("bMV", l[3]); writeM("bMass", l[4]); }
  let lastBall = null;
  // ---- units: metric (default) or imperial, for display and input only; all maths stay metric ----
  const IMP = () => document.documentElement.dataset.units === "imp";
  const UC = { bMV:[3.28084,"Muzzle velocity","m/s","fps",0], bMass:[15.4324,"Bullet","g","gr",1], bSH:[0.393701,"Sight height","cm","in",2], bZero:[1.09361,"Zero","m","yd",0],
    bWind:[0.621371,"Wind","km/h","mph",1], bAlt:[3.28084,"Altitude","m","ft",0], bTemp:["T","Temperature","°C","°F",0], bMove:[0.621371,"Target speed","km/h","mph",1],
    cDist:[1.09361,"Distance","m","yd",0], kV:[0.393701,"Group off","cm","in",1], kH:[0.393701,"Group off","cm","in",1], kDist:[1.09361,"Distance","m","yd",0],
    rSize:[1.09361,"Size","m","yd",2], aDist:[1.09361,"Line-of-sight distance","m","yd",0] };
  const dfmt = m => IMP() ? fmtN(m*1.09361) + " yd" : fmtN(m) + " m";
  window.FKUnits = { imp: IMP, dist: m => IMP() ? (m < 1609.344 ? Math.round(m*1.09361) + " yd" : (m/1609.344).toFixed(2) + " mi") : (m < 1000 ? Math.round(m) + " m" : (m/1000).toFixed(2) + " km"),
    small: m => IMP() ? Math.round(m*1.09361) + " yd" : Math.round(m) + " m", alt: m => IMP() ? Math.round(m*3.28084) + " ft" : Math.round(m) + " m" };
  const DIST = () => IMP() ? 0.9144 : 1;
  function readM(id){ const v = n(id), c = UC[id]; if (!IMP() || !c) return v; return c[0] === "T" ? (v - 32) * 5 / 9 : v / c[0]; }
  function writeM(id, m){ const c = UC[id]; if (!c){ $(id).value = m; return; } if (!IMP()){ $(id).value = +(+m).toFixed(c[4] + 1); return; } const v = c[0] === "T" ? m * 9 / 5 + 32 : m * c[0]; $(id).value = +v.toFixed(c[4]); }
  function unitLabels(){ const i = IMP(); Object.entries(UC).forEach(([id, c]) => { const l = document.querySelector(`label[for="${id}"]`); if (l) l.textContent = `${c[1]} (${i ? c[3] : c[2]})`; });
    $("bMax").previousElementSibling.textContent = `Out to (${i ? "yd" : "m"})`; $("bStep").previousElementSibling.textContent = `Step (${i ? "yd" : "m"})`; }
  window.__writeM = writeM; window.__readM = readM;
  window.__setUnits = imp => { const keep = {}; Object.keys(UC).forEach(id => { const e = $(id); keep[id] = (e.dataset.m != null && e.value === e.dataset.shown) ? +e.dataset.m : readM(id); });
    if (imp) document.documentElement.dataset.units = "imp"; else delete document.documentElement.dataset.units;
    Object.keys(UC).forEach(id => { writeM(id, keep[id]); $(id).dataset.m = keep[id]; $(id).dataset.shown = $(id).value; }); unitLabels(); ball();
    window.dispatchEvent(new Event("fk-units")); };
  function ball(){
    const o = { model:$("bModel").value, bc:n("bBC"), mv:readM("bMV"), sh:readM("bSH"), zero:readM("bZero"), wind:readM("bWind"), clock:+$("bClock").value, alt:readM("bAlt"), temp:readM("bTemp"), max:+$("bMax").value*DIST(), step:+$("bStep").value*DIST(), mass:readM("bMass"), imp:IMP() };
    if (!(o.bc>0 && o.mv>0 && o.zero>0)) { $("bTable").innerHTML = ""; return; }
    const res = solve(o), mv = readM("bMove")/3.6, I = o.imp, dR = R => Math.round(R / DIST()), uL = I ? "in" : "cm", cL = x => I ? x / 2.54 : x;
    lastBall = { o, res, load: ($("bPre").value === "own" && window.__srLoad) ? window.__srLoad : $("bPre").selectedOptions[0].textContent };
    const sos = RB.air({ temp: o.temp, alt: o.alt }).c;
    $("bTable").innerHTML = `<tr><th>Range<small>${I ? "yd" : "m"}</small></th><th>Drop<small>${uL}</small></th><th>Elev.<small>MIL</small></th><th>Elev.<small>MOA</small></th><th>Wind<small>${uL}</small></th><th>Wind<small>MIL</small></th><th>Lead<small>MIL</small></th><th>Velocity<small>${I ? "fps" : "m/s"}</small></th><th>Energy<small>${I ? "ft·lb" : "J"}</small></th><th>Time<small>s</small></th></tr>` +
      res.map(r => {
        const mil = -r.dropcm*10/r.R, moa = -r.dropcm/(MOA_CM_100*r.R/100), wmil = r.drift*10/r.R, lead = mv*r.tof*1000/r.R;
        const cls = Math.abs(r.R - o.zero) < 0.5 ? "zero" : (r.vms < 1.2*sos ? "trans" : "");
        return `<tr class="${cls}"><td>${dR(r.R)}</td><td>${fmtN(cL(r.dropcm),1)}</td><td class="key">${fmtN(mil,1)}</td><td>${fmtN(moa,1)}</td><td>${fmtN(cL(r.drift),1)}</td><td class="key">${fmtN(wmil,1)}</td><td>${fmtN(lead,1)}</td><td>${fmtN(I ? r.vms*3.28084 : r.vms)}</td><td>${fmtN(I ? r.J*0.737562 : r.J)}</td><td>${fmtN(r.tof,2)}</td></tr>`;
      }).join("");
    const last = res[res.length-1], muzzleJ = 0.5*o.mass/1000*o.mv*o.mv;
    const trans = res.find(r => r.vms < 1.2*sos);
    const du = I ? " yd" : " m";
    $("bSum").innerHTML = cell(I ? fmtN(muzzleJ*0.737562) + " ft·lb" : fmtN(muzzleJ) + " J", "Muzzle energy") + cell(fmtN(-last.dropcm*10/last.R,1), "MIL up at " + dR(last.R) + du) + cell(fmtN(last.drift*10/last.R,1), "MIL wind at " + dR(last.R) + du) + cell(trans ? dR(trans.R) + du : "> " + dR(last.R) + du, "Stays supersonic to");
  }
  $("bPre").addEventListener("change", () => { window.__srLoad = null; if (window.__srClear) window.__srClear(); applyLoad(); ball(); });
  ["bBC","bMV","bMass","bModel"].forEach(id => $(id).addEventListener("input", () => { $("bPre").value = "own"; window.__srLoad = null; ball(); }));
  window.__ball = ball;
  ["bSH","bZero","bWind","bClock","bAlt","bTemp","bMax","bStep","bMove"].forEach(id => $(id).addEventListener("input", ball));
  applyLoad(); ball();

  function conv(){
    const v = n("cVal"), u = $("cUnit").value, d = readM("cDist"), cmPerMil = d/10, cmPerMoa = MOA_CM_100*d/100;
    const cm = u==="cm" ? v : u==="in" ? v*2.54 : u==="mil" ? v*cmPerMil : v*cmPerMoa;
    $("cOut").innerHTML = cell(fmtN(cm/cmPerMil,2), "MIL") + cell(fmtN(cm/cmPerMoa,2), "MOA") +
      (IMP() ? cell(fmtN(cm/2.54,1), "inch at " + dfmt(d)) + cell(fmtN(cm,1), "cm") : cell(fmtN(cm,1), "cm at " + dfmt(d)) + cell(fmtN(cm/2.54,1), "inch"));
  }
  function clicks(){
    const d = readM("kDist"), cv = $("kClick").value;
    const per = cv.endsWith("mil") ? parseFloat(cv)*d/10 : parseFloat(cv)*MOA_CM_100*d/100;
    const vc = Math.round(readM("kV")/per), hc = Math.round(readM("kH")/per);
    $("kOut").innerHTML = cell(vc, "clicks", `<div class="arrow">↕ ${$("kVd").value==="low"?"Up":"Down"}</div>`) + cell(hc, "clicks", `<div class="arrow">↔ ${$("kHd").value==="left"?"Right":"Left"}</div>`) + (IMP() ? cell(fmtN(per/2.54,2), "inch per click at " + dfmt(d)) : cell(fmtN(per,2), "cm per click at " + dfmt(d)));
  }
  function range(){
    const pre = $("rPre").value; if (pre !== "custom") writeM("rSize", +pre);
    const s = readM("rSize"), m = n("rMils"), k = IMP() ? 1.09361 : 1, u = IMP() ? " yd" : " m";
    $("rOut").innerHTML = cell(fmtN(s*1000/m*k) + u, "Estimated range") + cell(fmtN(s*1000/(m+.25)*k) + "–" + fmtN(s*1000/Math.max(m-.25,.01)*k) + u, "If misread by ±0.25 MIL");
  }
  function angle(){
    const d = readM("aDist"), a = n("aDeg")*Math.PI/180, h = d*Math.cos(a);
    $("aOut").innerHTML = cell(dfmt(h), "Use this distance for drop") + cell(dfmt(d-h), "Shorter than line of sight") + cell(fmtN(Math.cos(a),3), "Cosine factor");
  }
  ["cVal","cUnit","cDist"].forEach(id => $(id).addEventListener("input", conv));
  ["kV","kVd","kH","kHd","kDist","kClick"].forEach(id => $(id).addEventListener("input", clicks));
  $("rSize").addEventListener("input", () => { $("rPre").value = "custom"; range(); });
  ["rPre","rMils"].forEach(id => $(id).addEventListener("input", range));
  ["aDist","aDeg"].forEach(id => $(id).addEventListener("input", angle));
  window.addEventListener("fk-units", () => { conv(); clicks(); range(); angle(); });
  conv(); clicks(); range(); angle();

  // --- par timer ---
  let tTimers = [], tRaf = 0, tRun = false;
  function tSet(state, time, cls){ $("tState").textContent = state; if (time != null) $("tTime").textContent = time; $("clock").className = "clock " + (cls||""); }
  function tStop(msg){ tRun = false; tTimers.forEach(clearTimeout); tTimers = []; cancelAnimationFrame(tRaf); wake(false); $("tGo").textContent = "Start"; if (msg) tSet(msg); }
  function tRep(i){
    const reps = Math.max(1, n("tReps")|0), par = n("tPar"), lo = n("tMin"), hi = Math.max(lo, n("tMax"));
    $("tRep").textContent = "Rep " + i + " / " + reps;
    tSet("Stand by", "0.00");
    const delay = (lo + Math.random()*(hi-lo))*1000;
    tTimers.push(setTimeout(() => {
      tone(1800, .25, .3, "square"); const s = performance.now(); tSet("Go", null, "go");
      const tick = () => { if (!tRun) return; const el = (performance.now()-s)/1000; $("tTime").textContent = Math.min(el,par).toFixed(2); if (el < par) tRaf = requestAnimationFrame(tick); };
      tRaf = requestAnimationFrame(tick);
      tTimers.push(setTimeout(() => {
        tone(1200, .15, .3, "square"); setTimeout(() => tone(1200, .15, .3, "square"), 200);
        $("tTime").textContent = par.toFixed(2); tSet("Par", null, "par");
        if (i < reps) tTimers.push(setTimeout(() => { tSet("Rest"); tTimers.push(setTimeout(() => tRep(i+1), Math.max(0,n("tRest")*1000 - 1000))); }, 1000));
        else tTimers.push(setTimeout(() => tStop("Done"), 1200));
      }, par*1000));
    }, delay));
  }
  $("tGo").onclick = () => { if (tRun) { tStop("Stopped"); return; } audio(); tRun = true; $("tGo").textContent = "Restart"; wake(true); tRep(1); };
  $("tStop").onclick = () => tStop("Stopped");
  $("tRep").textContent = "Rep 0 / " + n("tReps");
  $("tReps").addEventListener("input", () => { if (!tRun) $("tRep").textContent = "Rep 0 / " + n("tReps"); });

  // ================= FIELD CARDS (double-sided) =================
  // ---------- rope renderer: smooth strands with explicit over/under via z at control points ----------
  const INK = "#1D1E1A", TAG = { red:"#B23A2E", yel:"#D9B33B", grn:"#5F7F3A", blk:"#1D1E1A" };
  const FF = 'font-family="Barlow Semi Condensed, Arial Narrow, sans-serif"';
  const T = (head, rows, cls) => `<div class="scroll"><table>${head ? "<tr>" + head.map((h,i) => `<th class="${i===0&&cls?"l":""}">${h}</th>`).join("") + "</tr>" : ""}${rows.map(r => "<tr>" + r.map((c,i) => `<td class="${i===0&&cls?"l":""}">${c}</td>`).join("") + "</tr>").join("")}</table></div>`;
  const fig = (svg, cap) => `<figure class="fig">${svg}${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
  // flowchart helpers
  function bx(x, y, w, h, lines, o = {}){
    const L = [].concat(lines), fs = o.fs || 10, lh = fs*1.15, y0 = y + h/2 - (L.length-1)*lh/2 + fs*0.35;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 3}" fill="${o.fill || "#fff"}" fill-opacity="${o.fo ?? .55}" stroke="${INK}" stroke-width="${o.sw || 1.3}"/>` +
      L.map((t,i) => `<text x="${x+w/2}" y="${y0+i*lh}" text-anchor="middle" font-size="${fs}" ${FF} font-weight="${o.b ? 700 : 400}" fill="${o.tc || INK}">${t}</text>`).join("");
  }
  function ar(x1, y1, x2, y2, label, lx, ly){
    const a = Math.atan2(y2-y1, x2-x1), h = 5;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="1.3"/><path d="M${x2} ${y2} L${x2-h*Math.cos(a-0.45)} ${y2-h*Math.sin(a-0.45)} L${x2-h*Math.cos(a+0.45)} ${y2-h*Math.sin(a+0.45)}Z" fill="${INK}"/>` +
      (label ? `<text x="${lx ?? (x1+x2)/2+4}" y="${ly ?? (y1+y2)/2-2}" font-size="9" ${FF} font-weight="700" fill="${INK}">${label}</text>` : "");
  }
  const sv = (vb, body, aria) => `<svg viewBox="${vb}" role="img" aria-label="${aria||""}" class="dia">${body}</svg>`;

  // ---- graphics ----
  const G = {
    lays: () => {
      const st = `stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"`;
      const tee = `<path d="M10 70 L35 18 M60 70 L35 18 M22 70 L35 18 M48 70 L35 18" ${st}/><path d="M28 70q7-14 14 0" stroke="${TAG.red}" stroke-width="2" fill="none"/>`;
      const cab = `<g transform="translate(80 0)"><path d="M6 66h56M6 58h56M14 50v-0M12 52h44M12 44h44M18 36h32M18 28h32" ${st}/><path d="M10 70v-8M58 70v-8" ${st}/><circle cx="34" cy="60" r="5" fill="${TAG.red}" opacity=".8"/></g>`;
      const lean = `<g transform="translate(160 0)"><rect x="4" y="54" width="60" height="12" rx="6" fill="none" stroke="${INK}" stroke-width="3"/><path d="M12 70 L44 50 M24 70 L52 50 M36 70 L60 52" ${st}/><path d="M66 30 l-14 6 M66 40 l-14 6" stroke="${INK}" stroke-width="1.4" marker-end=""/><text x="48" y="24" font-size="9" ${FF}>wind</text></g>`;
      const dak = `<g transform="translate(240 0)"><path d="M0 40h70" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M6 40 v26 h18 v-26 M44 40 l4 26 h14 l4 -26" ${st}/><path d="M22 62 L46 62" ${st}/><path d="M12 56 q4 -8 8 0" stroke="${TAG.red}" stroke-width="2" fill="none"/><text x="2" y="34" font-size="9" ${FF}>fire</text><text x="44" y="34" font-size="9" ${FF}>air</text></g>`;
      return sv("0 10 315 70", tee + cab + lean + dak, "Fire lays") + `<div class="caps4"><span>Teepee</span><span>Log cabin</span><span>Lean-to</span><span>Dakota hole</span></div>`;
    },
    tarps: () => {
      const s = `stroke="${INK}" stroke-width="2" fill="#8E9873" fill-opacity=".55"`, l = `stroke="${INK}" stroke-width="1.2" fill="none"`;
      const a = `<path d="M4 70 H90" ${l}/><path d="M10 20 L80 20" stroke="${INK}" stroke-width="1.2"/><path d="M14 70 L45 20 L76 70" ${s}/><path d="M45 20 L45 70" ${l} stroke-dasharray="3 2"/><path d="M6 20 L14 70 M84 20 L76 70" ${l}/>`;
      const b = `<g transform="translate(100 0)"><path d="M4 70 H90" ${l}/><path d="M8 24 H84" stroke="${INK}" stroke-width="1.2"/><path d="M12 24 L80 24 L70 70 L22 70Z" ${s} transform="skewX(-12) translate(10 0)"/><path d="M14 24v46M78 24v46" ${l}/></g>`;
      const c = `<g transform="translate(200 0)"><path d="M4 70 H90" ${l}/><path d="M60 16 L10 70 L86 70Z" ${s}/><path d="M60 16 L60 70" ${l} stroke-dasharray="3 2"/><path d="M60 16 l14 -6" ${l}/></g>`;
      return sv("0 5 295 70", a + b + c, "Tarp shelters") + `<div class="caps3"><span>A-frame: rain, all-round</span><span>Lean-to: fire in front, wind behind</span><span>Plough point: one pole, fast</span></div>`;
    },
    shadow: () => sv("0 0 200 92", `<path d="M10 80 H190" stroke="${INK}" stroke-width="1"/><path d="M100 80 V30" stroke="${INK}" stroke-width="3"/><path d="M100 80 L46 64" stroke="${INK}" stroke-opacity=".35" stroke-width="6"/><path d="M100 80 L64 52" stroke="${INK}" stroke-opacity=".2" stroke-width="6"/><circle cx="46" cy="64" r="4" fill="${INK}"/><circle cx="64" cy="52" r="4" fill="none" stroke="${INK}" stroke-width="2"/>${ar(46,64,88,34)}<text x="30" y="76" font-size="10" ${FF}>1st mark = W</text><text x="70" y="47" font-size="10" ${FF}>2nd (15 min) = E</text><text x="140" y="30" font-size="10" ${FF}>stick</text>`, "Shadow-stick method"),
    dipper: () => { const st = [[30,70],[52,66],[70,72],[86,80],[92,104],[122,104],[124,82]], pol = [150,22];
      return sv("0 0 200 120", `<polyline points="${st.map(p=>p.join(",")).join(" ")} 86,80" fill="none" stroke="${INK}" stroke-width=".8" stroke-dasharray="2 2"/>` + st.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${INK}"/>`).join("") +
        `<line x1="122" y1="104" x2="${pol[0]}" y2="${pol[1]+6}" stroke="${INK}" stroke-width="1" stroke-dasharray="4 3"/><circle cx="${pol[0]}" cy="${pol[1]}" r="5" fill="${INK}"/><text x="160" y="25" font-size="10" ${FF} font-weight="700">Polaris = N</text><text x="20" y="116" font-size="9" ${FF}>Big Dipper: pointers × 5 to Polaris</text>`, "Finding Polaris"); },
    urine: () => { const c = ["#F7F2C4","#F2E89A","#EEDD6E","#E7CB45","#DDB52F","#C99624","#AF7A1D","#8C5A17"];
      return `<div class="urine">${c.map((x,i) => `<span class="u${i}">${i+1}</span>`).join("")}</div><p class="tiny">1–3 hydrated · 4–5 drink now · 6–8 dehydrated, drink and rest</p>`; },
    tq: () => sv("0 0 300 120",
      `<path d="M10 40 C80 30 200 34 290 46 L290 86 C200 92 80 96 10 88 Z" fill="#E3C7A6" stroke="${INK}" stroke-width="1.6"/>
       <ellipse cx="225" cy="64" rx="10" ry="6" fill="${TAG.red}"/><path d="M225 70 q2 14 -2 26" stroke="${TAG.red}" stroke-width="3" fill="none"/>
       <rect x="138" y="32" width="18" height="62" fill="#3A3B34" stroke="${INK}"/><rect x="132" y="56" width="30" height="7" rx="2" fill="#5D6159" stroke="${INK}" transform="rotate(-25 147 60)"/>
       <path d="M156 24 H222" stroke="${INK}"/>${ar(160,24,156,24)}${ar(218,24,224,24)}<text x="166" y="19" font-size="10" ${FF} font-weight="700">5–8 cm</text>
       <text x="12" y="114" font-size="10" ${FF} font-weight="700">Hot zone: high &amp; tight. Warm zone: 5–8 cm above the wound.</text><text x="242" y="62" font-size="10" ${FF}>wound</text>
       <text x="12" y="24" font-size="10" ${FF}>Never over a joint</text><text x="72" y="68" font-size="11" ${FF} font-weight="700" fill="${INK}">T 14:32</text>`, "Tourniquet placement"),
    start: () => sv("0 0 340 186",
      bx(4,6,60,36,["Can walk?"],{b:1,fs:10}) + ar(64,24,72,24,"no",62,18) +
      bx(72,6,60,36,["Breathing?"],{b:1,fs:10}) + ar(132,24,140,24,"yes",128,18) +
      bx(140,6,60,36,["Resp. rate","> 30 / min?"],{b:1,fs:9.5}) + ar(200,24,208,24,"no",198,18) +
      bx(208,6,60,36,["No radial pulse","or cap refill","> 2 s?"],{b:1,fs:8.6}) + ar(268,24,276,24,"no",266,18) +
      bx(276,6,60,36,["Follows","simple","commands?"],{b:1,fs:8.6}) +
      ar(34,42,34,148,"yes",37,98) + bx(4,148,60,32,"MINOR",{fill:TAG.grn,fo:1,tc:"#fff",b:1,fs:10.5}) +
      ar(102,42,102,58,"no",105,53) + bx(72,58,60,24,["Open airway"],{fs:9.5}) + ar(102,82,102,96) + bx(72,96,60,24,["Breathing?"],{b:1,fs:9.5}) +
      ar(102,120,102,148,"no",105,138) + bx(72,148,60,32,"EXPECTANT",{fill:TAG.blk,fo:1,tc:"#fff",b:1,fs:9.5}) +
      ar(132,108,140,108) + `<text x="131" y="104" font-size="9" ${FF} font-weight="700" text-anchor="end">yes</text>` +
      ar(170,42,170,94,"yes",173,72) + ar(238,42,238,94,"yes",241,72) + ar(290,42,262,94,"no",281,74) +
      bx(140,94,128,30,"IMMEDIATE",{fill:TAG.red,fo:1,tc:"#fff",b:1,fs:11}) +
      ar(318,42,318,148,"yes",321,98) + bx(276,148,60,32,"DELAYED",{fill:TAG.yel,fo:1,b:1,fs:10.5}), "START triage"),
    march: () => { const R = [["M","Massive haemorrhage","TQ, pack, pressure"],["A","Airway","Position, NPA"],["R","Respiration","Chest seal, watch for tension"],["C","Circulation","Pulses, shock, IV/IO if trained"],["H","Hypothermia / Head","Insulate, avoid low O₂ and BP"]];
      return sv("0 0 340 196", R.map((r,i) => bx(4,4+i*38,34,30,r[0],{b:1,fs:16,fill:INK,fo:1,tc:"#E9E5D8"}) + bx(44,4+i*38,292,30,[`<tspan font-weight="700">${r[1]}</tspan> · ${r[2]}`],{fs:10.5}) + (i<4 ? ar(21,34+i*38,21,42+i*38) : "")).join(""), "MARCH sequence"); },
    cpr: () => sv("0 0 340 202",
      bx(70,4,200,26,["Unresponsive, not breathing normally?"],{b:1}) + ar(170,30,170,44) +
      bx(70,44,200,26,["Call 112, speaker on · send for AED"]) + ar(170,70,170,84) +
      bx(70,84,200,34,["30 compressions","centre of chest · 5–6 cm · 100–120/min"],{b:1,fill:"#fff"}) + ar(170,118,170,132) +
      bx(70,132,200,26,["2 rescue breaths (if trained)"]) + ar(170,158,170,172) +
      bx(70,172,200,26,["AED arrives: switch on, follow voice"],{b:1}) + ar(270,145,312,145) + ar(312,145,312,101) + ar(312,101,272,101) + `<text x="300" y="128" font-size="9" ${FF} font-weight="700" transform="rotate(90 300 128)">repeat 30:2</text>` +
      "", "CPR sequence"),
    shotChart: () => { const Z = [["Breaking wrist up",0],["Heeling",30],["Thumbing",75],["Breaking wrist down",120],["Jerking",150],["Pushing / anticipating",180],["Jerking / slapping",215],["Tightening grip",250],["Too little finger",280],["Too much finger",300],["Anticipating, no follow-through",330]];
      return sv("0 0 300 220", `<circle cx="150" cy="110" r="80" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="150" cy="110" r="52" fill="none" stroke="${INK}" stroke-width="1"/><circle cx="150" cy="110" r="22" fill="${INK}"/>` +
        Z.map(([t,a]) => { const r = a*Math.PI/180, x = 150 + 92*Math.sin(r), y = 110 - 92*Math.cos(r), anc = Math.sin(r) > .2 ? "start" : Math.sin(r) < -.2 ? "end" : "middle";
          return `<line x1="${150+56*Math.sin(r)}" y1="${110-56*Math.cos(r)}" x2="${150+80*Math.sin(r)}" y2="${110-80*Math.cos(r)}" stroke="${INK}" stroke-width=".8"/><text x="${x}" y="${y+3}" text-anchor="${anc}" font-size="9" ${FF}>${t}</text>`; }).join(""), "Shot correction chart"); },
    body: () => { const fig1 = dx => `<g transform="translate(${dx} 0)" fill="none" stroke="${INK}" stroke-width="1.3"><circle cx="40" cy="14" r="10"/><path d="M28 28 h24 l10 44 -8 2 -6 -30 v36 l4 48 h-9 l-3 -44 -3 44 h-9 l4 -48 v-36 l-6 30 -8 -2 z"/></g>`;
      return sv("0 0 200 140", fig1(10) + fig1(110) + `<text x="50" y="138" font-size="9" ${FF} text-anchor="middle">front</text><text x="150" y="138" font-size="9" ${FF} text-anchor="middle">back</text>`, "Body outline"); },
    column: () => sv("0 0 120 150", `<g stroke="${INK}" fill="none" stroke-width="2.5"><path d="M60 6 l4 10 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1z" fill="${INK}"/><path d="M34 48h52M38 54h44M42 54v76M78 54v76M50 54v76M60 54v76M70 54v76M36 130h48M30 138h60"/></g>`, "Column under star")
  };
  const MORSE = {A:".-",B:"-...",C:"-.-.",D:"-..",E:".",F:"..-.",G:"--.",H:"....",I:"..",J:".---",K:"-.-",L:".-..",M:"--",N:"-.",O:"---",P:".--.",Q:"--.-",R:".-.",S:"...",T:"-",U:"..-",V:"...-",W:".--",X:"-..-",Y:"-.--",Z:"--..",1:".----",2:"..---",3:"...--",4:"....-",5:".....",6:"-....",7:"--...",8:"---..",9:"----.",0:"-----"};
  const NATO = "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu".split(" ");
  const svgSign = d => `<svg viewBox="0 0 60 60"><path d="${d}"/></svg>`;
  const med = `<p class="tiny"><b>For trained users.</b> Follow current CoTCCC / C-TECC guidelines and your own protocols. Not a substitute for a course.</p>`;

  // ---- comms graphics ----
  const RED = "#B23A2E", YEL = "#D9B33B";
  function semaFig(lp, rp, label){
    const ang = (p, side) => p === 0 ? (side < 0 ? 200 : 160) : [0,225,270,315,0,45,90,135][p];
    const arm = (sx, p, side) => { const a = ang(p, side)*Math.PI/180, dx = Math.sin(a), dy = -Math.cos(a), hx = sx + dx*11, hy = 17 + dy*11, ex = sx + dx*20, ey = 17 + dy*20;
      const nx = -dy*side*(p===4 ? -1 : 1), ny = dx*side*(p===4 ? -1 : 1);
      const fx = hx + dx*3.5, fy = hy + dy*3.5, s = 6.5;
      const c1 = [fx, fy], c2 = [fx+dx*s, fy+dy*s], c3 = [fx+dx*s+nx*s, fy+dy*s+ny*s], c4 = [fx+nx*s, fy+ny*s];
      return `<line x1="${sx}" y1="17" x2="${hx}" y2="${hy}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="${INK}" stroke-width=".9"/>` +
        `<polygon points="${[c1,c2,c3].map(c => c.join(",")).join(" ")}" fill="${RED}" stroke="${INK}" stroke-width=".5"/><polygon points="${[c1,c3,c4].map(c => c.join(",")).join(" ")}" fill="${YEL}" stroke="${INK}" stroke-width=".5"/>`; };
    return `<svg viewBox="-6 -6 52 64" class="sema"><circle cx="20" cy="9" r="4" fill="${INK}"/><path d="M20 13 V33 M20 33 L15.5 48 M20 33 L24.5 48" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" fill="none"/>${arm(17.5, lp, -1)}${arm(22.5, rp, 1)}<text x="20" y="57" text-anchor="middle" font-size="9" ${FF} font-weight="700" fill="${INK}">${label}</text></svg>`;
  }
  const SEMA = {A:[1,0],B:[2,0],C:[3,0],D:[0,4],E:[0,5],F:[0,6],G:[0,7],H:[2,1],I:[3,1],J:[4,6],K:[1,4],L:[1,5],M:[1,6],N:[1,7],O:[3,2],P:[2,4],Q:[2,5],R:[2,6],S:[2,7],T:[3,4],U:[3,5],V:[4,7],W:[5,6],X:[5,7],Y:[3,6],Z:[6,7]};
  const semaRow = (letters, cls = "") => `<div class="semagrid ${cls}">${letters.map(([k,l]) => semaFig(SEMA[k] ? SEMA[k][0] : l[0], SEMA[k] ? SEMA[k][1] : l[1], k.length > 1 ? l[2] : k)).join("")}</div>`;
  function handFig(s){
    const hand = (x, y, k) => k === "fist" ? `<circle cx="${x}" cy="${y}" r="2.3" fill="${INK}"/>` : k === "palm" ? `<rect x="${x-2}" y="${y-2.8}" width="4" height="5.6" rx="1.6" fill="#fff" stroke="${INK}" stroke-width="1.1"/>` :
      k === "down" ? `<rect x="${x-2.8}" y="${y-1.6}" width="5.6" height="3.2" rx="1.4" fill="#fff" stroke="${INK}" stroke-width="1.1"/>` : k === "tdown" ? `<circle cx="${x}" cy="${y}" r="2.2" fill="${INK}"/><path d="M${x} ${y+1} v4.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` :
      k === "tup" ? `<circle cx="${x}" cy="${y}" r="2.2" fill="${INK}"/><path d="M${x} ${y-1} v-4.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` : k === "point" ? `<circle cx="${x}" cy="${y}" r="1.6" fill="${INK}"/>` : "";
    const arm = pts => `<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;
    const mv = (s.m || []).map(d => `<path d="${d}" fill="none" stroke="${RED}" stroke-width="1.3" stroke-linecap="round" marker-end="url(#ah)"/>`).join("");
    return `<svg viewBox="0 0 44 50" class="hand"><defs><marker id="ah" viewBox="0 0 6 6" refX="4" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6z" fill="${RED}"/></marker></defs>
      <circle cx="22" cy="9" r="4.2" fill="${INK}"/><path d="M22 13 V32 M22 32 L17.5 47 M22 32 L26.5 47" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      ${arm([[19,17]].concat(s.l))}${arm([[25,17]].concat(s.r || [[28,30]]))}${hand(...s.l[s.l.length-1], s.lh)}${s.rh ? hand(...s.r[s.r.length-1], s.rh) : ""}${mv}${s.x || ""}</svg>`;
  }
  const HS = [
    ["Freeze", "Fist up, forearm vertical. Stop and stay silent.", {l:[[9,17],[9,6]], lh:"fist"}],
    ["Halt", "Arm straight up, open palm forward.", {l:[[14,2]], lh:"palm"}],
    ["Get down", "Arm out, palm down, push toward the ground.", {l:[[4,17]], lh:"down", m:["M4 22 V31"]}],
    ["Rally on me", "Hand on top of the head.", {l:[[10,13],[19,5.5]], lh:"palm"}],
    ["Hurry up", "Fist at shoulder, pumped up and down fast.", {l:[[11,23],[11,13]], lh:"fist", m:["M5 13 V23","M5 23 V13"]}],
    ["Slow down", "Arm out, palm down, moved slowly up and down.", {l:[[4,18]], lh:"down", m:["M4 13 V9","M4 23 V27"]}],
    ["Look", "Two fingers to the eyes, then point.", {l:[[12,17],[18,9]], lh:"point", m:["M14 6 L4 2"]}],
    ["Listen", "Cupped hand behind the ear.", {l:[[11,17],[16,8]], lh:"palm", x:`<path d="M12 4 q-3 4 0 8 M9 2 q-4 6 0 12" stroke="${INK}" stroke-width=".9" fill="none"/>`}],
    ["Enemy / danger", "Thumb down, then point toward it.", {l:[[11,24],[7,30]], lh:"tdown"}],
    ["Understood", "Thumb up.", {l:[[12,25],[14,18]], lh:"tup"}],
    ["Move out", "Arm swung overhead and forward in the direction to go.", {l:[[4,16]], lh:"point", m:["M16 3 Q6 2 3 10"]}],
    ["Line", "Both arms straight out to the sides.", {l:[[4,17]], lh:"palm", r:[[40,17]], rh:"palm"}],
    ["File", "Arm straight up, lowered forward to point.", {l:[[14,2]], lh:"point", m:["M10 2 Q2 6 4 15"]}],
    ["Cancel", "Forearm waved across the face.", {l:[[12,24],[17,12]], lh:"palm", m:["M12 6 H32","M32 6 H12"]}],
    ["Rally point", "Arm up, circled overhead.", {l:[[16,2]], lh:"point", x:`<ellipse cx="16" cy="3" rx="7" ry="2.5" fill="none" stroke="${RED}" stroke-width="1.2"/>`}],
    ["Danger area", "Flat hand drawn across the throat.", {l:[[12,20],[19,14]], lh:"down", m:["M17 16.5 H29"]}]
  ];
  const handGrid = list => `<div class="handgrid">${list.map(([n,d,s]) => `<figure>${handFig(s)}<figcaption><b>${n}</b>${d}</figcaption></figure>`).join("")}</div>`;

  const CARDS = [
    // ================= SURVIVAL =================
    { p:"Survival", t:"Priorities", d:"Rule of 3s, STOP, what to do in the first hour when lost or stranded.",
      f:() => T(["You last about","Without","So first"], [["3 minutes","Air, or with massive bleeding","Stop the bleed, open the airway"],["3 hours","Shelter in harsh weather","Dry, out of wind, off the ground"],["3 days","Water","Find and treat water"],["3 weeks","Food","Food is last"]], 1) +
        `<h4>STOP</h4><p><b>S</b>it down · <b>T</b>hink · <b>O</b>bserve · <b>P</b>lan. Panic burns energy and daylight.</p><h4>Survival order: PLWF</h4><p><b>P</b>rotection (first aid, shelter, fire) · <b>L</b>ocation (signals) · <b>W</b>ater · <b>F</b>ood.</p>`,
      b:() => `<h4>The first hour</h4><ol><li>Stop moving if lost. Most searches end at the last known point.</li><li>Check people: injuries, warmth.</li><li>Inventory: water, food, light, layers, phone battery.</li><li>Call or message 112 / 140 while battery is good.</li><li>Shelter before dark: sunset minus 1 hour is your deadline.</li><li>Make yourself visible: bright clothing out, signal ready.</li></ol>
        <h4>Daylight left</h4><p>Hold your arm out, fingers flat under the sun. Each finger between sun and horizon ≈ 15 minutes.</p>
        <h4>Stay or go?</h4>${T(["Stay if","Go if"], [["Someone knows your route","No one will search"],["Injured or weather bad","You know the way out"],["Shelter is available","Staying means exposure"]])}` },
    { p:"Survival", t:"Shelter and warmth", d:"Heat loss, tarp setups, site selection.",
      f:() => `<h4>How you lose heat</h4>${T(["Way","Example","Stop it"], [["Conduction","Sitting on cold ground, snow","Insulate under you: pack, branches, pad"],["Convection","Wind through clothing","Windproof layer, get out of wind"],["Evaporation","Sweat, wet clothes","Vent early, change into dry layers"],["Radiation","Uncovered head, clear sky","Hat, overhead cover"],["Respiration","Cold air breathed","Buff over mouth"]], 1)}
        <h4>Layers: C.O.L.D.</h4><p>Keep <b>C</b>lean · avoid <b>O</b>verheating · wear it <b>L</b>oose and in layers · keep it <b>D</b>ry.</p>`,
      b:() => `<h4>Tarp setups</h4>${G.tarps()}<h4>Site</h4><ul><li>Not in hollows (cold air pools) or on ridges (wind)</li><li>Check above for dead branches, rockfall, avalanche paths</li><li>Away from water: dew, insects, flash floods</li><li>Insulation under you counts more than cover above</li><li>Ridgeline taut, use a <b>trucker's hitch</b>; guylines with a <b>taut-line hitch</b></li></ul>` },
    { p:"Survival", t:"Water", d:"Purification methods, finding water, how much you need.",
      f:() => T(["Method","Time","Kills","Misses"], [["Boil","1 min rolling, 3 min above 2000 m","Everything biological","Chemicals"],["Hollow-fibre filter","Immediate","Bacteria, protozoa","Viruses, chemicals"],["Chlorine dioxide","30 min; 4 h for Cryptosporidium","Bacteria, viruses, most protozoa","Chemicals; slow in cold"],["UV pen","60–90 s per litre","Bacteria, viruses, protozoa","Cloudy water, chemicals"],["Filter + tablet","30 min","All biological","Chemicals"]], 1) +
        `<p>Cloudy water: settle it, pour through a cloth first. Running water from high ground beats still water near pasture, farms or roads. Never drink seawater or urine.</p>`,
      b:() => `<h4>How much</h4><ul><li>At rest, temperate: 2–3 L a day</li><li>Hiking, heat or altitude: 4–6 L</li><li>Drink before you're thirsty; ration sweat, not water</li></ul><h4>Urine colour</h4>${G.urine()}
        <h4>Finding water</h4><ul><li>Follow valleys and gullies downhill; listen at dawn and dusk</li><li>Green vegetation, insects, bird flight paths at dusk</li><li>Dig on the outside of a dry riverbend</li><li>Morning dew: wipe grass with a cloth, wring out</li><li>Snow: melt it, don't eat it. Start with a little water in the pot.</li></ul>` },
    { p:"Survival", t:"Fire", d:"Fuel sizes, lays, ignition, wet-weather fire, putting it out.",
      f:() => `${G.lays()}<div class="two"><div><h4>Build up</h4><ul><li><b>Tinder</b>: thinner than a match. Birch bark, dry grass, fatwood, cotton with vaseline.</li><li><b>Kindling</b>: pencil thick.</li><li><b>Fuel</b>: thumb, wrist, then arm thick.</li><li>Gather 3× more than you think before you strike.</li></ul></div>
        <div><h4>Which lay</h4><ul><li><b>Teepee</b>: fast, hot, for starting and cooking</li><li><b>Log cabin</b>: stable, long-lasting coals</li><li><b>Lean-to</b>: shelters the flame from wind</li><li><b>Dakota hole</b>: low light and smoke, efficient</li></ul></div></div>`,
      b:() => `<h4>Ignition</h4>${T(["Tool","How"], [["Ferro rod","Hold striker still, pull the rod back into the tinder, not the striker forward"],["Lighter","Keep it warm in a pocket; works in wind if shielded by your body"],["Storm matches","Burn 10–15 s even wet; strike away, hold flame up"],["Battery + steel wool","9 V or two AAs, touch both poles"]], 1)}
        <h4>Wet weather</h4><ul><li>Split wood: the core of dead standing wood stays dry</li><li>Dead twigs from under spruce, still on the tree</li><li>Build on a platform of sticks, not wet ground</li></ul>
        <h4>Putting it out</h4><p>Drown, stir, drown again. Touch the ashes with the back of your hand; if warm, it isn't out.</p>
        <p><b>Law:</b> open fire in or near Austrian forests is generally prohibited (Forstgesetz). Respect bans and fire-danger warnings.</p>` },
    { p:"Survival", t:"Land navigation", d:"Map to ground, declination, pace count, sun and stars.",
      f:() => `<div class="two"><div><h4>Map to ground</h4><ol><li>Orient the map to north.</li><li>Lay the compass edge from you to the target.</li><li>Turn the dial to align with the grid lines.</li><li>Correct for declination.</li><li>Pick a feature on the bearing, walk to it, repeat.</li></ol></div>
        <div><h4>Declination, Austria</h4><p class="big">≈ 4–6° E</p><p>West to east, 2026. Grid to magnetic: subtract. Magnetic to grid: add. Check the current value before a trip.</p></div></div>
        <h4>Tricks</h4><ul><li><b>Handrail</b>: follow a stream, ridge or path parallel to your route</li><li><b>Catching feature</b>: a road or river that tells you you've gone too far</li><li><b>Aiming off</b>: aim deliberately left of a point on a line, then turn right</li><li><b>Attack point</b>: an easy feature close to the hard-to-find target</li></ul>`,
      b:() => `<h4>Pace count</h4><p>Count every left foot. Most people take 60–70 double paces per 100 m on flat ground. Measure yours; add 10–20 % uphill, at night, in snow. Tie knots in a cord every 100 m.</p>
        <div class="two"><div><h4>Shadow stick</h4>${G.shadow()}<p class="tiny">Mark the shadow tip, wait 15 min, mark again. First mark is west.</p></div><div><h4>North star</h4>${G.dipper()}<p class="tiny">Polaris is never more than 1° from true north.</p></div></div>
        <h4>Watch method</h4><p>Point the hour hand at the sun. South lies halfway between it and 12 (1 in summer time).</p>` },
    { p:"Survival", t:"Cold and heat", d:"Hypothermia, frostbite, heat exhaustion, heat stroke.",
      f:() => `<h4>Hypothermia</h4>${T(["Stage","Signs","Do"], [["Mild","Shivering, cold hands, still clear","Shelter, dry layers, warm sweet drinks, move"],["Moderate","The umbles: stumbles, mumbles, fumbles, grumbles","Insulate, heat packs on chest and armpits, no rubbing, keep flat"],["Severe","Shivering stops, confused or unconscious","Handle gently, keep horizontal, call 112 / 140, CPR if no breathing"]], 1)}
        <h4>Hypothermia wrap</h4><p>Insulation under → casualty in dry layers → heat packs on chest → sleeping bag → vapour barrier (foil, tarp) → hat and buff.</p>
        <h4>Frostbite</h4><p>White, waxy, numb, hard skin. Rewarm in 37–39 °C water only if it can't refreeze. Never rub, never snow.</p>`,
      b:() => T(["","Heat exhaustion","Heat stroke"], [["Skin","Pale, cool, sweaty","Hot, red, may be dry"],["Mind","Tired, dizzy, headache","Confused, aggressive, collapse"],["Body","Nausea, cramps, fast pulse","Temp over 40 °C, seizures"],["Do","Shade, lie down, legs up, water with salt","<b>Emergency.</b> Call 112. Cool hard and fast: soak, fan, ice to neck, armpits, groin"]], 1) +
        `<h4>Prevent</h4><ul><li>Heat: work early and late, drink with electrolytes, watch each other</li><li>Cold: eat often, stay dry, change socks, buddy-check faces for white spots</li><li>Wind chill: −5 °C with 30 km/h wind feels like −13 °C</li></ul>` },
    { p:"Comms", t:"Signalling", d:"Ground-to-air, helicopter body signals, distress signals, landing site.",
      f:() => `<h4>Ground-to-air symbols</h4><div class="g2a">
        <div>${svgSign("M12 10 L30 50 L48 10")}<p><b>V</b> Need assistance</p></div>
        <div>${svgSign("M12 10 L48 50 M48 10 L12 50")}<p><b>X</b> Need medical help</p></div>
        <div>${svgSign("M30 8 L30 52")}<p><b>I</b> Need supplies</p></div>
        <div>${svgSign("M8 30 L50 30 M38 18 L50 30 L38 42")}<p><b>→</b> Moving this way</p></div>
        <div>${svgSign("M15 10 L30 30 L45 10 M30 30 L30 50")}<p><b>Y</b> Yes</p></div>
        <div>${svgSign("M14 50 L14 10 L46 50 L46 10")}<p><b>N</b> No</p></div>
        <div>${svgSign("M30 6 v14 M30 20 L14 6 M30 20 L46 6 M30 20 v18 M30 38 L20 54 M30 38 L40 54")}<p><b>Body Y</b> Yes, need help</p></div>
        <div>${svgSign("M30 10 v28 M30 20 L46 6 M30 26 L14 40 M30 38 L20 54 M30 38 L40 54")}<p><b>Body N</b> No help needed</p></div></div>
        <p>Symbols at least 2.5 m long. Contrast beats size: dark on snow, light on forest floor. Straight lines don't occur in nature. Body signals: face the helicopter, hold still.</p>`,
      b:() => `<div class="two"><div class="box"><h4>Alpine distress signal</h4><ul><li><b>Call:</b> 6 signals in 1 min (every 10 s), 1 min pause, repeat</li><li><b>Answer:</b> 3 signals in 1 min (every 20 s), 1 min pause</li><li>Whistle, light, mirror, cloth</li></ul></div>
        <div class="box"><h4>Whistle</h4><ul><li>1 blast: where are you?</li><li>2 blasts: come to me</li><li>3 blasts: help</li><li>SOS: 3 short, 3 long, 3 short</li></ul></div></div>
        <p><b>Mirror:</b> two fingers in a V around the aircraft, tilt until the light spot sits on them, rock gently. Visible 15+ km. <b>Fire:</b> three in a triangle = distress; green leaves for white smoke.</p>
        <h4>Helicopter landing site</h4><p>Flat, 25 × 25 m, under 10° slope, no wires or loose items. Stand at the edge, back to the wind, arms in Y. Approach only from the front, crouched, when the crew signals.</p>` },
    { p:"Comms", t:"Emergency call", d:"Numbers in Austria and abroad, the five W's, location formats.",
      f:() => T(["Austria","Who"], [["<b>112</b>","Euro emergency, any network, no credit"],["<b>140</b>","Mountain rescue (Bergrettung)"],["<b>144</b>","Ambulance"],["<b>133</b>","Police"],["<b>122</b>","Fire brigade"],["<b>141</b>","Out-of-hours doctor"],["<b>01 406 43 43</b>","Poison information (Vienna)"]], 1) +
        `<h4>Give the five W's</h4><ol><li><b>Where</b> is it? Place, trail, coordinates.</li><li><b>What</b> happened?</li><li><b>How many</b> are hurt?</li><li><b>Which</b> injuries? Conscious, breathing, bleeding?</li><li><b>Wait</b> for questions. The dispatcher ends the call.</li></ol>`,
      b:() => T(["Abroad","Number"], [["EU, UK, CH, most of Europe","112"],["UK also","999"],["Switzerland air rescue (Rega)","1414"],["USA, Canada","911"],["Australia","000"]], 1) +
        `<h4>Reading your location</h4><ul><li>Phone: maps app, long-press your dot, read decimal degrees: <b>47.2692, 11.4041</b></li><li>Say each digit; give the format ("decimal degrees")</li><li>Austrian maps (ÖK) use UTM: zone, easting, northing</li><li>Mountain hut, trail number, last junction, altitude: all help</li></ul>
        <h4>No signal?</h4><ul><li>112 can work on another network when yours has no coverage</li><li>Climb to a ridge; send an SMS, it gets through on weak signal</li><li>Save battery: flight mode between tries, screen dim</li></ul>` },
    { p:"Comms", t:"NATO alphabet and Morse", d:"Every letter with its phonetic word and Morse code; numbers, SOS, prosigns.",
      f:() => `<div class="nm">${NATO.map(w => `<div><b>${w[0]}</b><span>${w}</span><i>${MORSE[w[0]].replace(/\./g,"·").replace(/-/g,"–")}</i></div>`).join("")}</div>`,
      b:() => `<div class="nm num">${[["0","zero"],["1","wun"],["2","too"],["3","tree"],["4","fower"],["5","fife"],["6","six"],["7","seven"],["8","ait"],["9","niner"]].map(([d,w]) => `<div><b>${d}</b><span>${w}</span><i>${MORSE[d].replace(/\./g,"·").replace(/-/g,"–")}</i></div>`).join("")}</div>
        <p><b>SOS</b> · · · – – – · · · as one signal, no gaps. <b>Timing:</b> dot 1 · dash 3 · gap in letter 1 · between letters 3 · between words 7.</p>
        ${T(["Prosign","Code","Means"], [["K","<b class=\"mc\">– · –</b>","Over, go ahead"],["AR","<b class=\"mc\">· – · – ·</b>","End of message"],["SK","<b class=\"mc\">· · · – · –</b>","End of contact"],["R","<b class=\"mc\">· – ·</b>","Received"],["IMI","<b class=\"mc\">· · – – · ·</b>","Say again"]], 1)}
        <p class="tiny">Spell names and grid letters phonetically, numbers digit by digit: 1500 = "wun fife zero zero". Light: hold the lamp still, cover and uncover.</p>` },
    { p:"Comms", t:"Radio procedure", d:"Prowords, call structure, signal reports, PMR446.",
      f:() => `${T(["Proword","Means"], [["Roger","Received and understood"],["Wilco","Will comply"],["Say again","Repeat your last"],["Over","Your turn, reply"],["Out","Conversation ended"],["Break","Pause between parts"],["Wait / wait out","Pause / I'll call back"],["Correction","Error, correct version follows"],["Mayday / Pan-pan","Distress / urgency"]], 1)}`,
      b:() => `<h4>Making a call</h4><ol><li>Think first: who, where, what, what you need.</li><li>Press, wait 1 s, speak slowly, release.</li><li>"<i>Base, this is Ranger 2, over.</i>" Wait for the answer.</li><li>Send the message in short parts; end with "over" or "out".</li></ol>
        <p><b>Signal reports:</b> loud and clear · readable · weak but readable · unreadable (move and retry).</p>
        <p><b>Discipline:</b> short calls, no names or locations in clear if it matters, listen before you transmit.</p>
        <p class="tiny">PMR446: licence-free in the EU, short range, 16 channels. Agree channel and call signs before you leave.</p>` },
    { p:"Comms", t:"Hand signals", d:"16 silent signals for moving as a team.",
      f:() => handGrid(HS.slice(0,8)), b:() => handGrid(HS.slice(8)) + `<p class="tiny">Agree signals with your team beforehand; pass each one back down the line.</p>` },
    { p:"Comms", t:"Semaphore", d:"Flag and arm alphabet, A to Z, as seen by the receiver.",
      f:() => semaRow("ABCDEFGHIJKLM".split("").map(k => [k]).concat([["SP",[0,0,"Rest"]]]), "s7") + `<p class="tiny">Drawn as the receiver sees you. A–G: one arm moves around the clock, the other rests low.</p>`,
      b:() => semaRow("NOPQRSTUVWXYZ".split("").map(k => [k]).concat([["NUM",[4,5,"Numbers"]],["CAN",[3,7,"Cancel"]]])) + `<p class="tiny">After "Numbers", A–J mean 1–0 until "J" (letters) is sent. Without flags, use bright cloth or bare arms against a plain background.</p>` },
    // ================= MEDICAL =================
    { p:"Medical", t:"TCCC and TECC", d:"Phases of tactical casualty care, THREAT, the order of work.",
      f:() => T(["TCCC (military)","TECC (civilian)","Zone","Priorities"], [["Care Under Fire","Direct Threat Care","Hot","Win the fight or move to cover. Self-aid. Only massive limb bleeding: TQ high and tight. No airway care."],["Tactical Field Care","Indirect Threat Care","Warm","Full MARCH PAWS. Reassess TQs. Airway, chest, shock, warmth. Document."],["Tactical Evacuation","Evacuation Care","Cold","Continue care during transport. Hand over with MIST."]], 1) +
        `<h4>THREAT (Hartford Consensus)</h4><p><b>T</b>hreat suppression · <b>H</b>emorrhage control · <b>R</b>apid <b>E</b>xtrication to safety · <b>A</b>ssessment by medical providers · <b>T</b>ransport to definitive care.</p>
        <h4>Hot zone rules</h4><ul><li>Fire superiority is the best medicine</li><li>Casualty: self-aid, move to cover if possible</li><li>Drag by drag handle, belt or collar; don't stop in the open</li></ul>${med}`,
      b:() => `<div class="marchw">${G.march()}</div><p><b>Then PAWS:</b> <b>P</b>ain per protocol · <b>A</b>ntibiotics for penetrating wounds · <b>W</b>ounds: reassess, find missed ones · <b>S</b>plint, check pulse before and after.</p>${med}` },
    { p:"Medical", t:"Massive bleeding", d:"Tourniquet, wound packing, pressure bandage, shock.",
      f:() => `<div class="tqw">${G.tq()}</div><ol><li>Strap tight, then twist the windlass until bleeding stops and the distal pulse is gone.</li><li>Lock, secure, write the time on TQ and card.</li><li>Still bleeding: second TQ just above the first.</li><li>Warm zone: expose and reassess; trained users may relocate it.</li></ol><p class="tiny">It hurts; that is normal. Never loosen to check. Not over a joint.</p>`,
      b:() => `<h4>Wound packing (junctional, or where no TQ fits)</h4><ol><li>Expose the wound, find the source of bleeding.</li><li>Pack haemostatic or plain gauze tightly into the wound, finger to the bottom.</li><li>Keep packing until full and above skin level.</li><li>Hold firm pressure: at least 3 min (haemostatic), 10 min (plain).</li><li>Pressure bandage over it; reassess for bleeding through.</li></ol>
        <h4>Pressure bandage</h4><p>Pad on the wound, wrap with tension, use the pressure bar over the wound, lock the end. Check fingers or toes stay warm.</p>
        <h4>Signs of shock</h4>${T(["Look for","Do"], [["Pale, cold, sweaty skin","Stop bleeding first"],["Fast, weak or absent radial pulse","Lay flat, keep warm"],["Confused, restless, thirsty","No food or drink; evacuate"]])}${med}` },
    { p:"Medical", t:"Airway and breathing", d:"Airway positions, NPA, chest seal, tension pneumothorax.",
      f:() => `<h4>Airway</h4>${T(["Situation","Do"], [["Talking, conscious","Airway is open. Let them sit in the position they prefer."],["Unconscious, breathing","Recovery position (on side, top knee bent, head tilted back)"],["Unconscious, no trauma","Head tilt, chin lift"],["Facial trauma, conscious","Sit up and lean forward so blood drains"],["Snoring, gurgling","Jaw thrust; NPA if trained"]], 1)}
        <h4>Nasopharyngeal airway (NPA)</h4><ol><li>Size: tip of nose to earlobe.</li><li>Lubricate. Bevel toward the septum.</li><li>Insert straight back along the floor of the nose, not up.</li><li>Gentle rotation; never force. Try the other side.</li></ol>${med}`,
      b:() => `<h4>Respiration</h4><ol><li>Expose the chest and back. Check armpits for exit wounds.</li><li>Any open chest wound: seal it with a <b>vented chest seal</b> at the end of exhalation.</li><li>Unvented seal: watch closely, "burp" it if breathing worsens.</li><li>Sit the casualty up or lay them injured side down if it helps breathing.</li></ol>
        <h4>Tension pneumothorax, suspect when</h4><ul><li>Increasing difficulty breathing after chest injury</li><li>Falling oxygen, fast weak pulse, collapse</li><li>Breath sounds missing on one side</li></ul><p>Burp or remove the seal first. Needle decompression only by trained providers.</p>
        <h4>Normal adult values</h4>${T(["Breathing rate","SpO₂","Pulse","Cap refill"], [["12–20 /min","≥ 95 %","60–100 /min","< 2 s"]])}${med}` },
    { p:"Medical", t:"CPR and AED", d:"Adult basic life support, choking, recovery position.",
      f:() => `${G.cpr()}<p class="tiny">Swap rescuer every 2 min. Keep going until help takes over or the person wakes. Hands-only CPR is fine if you can't or won't give breaths. Drowning and children: 5 rescue breaths first. In tactical trauma with no pulse, CPR is not indicated (TCCC).</p>`,
      b:() => `<h4>Choking (adult)</h4><ol><li>Can cough? Encourage coughing.</li><li>Cough ineffective: up to <b>5 back blows</b> between the shoulder blades.</li><li>Then up to <b>5 abdominal thrusts</b> (fist above navel, pull in and up).</li><li>Alternate until clear. Unconscious: call 112, start CPR.</li></ol>
        <h4>Recovery position</h4><ol><li>Arm nearest you at right angle, palm up.</li><li>Far hand against near cheek, hold it there.</li><li>Pull far knee up, roll toward you.</li><li>Tilt head back, mouth down to drain. Check breathing every minute.</li></ol>
        <h4>AED</h4><ul><li>Bare, dry chest; pads as pictured, right below collarbone and left side under armpit</li><li>Nobody touches during analysis and shock</li><li>Remove medication patches; avoid pads over implanted devices</li></ul>` },
    { p:"Medical", t:"Triage and handover", d:"START triage, AT-MIST, AVPU, vital signs.",
      f:() => `${G.start()}<p class="tiny">START, adult. 30 s each: only open the airway and stop massive bleeding, then move on. Retriage often.</p>${med}`,
      b:() => `<h4>AT-MIST handover</h4>${T(["","Say"], [["<b>A</b>ge","Approximate"],["<b>T</b>ime","Of injury, and TQ times"],["<b>M</b>echanism","Fall, gunshot, blast, vehicle, knife"],["<b>I</b>njuries","Head to toe, most serious first"],["<b>S</b>igns","Pulse, breathing, SpO₂, AVPU, trends"],["<b>T</b>reatment","What you did and when"]])}
        <h4>AVPU</h4><p><b>A</b>lert · responds to <b>V</b>oice · responds to <b>P</b>ain · <b>U</b>nresponsive. Anything below A: watch the airway.</p>
        <h4>Tag colours</h4><div class="tags"><span class="t-red">Immediate</span><span class="t-yel">Delayed</span><span class="t-grn">Minor</span><span class="t-blk">Expectant</span></div>` },
    { p:"Medical", t:"Assessment", d:"cABCDE primary survey, SAMPLE, OPQRST, BE-FAST stroke.",
      f:() => `<h4>Primary survey: cABCDE</h4>${T(["","Check","Act"], [["<b>c</b>","Catastrophic bleeding","TQ, pack, press"],["<b>A</b>","Airway: talking? noises?","Position, suction, NPA"],["<b>B</b>","Breathing: rate, depth, both sides, wounds","Chest seal, sit up"],["<b>C</b>","Circulation: pulse, skin, cap refill","Stop other bleeding, lay flat, warm"],["<b>D</b>","Disability: AVPU, pupils, sugar","Recovery position, sugar if alert"],["<b>E</b>","Exposure: head-to-toe, back","Find all wounds, then cover and warm"]])}
        <p>Run it top to bottom; fix each problem before moving on; repeat after every change or move.</p>`,
      b:() => `<div class="two"><div><h4>SAMPLE history</h4><ul><li><b>S</b>igns and symptoms</li><li><b>A</b>llergies</li><li><b>M</b>edications</li><li><b>P</b>ast illness</li><li><b>L</b>ast meal, drink</li><li><b>E</b>vents leading up</li></ul></div>
        <div><h4>OPQRST pain</h4><ul><li><b>O</b>nset</li><li><b>P</b>rovokes, palliates</li><li><b>Q</b>uality (sharp, dull)</li><li><b>R</b>adiates</li><li><b>S</b>everity 0–10</li><li><b>T</b>ime, since when</li></ul></div></div>
        <h4>Stroke: BE-FAST</h4>${T(["","Check"], [["<b>B</b>alance","Sudden loss of balance"],["<b>E</b>yes","Sudden vision loss"],["<b>F</b>ace","Ask to smile: one side droops?"],["<b>A</b>rms","Raise both: one drifts down?"],["<b>S</b>peech","Slurred, strange?"],["<b>T</b>ime","Call 112 now, note the time"]])}` },
    { p:"Medical", t:"9-line and casualty card", d:"MEDEVAC request and a casualty card to fill in.",
      f:() => T(["Line","Content"], [["1","Pickup location (grid)"],["2","Radio frequency, call sign"],["3","Patients by precedence: A urgent, B urgent surgical, C priority, D routine, E convenience"],["4","Special equipment: A none, B hoist, C extraction, D ventilator"],["5","Patients by type: L litter, A ambulatory"],["6","Security at pickup: N none, P possible, E enemy, X armed escort"],["7","Marking: A panels, B pyro, C smoke, D none, E other"],["8","Nationality and status"],["9","CBRN contamination / terrain"]], 1) + `<p class="tiny">NATO format. Civilian rescue: 112 with the five W's (Emergency call card).</p>`,
      b:() => `<div class="cc"><div class="ccf"><span>Roster / ID</span><span>Date</span><span>Time of injury</span></div>${G.body()}
        <div class="ccf"><span>Mechanism: GSW · blast · fall · MVC · other</span></div>
        ${T(["TQ","Location","Time","TQ","Location","Time"], [["1","","","2","",""]])}
        ${T(["Time","Pulse","Resp","SpO₂","AVPU","Pain"], [["&nbsp;","","","","",""],["&nbsp;","","","","",""]])}
        <div class="ccf"><span>☐ Packing</span><span>☐ Pressure bandage</span><span>☐ NPA</span><span>☐ Chest seal</span><span>☐ Hypothermia wrap</span></div></div>` },

    // ================= SHOOTING =================
    { p:"Shooting", t:"Safety and fundamentals", d:"Four rules, six fundamentals, range commands, shot correction chart.",
      f:() => `<div class="box mb8"><h4>The four rules</h4><ol><li>Treat every firearm as loaded.</li><li>Never point it at anything you are not willing to destroy.</li><li>Finger off the trigger until the sights are on target.</li><li>Be sure of your target and what is behind it.</li></ol></div>
        ${T(["Fundamental","Cue"], [["Position","Bone support, not muscle. Natural point of aim."],["Grip","Firm, high, the same every time."],["Sight picture","Focus on the front sight or reticle."],["Breathing","Break the shot in the natural pause."],["Trigger","Press straight back, surprise break."],["Follow-through","Hold, call the shot, reset."]], 1)}
        <h4>Range commands</h4><p><b>Cease fire</b>: stop now, finger out, muzzle safe · <b>Make safe</b>: unload, show clear · anyone may call cease fire.</p>`,
      b:() => `<div class="two"><div>${G.shotChart()}</div><div><h4>Shot correction (right-handed pistol)</h4><p>A classic starting point, not a diagnosis. Left-handed: mirror it.</p><p>Tight group off centre: sights. Scattered group: shooter.</p><h4>Calling the shot</h4><p>Say where the sights were when it broke, before you look. If call and hit match, fix the zero.</p></div></div>` },
    { p:"Shooting", t:"MIL, MOA and the math", d:"Angular unit tables, conversions, angle cosines.",
      f:() => { const ds = [100,200,300,400,500,600,800], f = x => x.toLocaleString("en",{maximumFractionDigits:1});
        return `<h4>MIL in cm</h4>` + T(["MIL"].concat(ds.map(d => d+" m")), [0.1,0.5,1,2,5].map(m => [`<b>${m}</b>`].concat(ds.map(d => f(m*d/10))))) +
          `<h4>MOA in cm</h4>` + T(["MOA"].concat(ds.map(d => d+" m")), [0.25,1,2,5].map(m => [`<b>${m}</b>`].concat(ds.map(d => f(m*MOA_CM_100*d/100))))); },
      b:() => `<h4>Conversions</h4>${T(["From","To","×"], [["MIL","MOA","3.438"],["MOA","MIL","0.291"],["MIL at 100 m","cm","10"],["MOA at 100 m","cm","2.91"],["MOA at 100 yd","inch","1.047"],["Group (cm) at R (m)","MIL","÷ (R ÷ 10)"]], 1)}
        <h4>Angle shooting: use distance × cos, up or down</h4>${T(["Angle","10°","15°","20°","25°","30°","35°","40°","45°"], [["cos","0.98","0.97","0.94","0.91","0.87","0.82","0.77","0.71"]])}
        <p><b>Clicks at 100 m:</b> 0.1 MIL = 1 cm · 1/4 MOA = 0.73 cm · 1/8 MOA = 0.36 cm.</p>` },
    { p:"Shooting", t:"Range estimation", d:"Mil relation, reference sizes, methods without optics.",
      f:() => { const sizes = [["Person, standing",1.8],["Head",0.25],["Shoulders",0.5],["Car height",1.5],["Car length",4.5],["Door",2.0],["Roe deer, chest–back",1.0]], ds = [100,200,300,400,500,600,800];
        return `<p class="big mb6">Range (m) = size (m) × 1000 ÷ MIL</p><p>What each object reads in MIL:</p>` + T(["Object"].concat(ds.map(d => d+" m")), sizes.map(([n,s]) => [n].concat(ds.map(d => (s*1000/d).toFixed(s*1000/d < 1 ? 2 : 1)))), 1) + `<p class="tiny">Read to 0.1 MIL. At 4 MIL, a 0.5 MIL error is 12 % range error.</p>`; },
      b:() => `<h4>Without optics</h4>${T(["You can see","About"], [["Eyes, mouth","100 m"],["Face, buttons","200 m"],["Body shape, colours","300 m"],["Body, no detail","400 m"],["Head, torso blur","500 m"],["Moving post","600 m+"]], 1)}
        <p><b>Methods:</b> count 100 m units (a football pitch) · bracket ("300 to 500" → 400) · average several people's guesses.</p>
        <div class="two"><div><h4>Looks closer</h4><p>Bright light, across water or a valley, up or downhill, large contrasting target.</p></div><div><h4>Looks farther</h4><p>Dusk, fog, rain, small or half-hidden target, through a forest edge, when prone.</p></div></div>` },
    { p:"Shooting", t:"Wind", d:"Reading wind, clock values, mirage, a drift table.",
      f:() => T(["km/h","You see"], [["0–2","Smoke rises straight up"],["3–5","Smoke drifts, flags hang"],["6–11","Felt on face, leaves rustle, flags lift"],["12–19","Leaves, twigs in constant motion, flags extend"],["20–28","Dust and paper lift, small branches move"],["29–38","Small trees sway, flags snap"]], 1) +
        `<div class="two"><div><h4>Clock value</h4><ul><li>3 and 9: full</li><li>2, 4, 8, 10: ≈ 0.9</li><li>1, 5, 7, 11: half</li><li>12 and 6: none</li></ul></div><div><h4>Mirage</h4><ul><li>Boiling: no wind or at a switch</li><li>Leaning: light to moderate</li><li>Flat, fast: strong; gone over ≈ 20 km/h</li><li>Focus the scope just in front of the target</li></ul></div></div>`,
      b:() => { const r = solve({bc:.505,mv:790,sh:4.5,zero:100,wind:10,clock:3,alt:400,temp:10,max:800,step:100,mass:11.3});
        return `<h4>Drift for 10 km/h full value</h4><p class="tiny">.308 Win 175 gr, 790 m/s, 400 m, 10 °C. Scale: 20 km/h = ×2, half value = ×0.5.</p>` + T(["Range m"].concat(r.map(x => x.R)), [["cm"].concat(r.map(x => fmtN(x.drift,0))), ["MIL"].concat(r.map(x => fmtN(x.drift*10/x.R,1)))], 1) +
          `<h4>Wind in practice</h4><ul><li>Read the wind at the target and halfway; the middle matters most</li><li>Hold for the average, shoot in the lulls if you can</li><li>Bracket: first hold on the edge you're sure of, correct from impact</li><li>Write your observed drift on the DOPE card</li></ul>`; } },
    { p:"Shooting", t:"DOPE card", d:"Your come-ups from the calculator; a log to fill in on the range.",
      f:() => { if (!lastBall) return "<p>Open Shooting → Drop &amp; wind first.</p>";
        const {o,res,load} = lastBall, I = o.imp, D = I ? 0.9144 : 1, rr = R => Math.round(R / D), rows = res.filter(r => rr(r.R) % 100 === 0 || res.length <= 12), cf = o.clock ? Math.abs(Math.sin(o.clock*Math.PI/6)) : 0;
        const wref = I ? 16.0934 : 10;
        return `<p><b>${esc(load)}</b> · BC ${o.model||"G1"} ${o.bc} · ${I ? fmtN(o.mv*3.28084) + " fps" : fmtN(o.mv) + " m/s"} · zero ${rr(o.zero)} ${I ? "yd" : "m"} · ${I ? fmtN(o.alt*3.28084) + " ft, " + fmtN(o.temp*9/5+32) + " °F" : fmtN(o.alt) + " m, " + fmtN(o.temp) + " °C"}</p>` +
          T([I ? "Range yd" : "Range m","Elev. MIL","Elev. MOA",I ? "Wind MIL / 10 mph" : "Wind MIL / 10 km/h",I ? "Velocity fps" : "Velocity m/s","Seen"], rows.map(r => [rr(r.R), fmtN(-r.dropcm*10/r.R,1), fmtN(-r.dropcm/(MOA_CM_100*r.R/100),1), (o.wind && cf) ? fmtN(r.drift*10/r.R * (wref/o.wind)/cf,1) : "–", fmtN(I ? r.vms*3.28084 : r.vms), ""])) +
          `<p class="tiny">Calculated. Overwrite with what you observe.</p>`; },
      b:() => `<h4>Range log</h4>${T(["Date","Place","Temp","Alt.","Wind","Range","Dialed","Impact","Note"], Array.from({length:6}, () => Array(9).fill("&nbsp;")))}
        <h4>Zero confirmation</h4>${T(["Date","Distance","Group size","Offset","Clicks"], Array.from({length:3}, () => Array(5).fill("&nbsp;")))}` },

    // ================= STOIC =================
    { p:"Stoic", t:"Dichotomy of control", d:"What is up to me, what is not. Epictetus and the archer.",
      f:() => `<p class="q">"Of things some are in our power, and others are not." Epictetus, Enchiridion 1</p>
        <div class="two"><div class="box"><h4>Up to me</h4><ul><li>My judgements</li><li>My intentions and effort</li><li>What I desire and avoid</li><li>How I act and respond</li><li>My training and preparation</li></ul></div>
        <div class="box"><h4>Not up to me</h4><ul><li>My body, in the end</li><li>Weather, terrain, luck</li><li>Other people's actions</li><li>Reputation, outcome, score</li><li>The past</li></ul></div></div>`,
      b:() => `<h4>The archer</h4><p>The Stoic archer does everything in his power: trains, chooses the arrow, reads the wind, draws and releases well. Once the arrow leaves the bow, the hit is no longer his. His goal is the good shot, not the hit. (After Cicero, De Finibus 3.22.)</p>
        <h4>The reserve clause</h4><p>Plan fully, then add: <i>"…if nothing prevents it."</i> Failure of the plan is then not a failure of you.</p>
        <h4>In practice</h4><ol><li>Name what is bothering you.</li><li>Split it: which part is mine, which is not?</li><li>Act fully on mine. Let the rest go, on purpose.</li></ol><div class="lines"><div></div><div></div><div></div></div>` },
    { p:"Stoic", t:"Four virtues", d:"Wisdom, courage, justice, temperance, and their counterfeits.",
      f:() => T(["Virtue","Latin","In the field"], [["Wisdom","Sapientia","See the situation as it is, not as you fear it"],["Courage","Fortitudo","Act while afraid; endure what must be endured"],["Justice","Iustitia","Do right by the team and by strangers"],["Temperance","Temperantia","Enough food, enough kit, enough words"]], 1) + `<p>Everything else (comfort, gear, praise, money) is "indifferent": useful, never the goal.</p>`,
      b:() => T(["Virtue","Too little","Too much (counterfeit)"], [["Wisdom","Foolishness, panic","Cleverness without honesty"],["Courage","Cowardice","Recklessness"],["Justice","Selfishness","Self-righteousness"],["Temperance","Indulgence","Rigid self-denial for show"]], 1) +
        `<h4>Daily check</h4><ol><li>Where did I see clearly today, where did fear decide?</li><li>What hard thing did I do anyway?</li><li>Whom did I treat well, whom did I neglect?</li><li>Where was enough, enough?</li></ol>` },
    { p:"Stoic", t:"Morning preparation", d:"Premeditatio malorum and the view from above.",
      f:() => `<p class="q">"Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial." Marcus Aurelius, Meditations 2.1</p>
        <ol><li>What is the hardest thing I will face today?</li><li>What could go wrong, and how will I respond?</li><li>Which virtue will I need most?</li></ol><div class="lines"><div></div><div></div><div></div><div></div></div>`,
      b:() => `<h4>Premeditatio malorum, step by step</h4><ol><li>Pick tomorrow's mission or a hard situation.</li><li>Imagine it going wrong, concretely, in order.</li><li>For each setback: what is still in my control?</li><li>Rehearse the calm response, with box breathing.</li><li>Accept the worst case once. Then plan to avoid it.</li></ol>
        <h4>The view from above</h4><p>Picture yourself from above: your room, your town, the country, the continent, the earth. See how small today's problem sits in it. Then come back down and act.</p>` },
    { p:"Stoic", t:"Evening review", d:"Seneca's and Epictetus' questions, with room to write.",
      f:() => `<p class="q">"What bad habit have I cured today? What fault have I resisted? In what respect am I better?" Seneca, De Ira 3.36</p>
        <ol><li>Where did I go wrong?</li><li>What did I do well?</li><li>What did I leave undone?</li></ol><p class="tiny">The Pythagorean review Epictetus recommends, Discourses 3.10.</p><div class="lines"><div></div><div></div><div></div><div></div><div></div></div>`,
      b:() => `<h4>Seven nights</h4>${T(["Day","Went wrong","Went well","Undone"], ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => [d,"&nbsp;","&nbsp;","&nbsp;"]), 1)}<p class="tiny">Judge the action, not yourself. Be your own fair commander: firm, specific, done.</p>` },
    { p:"Stoic", t:"Memento mori", d:"The coin's reverse as a card, with the lines behind it.",
      f:() => `<div class="two aic"><div class="tac">${G.column()}</div>
        <div><p class="big">MEMENTO MORI</p><p>DISCIPLINA · VIRTUS · VIGILANTIA</p>
        <p class="q">"Since it is possible that thou mayest depart from life this very moment, regulate every act and thought accordingly." Marcus Aurelius, Meditations 2.11</p></div></div>
        <p>Not a threat, a filter. If today were the last, would this matter? Then do it well, or drop it.</p>`,
      b:() => `<p class="q">"Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good." Meditations 4.17</p>
        <p class="q">"Let death and exile, and all other things which appear terrible, be daily before your eyes, but chiefly death; and you will never entertain any abject thought, nor too eagerly covet anything." Epictetus, Enchiridion 21</p>
        <h4>The symbols</h4><ul><li><b>Column</b>: what stands when everything else falls</li><li><b>Star</b>: a fixed point to navigate by</li><li><b>Disciplina · Virtus · Vigilantia</b>: discipline, courage, watchfulness</li></ul>` },
    { p:"Stoic", t:"Breathing protocols", d:"The six patterns from Breathe, and how to train them.",
      f:() => T(["Pattern","Rhythm (s)","When"], Object.values(PATS).filter(p => p.ph).map(p => [`<b>${p.name}</b>`, p.sub, p.use.split(".")[0]]), 1) + `<p>One minute of box breathing before anything hard. Coherent breathing daily builds the floor you fall back to.</p>`,
      b:() => `<h4>Train it like a skill</h4><ol><li>Daily: 10 min coherent breathing, same time each day.</li><li>Under load: after sprints or a drill, box breathe until heart rate drops; time it.</li><li>On the range: pre-shot pattern before every string.</li><li>Pair it with a cue word ("steady") so the word alone brings the calm.</li></ol>
        <h4>Signs of rising stress</h4>${T(["Body","Mind"], [["Fast heart, tunnel vision","Racing thoughts, time distortion"],["Shaky hands, dry mouth","Fixation on one thing"],["Loss of fine motor skill","Hearing shuts down"]])}<p>Breathe out longer than in. It is the one lever on your nervous system you always carry.</p>` }
  ];

    const CATS = ["Survival","Medical","Comms","Shooting","Stoic"];
  let filter = "all", sel = 0;
  const pad = i => "FC-" + String(i+1).padStart(2,"0");
  $("cardFilters").innerHTML = `<button type="button" data-f="all" aria-pressed="true">All ${CARDS.length}</button>` + CATS.map(c => `<button type="button" data-f="${c}" aria-pressed="false">${c} ${CARDS.filter(x => x.p===c).length}</button>`).join("");
  function renderCards(){
    $("cardGrid").innerHTML = CARDS.map((c,i) => (filter==="all" || c.p===filter) ?
      `<button type="button" class="fcard" data-c="${i}" aria-pressed="${i===sel}"><span class="cardrow"><span class="no">${pad(i)}</span><span class="pillar">${c.p}</span></span><b>${c.t}</b><span>${c.d}</span></button>` : "").join("");
  }
  $("cardGrid").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; sel = +b.dataset.c; renderCards(); $("preview").classList.add("open"); $("preview").classList.remove("showb"); renderPreview(); });
  $("cardFilters").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x===b)); renderCards(); });
  // ---- one business card per topic: front + back, 85 × 55 mm; content shrinks slightly if needed ----
  function face(c, side, idx = sel){
    const f = document.createElement("div"); f.className = "sheet face";
    f.innerHTML = `<div class="fh"><b>${c.t}</b><span>${pad(idx)} · ${c.p}</span></div><div class="fb"><div class="fit">${c[side]()}</div></div><div class="ff"><span>stoic-ranger.com</span><span>${side === "f" ? "Turn over" : "Impedimentum fit via"}</span></div>`;
    return f;
  }
  function fitFace(f){
    const b = f.querySelector(".fb"), w = f.querySelector(".fit"); let z = 1;
    const over = () => { const B = b.getBoundingClientRect(), W = w.getBoundingClientRect(), s = B.width / b.offsetWidth; return W.height > B.height + 0.5*s || w.scrollWidth*z*s > B.width + 1*s; };
    while (over() && z > 0.6){ z -= 0.02; w.style.zoom = z; }
    return z;
  }
  let zoomMode = "fit";
  function renderPreview(){
    if ($("v-cards").hidden) return;
    const c = CARDS[sel], P = $("preview");
    P.innerHTML = `<div class="viewbar"><button type="button" class="vback" id="vClose" aria-label="Back to cards">‹ Cards</button><button type="button" class="button ghost vflip" id="vFlip">Flip card</button></div><div class="kit-head"><h3>${pad(sel)} · ${c.t}</h3><span class="note">Tap the card or Flip to turn it over.</span>
      <span class="seg zoomseg" role="group" aria-label="Zoom"><button type="button" data-z="fit" aria-pressed="${zoomMode==="fit"}">Readable</button><button type="button" data-z="1" aria-pressed="${zoomMode==="1"}">Actual size</button></span></div>
      <div class="deck" id="deck"><div class="pairgrid" id="pair"></div></div>`;
    const deck = $("deck"), colW = Math.min(deck.clientWidth, 1000), faceW = 85*96/25.4, cols = colW >= faceW*2*1.25 + 24 ? 2 : 1;
    const z = zoomMode === "1" ? 1 : Math.max(1, Math.min(2.2, (colW - (cols-1)*24)/cols/faceW));
    deck.style.setProperty("--z", z); if (cols === 2) $("pair").classList.add("two");
    ["f","b"].forEach(side => { const box = document.createElement("div"), l = document.createElement("small"), w = document.createElement("div"); l.textContent = side === "f" ? "Front" : "Back"; w.className = "facewrap"; const fc = face(c, side); w.appendChild(fc); box.append(l, w); $("pair").appendChild(box); window.__fit = window.__fit || {}; window.__fit[pad(sel)+side] = fitFace(fc); });
    P.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zoomMode = b.dataset.z; renderPreview(); });
    const flip = () => P.classList.toggle("showb");
    $("vFlip").onclick = flip; $("pair").onclick = flip;
    $("vClose").onclick = () => P.classList.remove("open", "showb");
  }
  window.addEventListener("resize", () => { clearTimeout(window.__rz); window.__rz = setTimeout(renderPreview, 200); });
  onShow.cards = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(renderPreview);
  renderCards();


  {
  // ================= NAVIGATE: geo maths =================
  const RAD = Math.PI/180, DEG = 180/Math.PI;
  const WA = 6378137, WF = 1/298.257223563, E2 = WF*(2-WF), EP2 = E2/(1-E2), K0 = 0.9996;
  const BANDS = "CDEFGHJKLMNPQRSTUVWX";
  function utmZone(lat, lon){
    let z = Math.floor((lon+180)/6)+1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
    if (lat >= 72 && lat < 84){ if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33; else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37; }
    return z;
  }
  function toUTM(lat, lon, zone){
    zone = zone || utmZone(lat, lon);
    const l0 = ((zone-1)*6-180+3)*RAD, p = lat*RAD, l = lon*RAD;
    const e4 = E2*E2, e6 = e4*E2;
    const N = WA/Math.sqrt(1-E2*Math.sin(p)**2), T = Math.tan(p)**2, C = EP2*Math.cos(p)**2, A = Math.cos(p)*(l-l0);
    const M = WA*((1-E2/4-3*e4/64-5*e6/256)*p - (3*E2/8+3*e4/32+45*e6/1024)*Math.sin(2*p) + (15*e4/256+45*e6/1024)*Math.sin(4*p) - (35*e6/3072)*Math.sin(6*p));
    const E = K0*N*(A + (1-T+C)*A**3/6 + (5-18*T+T*T+72*C-58*EP2)*A**5/120) + 500000;
    let Nn = K0*(M + N*Math.tan(p)*(A*A/2 + (5-T+9*C+4*C*C)*A**4/24 + (61-58*T+T*T+600*C-330*EP2)*A**6/720));
    if (lat < 0) Nn += 10000000;
    return { zone, E, N: Nn, south: lat < 0, band: BANDS[Math.min(19, Math.max(0, Math.floor((lat+80)/8)))], conv: (lon - ((zone-1)*6-180+3))*Math.sin(p) };
  }
  function fromUTM(zone, E, N, south){
    const e4 = E2*E2, e6 = e4*E2, l0 = ((zone-1)*6-180+3)*RAD;
    const M = (south ? N-10000000 : N)/K0, mu = M/(WA*(1-E2/4-3*e4/64-5*e6/256));
    const e1 = (1-Math.sqrt(1-E2))/(1+Math.sqrt(1-E2));
    const p1 = mu + (3*e1/2-27*e1**3/32)*Math.sin(2*mu) + (21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu) + (151*e1**3/96)*Math.sin(6*mu) + (1097*e1**4/512)*Math.sin(8*mu);
    const N1 = WA/Math.sqrt(1-E2*Math.sin(p1)**2), T1 = Math.tan(p1)**2, C1 = EP2*Math.cos(p1)**2;
    const R1 = WA*(1-E2)/Math.pow(1-E2*Math.sin(p1)**2, 1.5), D = (E-500000)/(N1*K0);
    const lat = p1 - (N1*Math.tan(p1)/R1)*(D*D/2 - (5+3*T1+10*C1-4*C1*C1-9*EP2)*D**4/24 + (61+90*T1+298*C1+45*T1*T1-252*EP2-3*C1*C1)*D**6/720);
    const lon = l0 + (D - (1+2*T1+C1)*D**3/6 + (5-2*C1+28*T1-3*C1*C1+8*EP2+24*T1*T1)*D**5/120)/Math.cos(p1);
    return { lat: lat*DEG, lon: lon*DEG };
  }
  const COLS = ["ABCDEFGH","JKLMNPQR","STUVWXYZ"], ROWS = "ABCDEFGHJKLMNPQRSTUV";
  function toMGRS(lat, lon, digits = 5){
    if (lat < -80 || lat >= 84) return null;
    const u = toUTM(lat, lon), set = (u.zone-1) % 3;
    const col = COLS[set][Math.floor(u.E/100000)-1];
    const row = ROWS[(Math.floor(u.N/100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20];
    const f = Math.pow(10, 5-digits);
    const e = String(Math.floor((u.E % 100000)/f)).padStart(digits,"0"), n = String(Math.floor((u.N % 100000)/f)).padStart(digits,"0");
    return { gzd: u.zone + u.band, sq: col + row, e, n, u };
  }
  function fromMGRS(s){
    const m = s.toUpperCase().replace(/\s+/g,"").match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/);
    if (!m || m[5].length % 2 || m[5].length > 10) return null;
    const zone = +m[1], band = m[2], d = m[5].length/2;
    const set = (zone-1) % 3, ci = COLS[set].indexOf(m[3]);
    if (ci < 0 || zone < 1 || zone > 60) return null;
    const half = d ? Math.pow(10, 5-d)/2 : 50000;
    const E = (ci+1)*100000 + (d ? +m[5].slice(0,d)*Math.pow(10,5-d) : 0) + half;
    let ri = ROWS.indexOf(m[4]) - (zone % 2 === 0 ? 5 : 0); ri = (ri+20) % 20;
    const south = band < "N", bLat = -80 + BANDS.indexOf(band)*8;
    const minN = toUTM(bLat, (zone-1)*6-180+3, zone).N;
    let N = ri*100000 + (d ? +m[5].slice(d)*Math.pow(10,5-d) : 0) + half;
    while (N < minN - 100000) N += 2000000;
    return fromUTM(zone, E, N, south);
  }
  function parsePos(s){
    s = (s || "").trim(); if (!s) return null;
    const ll = s.match(/^(-?\d+(?:[.,]\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*([EWO])?$/i);
    if (ll){
      let lat = +ll[1].replace(",","."), lon = +ll[3].replace(",",".");
      if (ll[2] && /s/i.test(ll[2])) lat = -Math.abs(lat);
      if (ll[4] && /w/i.test(ll[4])) lon = -Math.abs(lon);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    return fromMGRS(s);
  }
  const fmtMGRS = (g, sp = true) => g ? (sp ? `${g.gzd} ${g.sq} ${g.e} ${g.n}` : g.gzd+g.sq+g.e+g.n) : "outside MGRS";
  const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), mm = (a-d)*60, m = Math.floor(mm), s = (mm-m)*60;
    return `${d}° ${String(m).padStart(2,"0")}′ ${s.toFixed(1).padStart(4,"0")}″ ${v >= 0 ? pos : neg}`; };
  function bearing(a, b){
    const p1 = a.lat*RAD, p2 = b.lat*RAD, dl = (b.lon-a.lon)*RAD;
    const y = Math.sin(dl)*Math.cos(p2), x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    const h = Math.sin((p2-p1)/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return { brg: (Math.atan2(y,x)*DEG + 360) % 360, dist: 2*6371008.8*Math.asin(Math.sqrt(h)) };
  }
  const norm360 = x => ((x % 360) + 360) % 360;
  const mils = deg => Math.round(norm360(deg)*6400/360) % 6400;

  // ================= NAVIGATE: sun and moon =================
  const jd = t => t/86400000 + 2440587.5;
  function sunEq(d){
    const g = (357.529 + 0.98560028*d)*RAD, q = 280.459 + 0.98564736*d;
    const L = (q + 1.915*Math.sin(g) + 0.020*Math.sin(2*g))*RAD, e = (23.439 - 0.00000036*d)*RAD;
    return { ra: Math.atan2(Math.cos(e)*Math.sin(L), Math.cos(L)), dec: Math.asin(Math.sin(e)*Math.sin(L)), lon: L };
  }
  function moonEq(d){
    const L = 218.316 + 13.176396*d, M = (134.963 + 13.064993*d)*RAD, F = (93.272 + 13.229350*d)*RAD;
    const D = (297.850 + 12.190749*d)*RAD, Ms = (357.529 + 0.98560028*d)*RAD, s = Math.sin;
    const lon = (L + 6.289*s(M) - 1.274*s(M-2*D) + 0.658*s(2*D) - 0.186*s(Ms) - 0.059*s(2*M-2*D) - 0.057*s(M-2*D+Ms) + 0.053*s(M+2*D)
      + 0.046*s(2*D-Ms) + 0.041*s(M-Ms) - 0.035*s(D) - 0.031*s(M+Ms) - 0.015*s(2*F-2*D) + 0.011*s(M-4*D))*RAD;
    const lat = (5.128*s(F) - 0.173*s(F-2*D) - 0.055*s(M-F-2*D) - 0.046*s(M+F-2*D) + 0.033*s(F+2*D) + 0.017*s(2*M+F))*RAD;
    const e = (23.439 - 0.00000036*d)*RAD;
    return { ra: Math.atan2(Math.sin(lon)*Math.cos(e) - Math.tan(lat)*Math.sin(e), Math.cos(lon)),
             dec: Math.asin(Math.sin(lat)*Math.cos(e) + Math.cos(lat)*Math.sin(e)*Math.sin(lon)), lon };
  }
  function alt(body, t, lat, lon){
    const d = jd(t) - 2451545.0, q = body(d);
    const lst = (280.46061837 + 360.98564736629*d + lon)*RAD, H = lst - q.ra, p = lat*RAD;
    return Math.asin(Math.sin(p)*Math.sin(q.dec) + Math.cos(p)*Math.cos(q.dec)*Math.cos(H))*DEG;
  }
  function crossings(body, h0, t0, t1, lat, lon){
    const out = [], step = 600000; let ta = t0, fa = alt(body, ta, lat, lon) - h0;
    for (let tb = t0+step; tb <= t1; tb += step){
      const fb = alt(body, tb, lat, lon) - h0;
      if ((fa < 0) !== (fb < 0)){
        let a = ta, b = tb, va = fa;
        for (let i = 0; i < 20; i++){ const m = (a+b)/2, vm = alt(body, m, lat, lon) - h0; if ((vm < 0) === (va < 0)){ a = m; va = vm; } else b = m; }
        out.push({ t: (a+b)/2, up: fa < 0 });
      }
      ta = tb; fa = fb;
    }
    return out;
  }
  const first = (arr, up) => (arr.find(x => x.up === up) || {}).t;
  function dayLight(date, lat, lon){
    const t0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), t1 = t0 + 86400000;
    const rs = crossings(sunEq, -0.833, t0, t1, lat, lon), civ = crossings(sunEq, -6, t0, t1, lat, lon), nau = crossings(sunEq, -12, t0, t1, lat, lon);
    const mo = crossings(moonEq, 0.125, t0, t1, lat, lon);
    let noon = null, best = -99; for (let t = t0; t <= t1; t += 300000){ const a = alt(sunEq, t, lat, lon); if (a > best){ best = a; noon = t; } }
    const rise = first(rs, true), set = first(rs, false);
    return { rise, set, dawn: first(civ, true), dusk: first(civ, false), ndawn: first(nau, true), ndusk: first(nau, false),
             noon, noonAlt: best, mrise: first(mo, true), mset: first(mo, false), allDay: !rs.length && alt(sunEq, t0+43200000, lat, lon) > 0, allNight: !rs.length && best < -0.833 };
  }
  function moonPhase(t){
    const d = jd(t) - 2451545.0, el = norm360((moonEq(d).lon - sunEq(d).lon)*DEG);
    return { el, frac: (1 - Math.cos(el*RAD))/2 };
  }
  function nextPhase(t, target){
    const step = 3600000; let pd = norm360(moonPhase(t).el - target);
    for (let x = t + step; x < t + 32*86400000; x += step){
      const d = norm360(moonPhase(x).el - target);
      if (pd > 180 && d < 180) return x - step*d/(d + 360 - pd);
      pd = d;
    }
    return null;
  }
  const phaseName = el => el < 6 || el > 354 ? "New moon" : el < 84 ? "Waxing crescent" : el < 96 ? "First quarter" : el < 174 ? "Waxing gibbous" : el < 186 ? "Full moon" : el < 264 ? "Waning gibbous" : el < 276 ? "Last quarter" : "Waning crescent";
  function moonPath(el, r = 50, c = 60){
    const k = Math.cos(el*RAD), rx = Math.abs(k)*r, wax = el < 180, gib = k < 0;
    const s1 = wax ? 1 : 0, s2 = wax ? (gib ? 1 : 0) : (gib ? 0 : 1);
    return `M${c} ${c-r} A${r} ${r} 0 0 ${s1} ${c} ${c+r} A${rx.toFixed(2)} ${r} 0 0 ${s2} ${c} ${c-r}Z`;
  }
  const hm = t => t == null ? "–" : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dur = ms => ms == null || !isFinite(ms) ? "–" : `${Math.floor(ms/3600000)} h ${String(Math.round(ms/60000) % 60).padStart(2,"0")} min`;

  // ================= NAVIGATE: page =================
  let here = store.get("sr-pos", null);
  const points = store.get("sr-points", []);
  const setHere = (p, src) => { here = { lat: p.lat, lon: p.lon, src, acc: p.acc, alt: p.alt, t: Date.now() }; store.set("sr-pos", here); renderPos(); renderSun(); };
  function locate(btn){
    const msg = $("posMsg");
    if (!("geolocation" in navigator)){ msg.textContent = "This browser can't give a position. Type one instead."; return; }
    msg.textContent = "Getting a fix…"; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(p => { btn.disabled = false; msg.textContent = "";
        setHere({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude }, "GPS"); },
      e => { btn.disabled = false; if (e.code === 1 && window.FKNative){ msg.innerHTML = 'Location permission was refused. Type a position instead, or <button type="button" class="lnk" id="openPerm">allow it in the settings</button>.'; $("openPerm").onclick = () => FKNative.openAppSettings(); }
        else msg.textContent = e.code === 1 ? "Location permission was refused. Type a position instead, or allow it in the browser settings." : "No fix yet. Try again in the open, or type a position.";
        $("sunWhere").textContent = msg.textContent; },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }
  function renderPos(){
    if (!here){ $("gridref").innerHTML = `<span class="note">No position yet. Tap "Use my position" or type one.</span>`; $("posOut").innerHTML = ""; renderBrg(); return; }
    const g = toMGRS(here.lat, here.lon), u = g ? g.u : toUTM(here.lat, here.lon);
    $("gridref").innerHTML = `<small>MGRS · ${here.src === "GPS" ? "from GPS" : "entered"}</small><b>${fmtMGRS(g)}</b>`;
    const g4 = toMGRS(here.lat, here.lon, 4), g3 = toMGRS(here.lat, here.lon, 3);
    $("posOut").innerHTML = [
      ["8-figure (10 m)", fmtMGRS(g4)], ["6-figure (100 m)", fmtMGRS(g3)],
      ["UTM", `${u.zone}${u.band} ${Math.floor(u.E)} E ${Math.floor(u.N)} N`],
      ["Lat / lon", `${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}`],
      ["Degrees, min, sec", `${dms(here.lat,"N","S")}<br>${dms(here.lon,"E","W")}`],
      ["Accuracy · altitude", `${here.acc ? "± " + FKUnits.small(here.acc) : "–"} · ${here.alt != null ? FKUnits.alt(here.alt) : "–"}`]
    ].map(([k,v]) => `<div><small>${k}</small><span class="val">${v}</span></div>`).join("");
    renderBrg();
  }
  function renderBrg(){
    const tgt = parsePos($("tgtIn").value) || (points[+$("tgtPick").value - 1] || null);
    if (!here || !tgt){ $("brgOut").innerHTML = `<div><small>Bearing</small><span class="val">${!here ? "Set your position first" : "Enter a target"}</span></div>`; return; }
    const b = bearing(here, tgt), dec = +$("decl").value || 0, conv = toUTM(here.lat, here.lon).conv;
    const mag = norm360(b.brg - dec), grid = norm360(b.brg - conv);
    $("brgOut").innerHTML = [
      ["Distance", FKUnits.dist(b.dist)],
      ["Magnetic", `${mag.toFixed(0)}° · ${mils(mag)} mil`], ["True", `${b.brg.toFixed(0)}° · ${mils(b.brg)} mil`],
      ["Grid", `${grid.toFixed(0)}° · ${mils(grid)} mil`], ["Back bearing (mag)", `${norm360(mag+180).toFixed(0)}° · ${mils(mag+180)} mil`],
      ["Convergence", `${conv >= 0 ? "+" : ""}${conv.toFixed(2)}°`]
    ].map(([k,v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
  }
  function renderPts(){
    $("ptTable").innerHTML = points.length ? `<thead><tr><th>Name</th><th>MGRS</th><th>From you</th><th></th></tr></thead><tbody>` + points.map((p,i) => {
      const b = here ? bearing(here, p) : null;
      return `<tr><td>${esc(p.name)}</td><td>${fmtMGRS(toMGRS(p.lat, p.lon))}</td><td>${b ? FKUnits.dist(b.dist) + " · " + mils(b.brg - (+$("decl").value || 0)) + " mil" : "–"}</td><td><button class="x" type="button" data-del="${i}" aria-label="Delete ${esc(p.name)}">×</button></td></tr>`; }).join("") + "</tbody>"
      : `<tbody><tr><td class="empty">No saved points yet.</td></tr></tbody>`;
    $("tgtPick").innerHTML = `<option value="">–</option>` + points.map((p,i) => `<option value="${i+1}">${esc(p.name)}</option>`).join("");
  }
  $("gpsBtn").onclick = () => locate($("gpsBtn"));
  window.addEventListener("fk-units", () => { renderPos(); renderPts(); });
  $("gpsBtn2").onclick = () => locate($("gpsBtn2"));
  $("posIn").addEventListener("change", () => { const p = parsePos($("posIn").value); if (p){ $("posMsg").textContent = ""; setHere(p, "typed"); renderPts(); } else $("posMsg").textContent = "Can't read that. Use MGRS like 30U YC 08213 07235, or lat, lon like 51.4779, -0.0015."; });
  ["tgtIn","decl"].forEach(id => $(id).addEventListener("input", () => { renderBrg(); renderPts(); }));
  $("tgtPick").onchange = () => { $("tgtIn").value = ""; renderBrg(); };
  $("ptSave").onclick = () => { if (!here) return; points.push({ name: $("ptName").value.trim() || "Point " + (points.length+1), lat: here.lat, lon: here.lon }); store.set("sr-points", points); $("ptName").value = ""; renderPts(); };
  $("ptTable").onclick = e => { const b = e.target.closest("[data-del]"); if (b){ points.splice(+b.dataset.del, 1); store.set("sr-points", points); renderPts(); renderBrg(); } };
  document.querySelectorAll("[data-ntab]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-ntab]").forEach(x => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-npane]").forEach(p => p.hidden = p.dataset.npane !== b.dataset.ntab);
  });

  function renderSun(){
    const dv = $("sunDate").value, base = dv ? new Date(dv + "T12:00:00") : new Date();
    if (!here){ $("sunWhere").textContent = `No position yet. Tap "Use my position", or type one on the Position & grid tab.`; $("sunOut").innerHTML = ""; $("sunTable").innerHTML = ""; $("moonSvg").innerHTML = ""; $("moonTxt").innerHTML = ""; return; }
    $("sunWhere").textContent = `For ${fmtMGRS(toMGRS(here.lat, here.lon))} (${here.lat.toFixed(3)}, ${here.lon.toFixed(3)})${here.src === "GPS" ? ", from GPS" : ""}.`;
    const L = dayLight(base, here.lat, here.lon);
    $("sunOut").innerHTML = [
      ["First light", hm(L.dawn)], ["Sunrise", L.allDay ? "Up all day" : L.allNight ? "No sunrise" : hm(L.rise)], ["Sunset", hm(L.set)], ["Last light", hm(L.dusk)],
      ["Daylight", L.allDay ? "24 h" : dur(L.set - L.rise)], ["Sun highest", `${hm(L.noon)} · ${Math.round(L.noonAlt)}°`],
      ["Nautical dawn", hm(L.ndawn)], ["Nautical dusk", hm(L.ndusk)], ["Moonrise", hm(L.mrise)], ["Moonset", hm(L.mset)]
    ].map(([k,v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
    const ph = moonPhase(base.getTime()), nf = nextPhase(base.getTime(), 180), nn = nextPhase(base.getTime(), 0);
    $("moonSvg").innerHTML = `<circle cx="60" cy="60" r="50" class="moon-dark"/><path d="${moonPath(ph.el)}" class="moon-lit"/>`;
    const dd = t => t ? new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "–";
    $("moonTxt").innerHTML = `<b>${phaseName(ph.el)}</b><span>${Math.round(ph.frac*100)} % lit</span><span>Full moon: ${dd(nf)}</span><span>New moon: ${dd(nn)}</span>`;
    let rows = "";
    for (let i = 0; i < 7; i++){
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12), x = dayLight(day, here.lat, here.lon), m = moonPhase(day.getTime());
      rows += `<tr><td>${day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</td><td>${hm(x.dawn)}</td><td>${hm(x.rise)}</td><td>${hm(x.set)}</td><td>${hm(x.dusk)}</td><td>${Math.round(m.frac*100)} %</td></tr>`;
    }
    $("sunTable").innerHTML = `<thead><tr><th>Day</th><th>First light</th><th>Sunrise</th><th>Sunset</th><th>Last light</th><th>Moon</th></tr></thead><tbody>${rows}</tbody>`;
  }
  $("sunDate").value = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  $("sunDate").addEventListener("change", renderSun);
  renderPos(); renderPts(); renderSun();

  }


  // ================= SAVE PRINTABLES =================
  // A4 portrait, 2 × 5 cards per page. Backs follow each fronts page, columns swapped, so a long-edge duplex print lines up.
  function buildPrint(){
    const list = CARDS.map((c,i) => [c,i]).filter(([c]) => filter === "all" || c.p === filter), P = $("printout");
    P.innerHTML = "";
    for (let s = 0; s < list.length; s += 10){
      const chunk = list.slice(s, s+10);
      ["f","b"].forEach(side => {
        const sh = document.createElement("div"); sh.className = "psheet";
        for (let k = 0; k < 10; k++){
          const r = Math.floor(k/2), col = k % 2, item = chunk[r*2 + (side === "f" ? col : 1-col)], cell = document.createElement("div");
          cell.className = "pcell"; if (item) cell.appendChild(face(item[0], side, item[1])); sh.appendChild(cell);
        }
        P.appendChild(sh);
      });
    }
    P.querySelectorAll(".face").forEach(fitFace);
  }
  let oldTitle = document.title;
  $("printBtn").addEventListener("click", () => {
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
      buildPrint(); const job = "SR field cards" + (filter === "all" ? "" : " - " + filter);
      if (window.FKNative && FKNative.print){ FKNative.print(window.FK.printDoc($("printout").outerHTML), job); setTimeout(() => { $("printout").innerHTML = ""; }, 3000); return; }
      oldTitle = document.title; document.title = job;
      setTimeout(() => window.print(), 60);
    });
  });
  window.addEventListener("afterprint", () => { document.title = oldTitle; $("printout").innerHTML = ""; });
  const syncPrintLabel = () => { const n = CARDS.filter(c => filter === "all" || c.p === filter).length; $("printCount").textContent = n + (n === 1 ? " card" : " cards") + (filter === "all" ? "" : " (" + filter + ")"); };
  $("cardFilters").addEventListener("click", syncPrintLabel); syncPrintLabel();

  // ================= SAVE FOR OFFLINE USE =================
  const offBtn = $("offBtn"), offState = $("offState"), offHelp = $("offHelp");
  let deferred = null;
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  async function cached(){ try { return "caches" in window && (await caches.keys()).some(k => k.indexOf("sr-kit") === 0); } catch(e){ return false; } }
  function refreshOffline(){
    if (standalone()){ offBtn.textContent = "Saved for offline use ✓"; offBtn.disabled = true; }
    cached().then(ok => { offState.textContent = ok ? "Offline copy ready on this device." : ""; });
  }
  if (false){   // the app is offline by design: no service worker
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => setTimeout(refreshOffline, 1200)).catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
  window.addEventListener("appinstalled", () => { deferred = null; offHelp.hidden = true; refreshOffline(); });
  offBtn.addEventListener("click", async () => {
    if (deferred){ deferred.prompt(); try { await deferred.userChoice; } catch(e){} deferred = null; refreshOffline(); return; }
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
      android = /Android/.test(ua), ff = /Firefox|FxiOS/.test(ua), safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(ua);
    let how;
    if (ios) how = "<b>iPhone / iPad:</b> tap the <b>Share</b> button (square with an arrow), then <b>Add to Home Screen</b>.";
    else if (android && ff) how = "<b>Firefox on Android:</b> open the menu (⋮) and tap <b>Install</b>.";
    else if (android) how = "<b>Android:</b> open the browser menu (⋮) and tap <b>Install app</b> or <b>Add to Home screen</b>.";
    else if (safari) how = "<b>Safari on Mac:</b> choose <b>File › Add to Dock</b>.";
    else if (ff) how = "<b>Firefox on a computer</b> can't install websites as apps. Bookmark this page instead: it is already stored and opens without a connection.";
    else how = "Use the <b>install</b> icon at the right end of the address bar, or the browser menu › <b>Install</b>. If your browser has neither, bookmark this page: it is already stored and opens without a connection.";
    offHelp.innerHTML = `<p>${how}</p><p>The Field Kit then opens from its own icon, with or without signal. Nothing is sent anywhere; your settings stay on this device.</p>`;
    offHelp.hidden = !offHelp.hidden;
  });
  refreshOffline();

  // Breathe on phones: after Start, bring ring and buttons into view together
  $("bStart").addEventListener("click", () => { const sc = document.querySelector(".screen"), pc = document.querySelector(".pacer"); if (sc && pc && sc.scrollTop > pc.offsetTop) sc.scrollTo({top: 0, behavior: "smooth"}); });

  route();
})();
