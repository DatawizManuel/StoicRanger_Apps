/* SR Field Kit — wind cheat sheet (Printables). Generic, or filled with holds for one gun and load: from Stoic Ranger
   when linked (js/link.js), or the current Drop & wind values. Holds come from the Stoic Ranger solver (window.__solve).
   Print: FKNative.print (Android print screen: print or Save as PDF). */
'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const f = (x, d) => isFinite(x) ? x.toFixed(d) : "–";
  const RANGES = [100,200,300,400,500,600,700,800,900,1000,1100,1200];
  const IMP = () => document.documentElement.dataset.units === "imp";
  // metric: m, m/s, cm · imperial: yd, mph, in
  const U = () => IMP() ? { d:"yd", s:"mph", l:"in", D:0.9144, S:1.609344, L:2.54, speeds:[2,4,6,8,10,15], ref:10, plates:[[12,"12 in"],[20,"20 in"]], br:["0–2","2–5","5–7","7–11","11–18","18+"] }
                        : { d:"m", s:"m/s", l:"cm", D:1, S:3.6, L:1, speeds:[1,2,3,4,6,8], ref:4, plates:[[30,"30 cm"],[50,"50 cm"]], br:["0–1","1–2","2–3","3–5","5–8","8+"] };

  function sources(){
    const out = [{ id: "generic", label: "Generic, fill in by hand" }, { id: "current", label: "Current Drop & wind values" }];
    const S = window.__SR;
    if (S && S.linked()) S.data.weapons.forEach(w => {
      const same = S.data.munitions.filter(m => m.caliber && m.caliber === w.caliber);
      (same.length ? same : S.data.munitions).forEach(m => { const bc = m.bcG7 > 0 || m.bcG1 > 0, v = S.v0Of(w, m).v;
        if (bc && v) out.push({ id: w.id + "|" + m.id, label: w.name + " · " + m.name }); });
    });
    return out;
  }
  let picked = false;
  function fillSelect(){
    const sel = $("wsSrc"), keep = sel.value, list = sources();
    sel.innerHTML = list.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join("");
    sel.value = (picked && list.some(s => s.id === keep)) ? keep : (list[2] ? list[2].id : "generic");
  }
  function profile(id){
    if (id === "generic") return null;
    const n = k => window.__readM ? window.__readM(k) : parseFloat($(k).value);
    if (id === "current") return { line1: $("bPre").value === "own" ? (window.__srLoad || "My own load") : $("bPre").selectedOptions[0].textContent, line2: "",
      model: $("bModel").value, bc: n("bBC"), mv: n("bMV"), mass: n("bMass"), sh: n("bSH"), zero: n("bZero") };
    const S = window.__SR, D = S && S.linked() ? S.data : null; if (!D) return null;
    const i = id.indexOf("|"), wid = id.slice(0, i), mid = id.slice(i + 1), w = D.weapons.find(x => String(x.id) === wid), m = D.munitions.find(x => String(x.id) === mid);
    if (!w || !m) return null;
    const { meas, v } = S.v0Of(w, m), g7 = m.bcG7 > 0;
    return { line1: w.name + (w.caliber ? " · " + w.caliber : "") + (w.twist ? " · " + w.twist : "") + (w.optic ? " | " + w.optic + (w.clickValue ? " · " + w.clickValue + " " + (w.scopeUnit || "") : "") : ""),
      line2: m.name + " · " + (g7 ? "G7 " + m.bcG7 : "G1 " + m.bcG1) + " · MV " + (IMP() ? Math.round(v * 3.28084) + " fps" : v + " m/s") + (meas && meas.v > 0 ? " (measured)" : ""),
      model: g7 ? "G7" : "G1", bc: g7 ? m.bcG7 : m.bcG1, mv: v, mass: m.bulletWeightG > 0 ? m.bulletWeightG : 10, sh: w.sightHeightMm > 0 ? w.sightHeightMm / 10 : 4.5, zero: w.zeroM > 0 ? w.zeroM : 100, short: m.name };
  }
  // drift per 1 m/s full value, in mrad, at each range (ICAO sea-level air, as the reference sheet)
  // drift per 1 unit of wind speed (m/s or mph), full value: mrad and cm/in, keyed by range in m or yd
  function perMs(p){
    const u = U();
    const rows = window.__solve({ model: p.model, bc: p.bc, mv: p.mv, sh: p.sh, zero: p.zero, wind: u.S, clock: 3, alt: 0, temp: 15, max: 1200 * u.D, step: 100 * u.D, mass: p.mass });
    const m = {}; rows.forEach(r => { m[Math.round(r.R / u.D)] = { mil: r.drift * 10 / r.R, cm: r.drift / u.L }; }); return m;
  }
  const clockSvg = () => {
    const val = { 12:"0", 1:"½", 2:"0.9", 3:"FULL", 4:"0.9", 5:"½", 6:"0", 7:"½", 8:"0.9", 9:"FULL", 10:"0.9", 11:"½" };
    const shade = { "0":"#F3F0E6", "½":"#E9D4A8", "0.9":"#DDB06A", "FULL":"#C9853C" };
    let s = `<svg class="dia wsclock" viewBox="0 0 220 220" aria-label="Wind clock: 3 and 9 full value, 2 4 8 10 0.9, 1 5 7 11 half, 12 and 6 none">`;
    for (let h = 1; h <= 12; h++){
      const a0 = (h - 0.5) * 30 - 90, a1 = (h + 0.5) * 30 - 90, r = 92, R = Math.PI / 180;
      const p = a => [110 + r * Math.cos(a * R), 110 + r * Math.sin(a * R)];
      const [x0, y0] = p(a0), [x1, y1] = p(a1);
      s += `<path d="M110 110 L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${shade[val[h]]}" stroke="#1D1E1A" stroke-width=".6"/>`;
      const am = h * 30 - 90, tx = 110 + 104 * Math.cos(am * R), ty = 110 + 104 * Math.sin(am * R), vx = 110 + 62 * Math.cos(am * R), vy = 110 + 62 * Math.sin(am * R);
      s += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#1D1E1A">${h}</text>`;
      s += `<text x="${vx.toFixed(1)}" y="${(vy + 4).toFixed(1)}" text-anchor="middle" font-size="${val[h] === "FULL" ? 10 : 12}" font-weight="700" fill="#1D1E1A">${val[h]}</text>`;
    }
    return s + `<circle cx="110" cy="110" r="5" fill="#1D1E1A"/><path d="M110 104 V30" stroke="#1D1E1A" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`;
  };

  function build(p){
    const u = U(), SPEEDS = u.speeds;
    const blank = (n, cols) => Array.from({ length: n }, () => `<tr>${"<td>&nbsp;</td>".repeat(cols)}</tr>`).join("");
    let holds, anchors, budget;
    if (p){
      const d = perMs(p);
      holds = `<table><tr><th>Range ${u.d}</th>${SPEEDS.map(v => `<th>${v} ${u.s}</th>`).join("")}<th>${u.l} @ ${u.ref}</th></tr>` +
        RANGES.filter(R => d[R]).map(R => `<tr><td class="l"><b>${R}</b></td>${SPEEDS.map(v => `<td>${f(d[R].mil * v, v === SPEEDS[0] ? 2 : 1)}</td>`).join("")}<td>${f(d[R].cm * u.ref, 0)}</td></tr>`).join("") + `</table>`;
      const a6 = d[600], a10 = d[1000];
      anchors = a6 && a10 ? `<p class="box">Your two anchor numbers: ${u.ref} ${u.s} full value = <b class="big">${f(a6.mil * u.ref, 1)} mrad @ 600 ${u.d}</b> and <b class="big">${f(a10.mil * u.ref, 1)} mrad @ 1,000 ${u.d}</b>. Each 1 ${u.s} you misjudge = ${f(a6.mil, 2)} mrad (${f(a6.cm, 1)} ${u.l}) @ 600 ${u.d}.</p>` : "";
      budget = `<table><tr><th class="l">Max wind error (${u.s})</th>${[300,600,800,1000].map(R => `<th>${R} ${u.d}</th>`).join("")}</tr>` +
        u.plates.map(([cm, t]) => [cm, "½ of a " + t + " plate"]).map(([cm, t]) => `<tr><td class="l">Stay inside ${t}</td>${[300,600,800,1000].map(R => `<td>${d[R] ? f(cm / 2 / d[R].cm, 1) : "–"}</td>`).join("")}</tr>`).join("") + `</table>`;
    } else {
      holds = `<table><tr><th>Range ${u.d}</th>${SPEEDS.map(v => `<th>${v} ${u.s}</th>`).join("")}<th>${u.l} @ ${u.ref}</th></tr>` + RANGES.map(R => `<tr><td class="l"><b>${R}</b></td>${"<td>&nbsp;</td>".repeat(SPEEDS.length + 1)}</tr>`).join("") + `</table>`;
      anchors = `<p class="box">Your two anchor numbers: ${u.ref} ${u.s} full value = ______ mrad @ 600 ${u.d} and ______ mrad @ 1,000 ${u.d}. Fill in from your dope or let the app fill the sheet for your gun and load.</p>`;
      budget = `<table><tr><th class="l">Max wind error (${u.s})</th><th>300 ${u.d}</th><th>600 ${u.d}</th><th>800 ${u.d}</th><th>1,000 ${u.d}</th></tr><tr><td class="l">Stay inside ½ of a ${u.plates[0][1]} plate</td><td></td><td></td><td></td><td></td></tr><tr><td class="l">Same, ½ of a ${u.plates[1][1]} plate</td><td></td><td></td><td></td><td></td></tr></table>`;
    }
    const head = p ? `<small>${esc(p.line1)}<br>${esc(p.line2)}</small>` : `<small>Rifle ________________ · Optic ____________<br>Load ________________ · BC ______ · MV ______ m/s</small>`;
    return `<div class="sheet wsheet">
      <div class="sh"><div><span class="wscat">Long range · 03</span><b>Wind cheat sheet</b></div>${head}</div>
      <div class="two">
        <div><h4>1 · Direction → value</h4>${clockSvg()}
          <table><tr><th class="l">Wind from</th><th>Value</th><th class="l">Use</th></tr>
          <tr><td class="l">3 or 9 o'clock</td><td>1.0</td><td class="l">full table value</td></tr><tr><td class="l">2, 4, 8, 10</td><td>0.9</td><td class="l">treat as full</td></tr>
          <tr><td class="l">1, 5, 7, 11</td><td>0.5</td><td class="l">half the table</td></tr><tr><td class="l">12 or 6</td><td>0</td><td class="l">no drift</td></tr></table>
          <p class="tiny">You stand in the centre, shooting towards 12. Wind from the right (3 o'clock) pushes the bullet left: hold right, into the wind.</p></div>
        <div><h4>2 · Your holds${p ? ": " + esc(p.short || p.line1) : ""}, full value</h4><div class="scroll">${holds}</div>
          <p class="tiny">Holds in mrad${p ? ", Stoic Ranger solver (" + p.model + ", ICAO air, " + Math.round(p.zero / u.D) + " " + u.d + " zero)" : ""}. "${u.l} @ ${u.ref}" = drift at ${u.ref} ${u.s}. Spin drift not included.</p>${anchors}
          <h4>Holding wind</h4><ul><li>Hold wind, dial elevation. Dial wind only for a long string in steady wind, and write it down so you return to 0.</li><li>With a first-focal-plane scope the holds stay valid at every magnification.</li></ul></div>
      </div>
      <div class="two">
        <div><h4>3 · Speed: read it without a meter</h4>
          <table><tr><th>${u.s}</th><th class="l">Flags / nature</th><th class="l">Mirage</th></tr>
          <tr><td>${u.br[0]}</td><td class="l">smoke rises, grass still</td><td class="l">boils straight up</td></tr><tr><td>${u.br[1]}</td><td class="l">felt on the face, leaves rustle</td><td class="l">slight lean</td></tr>
          <tr><td>${u.br[2]}</td><td class="l">leaves and thin twigs move</td><td class="l">clear lean</td></tr><tr><td>${u.br[3]}</td><td class="l">dust and dry leaves lift, small branches move</td><td class="l">flat, running</td></tr>
          <tr><td>${u.br[4]}</td><td class="l">small trees sway, grass waves</td><td class="l">fast and flat, then gone</td></tr><tr><td>${u.br[5]}</td><td class="l">large branches move, hard to hold the rifle</td><td class="l">none visible</td></tr></table>
          <p class="tiny">Mirage: around 15–20×, set the focus slightly in front of the target so the heat waves are sharp.</p></div>
        <div><h4>4 · The wind call, every shot</h4><ol>
          <li><b>Direction</b> as a clock, flags and grass from you to the target.</li><li><b>Speed</b> as a bracket, e.g. "${IMP() ? "5 to 10 mph" : "2 to 4 m/s"}".</li>
          <li><b>Value</b> from the clock: full, 0.9 or half.</li><li><b>Hold</b> = table × value, using the middle of your bracket.</li>
          <li><b>Fire in the same condition</b> you read: wait out a gust or a switch rather than chase it.</li><li><b>Correct off the impact</b>, not your guess.</li></ol>
          <h4>Terrain</h4><ul><li>Valleys and forest edges: wind at the target can differ from yours. The first two thirds of the flight path move the bullet most.</li><li>Updrafts on slopes lift impacts, downdrafts drop them.</li></ul></div>
      </div>
      <div class="two">
        <div><h4>5 · How big is your error budget?</h4><div class="scroll">${budget}</div></div>
        <div><h4>6 · Log it</h4><table><tr><th>Date</th><th>Range</th><th>Clock</th><th>Called</th><th>Held</th><th>Needed</th></tr>${blank(5, 6)}</table>
          <p class="tiny">"Needed" minus "held" over many shots shows if you misjudge speed in one direction.</p></div>
      </div>
      <div class="foot"><span>SR Field Kit · wind cheat sheet</span><span>${p ? "Calculated. Confirm on the range." : "Generic · fill in by hand"}</span></div>
    </div>`;
  }

  const V = $("wsView");
  function open(){
    const p = profile($("wsSrc").value);
    const html = build(p);
    V.innerHTML = `<div class="viewbar"><button type="button" class="vback" id="wsClose">‹ Printables</button><button type="button" class="button vprint" id="wsPrint">Print</button></div>` + html;
    V.hidden = false; V.scrollTop = 0;
    $("wsClose").onclick = () => { V.hidden = true; };
    $("wsPrint").onclick = () => {
      const job = "SR wind cheat sheet" + (p && p.short ? " - " + p.short : "");
      if (window.FKNative && FKNative.print) FKNative.print(window.FK.printDoc(`<div id="printout">${html}</div>`), job);
      else { $("printout").innerHTML = html; setTimeout(() => window.print(), 60); }
    };
  }
  $("wsOpen").addEventListener("click", open);
  $("wsSrc").addEventListener("change", () => { picked = true; });
  window.addEventListener("hashchange", () => { V.hidden = true; if (location.hash === "#print") fillSelect(); });
  fillSelect();
})();
