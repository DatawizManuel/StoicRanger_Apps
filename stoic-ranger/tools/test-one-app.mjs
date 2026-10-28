#!/usr/bin/env node
/* Stoic Ranger 1.0 (Android path): runs app/src/main/assets/www in headless Chromium at the WebView origin with a
   fake SRNative bridge (db.json, db.bak.json and files/backups kept in localStorage) and checks:
   1. an SR_Database 0.6 db.json is converted in place into the one database, with a backup first, nothing lost,
   2. home shows today's thought and the four parts; every part page starts without script errors,
   3. old SR_Training Log, SR_Shooting Drills and SR_Daily Thoughts backups merge in, twice adds nothing,
   4. the parts see each other's data (shooters/guns shared, rounds of trainings in the Gun Database),
   5. data from a newer version opens read-only and is never overwritten,
   6. Daily Thoughts (1.0.1) keeps its own file thoughts.json: 1.0.0 data is copied over once (db.json backed up and
      left as it was), backups carry it, restoring a 1.0.0 or a 1.0.1 backup keeps the favourite quotes.
   Usage: node tools/test-one-app.mjs [SR_Database db.json]   */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../app/src/main/assets/www');
const ORIGIN = 'https://appassets.androidplatform.net';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.jpg': 'image/jpeg' };
// an SR_Database file: the one given, else the built-in demo data in its oldest format (schema 1) as a user's own entries
const GUN = JSON.parse(fs.readFileSync(process.argv[2] || path.join(WWW, 'gun/data/demo.json'), 'utf8'));
if (!process.argv[2]) ['weapons', 'barrels', 'munitions', 'shooters', 'roundsLog', 'sheets'].forEach(t => (GUN[t] || []).forEach(r => delete r.example));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const MOCK = () => {
  const L = localStorage, g = k => L.getItem(k), s = (k, v) => L.setItem(k, v);
  const cb = (id, res) => setTimeout(() => window.SRNativeCallback && window.SRNativeCallback(id, res), 10);
  window.SRNative = {
    loadDb: () => g('m.db') || g('m.bak') || '',
    saveDb: t => { if (g('m.db')) s('m.bak', g('m.db')); s('m.db', t); s('m.saves', String(+(g('m.saves') || 0) + 1)); return true; },
    backupDb: n => { if (!g('m.db')) return false; s('m.backup.' + n, g('m.db')); return true; },
    loadDbBackup: () => g('m.bak') || '',
    loadData: n => n === 'thoughts' ? g('m.th') || g('m.thbak') || '' : '',
    saveData: (n, t) => { if (n !== 'thoughts') return false; if (g('m.th')) s('m.thbak', g('m.th')); s('m.th', t); s('m.thsaves', String(+(g('m.thsaves') || 0) + 1)); return true; },
    backupData: (n, x) => { if (n !== 'thoughts' || !g('m.th')) return false; s('m.thbackup.' + x, g('m.th')); return true; },
    loadDataBackup: n => n === 'thoughts' ? g('m.thbak') || '' : '',
    isNight: () => false, getSecret: k => g('m.secret.' + k) || '', setSecret: (k, v) => s('m.secret.' + k, v),
    appInfo: () => JSON.stringify({ version: '1.0.0', code: 8, android: '14', device: 'test' }),
    saveFile: (n, m, b64, id) => { s('m.saved.' + n, b64); cb(id, { ok: true, msg: n }); },
    openFile: (m, id) => { const f = g('m.open'); cb(id, f ? { ok: true, msg: 'pick.json', data: btoa(unescape(encodeURIComponent(f))) } : { ok: false, msg: 'cancelled' }); },
    shareFile() { }, shareText() { }, print() { }, printSized() { },
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await ctx.route(ORIGIN + '/**', r => {
  const p = decodeURIComponent(new URL(r.request().url()).pathname);
  const f = path.join(WWW, p.replace(/^\/www\//, ''));
  if (!p.startsWith('/www/') || !f.startsWith(WWW) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: 'nf' });
  r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
await ctx.addInitScript(MOCK);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const open = async (p, settle = 500) => { errors.length = 0; await page.goto(`${ORIGIN}/www/${p}`); await page.waitForTimeout(settle); };
const unified = () => page.evaluate(() => JSON.parse(localStorage.getItem('m.db')));
const thoughts = () => page.evaluate(() => JSON.parse(localStorage.getItem('m.th') || 'null'));
const keys = () => page.evaluate(() => Object.keys(localStorage));

// 1. conversion of the SR_Database file
await page.goto(`${ORIGIN}/www/nothing.html`).catch(() => { });
await page.evaluate(t => { localStorage.clear(); localStorage.setItem('m.db', t); }, JSON.stringify(GUN));
await open('index.html');
ok(!errors.length, 'home starts without errors ' + errors.join(' | '));
ok(await page.evaluate(() => SR.converted), 'SR_Database data converted on first start');
let U = await unified();
ok(U.app === 'stoic-ranger' && U.format === 1, 'db.json is now the one Stoic Ranger database');
ok(['weapons', 'barrels', 'munitions', 'shooters', 'sheets'].every(t => U[t].length === GUN[t].length), 'no guns, barrels, ammo, shooters or datasheets lost');
ok((await keys()).some(k => k.startsWith('m.backup.db-before-stoic-ranger-1.0')), 'backup of the old file kept before converting');

// 2. home and the parts
ok(await page.locator('.srwis blockquote').count() === 1, "home shows today's thought");
ok(await page.locator('a.srpart').count() === 4, 'home shows the four parts');
for (const [p, g] of [['gun/index.html', 'RB'], ['training/index.html', 'TL'], ['drills/index.html', 'SD'], ['thoughts/index.html', 'DT']]) {
  await open(p, 700);
  const st = await page.evaluate(g => ({ has: !!window[g], home: !!document.getElementById('srHome'), view: (document.getElementById('view') || {}).innerHTML.length || 0 }), g);
  ok(!errors.length && st.has && st.home && st.view > 50, `${p} starts, has the home button ${errors.join(' | ')}`);
}
U = await unified();
ok(U.schemas.gundb === 5 && U.weapons.length === GUN.weapons.length, 'Gun Database part migrated its tables in the one file (schema 5), guns kept');
await open('thoughts/index.html#/today', 700);
const qHome = await page.evaluate(() => document.querySelector('#view').innerText);
await open('index.html');
const wis = await page.locator('.srwis blockquote').innerText();
ok(qHome.replace(/\s+/g, ' ').includes(wis.replace(/\s+/g, ' ').slice(0, 40)), "home's thought = Daily Thoughts' quote of the day");

// 3. bring in old backups
const sh0 = U.shooters[0];
const TLB = { app: 'sr-training-log', schema: 3, settings: {}, history: [],
  shooters: [{ id: 'S-001', name: sh0.name, status: 'Active' }, { id: 'S-002', name: 'Test Friend', status: 'Active' }],
  weapons: [{ id: 'W-001', name: 'Test Pistol', type: 'Pistol', caliber: '9x19' }],
  trainers: [{ id: 'T-001', name: 'Test Trainer' }],
  trainings: [
    { id: 'TR-001', shooterId: 'S-001', date: '2026-10-20', durationH: 2, fire: 'live', desc: 'Test live', weapons: [{ weaponId: 'W-001', rounds: 50 }], trainerId: 'T-001' },
    { id: 'TR-002', shooterId: 'S-002', date: '2026-10-21', durationH: 1, fire: 'dry', desc: 'Test dry', weapons: [{ weaponId: 'W-001', rounds: 30 }] }] };
const SDB = { app: 'sr-shooting-drills', schema: 1, settings: {}, history: [], shooters: [{ id: 'S-001', name: 'Test Friend' }], weapons: [{ id: 'W-001', name: 'Test Pistol' }],
  results: [{ id: 'R-001', date: '2026-10-22', drillId: 'bill-drill', shooterId: 'S-001', weaponId: 'W-001', time: 3.1, hits: 6 }], favs: ['bill-drill'] };
const DTB = { app: 'sr-daily-thoughts', schema: 1, settings: { theme: 'auto' }, history: [], favs: [{ id: 'q-zeno-of-citium-01', at: '2026-10-01T08:00:00Z' }, { id: 'q-seneca-01', at: '' }] };
const bring = async j => page.evaluate(j => SR.importBackup(j), j);
let r = await bring(TLB); U = await unified();
ok(!r.error && U.trainings.length === 2, 'Training Log backup: 2 trainings brought in');
ok(U.shooters.filter(s => s.name === sh0.name).length === 1 && U.shooters.some(s => s.name === 'Test Friend'), 'same-name shooter used once, new shooter added');
const pistol = U.weapons.find(w => w.name === 'Test Pistol');
ok(pistol && U.trainings.every(t => t.weapons[0].weaponId === pistol.id), 'training guns point at the gun in the one database');
r = await bring(TLB); U = await unified();
ok(U.trainings.length === 2 && U.weapons.filter(w => w.name === 'Test Pistol').length === 1, 'bringing in the same backup twice adds nothing');
await bring(SDB); await bring(DTB); await bring(DTB); U = await unified();
ok(U.results.length === 1 && U.results[0].weaponId === pistol.id, 'Shooting Drills result brought in, linked to the same gun');
ok((await thoughts()).favs.length === 2 && !(U.thoughtFavs || []).length, 'Daily Thoughts favourites brought in once, into thoughts.json');
ok((await keys()).some(k => k.startsWith('m.backup.db-before-import-tl')), 'backup kept before an import');

// 4. the parts see each other
await open('training/index.html', 700);
ok(!errors.length && await page.evaluate(() => TL.db.trainings.length === 2 && TL.db.weapons.some(w => w.name === 'Test Pistol')), 'Training Log part shows the trainings ' + errors.join(' | '));
await open('drills/index.html', 700);
ok(!errors.length && await page.evaluate(() => SD.db.results.length === 1), 'Shooting Drills part shows the result');
await open('thoughts/index.html#/favourites', 700);
ok(!errors.length && await page.evaluate(() => DT.db.favs.length === 2), 'Daily Thoughts part shows the favourite quotes');
await page.evaluate(() => { DT.toggleFav(DT.quoteOfDay().id); DT.flush(); });
U = await unified();
ok((await thoughts()).favs.length !== 2 && U.trainings.length === 2 && U.weapons.length === GUN.weapons.length + 1, 'a favourite saved from Daily Thoughts keeps all other data');
await open('gun/index.html', 900);
const rb = await page.evaluate(() => ({ w: RB.db.weapons.length, rl: (RB.db.roundsLog || []).length, sh: RB.db.shooters.length }));
ok(!errors.length && rb.w === GUN.weapons.length + 1, 'Gun Database part lists the gun from the Training Log ' + errors.join(' | '));
const back = await page.evaluate(() => SR.back());
ok(back === true, 'back button at a part start screen goes home');
await page.waitForTimeout(400);
ok(/\/www\/index\.html/.test(page.url()), 'and lands on home');
await open('index.html#/data');
ok(!errors.length && await page.locator('#dIn').count() === 1, 'Data page opens');

// 5. newer data stays untouched
const newer = Object.assign(await unified(), { format: 2 });
await page.evaluate(t => { localStorage.setItem('m.db', t); localStorage.setItem('m.saves', '0'); }, JSON.stringify(newer));
for (const p of ['index.html', 'gun/index.html', 'training/index.html', 'drills/index.html', 'thoughts/index.html']) {
  await open(p, 600);
  await page.evaluate(() => { try { (window.RB || window.TL || window.SD || window.DT || {}).save && (window.RB || window.TL || window.SD || window.DT).save(true); } catch (e) { } SR.flush && SR.flush(); });
}
ok(await page.evaluate(() => localStorage.getItem('m.saves')) === '0' && (await unified()).format === 2, 'newer data: read-only in every part, never written');

// 6. Daily Thoughts in its own file
const keepDb = await unified(), keepTh = await thoughts();
const V100 = Object.assign({}, keepDb, { format: 1, schemas: Object.assign({}, keepDb.schemas, { dt: 1 }), settings: Object.assign({}, keepDb.settings, { dt: { theme: 'auto', seen: 5 } }),
  thoughtFavs: [{ id: 'q-seneca-01', at: '' }, { id: 'q-zeno-of-citium-01', at: '' }, { id: 'q-marcus-aurelius-01', at: '' }] });
await page.evaluate(t => { Object.keys(localStorage).filter(k => /^m\.(th|db|bak|backup)/.test(k)).forEach(k => localStorage.removeItem(k)); localStorage.setItem('m.db', t); localStorage.setItem('m.saves', '0'); }, JSON.stringify(V100));
await open('index.html');
let TH = await thoughts();
ok(!errors.length && TH && TH.favs.length === 3 && TH.schema === 1 && TH.settings.seen === 5 && await page.evaluate(() => SR.thoughtsMoved), '1.0.0 Daily Thoughts data copied into thoughts.json on the first start');
ok(JSON.stringify(await unified()) === JSON.stringify(V100) && await page.evaluate(() => localStorage.getItem('m.saves')) === '0', 'db.json left exactly as it was (add-only)');
ok((await keys()).some(k => k.startsWith('m.backup.db-before-thoughts-file-')), 'backup of db.json kept before the move');
await open('index.html');
ok(!(await page.evaluate(() => SR.thoughtsMoved)) && (await thoughts()).favs.length === 3, 'the move runs once');
await open('thoughts/index.html#/favourites', 700);
ok(!errors.length && await page.evaluate(() => DT.db.favs.length === 3 && !document.querySelector('#lPass')), 'Daily Thoughts shows them, no password of its own');
const full = JSON.parse(await page.evaluate(() => SR.backupText()));
ok(full.thoughts && full.thoughts.favs.length === 3 && full.thoughtFavs.length === 3 && full.weapons.length === V100.weapons.length, 'a backup holds the shooting database and Daily Thoughts');
// restore a 1.0.0 backup (favourites only in thoughtFavs)
const old = Object.assign({}, V100, { thoughtFavs: [{ id: 'q-seneca-01', at: '' }] });
ok(await page.evaluate(j => SR.restoreAll(j), old) && (await thoughts()).favs.length === 1, 'restoring a 1.0.0 backup brings back its favourite quotes');
ok((await keys()).some(k => k.startsWith('m.thbackup.thoughts-before-restore-')), 'Daily Thoughts backed up before a restore');
ok(await page.evaluate(j => SR.restoreAll(j), full) && (await thoughts()).favs.length === 3 && (await unified()).weapons.length === V100.weapons.length, 'restoring a 1.0.1 backup brings back both');
// newer Daily Thoughts file: read-only, never written
await page.goto(`${ORIGIN}/www/nothing.html`).catch(() => { });
await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('m.th')); t.format = 9; localStorage.setItem('m.th', JSON.stringify(t)); localStorage.setItem('m.thsaves', '0'); });
await open('thoughts/index.html#/favourites', 700);
await page.evaluate(() => { try { DT.toggleFav('q-seneca-01'); DT.flush(); } catch (e) { } });
ok(await page.evaluate(() => localStorage.getItem('m.thsaves')) === '0' && (await thoughts()).format === 9, 'newer thoughts.json: read-only, never written');

await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
