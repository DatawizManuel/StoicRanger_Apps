/* Tests the Map Manager's computer side (lib/core.js): downloading a region into the Nextcloud folder, maps.json,
   checksums, no half files, updates, removing, routes, and finding the newest daily build. Uses a local test server. */
import { createRequire } from 'module'; import http from 'http'; import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
const require = createRequire(import.meta.url);
const pmx = require('../lib/pmx.js'); const { Core } = require('../lib/core.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmcore-'));
const tiles = {}; for (let z = 0; z <= 9; z++){ const n = 2 ** z; for (let x = Math.floor(n * 0.52); x <= Math.floor(n * 0.55); x++) for (let y = Math.floor(n * 0.33); y <= Math.floor(n * 0.36); y++) tiles[pmx.zxyToTileId(z, x, y)] = Buffer.from(`t${z}/${x}/${y}`); }
pmx.writeFromTiles(path.join(dir, '20261107.pmtiles'), tiles, { minZoom: 0, maxZoom: 9, meta: { name: 'base' } });
pmx.writeFromTiles(path.join(dir, 'planet.pmtiles'), tiles, { minZoom: 0, maxZoom: 9, tileType: 4 });
const srv = http.createServer((q, r) => {
  const f = path.join(dir, path.basename(q.url)); if (!fs.existsSync(f)){ r.writeHead(404); return r.end(); }
  const all = fs.readFileSync(f), m = /bytes=(\d+)-(\d+)/.exec(q.headers.range || '');
  if (!m){ r.writeHead(200); return r.end(all); } const a = +m[1], b = Math.min(+m[2], all.length - 1);
  r.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${all.length}` }); r.end(all.subarray(a, b + 1));
});
await new Promise(res => srv.listen(0, res)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
const folder = path.join(dir, 'Nextcloud', 'StoicRanger_Maps');
const core = new Core({ configDir: path.join(dir, 'cfg'), tmpDir: path.join(dir, 'tmp') });
core.saveCfg({ folder, baseUrl: base + '20261107.pmtiles', terrainUrl: base + 'planet.pmtiles' });
const e = await core.estimate('at-wien'); ok(e.bytes > 0 && e.date === '20261107', 'estimate for Vienna: ' + e.bytes + ' bytes, build 2026-11-07');
const phases = new Set(); const entry = await core.download('at-wien', p => phases.add(p.phase));
ok(fs.existsSync(path.join(folder, 'at-wien.pmtiles')) && fs.existsSync(path.join(folder, 'at-wien-terrain.pmtiles')), 'both files are in the Nextcloud folder');
ok(fs.readdirSync(path.join(dir, 'tmp')).length === 0, 'nothing left in the temporary folder');
ok(!fs.readdirSync(folder).some(f => /\.part$|\.tmp/.test(f)), 'no half-written files in the synced folder');
const cat = JSON.parse(fs.readFileSync(path.join(folder, 'maps.json'), 'utf8'));
ok(cat.format === 'FK-1' && cat.maps.length === 1 && cat.maps[0].id === 'at-wien' && cat.maps[0].date === '2026-11-07', 'maps.json lists the map with format and date');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, 'at-wien.pmtiles'))).digest('hex');
ok(cat.maps[0].base.sha256 === sha, 'checksum in maps.json matches the file');
ok(['Map', 'Terrain', 'Checking', 'Done'].every(p => phases.has(p)), 'progress phases reported');
ok(fs.existsSync(path.join(folder, 'Routes')), 'Routes folder created');
// update with a newer build keeps one entry
core.saveCfg({ baseUrl: base + '20261107.pmtiles' }); await core.download('at-wien');
ok(core.catalog().maps.length === 1, 'updating keeps one entry');
// routes
const f1 = core.saveRoute('Ridge walk', '<gpx/>'), f2 = core.saveRoute('Ridge walk', '<gpx/>');
ok(f1 === 'Ridge walk.gpx' && f2 === 'Ridge walk (2).gpx', 'route names never overwrite another route');
const f3 = core.saveRoute('Ridge/walk: new', '<gpx/>', f2); ok(f3 === 'Ridge walk new.gpx' && !fs.existsSync(path.join(folder, 'Routes', f2)), 'renaming replaces the old file, unsafe characters removed');
ok(core.routes().length === 2, 'routes listed'); core.deleteRoute(f3); ok(core.routes().length === 1, 'route deleted');
ok(core.saveRoute('x', '<gpx/>', '../../evil.gpx') === 'x.gpx' && fs.existsSync(path.join(dir, 'Nextcloud', 'StoicRanger_Maps', 'Routes', 'x.gpx')), 'paths outside the Routes folder are not touched');
// remove
ok(core.remove('at-wien') && !fs.existsSync(path.join(folder, 'at-wien.pmtiles')) && core.catalog().maps.length === 0, 'remove deletes files and the catalog entry');
// newest build search: 404 for two days, then a build
let asked = [];
const c2 = new Core({ configDir: path.join(dir, 'cfg2'), tmpDir: path.join(dir, 'tmp2'), now: () => new Date('2026-11-09T10:00:00Z'),
  fetch: async (url, o) => { asked.push(url); return url.endsWith('20261107.pmtiles') ? fetch(base + '20261107.pmtiles', o) : new Response('', { status: 404 }); } });
c2.saveCfg({ folder });
const b = await c2.baseSource(); ok(b.date === '20261107' && asked.length === 3 && asked[0].endsWith('/20261109.pmtiles'), 'newest daily build found by trying back from today');
const c3 = new Core({ configDir: path.join(dir, 'cfg3'), tmpDir: path.join(dir, 'tmp3'), fetch: async () => new Response('', { status: 404 }) }); c3.saveCfg({ folder });
let msg = ''; try { await c3.baseSource(); } catch (err){ msg = err.message; } ok(/No current OpenStreetMap build/.test(msg), 'no build reachable gives a clear message');
// a newer maps.json is never overwritten; a damaged one is kept as a copy
fs.writeFileSync(path.join(folder, 'maps.json'), JSON.stringify({ format: 'FK-2', version: 1, maps: [] }));
let nm = ''; try { core.writeCatalog(core.catalog()); } catch (err){ nm = err.message; } ok(/newer Map Manager/.test(nm) && JSON.parse(fs.readFileSync(path.join(folder, 'maps.json'), 'utf8')).format === 'FK-2', 'newer maps.json is left unchanged');
fs.writeFileSync(path.join(folder, 'maps.json'), '{broken');
core.writeCatalog(core.catalog()); ok(fs.readdirSync(folder).some(f => f.startsWith('maps.json.damaged-')) && core.catalog().format === 'FK-1', 'damaged maps.json kept as a copy, then rewritten');
// cancelled download leaves nothing behind
const ac = new AbortController(); ac.abort(); let cm = ''; try { await core.download('at-tirol', null, ac.signal); } catch (err){ cm = err.message; }
ok(cm && !fs.existsSync(path.join(folder, 'at-tirol.pmtiles')) && fs.readdirSync(path.join(dir, 'tmp')).length === 0, 'a stopped download leaves no files (' + cm + ')');
srv.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
