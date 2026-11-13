/* Stoic Ranger offline map — shared by SR Field Kit (Android) and the Stoic Ranger Map Manager (Windows).
   Map: Protomaps OpenStreetMap basemap (vector PMTiles). Terrain: Mapterhorn terrain tiles (terrarium PMTiles) for
   hillshade and contour lines, drawn on the device. Several regions can be loaded; for each tile the first region
   that has it is used (extracts contain whole tiles, so borders join without gaps).
   Everything is read from local files through a reader the host gives: read(name, offset, length) → Promise<ArrayBuffer>.
   Labels are drawn on the device with the app's own font (TinySDF), so no glyph files are needed.
   Libraries: maplibre-gl, pmtiles, maplibre-contour, @protomaps/basemaps (BSD), tiny-sdf (BSD-2, adapted below). */
'use strict';
(function(){
  const R = 6371008.8, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const geo = {
    /** distance in metres (haversine) */
    dist(a, b){ const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); },
    /** initial true bearing in degrees 0..360 */
    bearing(a, b){ const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon)); return (deg(Math.atan2(y, x)) + 360) % 360; },
    mils: d => Math.round(d * 6400 / 360) % 6400,
    fmtDist(m){ return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " km" : Math.round(m) + " m"; },
  };

  // ---------- TinySDF (Mapbox, BSD-2-Clause), trimmed ----------
  const INF = 1e20;
  function edt1d(g, off, stride, len, f, v, z){ v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = g[off];
    for (let q = 1, k = 0, s = 0; q < len; q++){ f[q] = g[off + q * stride]; const q2 = q * q;
      do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    for (let q = 0, k = 0; q < len; q++){ while (z[k + 1] < q) k++; const r = v[k], qr = q - r; g[off + q * stride] = f[r] + qr * qr; } }
  function edt(d, x0, y0, w, h, gs, f, v, z){ for (let x = x0; x < x0 + w; x++) edt1d(d, y0 * gs + x, gs, h, f, v, z); for (let y = y0; y < y0 + h; y++) edt1d(d, y * gs + x0, 1, w, f, v, z); }
  function TinySDF(font){ const size = this.size = 24 + 12; this.buffer = 3; this.radius = 8; this.cutoff = 0.25;
    const c = document.createElement("canvas"); c.width = c.height = size; const ctx = this.ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.font = font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = "black";
    this.go = new Float64Array(size * size); this.gi = new Float64Array(size * size); this.f = new Float64Array(size); this.z = new Float64Array(size + 1); this.v = new Uint16Array(size); }
  TinySDF.prototype.draw = function(ch){
    const m = this.ctx.measureText(ch), glyphAdvance = m.width, glyphTop = Math.ceil(m.actualBoundingBoxAscent), buffer = this.buffer;
    const glyphWidth = Math.max(0, Math.min(this.size - buffer, Math.ceil(m.actualBoundingBoxRight - m.actualBoundingBoxLeft)));
    const glyphHeight = Math.min(this.size - buffer, glyphTop + Math.ceil(m.actualBoundingBoxDescent));
    const width = glyphWidth + 2 * buffer, height = glyphHeight + 2 * buffer, len = Math.max(width * height, 0), data = new Uint8ClampedArray(len);
    const g = { data, glyphWidth, glyphHeight, glyphTop, glyphAdvance };
    if (glyphWidth === 0 || glyphHeight === 0) return g;
    const { ctx, gi, go } = this; ctx.clearRect(buffer, buffer, glyphWidth, glyphHeight); ctx.fillText(ch, buffer, buffer + glyphTop);
    const img = ctx.getImageData(buffer, buffer, glyphWidth, glyphHeight); go.fill(INF, 0, len); gi.fill(0, 0, len);
    for (let y = 0; y < glyphHeight; y++) for (let x = 0; x < glyphWidth; x++){ const a = img.data[4 * (y * glyphWidth + x) + 3] / 255; if (a === 0) continue;
      const j = (y + buffer) * width + x + buffer; if (a === 1){ go[j] = 0; gi[j] = INF; } else { const d = 0.5 - a; go[j] = d > 0 ? d * d : 0; gi[j] = d < 0 ? d * d : 0; } }
    edt(go, 0, 0, width, height, width, this.f, this.v, this.z); edt(gi, buffer, buffer, glyphWidth, glyphHeight, width, this.f, this.v, this.z);
    for (let i = 0; i < len; i++){ const d = Math.sqrt(go[i]) - Math.sqrt(gi[i]); data[i] = Math.round(255 - 255 * (d / this.radius + this.cutoff)); }
    return g;
  };
  // ---------- glyph PBF writer (MapLibre glyph format) ----------
  function pbfWriter(){ const a = []; const vint = v => { while (v > 127){ a.push((v & 127) | 128); v >>>= 7; } a.push(v); };
    return { a, vint, tag: (f, t) => vint((f << 3) | t), u: (f, v) => { vint(f << 3); vint(v >>> 0); }, s: (f, v) => { vint(f << 3); vint(((v << 1) ^ (v >> 31)) >>> 0); },
      bytes(f, b){ vint((f << 3) | 2); vint(b.length); for (let i = 0; i < b.length; i++) a.push(b[i]); },
      str(f, t){ this.bytes(f, new TextEncoder().encode(t)); } }; }
  const FONTS = { regular: '400 24px "Barlow Semi Condensed", "Noto Sans", sans-serif', bold: '600 24px "Barlow Semi Condensed", "Noto Sans", sans-serif', italic: 'italic 400 24px "Barlow Semi Condensed", "Noto Sans", sans-serif' };
  const sdfs = {};
  async function glyphRange(stack, start){
    const kind = /italic/i.test(stack) ? "italic" : /medium|bold|semibold/i.test(stack) ? "bold" : "regular";
    try { if (document.fonts) await document.fonts.load(FONTS[kind]); } catch(e){}
    const sdf = sdfs[kind] || (sdfs[kind] = new TinySDF(FONTS[kind]));
    const st = pbfWriter(); st.str(1, stack); st.str(2, start + "-" + (start + 255));
    for (let id = start; id < start + 256; id++){
      if (id < 32) continue;
      const g = sdf.draw(String.fromCharCode(id)), gw = pbfWriter();
      gw.u(1, id); if (g.data.length) gw.bytes(2, g.data);
      gw.u(3, g.glyphWidth); gw.u(4, g.glyphHeight); gw.s(5, 0); gw.s(6, g.glyphTop - 27); gw.u(7, Math.round(g.glyphAdvance));
      st.bytes(3, gw.a);
    }
    const top = pbfWriter(); top.bytes(1, st.a); return new Uint8Array(top.a).buffer;
  }

  // ---------- regions and protocols ----------
  let regions = [];   // [{key, name, base: PMTiles|null, dem: PMTiles|null}]
  function readerSource(key, read){ return { getKey: () => key, getBytes: async (offset, length) => ({ data: await read(offset, length) }) }; }
  async function firstTile(kind, z, x, y){
    for (const r of regions){ const p = r[kind]; if (!p) continue;
      try { const t = await p.getZxy(z, x, y); if (t && t.data && t.data.byteLength) return t.data; } catch(e){} }
    return null;
  }
  let protocolsReady = false, demSource = null;
  function setupProtocols(){
    if (protocolsReady) return; protocolsReady = true;
    const parse = url => url.replace(/^[a-z]+:\/\//, "").split("/").map(Number);
    maplibregl.addProtocol("fkbase", async params => { const [z, x, y] = parse(params.url); const d = await firstTile("base", z, x, y); return { data: d || new ArrayBuffer(0) }; });
    maplibregl.addProtocol("fkglyphs", async params => { const m = /fkglyphs:\/\/(.+)\/(\d+)-\d+/.exec(params.url); return { data: await glyphRange(decodeURIComponent(m[1]), +m[2]) }; });
    if (window.mlcontour){
      demSource = new mlcontour.DemSource({ url: "fkdem://{z}/{x}/{y}", encoding: "terrarium", maxzoom: 12, worker: false, cacheSize: 60 });
      demSource.manager.getTile = async url => { const [z, x, y] = parse(url); const d = await firstTile("dem", z, x, y); if (!d) throw new Error("no terrain here"); return { data: new Blob([d], { type: "image/webp" }) }; };
      demSource.setupMaplibre(maplibregl);
    }
  }
  /** regions: [{key, name, base: read-fn|null, dem: read-fn|null}] with read(offset, length) → Promise<ArrayBuffer>. */
  async function setRegions(list){
    regions = list.map(r => ({ key: r.key, name: r.name, base: r.base ? new pmtiles.PMTiles(readerSource(r.key + "-base", r.base)) : null, dem: r.dem ? new pmtiles.PMTiles(readerSource(r.key + "-dem", r.dem)) : null }));
    const info = [];
    for (const r of regions){ try { const h = r.base ? await r.base.getHeader() : await r.dem.getHeader(); info.push({ key: r.key, name: r.name, bbox: [h.minLon, h.minLat, h.maxLon, h.maxLat], maxZoom: h.maxZoom, terrain: !!r.dem }); } catch(e){ info.push({ key: r.key, name: r.name, error: e.message }); } }
    return info;
  }

  // ---------- style ----------
  const ATTR = '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a> · Protomaps · Mapterhorn';
  function style(dark){
    const flavor = basemaps.namedFlavor(dark ? "dark" : "light");
    const hasDem = !!demSource && regions.some(r => r.dem), hasBase = regions.some(r => r.base);
    const s = { version: 8, glyphs: "fkglyphs://{fontstack}/{range}.pbf", sources: {}, layers: [] };
    if (hasBase) s.sources.protomaps = { type: "vector", tiles: ["fkbase://{z}/{x}/{y}"], minzoom: 0, maxzoom: 15, attribution: ATTR };
    const base = hasBase ? basemaps.layers("protomaps", flavor) : [{ id: "background", type: "background", paint: { "background-color": dark ? "#2b2b2b" : "#ece6d3" } }];
    const labels = hasBase ? basemaps.layers("protomaps", flavor, { labelsOnly: true, lang: "de" }) : [];
    const terrain = [];
    if (hasDem){
      s.sources.dem = { type: "raster-dem", tiles: [demSource.sharedDemProtocolUrl], encoding: "terrarium", tileSize: 512, maxzoom: 12 };
      s.sources.contours = { type: "vector", tiles: [demSource.contourProtocolUrl({ multiplier: 1, thresholds: { 10: [100, 500], 11: [50, 250], 12: [20, 100], 13: [20, 100], 14: [10, 50], 15: [10, 50] }, elevationKey: "ele", levelKey: "level", contourLayer: "contours" })], maxzoom: 15 };
      const c = dark ? "#c9a96b" : "#a07c45";
      terrain.push({ id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": dark ? "#000" : "#5a4a35", "hillshade-highlight-color": dark ? "#444" : "#fffaf0" } });
      terrain.push({ id: "contours", type: "line", source: "contours", "source-layer": "contours", minzoom: 10, paint: { "line-color": c, "line-opacity": 0.7, "line-width": ["match", ["get", "level"], 1, 1.1, 0.5] } });
      terrain.push({ id: "contour-labels", type: "symbol", source: "contours", "source-layer": "contours", minzoom: 12, filter: [">", ["get", "level"], 0],
        layout: { "symbol-placement": "line", "text-size": 11, "text-field": ["concat", ["number-format", ["get", "ele"], {}], " m"], "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": c, "text-halo-color": dark ? "#222" : "#f4efe2", "text-halo-width": 1.2 } });
    }
    // terrain goes over land and landcover, under water, roads and labels
    const idx = base.findIndex(l => /water/.test(l.id));
    s.layers = idx > 0 ? base.slice(0, idx).concat(terrain, base.slice(idx)) : base.concat(terrain);
    s.layers = s.layers.concat(labels);
    // overlays: saved points, route, own position
    s.sources.fkpoints = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    s.sources.fkroute = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    s.sources.fkme = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    s.layers.push(
      { id: "fk-points", type: "circle", source: "fkpoints", paint: { "circle-radius": 6, "circle-color": "#4B5320", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      { id: "fk-points-label", type: "symbol", source: "fkpoints", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 13, "text-offset": [0, 1.1], "text-anchor": "top" }, paint: { "text-color": dark ? "#e8e2d0" : "#2d3314", "text-halo-color": dark ? "#111" : "#fff", "text-halo-width": 1.5 } },
      { id: "fk-route-casing", type: "line", source: "fkroute", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#141414", "line-width": 6, "line-opacity": ["case", ["get", "done"], 0.35, 1] } },
      { id: "fk-route", type: "line", source: "fkroute", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-join": "round" }, paint: { "line-color": ["case", ["get", "active"], "#e0b552", "#b08d3c"], "line-width": 3, "line-dasharray": [2, 1.5] } },
      { id: "fk-wp", type: "circle", source: "fkroute", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["get", "next"], 14, 12], "circle-color": ["case", ["get", "ticked"], "#8a877f", "#141414"], "circle-stroke-color": ["case", ["get", "next"], "#b08d3c", "#fff"], "circle-stroke-width": ["case", ["get", "next"], 3, 1.5] } },
      { id: "fk-wp-num", type: "symbol", source: "fkroute", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["to-string", ["get", "n"]], "text-font": ["Noto Sans Medium"], "text-size": 13, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": ["case", ["get", "ticked"], "#f4efe2", "#e0b552"] } },
      { id: "fk-wp-name", type: "symbol", source: "fkroute", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top", "text-optional": true }, paint: { "text-color": dark ? "#e8e2d0" : "#1b1a17", "text-halo-color": dark ? "#111" : "#fff", "text-halo-width": 1.5 } },
      { id: "fk-me-acc", type: "circle", source: "fkme", paint: { "circle-radius": ["get", "px"], "circle-color": "#3E5765", "circle-opacity": 0.15 } },
      { id: "fk-me", type: "circle", source: "fkme", paint: { "circle-radius": 7, "circle-color": "#3E5765", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    return s;
  }

  // ---------- map ----------
  const dot = (() => { const n = 16, d = new Uint8Array(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){ const r = Math.hypot(x - 7.5, y - 7.5), i = (y * n + x) * 4; if (r < 4){ d[i] = 90; d[i + 1] = 85; d[i + 2] = 75; d[i + 3] = 220; } } return { width: n, height: n, data: d }; })();
  function create(container, opts = {}){
    setupProtocols();
    const map = new maplibregl.Map({ container, style: style(!!opts.dark), center: opts.center || [13.33, 47.6], zoom: opts.zoom != null ? opts.zoom : 6.5, maxZoom: 17.5, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, fadeDuration: 0 });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ unit: opts.imperial ? "imperial" : "metric" }), "bottom-left");
    map.on("styleimagemissing", e => { if (!map.hasImage(e.id)) map.addImage(e.id, dot); });
    map.on("error", e => { if (window.FK && FK.errors && e && e.error && !/no terrain here|AbortError/.test(String(e.error && e.error.message))) FK.errors.push("map: " + e.error.message); });
    map.fkDark = !!opts.dark;
    return map;
  }
  function restyle(map, dark){ map.fkDark = !!dark; const keep = ["fkpoints", "fkroute", "fkme"].map(id => { const s = map.getSource(id); return s && s._data; });
    map.setStyle(style(!!dark)); map.once("styledata", () => ["fkpoints", "fkroute", "fkme"].forEach((id, i) => { if (keep[i]) map.getSource(id).setData(keep[i]); })); }
  function setData(map, id, fc){ const go = () => { const s = map.getSource(id); if (s) s.setData(fc); }; if (map.isStyleLoaded()) go(); else map.once("load", go); }
  /** waypoints [{lat, lon, name}], ticked: count of waypoints passed (0 = none). */
  function setRoute(map, wps, ticked){
    const f = [];
    for (let i = 0; i + 1 < wps.length; i++) f.push({ type: "Feature", properties: { done: i + 1 < ticked, active: i + 1 === ticked && ticked > 0 }, geometry: { type: "LineString", coordinates: [[wps[i].lon, wps[i].lat], [wps[i + 1].lon, wps[i + 1].lat]] } });
    wps.forEach((w, i) => f.push({ type: "Feature", properties: { n: i + 1, name: w.name || "", ticked: i < ticked, next: i === ticked }, geometry: { type: "Point", coordinates: [w.lon, w.lat] } }));
    setData(map, "fkroute", { type: "FeatureCollection", features: f });
  }
  function setPoints(map, pts){ setData(map, "fkpoints", { type: "FeatureCollection", features: pts.map(p => ({ type: "Feature", properties: { name: p.name || "" }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) }); }
  function setMe(map, pos){
    if (!pos){ setData(map, "fkme", { type: "FeatureCollection", features: [] }); return; }
    const mpp = 156543.03 * Math.cos(rad(pos.lat)) / Math.pow(2, map.getZoom());
    setData(map, "fkme", { type: "FeatureCollection", features: [{ type: "Feature", properties: { px: Math.max(8, Math.min(300, (pos.acc || 10) / mpp)) }, geometry: { type: "Point", coordinates: [pos.lon, pos.lat] } }] });
  }
  window.FKMap = { geo, create, restyle, setRegions, setRoute, setPoints, setMe, readerSource, regions: () => regions, ATTR, _glyphRange: glyphRange };
})();
