// SR Field Kit web layer tests (no phone needed): node field-kit/tools/test-app.mjs
// Serves app/src/main/assets/www, opens it in Chromium (phone size) and checks routes, solver, MGRS, units, link, data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
// optional: FK_TEST_MAPS=<dir with test.pmtiles, test-terrain.pmtiles> (map-manager/tools/make-test-maps.mjs) adds the map drawing test
const MAPS = process.env.FK_TEST_MAPS || '';
const srv = createServer(async (q, r) => { try { const u = new URL(q.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p.startsWith('/maps/')) { const b = await readFile(join(MAPS, p.slice(6).replace(/[\\/]/g, ''))); const o = +u.searchParams.get('o'), l = +u.searchParams.get('l'); r.writeHead(200); return r.end(b.subarray(o, o + l)); } const b = await readFile(join(WWW, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(b); } catch (e) { r.writeHead(404); r.end(); } });
await new Promise(ok => srv.listen(0, ok));
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// Fake Android bridge, so the same page runs as on the phone
const BRIDGE = ({ db, installed, srJson }) => {
  const state = { db, bak: '', backups: [], saved: 0, printed: [], assets: [] };
  window.__bridge = state;
  window.FKNative = {
    loadDb: () => state.db, loadDbBackup: () => state.bak,
    saveDb: t => { state.bak = state.db; state.db = t; state.saved++; return true; },
    backupDb: n => { state.backups.push(n); return true; },
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.1.0', code: 1 }),
    keepScreenOn: () => {}, hasLocation: () => false, openAppSettings: () => {},
    srStatus: () => JSON.stringify({ installed, version: installed ? '1.2.0' : undefined }),
    srCall: () => srJson, print: (h, j) => state.printed.push(j), printAsset: (p, j) => state.assets.push(['print', p]), shareAsset: (p) => state.assets.push(['share', p]),
    saveFile: (name, mime, b64, cb) => { state.files.push({ name, text: decodeURIComponent(escape(atob(b64))) }); setTimeout(() => FKNativeCallback(cb, { ok: true, msg: name }), 5); },
    // 0.3.0: Nextcloud (fake server in state.nc), maps, file picker, sensors, flashlight
    syncGet: () => JSON.stringify({ mode: 'nextcloud', url: 'https://cloud.example.com', user: 'u', folder: '/Stoic Ranger/', hasPassword: true }), syncSet: () => true,
    ncRequest: (m, path, b64, ifm, depth, cb) => { state.calls.push(m + ' ' + path); const f = state.nc[m + ' ' + path]; const res = f ? { status: f[0], body: btoa(unescape(encodeURIComponent(f[1] || ''))) } : { status: m === 'MKCOL' ? 405 : m === 'PUT' ? 201 : 404, body: '' }; if (m === 'PUT') state.nc['GET ' + path] = [200, decodeURIComponent(escape(atob(b64)))]; setTimeout(() => FKNativeCallback(cb, res), 5); },
    mapList: () => JSON.stringify(state.maps), mapFree: () => 5e9, mapDelete: n => { state.maps = state.maps.filter(f => f.name !== n); return true; },
    netState: () => JSON.stringify({ online: true, wifi: state.wifi }),
    mapDownload: (path, name, sha, size, id) => { state.calls.push('DL ' + path); setTimeout(() => FKMapProgress(id, size / 2, size, 'run', ''), 5); setTimeout(() => { state.maps = state.maps.filter(f => f.name !== name).concat([{ name, bytes: size }]); FKMapProgress(id, 0, 0, 'done', ''); }, 15); },
    mapCancel: () => {}, pickFile: (kind, cb) => setTimeout(() => FKNativeCallback(cb, state.pick), 5),
    sensors: cb => setTimeout(() => FKNativeCallback(cb, { ok: true, msg: JSON.stringify(state.sensors) }), 5),
    hasTorch: () => true, torch: on => { state.torch.push(on); return true; }, setBrightness: f => state.bright.push(f),
  };
  Object.assign(state, { files: [], calls: [], nc: {}, maps: [], wifi: true, pick: { ok: false, msg: 'cancelled' }, sensors: { hasPressure: true, hasTemp: false, pressure: 950 }, torch: [], bright: [] });
};
const SR = JSON.stringify({ weapons: [{ id: 'W1', name: 'Test rifle', caliber: '6.5 Creedmoor', sightHeightMm: 52, zeroM: 100, scopeUnit: 'mrad', clickValue: 0.1 }],
  munitions: [{ id: 'M1', name: 'Test 140', caliber: '6.5 Creedmoor', bulletWeightG: 9.07, bcG1: 0.646, bcG7: 0.326, nominalV0: 823 }], v0: { 'W1|M1': { v: 820, n: 6 } } });

const browser = await chromium.launch();
async function page(opts, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
  if (opts) await p.addInitScript(BRIDGE, opts);
  await p.goto(URL0 + hash); await p.waitForTimeout(300);
  return p;
}

// 1. routes, header, no errors
{
  const p = await page({ db: '', installed: false, srJson: '{"error":"no-provider"}' });
  for (const [h, t] of [['home', 'SR Field Kit'], ['shoot', 'Shooting helpers'], ['nav', 'Navigate'], ['breathe', 'Breathe'], ['cards', 'Field cards'], ['print', 'Printables']]) {
    await p.evaluate(h => { location.hash = '#' + h; }, h); await p.waitForTimeout(80);
    ok(await p.$eval('#hTitle', e => e.textContent) === t && await p.$eval('#v-' + h, e => !e.hidden), 'route #' + h);
  }
  ok(await p.evaluate(() => document.querySelectorAll('#cardGrid .fcard').length) === 30, '30 field cards (incl. DOPE)');
  ok(await p.$eval('#srLink', e => e.hidden), 'no link box without Stoic Ranger');
  // phone Back (remark #1): last page, then home, then "press again" before closing
  await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(50);
  for (const h of ['shoot', 'nav', 'cards']) { await p.evaluate(h => { location.hash = '#' + h; }, h); await p.waitForTimeout(50); }
  const step = async () => { const r = await p.evaluate(() => FK.back()); await p.waitForTimeout(50); return [r, await p.evaluate(() => location.hash)]; };
  ok(JSON.stringify(await step()) === '[true,"#nav"]', 'Back: Field cards → Navigate (last page)');
  ok(JSON.stringify(await step()) === '[true,"#shoot"]', 'Back: Navigate → Shooting helpers');
  ok(JSON.stringify(await step()) === '[true,"#home"]', 'Back: Shooting helpers → home');
  const r1 = await step(); ok(r1[0] === true && !(await p.$eval('#toast', e => e.hidden)), 'Back on home: "Press back again to close", app stays open');
  ok((await step())[0] === false, 'second Back on home within 2 s closes the app');
  await p.evaluate(() => { location.hash = '#cards'; }); await p.waitForTimeout(50);
  await p.click('#cardGrid .fcard'); await p.waitForTimeout(50);
  ok(await p.evaluate(() => FK.back()) === true && await p.evaluate(() => location.hash) === '#cards' && !(await p.$eval('#preview', e => e.classList.contains('open'))), 'Back closes the card viewer first');
  await p.click('#aboutBtn'); ok(await p.evaluate(() => FK.back()) === true && await p.$eval('#about', e => e.hidden), 'Back closes About first');
  // solver vs Stoic Ranger dope (ballistics.js directly)
  const r = await p.evaluate(() => { const a = RB.air({ temp: 15, alt: 0 }); const d = RB.dope({ v0: 820, bc: 0.326, model: 'G7', sightMm: 52, zeroM: 100, air: a, maxM: 1000, stepM: 100, windMs: 0, massG: 9.07 }); return d.rows.find(x => x.x === 100); });
  ok(Math.abs(r.elevMrad) < 0.05, 'solver: zero at 100 m');
  const t = await p.evaluate(() => window.__solve({ model: 'G7', bc: 0.326, mv: 820, sh: 5.2, zero: 100, wind: 3.6, clock: 3, alt: 0, temp: 15, max: 600, step: 100, mass: 9.07 }).find(x => Math.round(x.R) === 600));
  ok(t && t.drift * 10 / t.R > 0.2 && t.drift * 10 / t.R < 0.35, 'solver: 1 m/s wind at 600 m ≈ 0.27 mrad (got ' + (t && (t.drift * 10 / t.R).toFixed(3)) + ')');
  // MGRS
  await p.evaluate(() => { location.hash = '#nav'; }); await p.fill('#posIn', '51.4779, -0.0015'); await p.press('#posIn', 'Enter'); await p.waitForTimeout(150);
  const g = (await p.$eval('#gridref', e => e.textContent)).replace(/\s+/g, ' ');
  ok(/30U YC 08213 07235/.test(g), 'MGRS 51.4779,-0.0015 → 30U YC 08213 07235');
  // units round-trip
  await p.evaluate(() => { location.hash = '#shoot'; });
  const before = await p.$eval('#bZero', e => e.value);
  await p.click('#aboutBtn'); await p.click('[data-u="imp"]'); const yd = await p.$eval('#bZero', e => e.value); await p.click('[data-u="metric"]');
  ok(yd === '109' && await p.$eval('#bZero', e => e.value) === before, 'units: 100 m → 109 yd → 100 m');
  await p.click('#aboutClose');
  // printables call the bridge
  await p.evaluate(() => { location.hash = '#print'; }); await p.click('[data-print="range-card-A5.pdf"]'); await p.click('[data-share="datasheet-blank.pdf"]');
  ok(JSON.stringify(await p.evaluate(() => __bridge.assets)) === JSON.stringify([['print', 'www/printables/range-card-A5.pdf'], ['share', 'www/printables/datasheet-blank.pdf']]), 'printables: print and share via the app');
  await p.click('#wsOpen'); await p.click('#wsPrint');
  ok((await p.evaluate(() => __bridge.printed)).length === 1, 'wind cheat sheet prints');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}
// 2. link with Stoic Ranger: consent first, then values
{
  const p = await page({ db: '', installed: true, srJson: SR }, '#shoot');
  ok(!(await p.$eval('#srLink', e => e.hidden)), 'link box shown when Stoic Ranger is installed');
  const mv0 = await p.$eval('#bMV', e => e.value);
  await p.click('#lkAsk'); ok(await p.$eval('#bMV', e => e.value) === mv0, 'nothing read before Allow');
  await p.click('#lkYes'); await p.waitForTimeout(50);
  ok(await p.$eval('#bMV', e => e.value) === '820' && await p.$eval('#bModel', e => e.value) === 'G7' && await p.$eval('#bBC', e => e.value) === '0.326', 'Allow fills V0 820 (measured), G7 0.326');
  await p.evaluate(() => { location.hash = '#print'; });
  ok(await p.$$eval('#wsSrc option', o => o.map(x => x.textContent).includes('Test rifle · Test 140')), 'wind cheat sheet offers the linked gun and load');
  await p.evaluate(() => { location.hash = '#shoot'; }); await p.click('#lkOff');
  ok(await p.$eval('#srLink', e => e.textContent.includes('Stoic Ranger is on this phone')), 'Unlink');
  await p.click('#lkDis'); ok(await p.$eval('#srLink', e => e.hidden), 'Dismiss hides the box');
  await p.click('#aboutBtn'); await p.check('#setLink'); ok(!(await p.$eval('#srLink', e => e.hidden)), 'Settings brings it back');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}
{
  const p = await page({ db: JSON.stringify({ app: 'sr-field-kit', format: 1, data: { link: { linked: true } } }), installed: true, srJson: '{"error":"no-provider"}' }, '#shoot');
  ok(await p.$eval('#srLink', e => e.textContent.includes("can't share its data yet")), 'older Stoic Ranger: clear message');
  await p.context().close();
}
// 3. data safety
{
  const p = await page({ db: '', installed: false, srJson: '' });
  await p.evaluate(() => { location.hash = '#nav'; }); await p.fill('#posIn', '51.4779, -0.0015'); await p.press('#posIn', 'Enter');
  await p.fill('#ptName', 'Car'); await p.click('#ptSave'); await p.evaluate(() => FK.pause());
  const db = JSON.parse(await p.evaluate(() => __bridge.db));
  ok(db.app === 'sr-field-kit' && db.format === 1 && db.data['sr-points'][0].name === 'Car', 'saved point written to db.json');
  await p.click('#aboutBtn'); await p.click('#wipeBtn'); await p.click('#wipeYes');
  ok((await p.evaluate(() => __bridge.backups)).some(n => n.startsWith('before-delete-')), 'delete keeps a backup first');
  await p.context().close();
}
{
  const newer = JSON.stringify({ app: 'sr-field-kit', format: 99, data: { 'sr-points': [{ name: 'X', lat: 1, lon: 2 }], future: 1 } });
  const p = await page({ db: newer, installed: false, srJson: '' }, '#nav');
  await p.fill('#ptName', 'Y'); await p.fill('#posIn', '51.4779, -0.0015'); await p.press('#posIn', 'Enter'); await p.click('#ptSave'); await p.evaluate(() => FK.pause());
  ok(await p.evaluate(() => __bridge.saved) === 0 && await p.evaluate(() => __bridge.db) === newer, 'newer data file: read-only, never written');
  ok(!(await p.$eval('#roBanner', e => e.hidden)), 'newer data file: notice shown');
  await p.context().close();
}
{
  const good = JSON.stringify({ app: 'sr-field-kit', format: 1, data: { 'sr-points': [{ name: 'Old', lat: 1, lon: 2 }] } });
  const p = await page(null); await p.context().close();
  const q = await (async () => { const ctx = await browser.newContext(); const pg = await ctx.newPage(); await pg.addInitScript(BRIDGE, { db: '{broken', installed: false, srJson: '' }); await pg.addInitScript(g => { window.__bridge.bak = g; }, good); await pg.goto(URL0); await pg.waitForTimeout(200); return pg; })();
  ok(await q.evaluate(() => FKStore.get('sr-points', [])[0].name) === 'Old' && (await q.evaluate(() => __bridge.backups)).some(n => n.startsWith('damaged-')), 'damaged file: backed up, previous copy loaded');
  await q.context().close();
}
// 4. 0.3.0: converter, routes with tick-off, GPX, Nextcloud routes and maps, bearings fix, sensors, level, night & signal
{
  const p = await page({ db: '', installed: false, srJson: '' }, '#nav');
  await p.click('[data-ntab="conv"]');
  await p.fill('#cvIn', '47.2692, 11.4041'); await p.waitForTimeout(50);
  const conv = await p.$eval('#cvOut', e => e.textContent);
  ok(/32T PT 8\d{4} 3\d{4}/.test(conv) && /47° 16/.test(conv), 'converter: lat/lon → MGRS, UTM, DMS (' + conv.match(/32T PT \S+ \S+/) + ')');
  await p.fill('#cvIn', await p.evaluate(() => FKCoord.toMgrs(47.2692, 11.4041))); await p.waitForTimeout(50);
  ok(/Read as 47\.269\d+, 11\.404\d+/.test(await p.$eval('#cvMsg', e => e.textContent)), 'converter: MGRS back to lat/lon');
  await p.fill('#cvName', 'Hut'); await p.click('#cvSave');
  ok(await p.evaluate(() => FKStore.get('sr-points', []).some(x => x.name === 'Hut')), 'converter: save as point');
  await p.fill('#cvIn', 'nonsense'); await p.waitForTimeout(50);
  ok((await p.$eval('#cvMsg', e => e.textContent)).startsWith('Not recognised'), 'converter: clear message for unreadable text');
  // routes
  await p.click('[data-ntab="map"]'); await p.waitForTimeout(300);
  await p.click('#rtNew');
  for (const c of ['47.2600, 11.3900', '47.2700, 11.4000', '47.2800, 11.4200']) { await p.fill('#rtCo', c); await p.click('#rtCoAdd'); }
  ok(await p.$$eval('.wprow', e => e.length) === 3, 'route: three waypoints added by coordinates');
  ok((await p.$eval('#rtNav', e => e.textContent)).includes('waypoint 1 of 3'), 'route: next is waypoint 1 before any tick');
  await p.click('#rtTick'); await p.click('#rtTick');
  const exp = await p.evaluate(() => { const a = { lat: 47.27, lon: 11.40 }, b = { lat: 47.28, lon: 11.42 }; const R = Math.PI / 180, y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R), x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R); return ((Math.atan2(y, x) / R) + 360) % 360; });
  const nv = await p.$eval('#rtNav', e => e.textContent);
  ok(nv.includes('waypoint 3 of 3') && nv.includes('From 2') && nv.includes(String(Math.round(exp)).padStart(3, '0') + '°'), 'route: after 2 ticks, bearing from waypoint 2 to 3 = ' + Math.round(exp) + '° (decl 0)');
  await p.fill('#mDecl', '4.5');
  ok(await p.$eval('#decl', e => e.value) === '4.5', 'map: declination field is the same as in Position & grid');
  ok((await p.$eval('#rtNav', e => e.textContent)).includes(String(Math.round(exp - 4.5)).padStart(3, '0') + '°'), 'route: magnetic bearing uses the declination');
  await p.click('#rtUndo'); await p.evaluate(() => FK.pause());
  const dbr = JSON.parse(await p.evaluate(() => __bridge.db)).data;
  ok(dbr['sr-routes'][0].ticked === 1 && dbr['sr-routes'][0].wps.length === 3, 'route: undo, and ticks are kept in db.json');
  await p.click('#rtExport'); await p.waitForTimeout(30);
  const f = (await p.evaluate(() => __bridge.files))[0];
  ok(f && /\.gpx$/.test(f.name) && (f.text.match(/<rtept/g) || []).length === 3, 'route: export as GPX file (3 points)');
  await p.click('#rtNcUp'); await p.waitForTimeout(60);
  ok((await p.evaluate(() => __bridge.calls)).some(c => /^PUT \/StoicRanger_Maps\/Routes\/Route 1\.gpx$/.test(c)), 'route: saved to /StoicRanger_Maps/Routes/ on Nextcloud');
  await p.evaluate(() => { __bridge.nc['PROPFIND /StoicRanger_Maps/Routes/'] = [207, '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/files/u/StoicRanger_Maps/Routes/</d:href></d:response><d:response><d:href>/remote.php/dav/files/u/StoicRanger_Maps/Routes/Ridge%20walk.gpx</d:href></d:response></d:multistatus>'];
    __bridge.nc['GET /StoicRanger_Maps/Routes/Ridge walk.gpx'] = [200, FKGpx.toGpx({ name: 'Ridge walk', wps: [{ lat: 47.3, lon: 11.5, name: 'A' }, { lat: 47.31, lon: 11.52, name: 'B' }] })]; });
  await p.click('#rtNc'); await p.waitForTimeout(60);
  await p.click('[data-ncget="Ridge walk.gpx"]'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FKStore.get('sr-routes', []).some(r => r.name === 'Ridge walk' && r.wps.length === 2 && r.file === 'Ridge walk.gpx')), 'route: loaded from Nextcloud Routes folder');
  await p.evaluate(() => { __bridge.pick = { ok: true, msg: JSON.stringify({ name: 'Track.gpx', text: '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>T</name><trkseg>' + Array.from({ length: 120 }, (_, i) => `<trkpt lat="${47 + i / 1000}" lon="11"/>`).join('') + '</trkseg></trk></gpx>' }) }; });
  await p.click('#rtImport'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FKStore.get('sr-routes', []).some(r => r.name === 'T' && r.wps.length === 50)), 'route: GPX track import thinned to 50 points');
  // maps from Nextcloud
  await p.click('[data-mtab="maps"]');
  await p.evaluate(() => { __bridge.nc['GET /StoicRanger_Maps/maps.json'] = [200, JSON.stringify({ format: 'FK-1', version: 1, maps: [{ id: 'at-tirol', name: 'Austria · Tyrol', date: '2026-11-07', bbox: [10, 46.6, 12.97, 47.75], base: { file: 'at-tirol.pmtiles', bytes: 400e6, sha256: 'ab' }, terrain: { file: 'at-tirol-terrain.pmtiles', bytes: 300e6, sha256: 'cd' } }] })]; });
  await p.click('#mCheck'); await p.waitForTimeout(60);
  ok((await p.$eval('#mList', e => e.textContent)).includes('Austria · Tyrol') && await p.$('[data-mget="at-tirol"]'), 'maps: Nextcloud catalog listed with Download');
  await p.evaluate(() => { __bridge.wifi = false; }); await p.click('[data-mget="at-tirol"]'); await p.waitForTimeout(30);
  ok((await p.$eval('#mMsg', e => e.textContent)).includes('Not on Wi-Fi') && !(await p.evaluate(() => __bridge.calls)).some(c => c.startsWith('DL')), 'maps: Wi-Fi only blocks the download on mobile data');
  await p.evaluate(() => { __bridge.wifi = true; }); await p.click('[data-mget="at-tirol"]'); await p.waitForTimeout(200);
  const m = await p.evaluate(() => FKStore.get('sr-maps', []).find(x => x.id === 'at-tirol'));
  ok(m && m.date === '2026-11-07' && m.base.file === 'at-tirol.pmtiles' && m.terrain.file === 'at-tirol-terrain.pmtiles' && (await p.evaluate(() => __bridge.calls)).filter(c => c.startsWith('DL /StoicRanger_Maps/at-tirol')).length === 2, 'maps: map and terrain downloaded, phone catalog updated');
  ok((await p.$eval('#mList', e => e.textContent)).includes('On phone'), 'maps: shown as on the phone');
  await p.evaluate(() => { const c = FKStore.get('sr-maps-nc'); c.catalog.maps[0].date = '2026-12-01'; FKStore.set('sr-maps-nc', c); __nav3.renderMaps(); });
  ok((await p.$eval('#mList', e => e.textContent)).includes('Update'), 'maps: newer build on Nextcloud shows Update');
  await p.click('[data-mdel="at-tirol"]'); await p.click('[data-mdel="at-tirol"]'); await p.waitForTimeout(30);
  ok(await p.evaluate(() => __bridge.maps.length === 0 && !FKStore.get('sr-maps', []).length), 'maps: delete (asks twice) removes files and entry');
  // position from two bearings
  const fx = await p.evaluate(() => { const P = { lat: 47.25, lon: 11.40 }, L1 = { lat: 47.30, lon: 11.38 }, L2 = { lat: 47.27, lon: 11.48 };
    const R = Math.PI / 180, brg = (a, b) => { const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R), x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R); return (Math.atan2(y, x) / R + 360) % 360; };
    const r = __nav3.resect(L1, brg(P, L1), L2, brg(P, L2)); return Math.hypot((r.lat - P.lat) * 111320, (r.lon - P.lon) * 111320 * Math.cos(P.lat * R)); });
  ok(fx < 15, 'bearings fix: two bearings give the position back (' + fx.toFixed(1) + ' m off)');
  await p.click('[data-mtab="fix"]');
  await p.evaluate(() => { __nav.addPoint('Summit', 47.30, 11.38); __nav.addPoint('Mast', 47.27, 11.48); });
  await p.selectOption('[data-fxpt="0"]', { label: 'Summit' }); await p.selectOption('[data-fxpt="1"]', { label: 'Mast' });
  await p.fill('#mDecl', '0'); await p.selectOption('#fxUnit', 'degT');
  await p.fill('#fxB0', '345'); await p.fill('#fxB1', '60'); await p.waitForTimeout(50);
  ok((await p.$eval('#fxOut', e => e.textContent)).includes('Angle of cut') && !(await p.$eval('#fxUse', e => e.disabled)), 'bearings fix: landmarks from saved points, result and angle of cut shown');
  await p.click('#fxUse'); ok(await p.evaluate(() => FKStore.get('sr-pos').src === 'bearings'), 'bearings fix: used as my position');
  const real4 = p.errors.filter(e => !/Failed to load resource/.test(e));   // the fake map files are not there to read
  ok(real4.length === 0, 'no console errors ' + real4.join(' | '));
  await p.context().close();
}
{
  const p = await page({ db: '', installed: false, srJson: '' }, '#shoot');
  await p.click('#bSens'); await p.waitForTimeout(80);
  ok(Math.abs(+(await p.$eval('#bAlt', e => e.value)) - 540) < 6 && (await p.$eval('#bSensMsg', e => e.textContent)).includes('no air temperature sensor'), 'use sensors: 950 hPa → about 540 m pressure altitude; no temperature sensor said plainly');
  await p.evaluate(() => FK.pause());
  ok(Math.abs(JSON.parse(await p.evaluate(() => __bridge.db)).data['sr-ball'].bAlt - 540) < 6, 'use sensors: value saved like a typed one');
  await p.click('[data-tab="level"]');
  await p.evaluate(() => { for (let i = 0; i < 40; i++) __level.onMotion({ accelerationIncludingGravity: { x: 9.81 * Math.sin(Math.PI / 180), y: 0, z: 9.81 * Math.cos(Math.PI / 180) } }); });
  ok((await p.$eval('#lvBig', e => e.textContent)) === '1.0°' && (await p.$eval('#lvMode', e => e.textContent)).startsWith('Flat'), 'level: flat phone tilted 1° reads 1.0°');
  await p.evaluate(() => { for (let i = 0; i < 60; i++) __level.onMotion({ accelerationIncludingGravity: { x: -9.81 * Math.sin(2 * Math.PI / 180), y: 9.81 * Math.cos(2 * Math.PI / 180), z: 0 } }); });
  ok((await p.$eval('#lvBig', e => e.textContent)) === '2.0°' && (await p.$eval('#lvMode', e => e.textContent)).includes('right'), 'level: upright, 2° cant');
  await p.click('#lvZero'); ok((await p.$eval('#lvBig', e => e.textContent)) === '0.0°', 'level: set zero');
  // night & signal
  await p.evaluate(() => { location.hash = '#night'; }); await p.waitForTimeout(50);
  ok(await p.$eval('#hTitle', e => e.textContent) === 'Night & signal', 'route #night');
  const s = await p.evaluate(() => __night.seq('SOS').map(x => (x[0] ? '1' : '0') + x[1]).join(' '));
  ok(s === '11 01 11 01 11 03 13 01 13 01 13 03 11 01 11 01 11', 'Morse: SOS timing (dot 1, dash 3, gaps 1/3)');
  await p.click('#ngSos'); await p.waitForTimeout(500); await p.click('#ngStop');
  const tr = await p.evaluate(() => __bridge.torch);
  ok(tr.includes(true) && tr[tr.length - 1] === false, 'signal light: SOS uses the flashlight, Stop turns it off');
  await p.click('#ngRed'); ok(!(await p.$eval('#ngScr', e => e.hidden)) && (await p.evaluate(() => __bridge.bright)).length > 0, 'red screen opens and dims the screen');
  ok(await p.evaluate(() => FK.back()) === true && await p.$eval('#ngScr', e => e.hidden) && (await p.evaluate(() => __bridge.bright)).slice(-1)[0] === -1, 'Back closes the red screen, brightness back to the phone');
  await p.check('#ngMode'); ok(await p.evaluate(() => document.documentElement.hasAttribute('data-red')), 'red night mode for the whole app');
  await p.click('#aboutBtn'); ok(!(await p.$eval('#about', e => e.textContent)).includes('no internet permission'), 'About no longer says "no internet permission"');
  ok(p.errors.length === 0, 'no console errors ' + p.errors.join(' | '));
  await p.context().close();
}
if (MAPS) {
  const p = await page({ db: '', installed: false, srJson: '' }, '#nav');
  await p.evaluate(() => { __bridge.maps = [{ name: 'test.pmtiles', bytes: 37615 }, { name: 'test-terrain.pmtiles', bytes: 5654896 }]; FKStore.set('sr-map-view', { c: [11.40, 47.27], z: 12 }); });
  await p.click('[data-ntab="map"]');
  await p.waitForFunction(() => document.querySelector('#fkMap canvas'), null, { timeout: 20000 }); await p.waitForTimeout(3000);
  ok(await p.evaluate(() => FKMap.regions().length === 1 && FKMap.regions()[0].base && FKMap.regions()[0].dem), 'map: phone files found and loaded as one region (map + terrain)');
  ok(await p.$eval('#mapMsg', e => e.hidden), 'map: no "no map" message');
  await p.click('#rtNew'); await p.evaluate(() => document.querySelector('#mapBox').scrollIntoView()); await p.waitForTimeout(300); const bx = await p.locator('#fkMap').boundingBox();
  await p.mouse.click(bx.x + bx.width * 0.4, bx.y + bx.height * 0.5); await p.mouse.click(bx.x + bx.width * 0.6, bx.y + bx.height * 0.4); await p.waitForTimeout(200);
  ok(await p.$$eval('.wprow', e => e.length) === 2, 'map: tapping the map adds waypoints in edit mode');
  if (process.env.FK_SHOT) { await p.waitForTimeout(1500); await p.locator('#mapBox').screenshot({ path: process.env.FK_SHOT }); }
  const real = p.errors.filter(e => !/Failed to load resource/.test(e));
  ok(real.length === 0, 'map: no console errors ' + real.join(' | '));
  await p.context().close();
} else console.log('(map drawing test skipped: set FK_TEST_MAPS)');
await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
