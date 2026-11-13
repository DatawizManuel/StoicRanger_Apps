/* Stoic Ranger Map Manager — PMTiles v3 region extract over HTTP range requests (no extra tools needed).
   Reads only the directories and the tiles inside the bounding box, merges nearby byte ranges into few requests,
   and writes a new, clustered PMTiles file. Works with any reader: a local path or an http(s) URL. */
'use strict';
const fs = require('fs'), zlib = require('zlib');

const HEADER = 127, ROOT_MAX = 16384 - HEADER;

// ---------- tile ids (Hilbert order, as in the PMTiles spec) ----------
function rotate(n, xy, rx, ry){ if (ry === 0){ if (rx === 1){ xy[0] = n - 1 - xy[0]; xy[1] = n - 1 - xy[1]; } const t = xy[0]; xy[0] = xy[1]; xy[1] = t; } }
function zxyToTileId(z, x, y){
  let acc = 0; for (let t = 0; t < z; t++) acc += Math.pow(4, t);   // tiles of all lower zooms (exact up to z26)
  const n = Math.pow(2, z), xy = [x, y]; let d = 0;
  for (let s = n / 2; s >= 1; s /= 2){ const rx = (xy[0] & s) > 0 ? 1 : 0, ry = (xy[1] & s) > 0 ? 1 : 0; d += s * s * ((3 * rx) ^ ry); rotate(s, xy, rx, ry); }
  return acc + d;
}
function lon2x(lon, z){ return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
function lat2y(lat, z){ const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
function clampT(v, z){ return Math.max(0, Math.min(Math.pow(2, z) - 1, v)); }
/** All tile ids inside bbox [w,s,e,n] for zooms minz..maxz, sorted. */
function tileIds(bbox, minz, maxz){
  const out = [];
  for (let z = minz; z <= maxz; z++){
    const x0 = clampT(lon2x(bbox[0], z), z), x1 = clampT(lon2x(bbox[2], z), z), y0 = clampT(lat2y(bbox[3], z), z), y1 = clampT(lat2y(bbox[1], z), z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(zxyToTileId(z, x, y));
  }
  return out.sort((a, b) => a - b);
}

// ---------- varints and directories ----------
function readVarint(b, p){ let v = 0, mul = 1, byte; do { byte = b[p.i++]; v += (byte & 0x7f) * mul; mul *= 128; } while (byte & 0x80); return v; }
function writeVarint(arr, v){ while (v >= 128){ arr.push((v % 128) | 0x80); v = Math.floor(v / 128); } arr.push(v); }
function decompress(buf, c){ if (c === 1 || c === 0) return buf; if (c === 2) return zlib.gunzipSync(buf); throw new Error("Unsupported compression " + c); }
function parseDir(buf){
  const p = { i: 0 }, n = readVarint(buf, p), e = new Array(n);
  let last = 0;
  for (let k = 0; k < n; k++){ last += readVarint(buf, p); e[k] = { tileId: last, offset: 0, length: 0, runLength: 0 }; }
  for (let k = 0; k < n; k++) e[k].runLength = readVarint(buf, p);
  for (let k = 0; k < n; k++) e[k].length = readVarint(buf, p);
  for (let k = 0; k < n; k++){ const v = readVarint(buf, p); e[k].offset = (v === 0 && k > 0) ? e[k - 1].offset + e[k - 1].length : v - 1; }
  return e;
}
function serializeDir(entries){
  const a = []; writeVarint(a, entries.length);
  let last = 0; for (const e of entries){ writeVarint(a, e.tileId - last); last = e.tileId; }
  for (const e of entries) writeVarint(a, e.runLength);
  for (const e of entries) writeVarint(a, e.length);
  for (let k = 0; k < entries.length; k++){ const e = entries[k]; if (k > 0 && e.offset === entries[k - 1].offset + entries[k - 1].length) writeVarint(a, 0); else writeVarint(a, e.offset + 1); }
  return zlib.gzipSync(Buffer.from(a));
}
function u64(b, o){ return b.readUInt32LE(o) + b.readUInt32LE(o + 4) * 4294967296; }
function w64(b, o, v){ b.writeUInt32LE(v % 4294967296, o); b.writeUInt32LE(Math.floor(v / 4294967296), o + 4); }
function parseHeader(b){
  if (b.toString("latin1", 0, 7) !== "PMTiles") throw new Error("Not a PMTiles file");
  if (b[7] !== 3) throw new Error("PMTiles version " + b[7] + " is not supported (needs 3)");
  return { rootOffset: u64(b, 8), rootLength: u64(b, 16), metaOffset: u64(b, 24), metaLength: u64(b, 32), leafOffset: u64(b, 40), leafLength: u64(b, 48),
    dataOffset: u64(b, 56), dataLength: u64(b, 64), addressed: u64(b, 72), entries: u64(b, 80), contents: u64(b, 88), clustered: b[96], internalComp: b[97], tileComp: b[98],
    tileType: b[99], minZoom: b[100], maxZoom: b[101], minLon: b.readInt32LE(102) / 1e7, minLat: b.readInt32LE(106) / 1e7, maxLon: b.readInt32LE(110) / 1e7, maxLat: b.readInt32LE(114) / 1e7,
    centerZoom: b[118], centerLon: b.readInt32LE(119) / 1e7, centerLat: b.readInt32LE(123) / 1e7 };
}
function headerBytes(h){
  const b = Buffer.alloc(HEADER); b.write("PMTiles", 0, "latin1"); b[7] = 3;
  [h.rootOffset, h.rootLength, h.metaOffset, h.metaLength, h.leafOffset, h.leafLength, h.dataOffset, h.dataLength, h.addressed, h.entries, h.contents].forEach((v, i) => w64(b, 8 + i * 8, v));
  b[96] = 1; b[97] = 2; b[98] = h.tileComp; b[99] = h.tileType; b[100] = h.minZoom; b[101] = h.maxZoom;
  b.writeInt32LE(Math.round(h.minLon * 1e7), 102); b.writeInt32LE(Math.round(h.minLat * 1e7), 106); b.writeInt32LE(Math.round(h.maxLon * 1e7), 110); b.writeInt32LE(Math.round(h.maxLat * 1e7), 114);
  b[118] = h.centerZoom; b.writeInt32LE(Math.round(h.centerLon * 1e7), 119); b.writeInt32LE(Math.round(h.centerLat * 1e7), 123);
  return b;
}
/** Builds root + leaf directories so that the root fits into the first 16 KiB. */
function buildDirs(entries){
  const root = serializeDir(entries);
  if (root.length <= ROOT_MAX) return { root, leaves: Buffer.alloc(0) };
  for (let size = 4096; ; size = Math.ceil(size * 1.2)){
    const rootEntries = [], parts = []; let off = 0;
    for (let i = 0; i < entries.length; i += size){
      const chunk = entries.slice(i, i + size), d = serializeDir(chunk);
      rootEntries.push({ tileId: chunk[0].tileId, offset: off, length: d.length, runLength: 0 }); parts.push(d); off += d.length;
    }
    const r = serializeDir(rootEntries);
    if (r.length <= ROOT_MAX) return { root: r, leaves: Buffer.concat(parts) };
  }
}

// ---------- readers ----------
/** A reader gets bytes [offset, offset+length) of a local file or a remote URL (HTTP range request, with retries). */
function reader(src, opts = {}){
  if (!/^https?:\/\//i.test(src)){
    const fd = fs.openSync(src, "r");
    return { read: async (o, l) => { const b = Buffer.alloc(l); const n = fs.readSync(fd, b, 0, l, o); return b.subarray(0, n); }, close: () => fs.closeSync(fd) };
  }
  const f = opts.fetch || fetch;
  return { read: async (o, l, signal) => {
    let err;
    for (let attempt = 0; attempt < 4; attempt++){
      if (signal && signal.aborted) throw new Error("cancelled");
      try {
        const r = await f(src, { headers: { Range: "bytes=" + o + "-" + (o + l - 1), "User-Agent": "StoicRangerMapManager/0.1" }, signal });
        if (r.status === 200 && o === 0 && l < 1e6){ const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, l); }
        if (r.status !== 206) throw new Error("The map server answered " + r.status + " for " + src);
        const b = Buffer.from(await r.arrayBuffer());
        const total = +((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1] || 0);
        if (b.length < l && total && o + b.length === total) return b;   // the end of the file
        if (b.length !== l) throw new Error("Short read from the map server (" + b.length + " of " + l + " bytes)");
        return b;
      } catch (e){ err = e; if (signal && signal.aborted) throw new Error("cancelled"); if (/answered 4\d\d/.test(e.message)) break; await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
    }
    throw err;
  }, close(){} };
}

// ---------- plan: which tiles, where in the source ----------
async function plan(src, bbox, opts = {}){
  const rd = opts.reader || reader(src, opts), signal = opts.signal;
  const first = await rd.read(0, 16384, signal), h = parseHeader(first);
  const maxz = Math.min(opts.maxzoom != null ? opts.maxzoom : h.maxZoom, h.maxZoom), minz = h.minZoom;
  const ids = tileIds(bbox, minz, maxz);
  const rootBuf = h.rootOffset + h.rootLength <= first.length ? first.subarray(h.rootOffset, h.rootOffset + h.rootLength) : await rd.read(h.rootOffset, h.rootLength, signal);
  const root = parseDir(decompress(rootBuf, h.internalComp));
  const leafCache = new Map();
  const found = [];  // {tileId, offset, length}
  // resolve ids against a directory; leaves are fetched in merged batches
  async function resolve(dir, list){
    const needLeaf = new Map();   // leaf entry index -> ids
    let k = 0;
    for (const id of list){
      while (k + 1 < dir.length && dir[k + 1].tileId <= id) k++;
      const e = dir[k]; if (!e || e.tileId > id) continue;
      if (e.runLength > 0){ if (id < e.tileId + e.runLength) found.push({ tileId: id, offset: e.offset, length: e.length }); }
      else { if (!needLeaf.has(k)) needLeaf.set(k, []); needLeaf.get(k).push(id); }
    }
    if (!needLeaf.size) return;
    const leafEntries = [...needLeaf.keys()].map(i => dir[i]).sort((a, b) => a.offset - b.offset);
    // merge leaf reads (they sit next to each other in the leaf section)
    const groups = []; let g = null;
    for (const e of leafEntries){
      if (leafCache.has(e.offset)) continue;
      if (g && e.offset - (g.end) <= 65536 && e.offset + e.length - g.start <= 8 * 1048576){ g.items.push(e); g.end = Math.max(g.end, e.offset + e.length); }
      else { g = { start: e.offset, end: e.offset + e.length, items: [e] }; groups.push(g); }
    }
    for (const gr of groups){
      const b = await rd.read(h.leafOffset + gr.start, gr.end - gr.start, signal);
      for (const e of gr.items) leafCache.set(e.offset, parseDir(decompress(b.subarray(e.offset - gr.start, e.offset - gr.start + e.length), h.internalComp)));
    }
    for (const [i, sub] of needLeaf){ await resolve(leafCache.get(dir[i].offset), sub); }
    if (opts.onPlan) opts.onPlan(found.length);
  }
  await resolve(root, ids);
  found.sort((a, b) => a.tileId - b.tileId);
  const uniq = new Map(); for (const t of found) if (!uniq.has(t.offset)) uniq.set(t.offset, t.length);
  let bytes = 0; for (const l of uniq.values()) bytes += l;
  return { header: h, reader: rd, tiles: found, uniq, bytes, minz, maxz };
}

/** Estimated size of an extract in bytes (reads only directories). */
async function estimate(src, bbox, opts = {}){ const p = await plan(src, bbox, opts); p.reader.close(); return { bytes: p.bytes, tiles: p.tiles.length, header: p.header }; }

/** Writes the extract to out (via out + ".part", renamed when complete). onProgress(doneBytes, totalBytes). */
async function extract(src, out, bbox, opts = {}){
  const p = await plan(src, bbox, opts), h = p.header, rd = p.reader, signal = opts.signal;
  // new offsets: tile contents in tile-id order of first use (clustered), shared contents written once
  const newOff = new Map(); let off = 0;
  for (const t of p.tiles) if (!newOff.has(t.offset)){ newOff.set(t.offset, off); off += t.length; }
  const dataLength = off;
  // directory entries with run lengths
  const entries = [];
  for (const t of p.tiles){
    const o = newOff.get(t.offset), last = entries[entries.length - 1];
    if (last && last.offset === o && last.tileId + last.runLength === t.tileId) last.runLength++;
    else entries.push({ tileId: t.tileId, offset: o, length: t.length, runLength: 1 });
  }
  if (!entries.length) throw new Error("No map data inside this area.");
  const dirs = buildDirs(entries);
  // metadata: the source's JSON, kept as it is
  let meta = Buffer.from("{}");
  if (h.metaLength) meta = decompress(await rd.read(h.metaOffset, h.metaLength, signal), h.internalComp);
  const metaGz = zlib.gzipSync(meta);
  const nh = { rootOffset: HEADER, rootLength: dirs.root.length };
  nh.metaOffset = nh.rootOffset + nh.rootLength; nh.metaLength = metaGz.length;
  nh.leafOffset = nh.metaOffset + nh.metaLength; nh.leafLength = dirs.leaves.length;
  nh.dataOffset = nh.leafOffset + nh.leafLength; nh.dataLength = dataLength;
  nh.addressed = p.tiles.length; nh.entries = entries.length; nh.contents = newOff.size;
  const bb = [Math.max(bbox[0], h.minLon), Math.max(bbox[1], h.minLat), Math.min(bbox[2], h.maxLon), Math.min(bbox[3], h.maxLat)];
  Object.assign(nh, { tileComp: h.tileComp, tileType: h.tileType, minZoom: p.minz, maxZoom: p.maxz, minLon: bb[0], minLat: bb[1], maxLon: bb[2], maxLat: bb[3],
    centerZoom: Math.min(p.maxz, Math.max(p.minz, 8)), centerLon: (bb[0] + bb[2]) / 2, centerLat: (bb[1] + bb[3]) / 2 });
  const part = out + ".part", fd = fs.openSync(part, "w");
  try {
    fs.writeSync(fd, headerBytes(nh), 0, HEADER, 0);
    fs.writeSync(fd, dirs.root, 0, dirs.root.length, nh.rootOffset);
    fs.writeSync(fd, metaGz, 0, metaGz.length, nh.metaOffset);
    if (dirs.leaves.length) fs.writeSync(fd, dirs.leaves, 0, dirs.leaves.length, nh.leafOffset);
    // fetch tile data in merged ranges
    const srcs = [...p.uniq.keys()].sort((a, b) => a - b), ranges = []; let r = null;
    const gap = opts.gap != null ? opts.gap : 131072, maxRange = opts.maxRange || 16 * 1048576;
    for (const o of srcs){
      const l = p.uniq.get(o);
      if (r && o - r.end <= gap && o + l - r.start <= maxRange){ r.items.push(o); r.end = Math.max(r.end, o + l); }
      else { r = { start: o, end: o + l, items: [o] }; ranges.push(r); }
    }
    let done = 0, next = 0;
    const worker = async () => {
      while (next < ranges.length){
        const g = ranges[next++];
        const b = await rd.read(h.dataOffset + g.start, g.end - g.start, signal);
        for (const o of g.items){ const l = p.uniq.get(o); fs.writeSync(fd, b, o - g.start, l, nh.dataOffset + newOff.get(o)); done += l; }
        if (opts.onProgress) opts.onProgress(done, p.bytes);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency || 4, ranges.length) }, worker));
    fs.closeSync(fd);
  } catch (e){ try { fs.closeSync(fd); } catch(x){} try { fs.unlinkSync(part); } catch(x){} rd.close(); throw e; }
  rd.close();
  fs.renameSync(part, out);
  return { bytes: nh.dataOffset + dataLength, tiles: p.tiles.length, minZoom: p.minz, maxZoom: p.maxz, bbox: bb };
}

/** Writes a PMTiles file from {tileId: Buffer} (used by the tests). */
function writeFromTiles(out, tiles, h){
  const ids = Object.keys(tiles).map(Number).sort((a, b) => a - b);
  const byContent = new Map(), entries = [], parts = []; let off = 0;
  for (const id of ids){
    const key = tiles[id].toString("base64"); let o = byContent.get(key);
    if (o == null){ o = off; byContent.set(key, o); parts.push(tiles[id]); off += tiles[id].length; }
    const last = entries[entries.length - 1];
    if (last && last.offset === o && last.tileId + last.runLength === id) last.runLength++;
    else entries.push({ tileId: id, offset: o, length: tiles[id].length, runLength: 1 });
  }
  const dirs = h.forceLeaves ? (() => { const parts2 = [], re = []; let lo = 0; for (let i = 0; i < entries.length; i += h.forceLeaves){ const c = entries.slice(i, i + h.forceLeaves), d = serializeDir(c); re.push({ tileId: c[0].tileId, offset: lo, length: d.length, runLength: 0 }); parts2.push(d); lo += d.length; } return { root: serializeDir(re), leaves: Buffer.concat(parts2) }; })() : buildDirs(entries);
  const meta = zlib.gzipSync(Buffer.from(JSON.stringify(h.meta || {})));
  const nh = Object.assign({ tileComp: 1, tileType: 1, minZoom: 0, maxZoom: 0, minLon: -180, minLat: -85, maxLon: 180, maxLat: 85, centerZoom: 0, centerLon: 0, centerLat: 0 }, h);
  nh.rootOffset = HEADER; nh.rootLength = dirs.root.length; nh.metaOffset = HEADER + dirs.root.length; nh.metaLength = meta.length;
  nh.leafOffset = nh.metaOffset + meta.length; nh.leafLength = dirs.leaves.length; nh.dataOffset = nh.leafOffset + dirs.leaves.length; nh.dataLength = off;
  nh.addressed = ids.length; nh.entries = entries.length; nh.contents = parts.length;
  fs.writeFileSync(out, Buffer.concat([headerBytes(nh), dirs.root, meta, dirs.leaves, ...parts]));
}

module.exports = { extract, estimate, plan, tileIds, zxyToTileId, parseHeader, reader, writeFromTiles };
