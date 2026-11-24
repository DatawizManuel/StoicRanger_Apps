/* Routes as GPX 1.1 files (opens in most map and GPS apps). Shared by SR Field Kit and the Map Manager.
   A route = { id, name, wps: [{lat, lon, name}] }. Reading takes <rte> routes first, else loose <wpt> points, else a
   <trk> track thinned to at most 50 points. */
'use strict';
(function(){
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const num = v => Math.round(v * 1e7) / 1e7;
  function toGpx(route){
    const pts = route.wps.map((w, i) => `    <rtept lat="${num(w.lat)}" lon="${num(w.lon)}"><name>${esc(w.name || "WP" + (i + 1))}</name></rtept>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Stoic Ranger" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(route.name)}</name><time>${new Date().toISOString()}</time></metadata>
  <rte>
    <name>${esc(route.name)}</name>
${pts}
  </rte>
</gpx>
`;
  }
  function pt(el, i){
    const lat = parseFloat(el.getAttribute("lat")), lon = parseFloat(el.getAttribute("lon"));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const n = el.getElementsByTagName("name")[0];
    return { lat, lon, name: n ? n.textContent.trim().slice(0, 60) : "WP" + (i + 1) };
  }
  /** Returns [{name, wps}] (may be empty). Throws on text that is not GPX. */
  function parseGpx(text, fallbackName){
    const doc = new DOMParser().parseFromString(String(text), "application/xml");
    if (doc.getElementsByTagName("parsererror").length || !doc.getElementsByTagName("gpx").length) throw new Error("This is not a GPX file.");
    const out = [], nm = (el, d) => { const n = [...el.children].find(c => c.localName === "name"); return n ? n.textContent.trim().slice(0, 60) : d; };
    [...doc.getElementsByTagName("rte")].forEach((r, k) => { const wps = [...r.getElementsByTagName("rtept")].map(pt).filter(Boolean); if (wps.length) out.push({ name: nm(r, (fallbackName || "Route") + (k ? " " + (k + 1) : "")), wps }); });
    if (!out.length){ const wps = [...doc.getElementsByTagName("wpt")].map(pt).filter(Boolean); if (wps.length) out.push({ name: fallbackName || "Waypoints", wps }); }
    if (!out.length){ [...doc.getElementsByTagName("trk")].forEach(t => { let p = [...t.getElementsByTagName("trkpt")].map(pt).filter(Boolean); if (p.length > 50){ const step = (p.length - 1) / 49; p = Array.from({ length: 50 }, (_, i) => p[Math.round(i * step)]); } p.forEach((w, i) => w.name = "P" + (i + 1)); if (p.length) out.push({ name: nm(t, fallbackName || "Track"), wps: p }); }); }
    return out;
  }
  window.FKGpx = { toGpx, parseGpx };
})();
