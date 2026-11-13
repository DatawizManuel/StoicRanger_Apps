/* Tests the PMTiles region extract against a made-up "planet" served over HTTP with range requests, and reads the
   result back with the official pmtiles reader. Usage: NODE_PATH=<dir with pmtiles> node tools/test-pmx.mjs */
import { createRequire } from 'module'; import http from 'http'; import fs from 'fs'; import os from 'os'; import path from 'path';
const require = createRequire(import.meta.url);
const pmx = require('../lib/pmx.js');
const { PMTiles } = require(process.env.PMTILES || 'pmtiles');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmx-'));

// 1. a source "planet" z0..8 with shared sea tiles and forced leaf directories
const tiles = {}, MAXZ = 8;
for (let z = 0; z <= MAXZ; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++)
  tiles[pmx.zxyToTileId(z, x, y)] = Buffer.from(((x * 7 + y * 3) % 5 === 0 && z > 2) ? 'SEA' : `${z}/${x}/${y}`);
const src = path.join(dir, 'planet.pmtiles');
pmx.writeFromTiles(src, tiles, { minZoom: 0, maxZoom: MAXZ, forceLeaves: 500, meta: { name: 'test planet', attribution: 'test' } });
ok(fs.statSync(src).size > 0, 'source written (' + Object.keys(tiles).length + ' tiles, leaf directories)');

// 2. serve it with range requests, count requests
let requests = 0;
const srv = http.createServer((q, r) => {
  requests++; const m = /bytes=(\d+)-(\d+)/.exec(q.headers.range || ''); const all = fs.readFileSync(src);
  if (!m){ r.writeHead(200); return r.end(all); }
  const a = +m[1], b = Math.min(+m[2], all.length - 1); r.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${all.length}` }); r.end(all.subarray(a, b + 1));
});
await new Promise(res => srv.listen(0, res));
const url = 'http://127.0.0.1:' + srv.address().port + '/planet.pmtiles';

const bbox = [9.53, 46.37, 17.16, 49.02];   // Austria
const est = await pmx.estimate(url, bbox, { maxzoom: 7 });
ok(est.tiles > 0 && est.bytes > 0, `estimate: ${est.tiles} tiles, ${est.bytes} bytes`);
requests = 0; let lastP = 0;
const out = path.join(dir, 'austria.pmtiles');
const res = await pmx.extract(url, out, bbox, { maxzoom: 7, onProgress: (d, t) => { lastP = d / t; } });
ok(fs.existsSync(out) && !fs.existsSync(out + '.part'), 'extract written, no .part left');
ok(lastP === 1, 'progress reached 100 %');
ok(requests < 40, 'few HTTP requests (' + requests + ')');
ok(res.maxZoom === 7 && res.minZoom === 0, 'zoom range 0-7');

// 3. read back with the official reader
class FileSource { constructor(f){ this.f = f; } getKey(){ return this.f; } async getBytes(o, l){ const fd = fs.openSync(this.f, 'r'); const b = Buffer.alloc(l); const n = fs.readSync(fd, b, 0, l, o); fs.closeSync(fd); return { data: b.buffer.slice(b.byteOffset, b.byteOffset + n) }; } }
const p = new PMTiles(new FileSource(out)), hd = await p.getHeader();
ok(hd.clustered === true && hd.maxZoom === 7, 'header: clustered, maxZoom 7');
let good = 0, bad = 0;
for (let z = 0; z <= 7; z++){
  const n = 2 ** z, x0 = Math.floor((bbox[0] + 180) / 360 * n), x1 = Math.floor((bbox[2] + 180) / 360 * n);
  const ly = lat => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  for (let x = x0; x <= x1; x++) for (let y = ly(bbox[3]); y <= ly(bbox[1]); y++){
    const t = await p.getZxy(z, x, y), want = tiles[pmx.zxyToTileId(z, x, y)].toString();
    if (t && Buffer.from(t.data).toString() === want) good++; else bad++;
  }
}
ok(bad === 0 && good > 0, `all ${good} tiles inside Austria read back correctly`);
ok(!(await p.getZxy(7, 0, 0)), 'a tile outside the area is not in the file');
ok(!(await p.getZxy(8, 136, 90)), 'no tiles above maxzoom 7');
const meta = await p.getMetadata();
ok(meta && meta.name === 'test planet', 'metadata kept');

// 4. bigger extract that needs leaf directories in the output
const big = path.join(dir, 'big.pmtiles');
await pmx.extract(url, big, [-180, -85, 180, 85], { maxzoom: 8 });
const pb = new PMTiles(new FileSource(big)), hb = await pb.getHeader();
ok(hb.leafDirectoryLength > 0, 'large extract uses leaf directories');
const t1 = await pb.getZxy(8, 130, 100);
ok(t1 && Buffer.from(t1.data).toString() === tiles[pmx.zxyToTileId(8, 130, 100)].toString(), 'large extract reads back');

// 5. a server error gives a clear message and leaves no partial file
const bad404 = 'http://127.0.0.1:' + srv.address().port + '/none';
const srv2 = http.createServer((q, r) => { r.writeHead(404); r.end(); }); await new Promise(res => srv2.listen(0, res));
let msg = ''; try { await pmx.extract('http://127.0.0.1:' + srv2.address().port + '/x.pmtiles', path.join(dir, 'x.pmtiles'), bbox, {}); } catch (e) { msg = e.message; }
ok(/answered 404/.test(msg) && !fs.existsSync(path.join(dir, 'x.pmtiles.part')), 'HTTP 404 gives a clear message: ' + msg);
srv.close(); srv2.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
