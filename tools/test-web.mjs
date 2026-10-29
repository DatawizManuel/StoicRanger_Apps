#!/usr/bin/env node
/* Checks the Stoic Ranger web build (dist/, run tools/build-web.mjs first) in a headless browser at iPhone size:
   0. the one-time password: the app is locked until it is entered, a wrong one is refused (right one with SR_PASSWORD=…),
   1. home and every part start without script errors and share one database in IndexedDB,
   2. an entry saved in one part is there after a restart and in the other parts; the previous copy is kept,
   3. a damaged db.json falls back to the previous copy; data from a newer version opens read-only, never overwritten,
   4. the localStorage mirror is used when it is newer than IndexedDB (a write iOS cut short),
   5. after one online start every page opens offline (service worker),
   6. Daily Thoughts is its own app again (1.1.0): no Daily Thoughts page or quote on the home page, thoughts.json and
      1.0.0 favourites stay on the device untouched, and the favourites can be saved as an SR_Daily Thoughts backup,
   7. database.xlsx (1.1.0): saved by hand, changed "in Excel", opened again: the change comes in, nothing is lost.
   The Android path (conversion of SR_Database data, imports, cross-part links) is checked by stoic-ranger/tools/test-one-app.mjs.
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
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.jpg': 'image/jpeg' };
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
const PAGES = [['', 'SR', 'home'], ['gun/', 'RB', 'gundb'], ['training/', 'TL', 'tl'], ['drills/', 'SD', 'sd']];

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

const LOCK_HASH = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/"lock":\{[^}]*"hash":"([0-9a-f]+)"/) || [])[1];
async function fresh(unlock = true) {
  const ctx = await browser.newContext(IPHONE);
  const p = await ctx.newPage();
  await p.goto(BASE + '/icon-32.png');
  if (unlock) await p.evaluate(h => localStorage.setItem('sr.unlock', h), LOCK_HASH);   // as after the one-time password
  return { ctx, p };
}
async function open(p, dir, hash = '') {
  const errs = [];
  const onErr = e => errs.push(e.message || String(e));
  const onCon = m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); };
  p.on('pageerror', onErr); p.on('console', onCon);
  await p.goto(`${BASE}/${dir}index.html${hash}`);
  await p.waitForFunction(() => window.SR && document.querySelector('#view') && document.querySelector('#view').children.length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(700);
  p.off('pageerror', onErr); p.off('console', onCon);
  return errs;
}
const leave = async p => { await p.goto(BASE + '/icon-32.png'); await p.waitForTimeout(300); };   // pagehide flushes, like closing the app
const dbOf = async p => JSON.parse((await idbAll(p))['sr/db.json'] || 'null');

/* 0: one-time password */
{
  ok(!!LOCK_HASH, 'password hash is in the build');
  const { ctx, p } = await fresh(false);
  await p.goto(`${BASE}/index.html`);
  await p.waitForSelector('#srLock input[type=password]');
  ok(await p.evaluate(() => !window.SR), 'locked: the app does not start before the password');
  ok(await p.evaluate(() => document.querySelector('#srLock img').naturalWidth > 0), 'lock screen shows the icon');
  await p.fill('#srLock input', 'wrong password'); await p.click('#srLock button');
  await p.waitForFunction(() => /Wrong password/.test(document.querySelector('#srLock [data-msg]').textContent));
  ok(await p.evaluate(() => !window.SR && !localStorage.getItem('sr.unlock')), 'wrong password is refused');
  if (process.env.SR_PASSWORD) {
    await p.fill('#srLock input', process.env.SR_PASSWORD); await p.click('#srLock button');
    await p.waitForFunction(() => window.SR && !document.querySelector('#srLock'), null, { timeout: 15000 });
    ok(true, 'right password unlocks');
    await p.goto(`${BASE}/training/index.html`); await p.waitForFunction(() => window.TL, null, { timeout: 15000 });
    ok(await p.evaluate(() => !document.querySelector('#srLock')), 'asked only once per device (every part)');
  } else console.log('SKIP right password (set SR_PASSWORD to test it)');
  await ctx.close();
}

/* 1 + 2: start, one database, restart */
{
  const { ctx, p } = await fresh();
  for (const [dir, G] of PAGES) {
    const errs = await open(p, dir);
    ok(!errs.length && await p.evaluate(G => !!window[G], G), `${dir || 'home'}: starts without errors ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `${(dir || 'home').replace('/', '')}.png`) }); }
  }
  await open(p, 'training/');
  await p.evaluate(() => { TL.db.shooters.push({ id: 'S-901', uid: 'u-test-901', name: 'Web Test' }); TL.save(true); });
  await leave(p);
  let d = await dbOf(p);
  ok(d && d.app === 'stoic-ranger' && d.shooters.some(s => s.uid === 'u-test-901'), 'saved to the one database in IndexedDB');
  await open(p, 'drills/');
  ok(await p.evaluate(() => SD.db.shooters.some(s => s.uid === 'u-test-901')), 'a shooter added in the Training Log is in Shooting Drills');
  await open(p, 'gun/');
  ok(await p.evaluate(() => RB.db.shooters.some(s => s.uid === 'u-test-901')), 'and in the Gun Database');
  await leave(p);
  d = await dbOf(p);
  const all = await idbAll(p);
  const bak = JSON.parse(all['sr/db.bak.json'] || '{}');
  ok(bak.app === 'stoic-ranger' && bak.shooters.some(s => s.uid === 'u-test-901') && bak.updated <= d.updated, 'previous copy kept as db.bak.json');
  await open(p, '');
  ok(await p.evaluate(() => !document.querySelector('.srwis') && /Training Log/.test(document.body.innerText) && !/Daily Thoughts/.test(document.querySelector('#view').innerText.split('Data')[0])), 'home shows the three parts and no quote');
  await ctx.close();
}
function arr(a) { return Array.isArray(a) ? a : []; }

/* 3: damaged file, newer data */
{
  const { ctx, p } = await fresh();
  const good = JSON.stringify({ app: 'stoic-ranger', format: 1, schemas: { tl: 3 }, settings: { common: {} }, history: [],
    shooters: [{ id: 'S-001', uid: 'u1', name: 'A' }], weapons: [], trainers: [], trainings: [{ id: 'TR-0001', uid: 't1', date: '2026-01-01', fire: 'live', shooterId: 'S-001', weapons: [] }] });
  await idbPut(p, { 'sr/db.json': '{"trainings":[', 'sr/db.bak.json': good });
  await open(p, 'training/');
  ok(await p.evaluate(() => TL.db.trainings.length === 1), 'damaged db.json falls back to the previous copy');
  await leave(p);
  ok(Object.keys(await idbAll(p)).some(k => k.startsWith('sr/backups/db-damaged-')), 'damaged file kept as a backup');
  const newer = JSON.parse(good); newer.format = 99;
  await idbPut(p, { 'sr/db.json': JSON.stringify(newer) });
  await open(p, 'training/');
  ok(await p.evaluate(() => TL.readOnly || SR.readOnly), 'newer data opens read-only');
  await p.evaluate(() => { TL.db.trainings.push({ id: 'X' }); TL.save(true); });
  await leave(p);
  ok((await dbOf(p)).trainings.length === 1, 'newer data never overwritten');
  await ctx.close();
}

/* 4: localStorage mirror newer than IndexedDB */
{
  const { ctx, p } = await fresh();
  const a = { app: 'stoic-ranger', format: 1, updated: '2026-10-01T10:00:00.000Z', schemas: { sd: 1 }, settings: { common: {} }, history: [], results: [], favs: [], shooters: [{ id: 'S-001', uid: 'a', name: 'Old' }], weapons: [] };
  const b = Object.assign({}, a, { updated: '2026-10-02T10:00:00.000Z', shooters: [{ id: 'S-001', uid: 'a', name: 'Old' }, { id: 'S-002', uid: 'b', name: 'New' }] });
  await idbPut(p, { 'sr/db.json': JSON.stringify(a) });
  await p.evaluate(t => localStorage.setItem('sr.db', t), JSON.stringify(b));
  await open(p, 'drills/');
  ok(await p.evaluate(() => SD.db.shooters.length === 2), 'newer localStorage copy wins over an older IndexedDB copy');
  await ctx.close();
}

/* 6: Daily Thoughts is its own app again (1.1.0) */
{
  const { ctx, p } = await fresh();
  const v100 = { app: 'stoic-ranger', format: 1, updated: '2026-10-28T10:00:00.000Z', schemas: { dt: 1, tl: 3 }, settings: { common: { theme: 'auto' }, dt: { theme: 'auto', seen: 3 } },
    history: [{ at: '2026-10-28T09:00:00.000Z', part: 'dt', note: 'x' }], shooters: [{ id: 'S-001', uid: 'u1', name: 'A' }], weapons: [], trainers: [], trainings: [],
    thoughtFavs: [{ id: 'q-seneca-01', at: '2026-10-27T08:00:00Z' }, { id: 'q-epictetus-02', at: '' }] };
  await idbPut(p, { 'sr/db.json': JSON.stringify(v100) });
  await open(p, '', '#/data');
  ok(await p.evaluate(() => !document.querySelector('.srwis') && !!document.querySelector('#dThoughts') && SR.hasThoughtFavs()), 'no quote on the home page; Data offers the favourites for the Daily Thoughts app');
  const saved = await p.evaluate(() => new Promise(res => {
    const N = window.SRNative, keep = N.saveFile;
    N.saveFile = (name, mime, b64, cb) => { N.saveFile = keep; res({ name, text: decodeURIComponent(escape(atob(b64))) }); };
    SR.saveThoughtsFile();
  }));
  const j = JSON.parse(saved.text);
  ok(/^daily-thoughts-favourites_\d{4}-\d\d-\d\d\.json$/.test(saved.name) && j.app === 'sr-daily-thoughts' && j.favs.map(f => f.id).join() === 'q-seneca-01,q-epictetus-02',
    'favourites saved as an SR_Daily Thoughts backup');
  await leave(p);
  const all = await idbAll(p);
  ok(JSON.parse(all['sr/db.json']).thoughtFavs.length === 2, 'the 1.0.0 favourites stay in db.json (nothing deleted)');
  await ctx.close();
}

/* 7: database.xlsx by hand (the way on iPhone): save, change "in Excel", open again */
{
  const { ctx, p } = await fresh();
  await open(p, 'training/');
  await p.evaluate(() => { TL.db.shooters.push({ id: 'S-801', uid: 'u-x-801', name: 'Xlsx Test' }); TL.save(true); });
  await open(p, '', '#/data');
  ok(await p.evaluate(() => !SR.xlsx.canLink() && !!document.querySelector('#xSave') && !!document.querySelector('#xIn')), 'web: database.xlsx is saved and opened by hand (no link)');
  const b64 = await p.evaluate(() => new Promise(res => {
    const N = window.SRNative, keep = N.saveFile;
    N.saveFile = (name, mime, b, cb) => { N.saveFile = keep; res(b); setTimeout(() => SRNativeCallback(cb, { ok: true, msg: name }), 0); };
    SR.xlsx.save();
  }));
  const r = await p.evaluate(b64 => {
    const wb = XLSX.read(b64, { type: 'base64' });
    const names = wb.SheetNames.join();
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Shooters, { defval: '' });
    const row = rows.find(x => x.Name === 'Xlsx Test');
    if (!row) return { names, fail: 'row missing' };
    row.Name = 'Edited In Excel';
    rows.push({ Name: 'Added In Excel' });
    wb.Sheets.Shooters = XLSX.utils.json_to_sheet(rows);
    const out = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return new Promise(res => {
      const N = window.SRNative, keep = N.openFile;
      N.openFile = (m, cb) => { N.openFile = keep; setTimeout(() => SRNativeCallback(cb, { ok: true, msg: 'database.xlsx', data: out }), 0); };
      SR.xlsx.open().then(x => res({ names, x }));
    });
  }, b64);
  ok(/Weapons/.test(r.names) && /Trainings/.test(r.names) && /_StoicRanger/.test(r.names), 'database.xlsx has the PC dashboard sheets and the app copy ' + r.names);
  ok(r.x && r.x.ok, 'database.xlsx opened again ' + JSON.stringify(r.x && (r.x.msg || r.x.error || r.x.stats)));
  await leave(p);
  const d = await dbOf(p);
  ok(d.shooters.some(s => s.uid === 'u-x-801' && s.name === 'Edited In Excel') && d.shooters.some(s => s.name === 'Added In Excel'), 'a change and a new row made in Excel come in');
  await open(p, 'drills/');
  ok(await p.evaluate(() => SD.db.shooters.some(s => s.name === 'Added In Excel')), 'and every part sees them');
  await ctx.close();
}

/* 5: offline */
{
  const { ctx, p } = await fresh();
  await open(p, '');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  for (const [dir] of PAGES) {
    let errs = ['did not load'];
    try { errs = await open(p, dir); } catch (e) { errs = [e.message]; }
    ok(!errs.length, `${dir || 'home'}: opens offline after the first start ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
  }
  await ctx.close();
}

await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exitCode = fails ? 1 : 0;
