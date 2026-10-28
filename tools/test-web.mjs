#!/usr/bin/env node
/* Checks the web build (dist/, run tools/build-web.mjs first) in a headless browser at iPhone size:
   1. every app starts without script errors and shows its first screen,
   2. data saved in an app survives a restart (IndexedDB), with the previous copy kept as db.bak.json,
   3. Gun Database data in the old schema-1 format migrates without losing entries, with a pre-migration backup,
   4. a damaged db.json falls back to the previous copy; data from a newer app version opens read-only and is
      never overwritten,
   5. the localStorage mirror is used when it is newer than IndexedDB (a write iOS cut short),
   6. linking: nothing is shared until switched on in both apps; then Training Log gets the Gun Database's
      shooters/guns and its rounds land in the Gun Database's rounds log; Shooting Drills gets the Training
      Log's shooters/guns and the trainings of a day,
   7. after one online start the apps open offline (service worker).
   Usage: node tools/test-web.mjs [--shots]   (--shots saves iPhone-size screenshots to dist-shots/) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = process.argv.includes('--shots') ? path.join(ROOT, 'dist-shots') : null;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST)) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

await new Promise(r => srv.listen(0, r));
const BASE = `http://localhost:${srv.address().port}`;
const browser = await chromium.launch();
const IPHONE = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };

// IndexedDB helpers that run in the page (same origin as the apps)
const idbPut = (p, obj) => p.evaluate(o => new Promise((res, rej) => {
  const r = indexedDB.open('stoic-ranger', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => { const t = r.result.transaction('files', 'readwrite'); for (const k in o) { if (o[k] == null) t.objectStore('files').delete(k); else t.objectStore('files').put(o[k], k); } t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
}), obj);
const idbAll = p => p.evaluate(() => new Promise(res => {
  const r = indexedDB.open('stoic-ranger', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => { const s = r.result.transaction('files').objectStore('files'), out = {}; const c = s.openCursor();
    c.onsuccess = () => { const x = c.result; if (x) { out[x.key] = x.value; x.continue(); } else { r.result.close(); res(out); } }; };
}));

async function fresh() {
  const ctx = await browser.newContext(IPHONE);
  const p = await ctx.newPage();
  await p.goto(BASE + '/favicon.png');
  return { ctx, p };
}
async function open(p, dir, hash = '') {
  const errs = [];
  const onErr = e => errs.push(e.message || String(e));
  const onCon = m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); };
  p.on('pageerror', onErr); p.on('console', onCon);
  await p.goto(`${BASE}/${dir}/index.html${hash}`);
  await p.waitForFunction(() => window.SR_WEB && document.querySelector('#view') && document.querySelector('#view').children.length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(900);   // link syncs run 400-500 ms after start
  p.off('pageerror', onErr); p.off('console', onCon);
  return errs;
}
const leave = async p => { await p.goto(BASE + '/favicon.png'); await p.waitForTimeout(300); };   // pagehide flushes, like closing the app

/* 1 + 2: start, save, restart */
for (const [dir, P, id] of [['database', 'RB', 'gundb'], ['training-log', 'TL', 'training-log'], ['shooting-drills', 'SD', 'shooting-drills']]) {
  const { ctx, p } = await fresh();
  const errs = await open(p, dir);
  ok(!errs.length, `${dir}: starts without errors ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
  ok(await p.evaluate(P => !!window[P + 'Native'] && window[P].native === true, P), `${dir}: web bridge in place`);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${dir}-start.png`) }); }
  await p.evaluate(P => { const T = window[P]; T.db.shooters.push({ id: 'S-901', uid: 'u-test-901', name: 'Web Test' }); T.save(true); }, P);
  await leave(p);
  const files = await idbAll(p);
  ok(files[id + '/db.json'] && files[id + '/db.json'].includes('u-test-901'), `${dir}: saved to IndexedDB`);
  ok(!!files[id + '/info.json'], `${dir}: version info published for linking`);
  await open(p, dir);
  ok(await p.evaluate(P => window[P].db.shooters.some(s => s.uid === 'u-test-901'), P), `${dir}: entry still there after restart`);
  await p.evaluate(P => { window[P].db.shooters.push({ id: 'S-902', uid: 'u-test-902', name: 'Second' }); window[P].save(true); }, P);
  await leave(p);
  const f2 = await idbAll(p);
  ok(f2[id + '/db.bak.json'] && f2[id + '/db.bak.json'].includes('u-test-901') && !f2[id + '/db.bak.json'].includes('u-test-902'), `${dir}: previous copy kept as db.bak.json`);
  if (SHOTS) for (const h of dir === 'database' ? ['#/more', '#/db/weapons'] : ['#/more']) { await open(p, dir, h); await p.screenshot({ path: path.join(SHOTS, `${dir}-${h.replace(/\W+/g, '-')}.png`) }); }
  await ctx.close();
}

/* 3: Gun Database schema-1 data (0.1.0 format) → schema 5 */
{
  const { ctx, p } = await fresh();
  const old = JSON.parse(fs.readFileSync(path.join(DIST, 'database/data/demo.json'), 'utf8'));
  old.schema = 1; delete old.history; delete old.targets; if (old.settings) { delete old.settings.dashFilter; delete old.settings.units; }
  old.weapons.forEach(w => delete w.type);
  const counts = o => Object.fromEntries(['weapons', 'barrels', 'munitions', 'roundsLog', 'sheets'].map(k => [k, (o[k] || []).length]));
  const before = counts(old);
  await idbPut(p, { 'gundb/db.json': JSON.stringify(old) });
  const errs = await open(p, 'database', '#/dash');
  ok(!errs.length, 'gundb schema 1: opens without errors ' + (errs.length ? JSON.stringify(errs.slice(0, 2)) : ''));
  await leave(p);
  const files = await idbAll(p), d = JSON.parse(files['gundb/db.json']);
  ok(d.schema === 5, 'gundb schema 1 → 5');
  ok(JSON.stringify(counts(d)) === JSON.stringify(before), 'gundb migration keeps every weapon, barrel, ammo, rounds-log entry and sheet');
  ok(Object.keys(files).some(k => /^gundb\/backups\/db-schema1-/.test(k)), 'gundb pre-migration backup saved');
  await ctx.close();
}

/* 4: damaged file, newer data */
{
  const { ctx, p } = await fresh();
  const good = JSON.stringify({ schema: 3, settings: { link: {} }, shooters: [{ id: 'S-001', uid: 'u1', name: 'A' }], weapons: [], trainers: [], trainings: [{ id: 'TR-0001', uid: 't1', date: '2026-01-01', shooterId: 'S-001', weapons: [] }] });
  await idbPut(p, { 'training-log/db.json': '{"trainings":[', 'training-log/db.bak.json': good });
  await open(p, 'training-log');
  ok(await p.evaluate(() => TL.recovered && TL.db.trainings.length === 1), 'damaged db.json falls back to the previous copy');
  await leave(p);
  ok(Object.keys(await idbAll(p)).some(k => k.startsWith('training-log/backups/db-damaged-')), 'damaged file kept as a backup');
  const newer = JSON.parse(good); newer.schema = 99;
  await idbPut(p, { 'training-log/db.json': JSON.stringify(newer) });
  await open(p, 'training-log');
  ok(await p.evaluate(() => TL.readOnly), 'newer data opens read-only');
  await p.evaluate(() => { TL.db.trainings.push({ id: 'X' }); TL.save(true); });
  await leave(p);
  ok(JSON.parse((await idbAll(p))['training-log/db.json']).trainings.length === 1, 'newer data never overwritten');
  await ctx.close();
}

/* 5: localStorage mirror newer than IndexedDB */
{
  const { ctx, p } = await fresh();
  const a = { schema: 1, updated: '2026-10-01T10:00:00.000Z', results: [], favs: [], shooters: [{ id: 'S-001', uid: 'a', name: 'Old' }], weapons: [] };
  const b = Object.assign({}, a, { updated: '2026-10-02T10:00:00.000Z', shooters: [{ id: 'S-001', uid: 'a', name: 'Old' }, { id: 'S-002', uid: 'b', name: 'New' }] });
  await idbPut(p, { 'shooting-drills/db.json': JSON.stringify(a) });
  await p.evaluate(t => localStorage.setItem('sr.shooting-drills.db', t), JSON.stringify(b));
  await open(p, 'shooting-drills');
  ok(await p.evaluate(() => SD.db.shooters.length === 2), 'newer localStorage copy wins over an older IndexedDB copy');
  await ctx.close();
}

/* 6: linking */
{
  const { ctx, p } = await fresh();
  await open(p, 'training-log');
  ok(await p.evaluate(() => TL.linkCall('status').error === 'not-installed'), 'link: Gun Database not opened yet → not installed');
  // Gun Database with one shooter and one gun, linking off
  await open(p, 'database');
  await p.evaluate(() => { RB.db.shooters.push({ id: 'S-050', name: 'Manuel Test' }); RB.db.weapons.push({ id: 'W-050', name: 'Tikka T3x TAC A1', caliber: '6.5 Creedmoor', type: 'Rifle' }); RB.save(true); });
  await leave(p);
  await open(p, 'training-log');
  ok(await p.evaluate(() => TL.linkCall('status').enabled === false && TL.linkCall('shared').error === 'disabled'), 'link: nothing shared while off in the Gun Database');
  await p.evaluate(() => { TL.db.settings.link = Object.assign(TL.db.settings.link || {}, { enabled: true }); TL.save(true); });
  await leave(p);
  await open(p, 'database');
  await p.evaluate(() => { RB.db.settings.link = Object.assign(RB.db.settings.link || {}, { enabled: true }); RB.save(true); });
  await leave(p);
  await open(p, 'training-log');
  const st = await p.evaluate(() => { const s = TL.linkSync(); return { s, sh: TL.db.shooters.map(x => x.name), w: TL.db.weapons.map(x => x.name) }; });
  ok(st.s && st.s.state === 'ok' && st.sh.includes('Manuel Test') && st.w.includes('Tikka T3x TAC A1'), 'link: Training Log pulls shooters and guns from the Gun Database ' + JSON.stringify(st.s));
  // a training with rounds → Gun Database rounds log
  await p.evaluate(() => {
    const sh = TL.db.shooters.find(x => x.name === 'Manuel Test'), w = TL.db.weapons.find(x => x.name === 'Tikka T3x TAC A1');
    TL.db.trainings.push({ id: 'TR-0050', uid: TL.uuid(), date: '2026-10-20', fire: 'live', shooterId: sh.id, desc: 'web link test', weapons: [{ uid: TL.uuid(), weaponId: w.id, rounds: 37 }] });
    TL.save(true); TL.linkSync();
  });
  await leave(p);
  await open(p, 'database');
  const rl = await p.evaluate(() => RB.db.roundsLog.filter(r => r.link && r.link.app === 'training-log').map(r => [r.weaponId, r.rounds]));
  ok(rl.length === 1 && rl[0][0] === 'W-050' && rl[0][1] === 37, 'link: Training Log rounds land in the Gun Database rounds log ' + JSON.stringify(rl));
  // Shooting Drills ↔ Training Log
  await open(p, 'shooting-drills');
  await p.evaluate(() => { SD.db.settings.link = Object.assign(SD.db.settings.link || {}, { enabled: true }); SD.save(true); });
  ok(await p.evaluate(() => SD.linkSync().state === 'off-there'), 'link: Shooting Drills waits until switched on in the Training Log');
  await leave(p);
  await open(p, 'training-log');
  await p.evaluate(() => { const L = TL.db.settings.link; L.apps = L.apps || {}; L.apps.shootingDrills = { enabled: true }; TL.save(true); });
  ok(await p.evaluate(() => TL.sdInstalled()), 'link: Training Log sees Shooting Drills');
  await leave(p);
  await open(p, 'shooting-drills');
  const sd = await p.evaluate(() => ({ s: SD.linkSync(), sh: SD.db.shooters.map(x => x.name), tr: SD.linkTrainings('2026-10-20') }));
  ok(sd.s.state === 'ok' && sd.sh.includes('Manuel Test'), 'link: Shooting Drills pulls shooters and guns from the Training Log');
  ok(sd.tr.length === 1 && sd.tr[0].desc === 'web link test' && sd.tr[0].weapons[0].rounds === 37, 'link: Shooting Drills sees the trainings of a day');
  await p.evaluate(() => SDNative.linkCall('putResults', JSON.stringify({ results: [{ uid: 'r1', trainingUid: 'x', date: '2026-10-20', drill: 'Test drill', result: '10/10' }] })));
  await leave(p);
  await open(p, 'training-log');
  ok(await p.evaluate(() => ((TL.db.linked || {}).drillResults || []).some(r => r.uid === 'r1')), 'link: drill results reach the Training Log inbox');
  await ctx.close();
}

/* 7: offline */
{
  const { ctx, p } = await fresh();
  for (const dir of ['database', 'training-log', 'shooting-drills']) {
    await open(p, dir);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForTimeout(500);
  }
  await ctx.setOffline(true);
  for (const dir of ['database', 'training-log', 'shooting-drills']) {
    let errs = ['did not load'];
    try { errs = await open(p, dir); } catch (e) { errs = [e.message]; }
    ok(!errs.length, `${dir}: opens offline after the first start ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
  }
  await ctx.close();
}

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exitCode = fails ? 1 : 0;
