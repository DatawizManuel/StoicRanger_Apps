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
  window.mm = { state: () => R({ cfg: { folder: 'C:\\Users\\info\\Nextcloud\\StoicRanger_Maps', checkUpdates: false, decl: 4.5, maxPart: 250, theme: 'system' }, folder: { folder: 'C:\\Users\\info\\Nextcloud\\StoicRanger_Maps', exists: true, synced: true, free: 2.1e11 }, catalog, regions, job: null, version: '0.2.0', tidied: ['Old Map'] }),
    saveSettings: p => R(p), pickFolder: () => R(null), openFolder: () => R(true), estimate: id => R({ id, bytes: 500e6, base: 400e6, terrain: 100e6 }), updates: () => R({ latest: null, outdated: [] }), remove: () => R(true),
    download: () => R(true), cancel: () => R(true), onProgress: () => {},
    mapRead: async (f, o, l) => { const b = atob(await window.mmRead(f, o, l)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; },
    routes: async () => ({ ok: true, v: await window.mmRoutes() }), saveRoute: async (n, g, o) => ({ ok: true, v: await window.mmSave(n, g, o) }), deleteRoute: () => R(true),
    exportRoute: () => R(null), importRoute: () => R(null) };
}, { catalog, regions });
await page.goto('file://' + path.join(www, 'index.html') + '#maps');
await page.waitForSelector('#mapRows tr');
ok((await page.textContent('#mapRows')).includes('Test Innsbruck'), 'Maps: the region is listed');
ok((await page.textContent('#catN')) === '1', 'catalog count shown');
ok((await page.textContent('#mapRows')).includes('Delete'), 'Maps: each map has a Delete button (#12)');
ok((await page.textContent('#toast')).includes('Old Map'), 'maps deleted by hand: message that they left maps.json');
await page.click('nav a[data-tab=add]');
await page.waitForSelector('.ctry');
const nC = new Set(regions.map(r => r.cc + '|' + r.country)).size;
ok(await page.locator('.ctry').count() === nC && nC > 200, 'Add a region: all ' + nC + ' countries in the left list (#15)');
await page.locator('.ctry', { hasText: /^Austria/ }).click();
ok((await page.textContent('#ctryHead')).includes('Austria') && await page.locator('#regionList .reg').count() === 10, 'Austria: whole country + 9 states in the middle list');
await page.locator('.reg', { hasText: 'Tyrol' }).first().locator('input').check();
await page.waitForTimeout(300);
const tot = await page.textContent('#selTotal');
ok(tot.includes('500 MB') && tot.includes('3 files of max. 250 MB'), 'selection total with file count, split invisible: ' + tot);
await page.fill('#q', 'scotland'); await page.waitForTimeout(100);
ok(await page.locator('.ctry').count() === 1 && (await page.textContent('.ctry')).includes('United Kingdom'), 'search "scotland" finds the United Kingdom');
ok((await page.textContent('#regionList')).includes('Scotland') && await page.locator('#regionList .reg').count() === 1, 'middle list shows Scotland');
await page.click('#showAll'); const ukT = await page.textContent('#regionList'); ok(['England', 'Scotland', 'Wales', 'Northern Ireland', 'Whole country'].every(t => ukT.includes(t)) && await page.locator('#regionList .reg').count() === 5, 'show all: UK whole + England, Scotland, Wales, Northern Ireland');
await page.fill('#q', 'tyrol'); await page.waitForTimeout(100);
const ct = await page.locator('.ctry').allTextContents();
ok(ct.length === 2 && ct.some(t => t.startsWith('Austria')) && ct.some(t => t.startsWith('Italy')), 'search "tyrol" finds Austria and Italy (South Tyrol): ' + ct.join(' | '));
await page.fill('#q', 'brazil'); await page.waitForTimeout(100); ok((await page.textContent('.ctry')).startsWith('Brazil'), 'search finds countries by name (Brazil)');
await page.fill('#q', '');
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
ok(await page.inputValue('#sMax') === '250' && await page.inputValue('#sTheme') === 'system', 'Settings: max. file size 250 MB and design (#13, #14)');
const bgL = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
const bgD = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(bgL === 'rgb(244, 241, 234)' && bgD === 'rgb(22, 21, 15)', 'dark design: ' + bgL + ' → ' + bgD);
if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-settings-dark.png') });
await page.click('nav a[data-tab=add]'); await page.locator('.ctry', { hasText: /^United Kingdom/ }).click(); await page.waitForTimeout(300);
if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-add-dark.png') });
await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(200);
if (shot) await page.screenshot({ path: shot.replace(/\.png$/, '-add-light.png') });
const real = errors.filter(e => !/no terrain here|Failed to load resource|AbortError/.test(e));
ok(real.length === 0, 'no script errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); fs.rmSync(routesDir, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
