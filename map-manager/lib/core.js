/* Stoic Ranger Map Manager — everything except the window: settings, the map catalog (maps.json), downloads and routes.
   The maps live in a folder that the Nextcloud desktop client syncs (default: <Nextcloud>\StoicRanger_Maps).
   Map format FK-1 = Protomaps OpenStreetMap basemap (vector PMTiles, zoom 0-15) + Mapterhorn terrain (terrarium
   PMTiles, zoom 0-12, for hillshade and contour lines). The phone app reads maps.json and only lists finished maps:
   files are written in a temporary folder outside the synced folder, checked (SHA-256), moved in, and maps.json is
   written last. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const pmx = require('./pmx'), REGIONS = require('./regions');

const FORMAT = "FK-1", BASE_MAXZOOM = 15, TERRAIN_MAXZOOM = 12;
const DEFAULTS = { folder: "", baseUrl: "", terrainUrl: "https://download.mapterhorn.com/planet.pmtiles", checkUpdates: true, keepOld: false };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const safeId = s => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "map";
const safeName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Route";

function moveFile(a, b){ try { fs.renameSync(a, b); } catch(e){ if (e.code !== "EXDEV") throw e; fs.copyFileSync(a, b); fs.unlinkSync(a); } }
function sha256(file){ return new Promise((res, rej) => { const h = crypto.createHash("sha256"); fs.createReadStream(file).on("data", d => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej); }); }
function writeAtomic(file, text){ const t = file + ".tmp-" + process.pid; fs.writeFileSync(t, text); fs.renameSync(t, file); }

class Core {
  constructor(o){
    this.configDir = o.configDir; this.tmpDir = o.tmpDir || path.join(os.tmpdir(), "sr-map-manager");
    this.fetch = o.fetch || fetch; this.now = o.now || (() => new Date());
    fs.mkdirSync(this.configDir, { recursive: true }); fs.mkdirSync(this.tmpDir, { recursive: true });
    this.cfgFile = path.join(this.configDir, "config.json");
    let c = {}; try { c = JSON.parse(fs.readFileSync(this.cfgFile, "utf8")); } catch(e){}
    this.cfg = Object.assign({}, DEFAULTS, c);
    if (!this.cfg.folder) this.cfg.folder = this.guessFolder();
  }
  guessFolder(){
    const home = os.homedir(), cands = [path.join(home, "Nextcloud", "StoicRanger_Maps"), path.join(home, "Nextcloud")];
    try { for (const d of fs.readdirSync(home)) if (/^nextcloud/i.test(d)) cands.push(path.join(home, d, "StoicRanger_Maps")); } catch(e){}
    return cands.find(p => fs.existsSync(p) && /StoicRanger_Maps$/.test(p)) || cands[0];
  }
  saveCfg(patch){ Object.assign(this.cfg, patch || {}); fs.writeFileSync(this.cfgFile, JSON.stringify(this.cfg, null, 2)); return this.cfg; }
  folderState(){
    const f = this.cfg.folder, exists = !!f && fs.existsSync(f);
    let free = null; try { if (exists && fs.statfsSync){ const s = fs.statfsSync(f); free = s.bavail * s.bsize; } } catch(e){}
    const parent = f ? path.dirname(f) : "", synced = exists && (/nextcloud/i.test(f) || fs.existsSync(path.join(parent, ".sync_journal.db")) || fs.readdirSync(parent).some(n => /^\.sync_.*\.db$/.test(n) || n === ".owncloudsync.log"));
    return { folder: f, exists, free, synced };
  }
  ensureFolder(){ if (!this.cfg.folder) throw new Error("Choose the Nextcloud maps folder under Settings first."); fs.mkdirSync(this.cfg.folder, { recursive: true }); fs.mkdirSync(path.join(this.cfg.folder, "Routes"), { recursive: true }); }
  catalogFile(){ return path.join(this.cfg.folder, "maps.json"); }
  catalog(){
    const f = this.catalogFile();
    if (!fs.existsSync(f)) return { format: FORMAT, version: 1, updated: null, maps: [] };
    let c = null; try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch(e){}
    if (c && Array.isArray(c.maps)) return c;
    // damaged: keep a copy before anything new is written (rule: data is never lost)
    try { fs.copyFileSync(f, f + ".damaged-" + this.now().toISOString().replace(/[-:]/g, "").slice(0, 15)); } catch(e){}
    return { format: FORMAT, version: 1, updated: null, maps: [], damaged: true };
  }
  writeCatalog(c){
    const old = fs.existsSync(this.catalogFile()) ? this.catalog() : null;
    if (old && !old.damaged && (old.format !== FORMAT || (old.version || 1) > 1)) throw new Error("maps.json was written by a newer Map Manager (" + old.format + " v" + old.version + "). Update this app first; nothing was changed.");
    delete c.damaged; c.format = FORMAT; c.version = 1; c.updated = this.now().toISOString(); c.maps.sort((a, b) => a.name.localeCompare(b.name)); this.ensureFolder(); writeAtomic(this.catalogFile(), JSON.stringify(c, null, 2)); }
  regions(){ return REGIONS; }

  /** The newest Protomaps daily build: tries the last 14 days (or the URL set under Settings). */
  async baseSource(signal){
    if (this.cfg.baseUrl) return { url: this.cfg.baseUrl, date: (/(\d{8})/.exec(this.cfg.baseUrl) || [])[1] || null };
    if (this._base && Date.now() - this._base.at < 3600e3) return this._base;
    const t = this.now(); let lastErr = "";
    for (let i = 0; i < 14; i++){
      const d = new Date(t.getTime() - i * 864e5), url = "https://build.protomaps.com/" + ymd(d) + ".pmtiles";
      try {
        const r = await this.fetch(url, { headers: { Range: "bytes=0-126" }, signal });
        if (r.status === 206 || r.status === 200){ const b = Buffer.from(await r.arrayBuffer()); if (b.toString("latin1", 0, 7) === "PMTiles"){ this._base = { url, date: ymd(d), at: Date.now() }; return this._base; } }
        lastErr = "HTTP " + r.status;
      } catch(e){ if (signal && signal.aborted) throw new Error("cancelled"); lastErr = e.message; }
    }
    throw new Error("No current OpenStreetMap build found at build.protomaps.com (" + lastErr + "). Check the internet connection, or set the address under Settings.");
  }
  terrainSource(){ return { url: this.cfg.terrainUrl || DEFAULTS.terrainUrl }; }

  async estimate(id, signal){
    const r = REGIONS.find(x => x.id === id); if (!r) throw new Error("Unknown region " + id);
    const b = await this.baseSource(signal), t = this.terrainSource();
    const [eb, et] = await Promise.all([pmx.estimate(b.url, r.bbox, { maxzoom: BASE_MAXZOOM, signal, fetch: this.fetch }), pmx.estimate(t.url, r.bbox, { maxzoom: TERRAIN_MAXZOOM, signal, fetch: this.fetch })]);
    return { id, bytes: eb.bytes + et.bytes, base: eb.bytes, terrain: et.bytes, date: b.date };
  }
  /** Downloads one region (both files), checks them, moves them into the folder, updates maps.json. */
  async download(id, onProgress, signal){
    const r = REGIONS.find(x => x.id === id); if (!r) throw new Error("Unknown region " + id);
    this.ensureFolder();
    const b = await this.baseSource(signal), t = this.terrainSource(), fileId = safeId(r.id);
    const tmpB = path.join(this.tmpDir, fileId + ".pmtiles"), tmpT = path.join(this.tmpDir, fileId + "-terrain.pmtiles");
    const prog = { base: [0, 1], terrain: [0, 1] };
    const report = phase => onProgress && onProgress({ id, phase, done: prog.base[0] + prog.terrain[0], total: prog.base[1] + prog.terrain[1] });
    try {
      report("Preparing");
      const rb = await pmx.extract(b.url, tmpB, r.bbox, { maxzoom: BASE_MAXZOOM, signal, fetch: this.fetch, onProgress: (d, tot) => { prog.base = [d, tot]; report("Map"); } });
      const rt = await pmx.extract(t.url, tmpT, r.bbox, { maxzoom: TERRAIN_MAXZOOM, signal, fetch: this.fetch, onProgress: (d, tot) => { prog.terrain = [d, tot]; report("Terrain"); } });
      report("Checking");
      const [hb, ht] = [await sha256(tmpB), await sha256(tmpT)];
      const cat = this.catalog(), old = cat.maps.find(m => m.id === fileId);
      const dst = f => path.join(this.cfg.folder, f);
      if (old && this.cfg.keepOld){ for (const k of ["base", "terrain"]) if (old[k] && fs.existsSync(dst(old[k].file))) moveFile(dst(old[k].file), dst(old[k].file.replace(/\.pmtiles$/, "-" + (old.date || "old").replace(/-/g, "") + ".pmtiles.bak"))); }
      moveFile(tmpB, dst(fileId + ".pmtiles")); moveFile(tmpT, dst(fileId + "-terrain.pmtiles"));
      const entry = { id: fileId, name: r.name, bbox: rb.bbox, date: b.date ? b.date.slice(0, 4) + "-" + b.date.slice(4, 6) + "-" + b.date.slice(6) : this.now().toISOString().slice(0, 10),
        downloaded: this.now().toISOString(), base: { file: fileId + ".pmtiles", bytes: rb.bytes, sha256: hb, maxZoom: rb.maxZoom }, terrain: { file: fileId + "-terrain.pmtiles", bytes: rt.bytes, sha256: ht, maxZoom: rt.maxZoom },
        attribution: "© OpenStreetMap contributors (ODbL), Protomaps; terrain: Mapterhorn (Copernicus GLO-30 and national elevation data)" };
      const c2 = this.catalog(); c2.maps = c2.maps.filter(m => m.id !== fileId).concat(entry); this.writeCatalog(c2);
      report("Done");
      return entry;
    } finally { for (const f of [tmpB, tmpT, tmpB + ".part", tmpT + ".part"]) try { fs.unlinkSync(f); } catch(e){} }
  }
  remove(id){
    const c = this.catalog(), m = c.maps.find(x => x.id === id); if (!m) return false;
    c.maps = c.maps.filter(x => x.id !== id); this.writeCatalog(c);      // the phone stops listing it first
    for (const k of ["base", "terrain"]) if (m[k]) try { fs.unlinkSync(path.join(this.cfg.folder, m[k].file)); } catch(e){}
    return true;
  }
  /** Newest build date vs. each map's date. */
  async updates(signal){ const b = await this.baseSource(signal); const d = b.date ? b.date.slice(0, 4) + "-" + b.date.slice(4, 6) + "-" + b.date.slice(6) : null; return { latest: d, outdated: d ? this.catalog().maps.filter(m => m.date < d).map(m => m.id) : [] }; }
  mapPath(file){ const p = path.join(this.cfg.folder, path.basename(file)); if (!/\.pmtiles$/.test(p)) throw new Error("bad file"); return p; }

  // ---------- routes: <folder>/Routes/*.gpx ----------
  routesDir(){ return path.join(this.cfg.folder, "Routes"); }
  routes(){ const d = this.routesDir(); if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter(f => /\.gpx$/i.test(f)).sort().map(f => { const p = path.join(d, f); return { file: f, gpx: fs.readFileSync(p, "utf8"), mtime: fs.statSync(p).mtimeMs }; }); }
  saveRoute(name, gpx, oldFile){
    this.ensureFolder(); const base = safeName(name); let f = base + ".gpx", n = 2;
    while (fs.existsSync(path.join(this.routesDir(), f)) && f !== oldFile) f = base + " (" + (n++) + ").gpx";
    writeAtomic(path.join(this.routesDir(), f), gpx);
    if (oldFile && oldFile !== f) try { fs.unlinkSync(path.join(this.routesDir(), path.basename(oldFile))); } catch(e){}
    return f;
  }
  deleteRoute(file){ try { fs.unlinkSync(path.join(this.routesDir(), path.basename(file))); return true; } catch(e){ return false; } }
}
module.exports = { Core, FORMAT, BASE_MAXZOOM, TERRAIN_MAXZOOM, safeName };
