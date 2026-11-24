/* Makes two small test map files (Innsbruck area) for the screen tests: a vector basemap in the Protomaps layout
   (made-up features, not real map data) and a terrain file from terrarium PNG tiles in <demDir> (z_x_y.png).
   Usage: NODE_PATH=<libs> node tools/make-test-maps.mjs <outDir> <demDir> */
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const pmx = require('../lib/pmx.js'), geojsonvt = require('geojson-vt'), vtpbf = require('vt-pbf');
const [out, demDir] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const F = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const layers = {
  earth: [F({ type: 'Polygon', coordinates: [[[10.9, 47.0], [11.9, 47.0], [11.9, 47.6], [10.9, 47.6], [10.9, 47.0]]] }, { kind: 'earth', min_zoom: 0 })],
  water: [F({ type: 'Polygon', coordinates: [[[11.30, 47.255], [11.34, 47.255], [11.34, 47.265], [11.30, 47.265], [11.30, 47.255]]] }, { kind: 'lake', min_zoom: 0 }),
          F({ type: 'LineString', coordinates: [[11.15, 47.25], [11.30, 47.262], [11.45, 47.27], [11.65, 47.30]] }, { kind: 'river', min_zoom: 0, name: 'Inn' })],
  landcover: [F({ type: 'Polygon', coordinates: [[[11.35, 47.20], [11.50, 47.20], [11.50, 47.24], [11.35, 47.24], [11.35, 47.20]]] }, { kind: 'forest', min_zoom: 0 })],
  roads: [F({ type: 'LineString', coordinates: [[11.2, 47.27], [11.39, 47.268], [11.6, 47.28]] }, { kind: 'major_road', kind_detail: 'primary', min_zoom: 0, name: 'Testroad' }),
          F({ type: 'LineString', coordinates: [[11.39, 47.268], [11.40, 47.30], [11.42, 47.32]] }, { kind: 'path', kind_detail: 'path', min_zoom: 0, name: 'Testpath' })],
  places: [F({ type: 'Point', coordinates: [11.394, 47.268] }, { kind: 'locality', kind_detail: 'city', name: 'Innsbruck', 'name:de': 'Innsbruck', min_zoom: 0, population_rank: 10 }),
           F({ type: 'Point', coordinates: [11.46, 47.29] }, { kind: 'locality', kind_detail: 'village', name: 'Teststadt Süd', min_zoom: 0, population_rank: 6 })],
};
const idx = {}; for (const k in layers) idx[k] = geojsonvt({ type: 'FeatureCollection', features: layers[k] }, { maxZoom: 14, indexMaxZoom: 14, extent: 4096, buffer: 64 });
const tiles = {};
for (let z = 0; z <= 14; z++){
  const n = 2 ** z, x0 = Math.floor((10.9 + 180) / 360 * n), x1 = Math.floor((11.9 + 180) / 360 * n);
  const ly = lat => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  for (let x = x0; x <= x1; x++) for (let y = ly(47.6); y <= ly(47.0); y++){
    const L = {}; for (const k in idx){ const t = idx[k].getTile(z, x, y); if (t) L[k] = t; }
    if (Object.keys(L).length) tiles[pmx.zxyToTileId(z, x, y)] = Buffer.from(vtpbf.fromGeojsonVt(L, { version: 2 }));
  }
}
pmx.writeFromTiles(path.join(out, 'test.pmtiles'), tiles, { minZoom: 0, maxZoom: 14, tileType: 1, tileComp: 1, minLon: 10.9, minLat: 47.0, maxLon: 11.9, maxLat: 47.6, meta: { name: 'test basemap (made up)' } });
const dem = {};
for (const f of fs.readdirSync(demDir)){ const m = /^(\d+)_(\d+)_(\d+)\.png$/.exec(f); if (m) dem[pmx.zxyToTileId(+m[1], +m[2], +m[3])] = fs.readFileSync(path.join(demDir, f)); }
pmx.writeFromTiles(path.join(out, 'test-terrain.pmtiles'), dem, { minZoom: 0, maxZoom: 12, tileType: 2, tileComp: 1, minLon: 11.2, minLat: 47.2, maxLon: 11.6, maxLat: 47.35 });
console.log('test maps:', Object.keys(tiles).length, 'vector tiles,', Object.keys(dem).length, 'terrain tiles');
