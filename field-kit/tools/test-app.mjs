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
const srv = createServer(async (q, r) => { try { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const b = await readFile(join(WWW, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(b); } catch (e) { r.writeHead(404); r.end(); } });
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
    srCall: () => srJson, print: (h, j) => state.printed.push(j), printAsset: (p, j) => state.assets.push(['print', p]), shareAsset: (p) => state.assets.push(['share', p]), saveFile: () => {},
  };
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
await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
