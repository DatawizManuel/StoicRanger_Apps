/* Screen test of the Map Manager page in Chromium with a stand-in for the computer side (window.mm) and the small
   made-up test maps (tools/make-test-maps.mjs). Usage: node tools/test-ui.mjs <dir with test.pmtiles> [shot.png] */
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import os from 'os';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [mapsDir, shot] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname), www = path.join(here, '..', 'www');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const routesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmroutes-'));
const catalog = { format: 'FK-1', version: 1, maps: [{ id: 'test', name: 'Test Innsbruck', date: '2026-11-01', base: { file: 'test.pmtiles', bytes: 37615 }, terrain: { file: 'test-terrain.pmtiles', bytes: 2959459 } }] };
const regions = require('../lib/regions.js');

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.exposeFunction('mmRead', (file, o, l) => { const fd = fs.openSync(path.join(mapsDir, path.basename(file)), 'r'); const b = Buffer.alloc(l); const n = fs.readSync(fd, b, 0, l, o); fs.closeSync(fd); return b.subarray(0, n).toString('base64'); });
await page.exposeFunction('mmRoutes', () => fs.readdirSync(routesDir).map(f => ({ file: f, gpx: fs.readFileSync(path.join(routesDir, f), 'utf8'), mtime: 0 })));
await page.exposeFunction('mmSave', (name, gpx, old) => { const f = name.replace(/[\\/:*?"<>|]+/g, ' ') + '.gpx'; fs.writeFileSync(path.join(routesDir, f), gpx); if (old && old !== f) fs.rmSync(path.join(routesDir, old), { force: true }); return f; });
await page.addInitScript(({ catalog, regions }) => {
  const R = v => Promise.resolve({ ok: true, v });
  window.mm = { state: () => R({ cfg: { folder: 'C:\\Users\\info\\Nextcloud\\StoicRanger_Maps', checkUpdates: false, decl: 4.5 }, folder: { folder: 'C:\\Users\\info\\Nextcloud\\StoicRanger_Maps', exists: true, synced: true, free: 2.1e11 }, catalog, regions, job: null, version: '0.1.0' }),
    saveSettings: p => R(p), pickFolder: () => R(null), openFolder: () => R(true), estimate: id => R({ id, bytes: 123e6 }), updates: () => R({ latest: null, outdated: [] }), remove: () => R(true),
    download: () => R(true), cancel: () => R(true), onProgress: () => {},
    mapRead: async (f, o, l) => { const b = atob(await window.mmRead(f, o, l)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; },
    routes: async () => ({ ok: true, v: await window.mmRoutes() }), saveRoute: async (n, g, o) => ({ ok: true, v: await window.mmSave(n, g, o) }), deleteRoute: () => R(true),
    exportRoute: () => R(null), importRoute: () => R(null) };
}, { catalog, regions });
await page.goto('file://' + path.join(www, 'index.html') + '#maps');
await page.waitForSelector('#mapRows tr');
ok((await page.textContent('#mapRows')).includes('Test Innsbruck'), 'Maps: the region is listed');
ok((await page.textContent('#catN')) === '1', 'catalog count shown');
await page.click('nav a[data-tab=add]');
await page.waitForSelector('.reg');
ok(await page.locator('.reg').count() === regions.length, 'Add a region: all ' + regions.length + ' regions listed');
await page.locator('.reg', { hasText: 'Austria · Tyrol' }).locator('input').check();
await page.waitForTimeout(300);
ok((await page.textContent('#selTotal')).includes('123 MB'), 'selection total from the size estimate');
await page.fill('#q', 'tirol'); ok(await page.locator('.reg').count() === 0, 'search filters (no "tirol", English names)');
await page.fill('#q', 'tyrol'); ok(await page.locator('.reg').count() === 2, 'search finds Tyrol and South Tyrol');
await page.click('nav a[data-tab=routes]');
await page.waitForFunction(() => document.querySelector('#map canvas'), null, { timeout: 15000 });
await page.waitForTimeout(3000);
const box = await page.locator('#map').boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
for (let i = 0; i < 8; i++){ await page.mouse.wheel(0, -400); await page.waitForTimeout(250); }
await page.waitForTimeout(2500);
await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5); await page.waitForTimeout(300);
await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.35); await page.waitForTimeout(300);
ok(await page.locator('.wp').count() === 2, 'Routes: two clicks add two waypoints');
ok(/\d+(\.\d)? (km|m) · \d{3}° · \d+ mil magnetic/.test(await page.textContent('.leg')), 'leg shows distance, bearing (magnetic) and mils: ' + await page.textContent('.leg'));
await page.fill('#cIn', '47.30, 11.45'); await page.click('#addCoord button');
ok(await page.locator('.wp').count() === 3, 'waypoint added by coordinates');
await page.fill('#cIn', 'nonsense'); await page.click('#addCoord button');
ok((await page.textContent('#cErr')).includes('Not recognised'), 'wrong coordinate gives a clear message');
await page.fill('#rName', 'Test walk'); await page.click('#saveRoute'); await page.waitForTimeout(300);
const saved = fs.readdirSync(routesDir);
ok(saved.length === 1 && saved[0] === 'Test walk.gpx', 'route saved as Routes/Test walk.gpx');
const gpx = fs.readFileSync(path.join(routesDir, saved[0]), 'utf8');
ok((gpx.match(/<rtept/g) || []).length === 3 && gpx.includes('<name>Test walk</name>'), 'GPX has the 3 waypoints and the name');
ok((await page.textContent('#routeList')).includes('Test walk'), 'route appears in the list');
await page.waitForTimeout(2500);
const rendered = await page.evaluate(() => { const c = document.querySelector('#map canvas'); return c && c.width > 0; });
ok(rendered, 'map canvas drawn');
if (shot) await page.screenshot({ path: shot });
await page.click('nav a[data-tab=settings]'); await page.waitForTimeout(300);
ok(await page.inputValue('#sDecl') === '4.5', 'Settings show the declination');
const real = errors.filter(e => !/no terrain here|Failed to load resource|AbortError/.test(e));
ok(real.length === 0, 'no script errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(routesDir, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
