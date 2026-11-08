/* Coordinates: read and write decimal degrees, degrees-minutes(-seconds), UTM and MGRS (WGS84).
   FKCoord.parse(text) → {lat, lon} or throws with a readable message; FKCoord.format(lat, lon) → all notations.
   Shared by SR Field Kit (coordinate converter, routes) and the Map Manager. */
'use strict';
(function(){
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const BANDS = "CDEFGHJKLMNPQRSTUVWX";
  function zoneOf(lat, lon){
    let z = Math.floor((lon + 180) / 6) + 1; if (z > 60) z = 60;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
    if (lat >= 72 && lat < 84){ if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33; else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37; }
    return z;
  }
  const bandOf = lat => lat < -80 || lat > 84 ? null : BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
  function toUtm(lat, lon, forceZone){
    const zone = forceZone || zoneOf(lat, lon), lon0 = rad((zone - 1) * 6 - 180 + 3), phi = rad(lat), lam = rad(lon);
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
    const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let Nn = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) Nn += 10000000;
    return { zone, band: bandOf(lat), hemi: lat < 0 ? "S" : "N", e: E, n: Nn };
  }
  function fromUtm(zone, south, E, Nn){
    const x = E - 500000, y = south ? Nn - 10000000 : Nn, lon0 = rad((zone - 1) * 6 - 180 + 3);
    const M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2, R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), D = x / (N1 * k0);
    const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
    return { lat: deg(lat), lon: deg(lon) };
  }
  const COLS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"], ROWS = "ABCDEFGHJKLMNPQRSTUV";
  function toMgrs(lat, lon, digits = 5){
    const u = toUtm(lat, lon); if (!u.band) return null;
    const col = COLS[(u.zone - 1) % 3][Math.floor(u.e / 100000) - 1], row = ROWS[(Math.floor(u.n / 100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20];
    const p = Math.pow(10, 5 - digits), ee = String(Math.floor((u.e % 100000) / p)).padStart(digits, "0"), nn = String(Math.floor((u.n % 100000) / p)).padStart(digits, "0");
    return `${u.zone}${u.band} ${col}${row} ${ee} ${nn}`;
  }
  function fromMgrs(s){
    const m = /^(\d{1,2})([C-HJ-NP-X])\s*([A-HJ-NP-Z])([A-HJ-NP-V])\s*(\d+)\s*(\d*)$/i.exec(s.trim().replace(/\s+/g, " "));
    if (!m) return null;
    const zone = +m[1], band = m[2].toUpperCase(), c = m[3].toUpperCase(), r = m[4].toUpperCase();
    let digits = m[5] + m[6]; if (digits.length % 2 || digits.length > 10) throw new Error("MGRS needs the same number of digits for east and north (e.g. 12345 67890).");
    const h = digits.length / 2, p = Math.pow(10, 5 - h), e100 = COLS[(zone - 1) % 3].indexOf(c) + 1;
    if (zone < 1 || zone > 60 || e100 < 1) throw new Error("This MGRS square does not exist in zone " + zone + ".");
    let rowIdx = ROWS.indexOf(r) - (zone % 2 === 0 ? 5 : 0); rowIdx = ((rowIdx % 20) + 20) % 20;
    const E = e100 * 100000 + (h ? +digits.slice(0, h) * p : 0) + p / 2 * (h < 5 ? 1 : 0);
    let N = rowIdx * 100000 + (h ? +digits.slice(h) * p : 0) + p / 2 * (h < 5 ? 1 : 0);
    const bandLat = -80 + BANDS.indexOf(band) * 8, south = bandLat < 0;
    const minN = toUtm(Math.max(-79.9, bandLat), (zone - 1) * 6 - 180 + 3, zone).n - 100000;   // northing at the band's south edge
    while (N < minN) N += 2000000;
    const ll = fromUtm(zone, south, E, N);
    if (ll.lat < bandLat - 0.5 || ll.lat > bandLat + 8.5 + (band === "X" ? 4 : 0)) throw new Error("This MGRS reference does not fit latitude band " + band + ".");
    return ll;
  }
  function dms(v, pos, neg, withSec){
    const s = v < 0 ? neg : pos; v = Math.abs(v); let d = Math.floor(v), m = (v - d) * 60;
    if (!withSec){ m = Math.round(m * 1000) / 1000; if (m >= 60){ d++; m = 0; } return `${d}° ${m.toFixed(3)}' ${s}`; }
    let mi = Math.floor(m), sec = Math.round((m - mi) * 60 * 10) / 10; if (sec >= 60){ sec = 0; mi++; } if (mi >= 60){ mi = 0; d++; }
    return `${d}° ${String(mi).padStart(2, "0")}' ${sec.toFixed(1).padStart(4, "0")}" ${s}`;
  }
  function format(lat, lon){
    const u = toUtm(lat, lon);
    return { dd: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, dms: dms(lat, "N", "S", true) + "  " + dms(lon, "E", "W", true), ddm: dms(lat, "N", "S", false) + "  " + dms(lon, "E", "W", false),
      utm: u.band ? `${u.zone}${u.band} ${Math.round(u.e)} ${Math.round(u.n)}` : "–", mgrs: toMgrs(lat, lon) || "–" };
  }
  /** One coordinate part like 47°12'30.5"N, 47 12.5 N, -11.25 or N47.2 → signed degrees. */
  function part(t, isLat){
    t = t.trim().toUpperCase().replace(/,/g, ".");
    const hm = /[NSEWO]/.exec(t), h = hm ? hm[0] : null;
    const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); if (!nums.length || nums.length > 3) return null;
    let v = Math.abs(nums[0]) + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
    if (nums[0] < 0 || h === "S" || h === "W") v = -v;
    if (h && ((isLat && !/[NS]/.test(h)) || (!isLat && !/[EWO]/.test(h)))) return null;
    return v;
  }
  function parse(text){
    const s = String(text || "").trim(); if (!s) throw new Error("Type a coordinate.");
    const mg = fromMgrs(s); if (mg) return mg;
    const um = /^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{6}(?:\.\d+)?)\s*[Ee]?\s+(\d{6,7}(?:\.\d+)?)\s*[Nn]?$/i.exec(s);
    if (um){ const zone = +um[1], band = um[2].toUpperCase(); if (zone < 1 || zone > 60) throw new Error("UTM zone must be 1 to 60."); return fromUtm(zone, BANDS.indexOf(band) < 10, +um[3], +um[4]); }
    // two parts: split on ; or , (with a space), or between hemisphere letters, or on whitespace for plain numbers
    let parts = s.split(/\s*;\s*|,\s+|\s*\/\s*/);
    if (parts.length !== 2){ const hm = /^(.*?[NS])\s*(.+[EWO])$/i.exec(s) || /^([NS].*?)\s+([EWO].+)$/i.exec(s); if (hm) parts = [hm[1], hm[2]]; }
    if (parts.length !== 2){ const nums = s.split(/\s+/); if (nums.length === 2) parts = nums; else if (nums.length === 4 || nums.length === 6){ const k = nums.length / 2; parts = [nums.slice(0, k).join(" "), nums.slice(k).join(" ")]; } }
    if (parts.length === 2){
      let la = part(parts[0], true), lo = part(parts[1], false);
      if ((la == null || lo == null) && /^[EWO]/i.test(parts[0].trim())){ la = part(parts[1], true); lo = part(parts[0], false); }
      if (la != null && lo != null){ if (Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error("Latitude must be within ±90° and longitude within ±180°."); return { lat: la, lon: lo }; }
    }
    throw new Error("Not recognised. Examples: 47.26, 11.39 · 47°15'36\"N 11°23'24\"E · 32T 680000 5236000 · 32T PT 80000 36000");
  }
  window.FKCoord = { parse, format, toUtm, fromUtm, toMgrs, fromMgrs };
})();
