/* SR Field Kit 0.3.0 (0.4.0: signal sequence in the app, #11) — "Use sensors" in Drop & wind (#4), cant level (#5), Night & signal (#6).
   Sensors are read only when the user taps. Nothing here is logged; settings in db.json: sr-level {flat, cant}
   (zero offsets), sr-night {red, lvl, wpm, src}. */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const store = window.FKStore, N = window.FKNative || null;
  const toast = t => window.FK && FK.toast ? FK.toast(t) : null;
  const cbs = {}; let cbn = 0;
  const prevCb = window.FKNativeCallback;
  window.FKNativeCallback = (id, res) => { if (cbs[id]){ const f = cbs[id]; delete cbs[id]; f(res); return; } if (prevCb) prevCb(id, res); };
  const call = fn => new Promise(res => { const id = "t3-" + (++cbn); cbs[id] = res; fn(id); });
  const deg = r => r * 180 / Math.PI;
  const fire = id => $(id).dispatchEvent(new Event("input", { bubbles: true }));

  // ================= USE SENSORS (#4) =================
  /** Pressure altitude (ICAO standard atmosphere) from the barometer: what the solver needs for air density. */
  const pAlt = hpa => 44330.8 * (1 - Math.pow(hpa / 1013.25, 0.190263));
  const gpsAlt = () => new Promise(res => { if (!("geolocation" in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p.coords.altitude), () => res(null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }); });
  $("bSens").onclick = async () => {
    const msg = $("bSensMsg"), btn = $("bSens"); btn.disabled = true; msg.classList.remove("bad"); msg.textContent = "Reading the phone's sensors …";
    let s = {};
    if (N && N.sensors){ const r = await call(id => N.sensors(id)); try { s = JSON.parse(r.msg) || {}; } catch (e){ } }
    const out = [];
    if (s.pressure > 300 && s.pressure < 1100){ const a = pAlt(s.pressure); window.__writeM("bAlt", Math.round(a)); fire("bAlt"); out.push(`Altitude ${FKUnits.alt(a)} from the barometer (${s.pressure.toFixed(1)} hPa, pressure altitude).`); }
    else {
      msg.textContent = (N && !s.hasPressure ? "No barometer in this phone. " : "") + "Getting the GPS altitude …";
      const a = await gpsAlt();
      if (a != null && isFinite(a)){ window.__writeM("bAlt", Math.round(a)); fire("bAlt"); out.push(`Altitude ${FKUnits.alt(a)} from GPS (no barometer${N && s.hasPressure ? " reading" : ""}; weather is not included).`); }
      else out.push("No altitude: no barometer and no GPS fix. Type it in.");
    }
    if (s.temp != null && isFinite(s.temp)){ window.__writeM("bTemp", Math.round(s.temp)); fire("bTemp"); out.push(`Temperature ${Math.round(s.temp)} °C from the phone's sensor (shade it from sun and hand).`); }
    else out.push("This phone has no air temperature sensor: type the temperature.");
    msg.textContent = out.join(" "); btn.disabled = false;
  };

  // ================= LEVEL (#5) =================
  const LP = document.querySelector('[data-pane="level"]');
  LP.innerHTML = `
    <div class="level">
      <svg viewBox="0 0 240 240" class="lvsvg" aria-hidden="true">
        <circle cx="120" cy="120" r="110" class="lvring"/><circle cx="120" cy="120" r="22" class="lvzero"/><circle cx="120" cy="120" r="55" class="lvmid"/>
        <path d="M120 6v228M6 120h228" class="lvcross"/>
        <g id="lvHz"><path d="M-20 120h280" class="lvhz"/></g>
        <circle id="lvBub" cx="120" cy="120" r="18" class="lvbub"/>
      </svg>
      <div><div class="lvbig" id="lvBig">–</div><div class="note" id="lvMode">Waiting for the tilt sensor …</div></div>
    </div>
    <div class="actions start wrap"><button class="button" id="lvAllow" type="button" hidden>Allow motion sensor</button><button class="button ghost" id="lvZero" type="button">Set zero here</button><button class="button ghost" id="lvClear" type="button">Clear zero</button></div>
    <p class="note" id="lvZeroNote"></p>
    <p class="formula"><b>Flat:</b> lay the phone on the rail, the turret cap or the action: the bubble shows both axes. <b>Upright:</b> hold a long edge against a flat vertical face (e.g. the flat of the elevation turret, the rifle held level): the number is the cant. Set zero on a surface you know is level to cancel the phone's own error. Cant moves the hit sideways by about drop × sin(cant): 2° with 3 m drop at 800 m ≈ 10 cm.</p>`;
  const lv = Object.assign({ flat: [0, 0], cant: 0 }, store.get("sr-level", {}));
  let g = null, lvOn = false, lvSeen = false, lvT = null;
  function onMotion(e){
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    lvSeen = true; const k = 0.2;
    g = g ? { x: g.x + (a.x - g.x) * k, y: g.y + (a.y - g.y) * k, z: g.z + (a.z - g.z) * k } : { x: a.x, y: a.y, z: a.z };
    drawLevel();
  }
  function reading(){
    if (!g) return null;
    const n = Math.hypot(g.x, g.y, g.z) || 9.81, flat = Math.abs(g.z) / n > 0.8;
    if (flat){ const sg = g.z >= 0 ? 1 : -1; return { flat: true, rx: deg(Math.atan2(g.x, g.z * sg)) - lv.flat[0], ry: deg(Math.atan2(g.y, g.z * sg)) - lv.flat[1] }; }
    const a = deg(Math.atan2(g.x, g.y)), ref = Math.round(a / 90) * 90;
    return { flat: false, raw: a - ref, cant: -(a - ref) - lv.cant, ref };
  }
  function drawLevel(){
    const r = reading(); if (!r) return;
    if (r.flat){
      const s = 90 / 10, cl = v => Math.max(-92, Math.min(92, v * s));   // 10° to the ring
      $("lvBub").setAttribute("cx", 120 + cl(r.rx)); $("lvBub").setAttribute("cy", 120 - cl(r.ry)); $("lvBub").style.display = ""; $("lvHz").style.display = "none";
      const t = Math.hypot(r.rx, r.ry);
      $("lvBig").textContent = t.toFixed(1) + "°"; $("lvBig").classList.toggle("lvok", t < 0.3);
      $("lvMode").textContent = `Flat · left/right ${Math.abs(r.rx).toFixed(1)}° · front/back ${Math.abs(r.ry).toFixed(1)}°`;
    } else {
      $("lvBub").style.display = "none"; $("lvHz").style.display = ""; $("lvHz").setAttribute("transform", `rotate(${(-r.cant).toFixed(2)} 120 120)`);
      $("lvBig").textContent = Math.abs(r.cant).toFixed(1) + "°"; $("lvBig").classList.toggle("lvok", Math.abs(r.cant) < 0.3);
      $("lvMode").textContent = Math.abs(r.cant) < 0.3 ? "Upright · level" : `Upright · cant to the ${r.cant > 0 ? "right" : "left"} (top leans ${r.cant > 0 ? "right" : "left"})`;
    }
  }
  function zeroNote(){ $("lvZeroNote").textContent = lv.flat[0] || lv.flat[1] || lv.cant ? `Zero set (flat ${lv.flat[0].toFixed(1)}° / ${lv.flat[1].toFixed(1)}°, upright ${lv.cant.toFixed(1)}°).` : "No zero set: the phone's sensor is used as it is."; }
  $("lvZero").onclick = () => { const r = reading(); if (!r) return toast("No sensor values yet");
    if (r.flat) lv.flat = [lv.flat[0] + r.rx, lv.flat[1] + r.ry]; else lv.cant = lv.cant + r.cant;
    store.set("sr-level", lv); zeroNote(); drawLevel(); toast("Zero set"); };
  $("lvClear").onclick = () => { lv.flat = [0, 0]; lv.cant = 0; store.set("sr-level", lv); zeroNote(); drawLevel(); };
  function level(on){
    if (on === lvOn) return; lvOn = on;
    if (on){ window.addEventListener("devicemotion", onMotion); if (N && N.keepScreenOn) N.keepScreenOn(true);
      clearTimeout(lvT); lvT = setTimeout(() => { if (!lvSeen) $("lvMode").textContent = "No values from the tilt sensor. This tool needs a phone with an accelerometer."; }, 2500); }
    else { window.removeEventListener("devicemotion", onMotion); if (N && N.keepScreenOn) N.keepScreenOn(false); }
  }
  // iPhone / iPad (web app): Safari only gives motion values after the user allows it with a tap
  const needAsk = typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function";
  $("lvAllow").hidden = !needAsk;
  $("lvAllow").onclick = () => DeviceMotionEvent.requestPermission().then(r => { $("lvAllow").hidden = r === "granted"; if (r !== "granted") $("lvMode").textContent = "Motion sensor not allowed."; }).catch(e => { $("lvMode").textContent = String(e.message || e); });
  zeroNote();
  window.addEventListener("fk-tab", e => level(e.detail === "level"));
  window.addEventListener("hashchange", () => level(location.hash === "#shoot" && !LP.hidden));
  window.__level = { reading, onMotion, lv };

  // ================= NIGHT & SIGNAL (#6) =================
  const NV = $("v-night");
  NV.innerHTML = `
    <h2>Night &amp; signal</h2>
    <p class="lede">Red light keeps your night vision. The signal light sends SOS or any message in Morse with the flashlight or the screen.</p>
    <div class="subhead"><h3 class="m0">Red light</h3></div>
    <div class="actions start wrap"><button class="button" id="ngRed" type="button">Red screen</button></div>
    <div class="field"><label for="ngLvl">Brightness of the red screen</label><input id="ngLvl" type="range" min="2" max="100" step="1"></div>
    <label class="check"><input type="checkbox" id="ngMode"> Red night mode for the whole app</label>
    <p class="note">Night mode shows every page dim red on black. Switch it off here (Night &amp; signal on the home screen).</p>
    <div class="subhead"><h3 class="m0">Signal light</h3><span class="note" id="ngTorchNote"></span></div>
    <div class="actions start wrap"><button class="button" id="ngTorch" type="button" aria-pressed="false">Light on</button><button class="button ghost" id="ngSos" type="button">SOS</button><button class="button ghost" id="ngStrobe" type="button">Strobe</button></div>
    <div class="savebar"><div class="field grow"><label for="ngMsg">Morse message</label><input id="ngMsg" type="text" maxlength="60" autocomplete="off" placeholder="OK"></div><button class="button ghost" id="ngSend" type="button">Send</button></div>
    <div class="form">
      <div class="field"><label for="ngSrc">Light</label><select id="ngSrc"><option value="torch">Flashlight</option><option value="screen">Screen, white</option><option value="red">Screen, red</option></select></div>
      <div class="field"><label for="ngWpm">Speed</label><select id="ngWpm"><option value="4">4 words/min</option><option value="6">6 words/min</option><option value="8">8 words/min</option><option value="12">12 words/min</option></select></div>
    </div>
    <label class="check"><input type="checkbox" id="ngRep" checked> Repeat until stopped</label>
    <div class="morse" id="ngShow" aria-live="polite"></div>
    <div class="actions start"><button class="button ghost" id="ngStop" type="button" hidden>Stop</button></div>
    <p class="formula">SOS = <code>··· ––– ···</code>. Timing: dot 1 unit, dash 3, gap inside a letter 1, between letters 3, between words 7. At 6 words/min a unit is 0.2 s. Letters A–Z, digits, and . , ? / are sent; other characters are left out. Signal lights can be seen far at night: think about who else sees them.</p>
    <div class="fkover redscr" id="ngScr" hidden><div class="redctl"><input id="ngLvl2" type="range" min="2" max="100" step="1" aria-label="Brightness"><button type="button" id="ngScrX">Close</button></div></div>
    <div class="fkover flashscr" id="ngFlash" hidden><button type="button" id="ngFlashX">Stop</button></div>`;
  const ng = Object.assign({ red: false, lvl: 20, wpm: 6, src: "torch" }, store.get("sr-night", {}));
  const saveNg = () => store.set("sr-night", ng);
  const torchOk = !!(N && N.hasTorch && N.hasTorch());
  if (!torchOk && ng.src === "torch") ng.src = "screen";
  $("ngSrc").querySelector('[value="torch"]').disabled = !torchOk;
  $("ngTorchNote").textContent = torchOk ? "" : N ? "No flashlight found: screen signals" : "Flashlight works in the Android app";
  $("ngLvl").value = $("ngLvl2").value = ng.lvl; $("ngWpm").value = ng.wpm; $("ngSrc").value = ng.src; $("ngMode").checked = !!ng.red;
  { const h = $("hNg"); if (h) h.textContent = (torchOk ? "Flashlight ready" : "Screen signals") + (ng.red ? " · night mode on" : ""); }

  // red night mode (whole app) and red screen
  function nightMode(){ document.documentElement.toggleAttribute("data-red", !!ng.red); const h = $("hNg"); if (h) h.textContent = (torchOk ? "Flashlight ready" : "Screen signals") + (ng.red ? " · night mode on" : ""); }
  $("ngMode").onchange = () => { ng.red = $("ngMode").checked; saveNg(); nightMode(); };
  nightMode();
  const scr = $("ngScr");
  function redLevel(){ const v = +ng.lvl; scr.style.background = `rgb(${Math.round(30 + v * 2.25)},0,0)`; if (N && N.setBrightness && !scr.hidden) N.setBrightness(Math.max(0.01, v / 100)); }
  function redScreen(on){ scr.hidden = !on; if (N && N.keepScreenOn) N.keepScreenOn(on); if (on) redLevel(); else if (N && N.setBrightness) N.setBrightness(-1); }
  scr.fkClose = () => redScreen(false);
  $("ngRed").onclick = () => redScreen(true);
  $("ngScrX").onclick = () => redScreen(false);
  [$("ngLvl"), $("ngLvl2")].forEach(i => i.addEventListener("input", () => { ng.lvl = +i.value; $("ngLvl").value = $("ngLvl2").value = ng.lvl; redLevel(); saveNg(); }));

  // signal light
  const MORSE = { A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-." };
  /** text → [[on, units, letter]] with standard timing. */
  function seq(text){
    const out = [], words = String(text).toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").split(/\s+/).filter(Boolean);
    words.forEach((w, wi) => { const letters = [...w].filter(c => MORSE[c]);
      letters.forEach((c, li) => { [...MORSE[c]].forEach((s, si) => { out.push([true, s === "." ? 1 : 3, c]); if (si < MORSE[c].length - 1) out.push([false, 1, c]); }); if (li < letters.length - 1) out.push([false, 3, ""]); });
      if (wi < words.length - 1) out.push([false, 7, ""]); });
    return out;
  }
  let run = 0, lightOn = false;
  const flash = $("ngFlash");
  function light(on){
    lightOn = on;
    if (ng.src === "torch" && torchOk) N.torch(on);
    else { flash.hidden = false; flash.classList.toggle("on", on); flash.classList.toggle("red", ng.src === "red"); }
  }
  let sig = null;   // the running flashlight sequence on the phone side (remark #11)
  function stop(){
    run++; if (sig){ sig = null; if (N.signalStop) N.signalStop(); }
    if (lightOn || ng.src === "torch") { if (torchOk) N.torch(false); } lightOn = false;
    flash.hidden = true; flash.classList.remove("on"); $("ngStop").hidden = true; $("ngShow").textContent = "";
    $("ngTorch").setAttribute("aria-pressed", "false"); $("ngTorch").textContent = "Light on";
    if (N && N.keepScreenOn && scr.hidden) N.keepScreenOn(false);
  }
  flash.fkClose = stop;
  $("ngFlashX").onclick = stop;
  function play(steps, label, unitMs){
    stop(); const my = ++run, rep = $("ngRep").checked;
    if (!steps.length){ toast("Nothing to send"); return; }
    $("ngStop").hidden = false; if (N && N.keepScreenOn) N.keepScreenOn(true);
    /* Flashlight: the whole sequence runs in the app itself (exact timing, light always off at the end); the page only
       shows which letter is being sent. Timers in the page were throttled and cut the message off (remark #11). */
    if (ng.src === "torch" && torchOk && N.signal){
      const id = "sig" + my; sig = { id, steps, label };
      if (!N.signal(JSON.stringify(steps.map(s => [s[0] ? 1 : 0, s[1]])), unitMs, rep, id)){ sig = null; stop(); toast("The flashlight could not be used"); }
      return;
    }
    let i = 0;
    const next = () => {
      if (my !== run) return;
      if (i >= steps.length){ if (!rep){ stop(); return; } i = 0; light(false); $("ngShow").textContent = label + " · pause"; setTimeout(next, unitMs * 7); return; }
      const [on, u, c] = steps[i++]; light(on); if (c) $("ngShow").textContent = label + " · " + c + " " + (MORSE[c] || "").replace(/\./g, "·").replace(/-/g, "–");
      setTimeout(next, u * unitMs);
    };
    next();
  }
  window.FKSignal = (id, i, state) => {
    if (!sig || sig.id !== id) return;
    if (state === "run"){ const c = sig.steps[i] && sig.steps[i][2]; if (c) $("ngShow").textContent = sig.label + " · " + c + " " + (MORSE[c] || "").replace(/\./g, "·").replace(/-/g, "–"); }
    else if (state === "pause") $("ngShow").textContent = sig.label + " · pause";
    else { sig = null; if (state === "error") toast("The flashlight stopped working"); stop(); }
  };
  const unit = () => 1200 / (+ng.wpm || 6);
  $("ngSos").onclick = () => play(seq("SOS"), "SOS", unit());
  $("ngSend").onclick = () => { const t = $("ngMsg").value.trim(); play(seq(t), t.toUpperCase(), unit()); };
  $("ngStrobe").onclick = () => { const steps = []; for (let k = 0; k < 10; k++) steps.push([true, 1, ""], [false, 1, ""]); play(steps, "Strobe", 80); $("ngShow").textContent = "Strobe"; };
  $("ngTorch").onclick = () => { if ($("ngTorch").getAttribute("aria-pressed") === "true"){ stop(); return; } stop(); run++; light(true); $("ngStop").hidden = false; $("ngTorch").setAttribute("aria-pressed", "true"); $("ngTorch").textContent = "Light off"; $("ngShow").textContent = "Light on"; if (N && N.keepScreenOn) N.keepScreenOn(true); };
  $("ngStop").onclick = stop;
  $("ngWpm").onchange = () => { ng.wpm = +$("ngWpm").value; saveNg(); };
  $("ngSrc").onchange = () => { stop(); ng.src = $("ngSrc").value; saveNg(); };
  window.addEventListener("hashchange", () => { if (location.hash !== "#night"){ stop(); redScreen(false); } });
  const prevPause = window.FK && FK.pause;
  if (window.FK) FK.pause = () => { stop(); if (prevPause) prevPause(); };
  window.__night = { seq, stop };
})();
