#!/usr/bin/env node
/* Stoic Ranger 1.1 (Android path): runs app/src/main/assets/www in headless Chromium at the WebView origin with a
   fake SRNative bridge (db.json, db.bak.json and files/backups kept in localStorage) and checks:
   1. an SR_Database 0.6 db.json is converted in place into the one database, with a backup first, nothing lost,
   2. home shows the three parts (Daily Thoughts is its own app again, 1.1.0); every part page starts without script errors,
   3. old SR_Training Log, SR_Shooting Drills and SR_Daily Thoughts backups merge in, twice adds nothing,
   4. the parts see each other's data (shooters/guns shared, rounds of trainings in the Gun Database),
   5. data from a newer version opens read-only and is never overwritten,
   6. Daily Thoughts (1.0.1) keeps its own file thoughts.json: 1.0.0 data is copied over once (db.json backed up and
      left as it was), backups carry it, restoring a 1.0.0 or a 1.0.1 backup keeps the favourite quotes; 1.1.0 saves
      them as an SR_Daily Thoughts backup for the standalone app,
   7. the linked database.xlsx (1.1.0): created, written when a part is left, edits made in Excel come in at the next
      start, both sides' changes are kept (three-way merge), rows deleted in Excel are not lost, a newer file is not merged,
   8. the Back button: inside a part it stays in the app, at home the first Back only warns, the second closes.
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
    loadData: n => n === 'thoughts' ? g('m.th') || g('m.thbak') || '' : n === 'xlsxbase' ? g('m.xb') || '' : '',
    saveData: (n, t) => { if (n === 'xlsxbase') { s('m.xb', t); return true; } if (n !== 'thoughts') return false; if (g('m.th')) s('m.thbak', g('m.th')); s('m.th', t); s('m.thsaves', String(+(g('m.thsaves') || 0) + 1)); return true; },
    backupData: (n, x) => { if (n !== 'thoughts' || !g('m.th')) return false; s('m.thbackup.' + x, g('m.th')); return true; },
    loadDataBackup: n => n === 'thoughts' ? g('m.thbak') || '' : '',
    isNight: () => false, getSecret: k => g('m.secret.' + k) || '', setSecret: (k, v) => s('m.secret.' + k, v),
    appInfo: () => JSON.stringify({ version: '1.1.0', code: 10, android: '14', device: 'test' }),
    // the linked database.xlsx: m.x = base64 of the file, m.xt = its "mtime"; m.xlinked = '1'
    xlsxInfo: () => JSON.stringify(g('m.xlinked') ? { linked: true, name: 'database.xlsx', size: g('m.x') ? atob(g('m.x')).length : 0, mtime: +(g('m.xt') || 0) } : { linked: false }),
    xlsxRead: () => g('m.x') || '',
    xlsxWrite: b => { if (g('m.x')) s('m.xbackup.' + Date.now(), g('m.x')); s('m.x', b); s('m.xt', String(Date.now())); s('m.xwrites', String(+(g('m.xwrites') || 0) + 1)); return JSON.stringify({ ok: true, size: atob(b).length, mtime: +g('m.xt') }); },
    xlsxLink: (mode, id) => { s('m.xlinked', '1'); if (mode === 'create') { s('m.x', ''); s('m.xt', String(Date.now())); } cb(id, { ok: true, msg: 'database.xlsx' }); },
    xlsxUnlink: () => localStorage.removeItem('m.xlinked'),
    saveFile: (n, m, b64, id) => { s('m.saved.' + n, b64); cb(id, { ok: true, msg: n }); },
    openFile: (m, id) => { const f = g('m.open'); cb(id, f ? { ok: true, msg: 'pick.json', data: btoa(unescape(encodeURIComponent(f))) } : { ok: false, msg: 'cancelled' }); },
    shareFile() { }, shareText() { }, print() { }, printSized() { },
    // 1.3.0: Nextcloud. m.nc = the stored setting; m.dav = a small WebDAV server {files:{name:{b64,etag,t}}, dirs:[], n}
    ncState: () => g('m.nc') || JSON.stringify({ mode: 'local', folder: '/Stoic Ranger/', hasPassword: false, share: false }),
    ncSet: (json, pw) => { const o = JSON.parse(json), cur = JSON.parse(g('m.nc') || '{}'); Object.assign(cur, o); if (pw) cur.hasPassword = true; s('m.nc', JSON.stringify(cur)); return true; },
    ncTry: (json, pw) => JSON.stringify(JSON.parse(json).url === 'https://cloud.test' && pw === 'app-pw' ? { status: 207, headers: {} } : { status: 401, headers: {} }),
    ncRequest: (m, name, hj, body) => {
      const D = JSON.parse(g('m.dav') || '{"files":{},"dirs":[],"n":0}'), h = JSON.parse(hj || '{}'), F = D.files;
      if (g('m.davdown')) return JSON.stringify({ status: 0, error: 'offline' });
      const put = (n, b64) => { D.n++; F[n] = { b64, etag: '"e' + D.n + '"', t: 1700000000000 + D.n * 1000 }; };
      const hdr = f => ({ etag: f.etag, 'last-modified': new Date(f.t).toUTCString(), 'content-length': String(atob(f.b64).length) });
      let r;
      if (D.bump && m === 'PUT' && name === 'database.xlsx' && F[name]) { D.bump = 0; put(name, F[name].b64); D.bumped = (D.bumped || 0) + 1; }   // someone else saved just now
      if (m === 'HEAD') r = F[name] ? { status: 200, headers: hdr(F[name]) } : { status: 404, headers: {} };
      else if (m === 'GET') r = F[name] ? { status: 200, headers: hdr(F[name]), body: F[name].b64 } : { status: 404, headers: {} };
      else if (m === 'MKCOL') { r = { status: D.dirs.includes(name) ? 405 : 201, headers: {} }; if (!D.dirs.includes(name)) D.dirs.push(name); }
      else if (m === 'COPY') { if (F[name]) { F[h['X-Dest-Name']] = Object.assign({}, F[name]); r = { status: 201, headers: {} }; } else r = { status: 404, headers: {} }; }
      else if (m === 'DELETE') { delete F[name]; r = { status: 204, headers: {} }; }
      else if (m === 'PROPFIND') r = { status: 207, headers: {}, body: btoa('<d:multistatus xmlns:d="DAV:">' + Object.keys(F).filter(n => n.startsWith(name + '/')).map(n => `<d:response><d:href>/remote.php/dav/files/u/Stoic%20Ranger/${encodeURIComponent(n).replace('%2F', '/')}</d:href></d:response>`).join('') + '</d:multistatus>') };
      else if (m === 'PUT') {
        if ((h['If-Match'] && (!F[name] || F[name].etag !== h['If-Match'])) || (h['If-None-Match'] === '*' && F[name])) r = { status: 412, headers: {} };
        else { put(name, body); r = { status: 201, headers: { etag: F[name].etag } }; }
      } else r = { status: 405, headers: {} };
      s('m.dav', JSON.stringify(D));
      return JSON.stringify(r);
    },
    takeLinkInbox: () => { const v = g('m.inbox') || ''; localStorage.removeItem('m.inbox'); return v; },
    linkStorage: () => g('m.linked') || '[]',
    linkAdopt: pkg => { const o = JSON.parse(g('m.linked') || '[]').find(x => x.app === pkg); if (!o) return false; const cur = JSON.parse(g('m.nc') || '{}'); Object.assign(cur, o); delete cur.app; s('m.nc', JSON.stringify(cur)); s('m.adopted', pkg); return true; },
    linkPush: () => { s('m.pushed', String(+(g('m.pushed') || 0) + 1)); return '["at.stoicranger.gunsafe"]'; },
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
ok(await page.locator('.srwis').count() === 0 && !/Daily Thoughts/.test(await page.locator('#view').innerText().then(t => t.split('Data')[0])), 'home shows no quote and no Daily Thoughts tile');
ok(await page.locator('a.srpart').count() === 3, 'home shows the three parts');
for (const [p, g] of [['gun/index.html', 'RB'], ['training/index.html', 'TL'], ['drills/index.html', 'SD']]) {
  await open(p, 700);
  const st = await page.evaluate(g => ({ has: !!window[g], home: !!document.getElementById('srHome'), view: (document.getElementById('view') || {}).innerHTML.length || 0 }), g);
  ok(!errors.length && st.has && st.home && st.view > 50, `${p} starts, has the home button ${errors.join(' | ')}`);
}
U = await unified();
ok(U.schemas.gundb === 5 && U.weapons.length === GUN.weapons.length, 'Gun Database part migrated its tables in the one file (schema 5), guns kept');
await open('index.html');   // backups are brought in on the home page (Data)

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
for (const p of ['index.html', 'gun/index.html', 'training/index.html', 'drills/index.html']) {
  await open(p, 600);
  await page.evaluate(() => { try { (window.RB || window.TL || window.SD || {}).save && (window.RB || window.TL || window.SD).save(true); } catch (e) { } SR.flush && SR.flush(); });
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
await open('index.html#/data');
const dtf = await page.evaluate(async () => { const r = await SR.saveThoughtsFile(); const k = Object.keys(localStorage).find(k => k.startsWith('m.saved.daily-thoughts-favourites_'));
  return { ok: r.ok, j: k && JSON.parse(decodeURIComponent(escape(atob(localStorage.getItem(k))))) }; });
ok(!errors.length && dtf.ok && dtf.j.app === 'sr-daily-thoughts' && dtf.j.favs.length === 3, 'Data page saves the favourites as an SR_Daily Thoughts backup for the standalone app');
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
await open('index.html', 600);
await page.evaluate(() => { try { SR.restoreAll(JSON.parse(SR.backupText())); } catch (e) { } SR.flush(); });
ok(await page.evaluate(() => localStorage.getItem('m.thsaves')) === '0' && (await thoughts()).format === 9, 'newer thoughts.json: read-only, never written');
await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('m.th')); t.format = 1; localStorage.setItem('m.th', JSON.stringify(t)); });

// 7. the linked database.xlsx
const xl = () => page.evaluate(() => {   // the file as Excel sees it: sheet name → rows
  const b = localStorage.getItem('m.x'); if (!b) return null;
  const wb = XLSX.read(b, { type: 'base64' }), o = {};
  wb.SheetNames.forEach(n => { o[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
  return o;
});
const excel = f => page.evaluate(f => {   // change the file "in Excel" (keeps every sheet, rewrites the changed ones)
  const wb = XLSX.read(localStorage.getItem('m.x'), { type: 'base64' });
  const rows = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
  const put = (n, r) => { wb.Sheets[n] = XLSX.utils.json_to_sheet(r); };
  new Function('rows', 'put', f)(rows, put);
  localStorage.setItem('m.x', XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }));
  localStorage.setItem('m.xt', String(Date.now() + 5000));
}, f.toString().replace(/^[^{]*{|}$/g, ''));
await open('gun/index.html', 300); await open('index.html#/data');
ok(await page.locator('#xNew').count() === 1 && await page.locator('#xOpen').count() === 1, 'Data page offers to create or use a database.xlsx');
r = await page.evaluate(() => SR.xlsx.link('create'));
let X = await xl();
U = await unified();
ok(r.ok && X && X.Weapons.length === U.weapons.length && X.Trainings.length === U.trainings.length && X.Shooters.length === U.shooters.length, 'a new database.xlsx holds every gun, training and shooter ' + JSON.stringify(r));
ok(['Weapons', 'Barrels', 'Munitions', 'Shooters', 'Rounds_Log', 'Targets', 'Purposes', 'Trainers', 'Trainings', 'Drill_Results', 'Info'].every(n => X[n]), 'with every sheet of the PC dashboard');
// Excel: rename a gun, add a trainer, delete a shooter row; the app meanwhile changes another field of the same gun
const gun = U.weapons.find(w => w.name === 'Test Pistol');
await excel(() => {
  const w = rows('Weapons'); w.find(x => x.Name === 'Test Pistol').Name = 'Test Pistol (Excel)'; put('Weapons', w);
  const t = rows('Trainers'); t.push({ Name: 'Excel Trainer' }); put('Trainers', t);
  put('Shooters', rows('Shooters').filter(x => x.Name !== 'Test Friend'));
});
await open('training/index.html', 700);
ok(!errors.length && await page.evaluate(() => TL.db.weapons.some(w => w.name === 'Test Pistol (Excel)') && TL.db.trainers.some(t => t.name === 'Excel Trainer')), 'Excel changes come in when a part starts ' + errors.join(' | '));
ok(await page.evaluate(() => TL.db.shooters.some(s => s.name === 'Test Friend')), 'a row deleted in Excel is not lost in the app');
await page.evaluate(id => { const w = TL.db.weapons.find(x => x.id === id); w.caliber = '9mm Luger'; TL.save(true); }, gun.id);
await page.evaluate(() => SR.flush());
X = await xl();
ok(X.Weapons.some(w => w.Name === 'Test Pistol (Excel)' && /9mm Luger/.test(JSON.stringify(w))), 'leaving a part writes the file: both changes kept (Excel name, app calibre)');
ok((await keys()).some(k => k.startsWith('m.xbackup.')), 'the previous file is kept as a backup before it is written');
// Excel changes a training while the part is open (app in the background): the next save of the part must not drop it
await excel(() => { const t = rows('Trainers'); t.push({ Name: 'Second Excel Trainer' }); put('Trainers', t); });
await page.evaluate(() => { SR.flush(); TL.save(true); SR.flush(); });
U = await unified();
ok(U.trainers.some(t => t.name === 'Second Excel Trainer'), 'a change in the file while a part is open is kept');
ok(U.barrels.length === GUN.barrels.length && U.sheets.length === GUN.sheets.length && U.weapons.length === GUN.weapons.length + 1 && U.trainings.length === 2 && U.trainings.every(t => t.weapons[0].weaponId === gun.id), 'no entry doubled by the round trips (a gun renamed in Excel stays one gun) ' + JSON.stringify(['barrels', 'sheets', 'weapons', 'munitions', 'roundsLog', 'targets'].map(t => [t, (U[t] || []).length, (GUN[t] || []).length])));
const again = await page.evaluate(() => SR.xlsx.syncIn());
ok(again && again.ok && !Object.keys(again.stats.added).length && !Object.keys(again.stats.changed).length, 'syncing the same file again changes nothing ' + JSON.stringify(again && again.stats));
// a file written by a newer Stoic Ranger is not merged
const before = JSON.stringify((await unified()).weapons);
await page.evaluate(() => {
  const wb = XLSX.read(localStorage.getItem('m.x'), { type: 'base64' });
  const info = XLSX.utils.sheet_to_json(wb.Sheets.Info, { header: 1 });
  info.forEach(r => { if (/format/i.test(String(r[0]))) r[1] = 99; });
  wb.Sheets.Info = XLSX.utils.aoa_to_sheet(info);
  localStorage.setItem('m.x', XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })); localStorage.setItem('m.xt', String(Date.now() + 9000));
});
await open('index.html', 600);
ok(JSON.stringify((await unified()).weapons) === before, 'a database.xlsx from a newer Stoic Ranger is not merged ' + JSON.stringify(await page.evaluate(() => SR.xlsxResult)));
await page.evaluate(() => SR.xlsx.unlink());
ok(!(await page.evaluate(() => SR.xlsx.linked())) && !!(await page.evaluate(() => localStorage.getItem('m.x'))), 'unlink keeps the file and the data');

// 8. the Back button
await open('training/index.html', 600);
ok(await page.evaluate(() => SR.back()) === true, 'Back in a part keeps the app open');
await page.waitForTimeout(500);
await open('index.html', 500);
ok(await page.evaluate(() => SR.back()) === true && /back again/i.test(await page.evaluate(() => document.body.innerText)), 'first Back at home only warns');
ok(await page.evaluate(() => SR.back()) === false, 'a second Back within 2 s closes the app');

// 9. 1.2.0: name, overviews on the home page, the paper datasheet (remarks #8, #9, #10)
await page.goto(`${ORIGIN}/www/nothing.html`).catch(() => { });
await page.evaluate(t => { localStorage.setItem('m.db', t); localStorage.setItem('m.saves', '0'); localStorage.removeItem('sr.home.overview'); }, JSON.stringify(Object.assign(await unified(), { format: 1 })));
await open('index.html', 700);
ok(await page.title() === 'Stoic Ranger Shooting' && (await page.locator('#hTitle').textContent()) === 'Stoic Ranger Shooting', 'the app is called Stoic Ranger Shooting');
const dbBefore = await page.evaluate(() => localStorage.getItem('m.db'));
for (const tab of ['guns', 'training', 'drills', 'dope']) {
  await page.click(`[data-ov="${tab}"]`); await page.waitForTimeout(150);
  ok(!errors.length && await page.evaluate(t => document.querySelector(`[data-ov="${t}"]`).classList.contains('on') && document.querySelector('#ovBody').innerText.trim().length > 20, tab), `overview tab ${tab} shows ${errors.join(' | ')}`);
}
await page.click('[data-ov="guns"]'); await page.waitForTimeout(150);
const ovGuns = await page.evaluate(() => document.querySelector('#ovBody').innerText);
ok(/Rounds per gun/i.test(ovGuns) && /Test Pistol/.test(ovGuns), 'guns overview lists the guns with their rounds');
await page.selectOption('#ovYear', ''); await page.waitForTimeout(150);
await page.click('[data-ov="dope"]'); await page.waitForTimeout(150);
const dopeLinks = await page.locator('#ovBody a.item').count(), wantDope = await page.evaluate(() => new Set(SR.db.sheets.filter(s => s.weaponId && s.munitionId && SR.db.weapons.some(w => w.id === s.weaponId) && SR.db.munitions.some(m => m.id === s.munitionId)).map(s => s.weaponId + '|' + s.munitionId)).size);
ok(dopeLinks === wantDope && dopeLinks > 0, `dope cards: one per gun and ammunition on the datasheets (${dopeLinks})`);
await page.click('[data-ov="training"]'); await page.waitForTimeout(150);
ok(await page.locator('#ovShooter').count() === 0, 'one shooter only: the overview has no shooter filter (1.3.0)');
const trAll = await page.evaluate(() => document.querySelector('#ovBody .tile .v').textContent);
ok(+trAll === await page.evaluate(() => SR.db.trainings.filter(t => !t.example).length), 'and counts every training, older ones of other shooters included');
ok(await page.evaluate(() => localStorage.getItem('m.db')) === dbBefore && await page.evaluate(() => localStorage.getItem('m.saves')) === '0', 'the overview never changes the database');
await open('index.html', 600);
ok(await page.evaluate(() => document.querySelector('[data-ov="training"]').classList.contains('on')), 'the overview keeps its tab on this device');
await page.click('[data-ov="dope"]'); await page.waitForTimeout(150);
const first = await page.locator('#ovBody a.item').first().getAttribute('href');
await open(first, 900);
const qs = new URLSearchParams(first.split('?')[1]);
ok(!errors.length && await page.evaluate(([w, m]) => RB.db.settings.dope.weaponId === w && RB.db.settings.dope.munitionId === m && /Dope card/i.test(document.body.innerText), [qs.get('w'), qs.get('m')]), 'a dope card from the home page opens on that gun and ammunition ' + errors.join(' | '));
await open('index.html', 600);
await page.click('#ovBlank'); await page.waitForTimeout(600);
const pdf = await page.evaluate(() => localStorage.getItem('m.saved.training-datasheet-blank.pdf'));
ok(!!pdf && atob(pdf).startsWith('%PDF'), 'the empty datasheet is saved as a PDF');
ok(await page.locator('a[href="gun/index.html#/analyse/scan"]').count() === 1, 'and a filled-in sheet can be brought back from the home page');
const bk = await page.evaluate(async () => { await SR.saveBackup(); return Object.keys(localStorage).filter(k => k.startsWith('m.saved.sr-shooting-backup_')).length; });
ok(bk === 1, 'backups are named sr-shooting-backup_<date>.json');

// 10. 1.3.0: one shooter, rounds entries, sheets of other apps, Nextcloud, the link with SR GunSafe
await open('training/index.html#/training/new', 700);
ok(await page.locator('#fShooter').count() === 0, 'the training form has no shooter choice any more');
await page.fill('#fDate', '2026-11-07'); await page.fill('#fDesc', 'One shooter test');
await page.click('#tSaveTop'); await page.waitForTimeout(400);
const tr13 = await page.evaluate(() => { const t = TL.db.trainings.find(x => x.desc === 'One shooter test'); return t && { sh: t.shooterId, me: TL.meId() }; });
ok(tr13 && tr13.sh && tr13.sh === tr13.me, 'a new training goes to the own shooter');
const other = await page.evaluate(() => { const f = TL.db.shooters.find(s => s.name === 'Test Friend'); const t = TL.db.trainings.find(x => x.shooterId === f.id); return t ? t.id : ''; });
if (other) {
  await open('training/index.html#/training/' + other, 700);
  ok(/Logged for/.test(await page.evaluate(() => document.body.innerText)), 'an older training of another shooter says whose it is');
  await page.click('#tSaveTop'); await page.waitForTimeout(400);
  ok(await page.evaluate(id => { const t = TL.db.trainings.find(x => x.id === id); return TL.nameOf('shooters', t.shooterId) === 'Test Friend'; }, other), 'and keeps that shooter when saved');
}
await open('index.html', 600);
ok(await page.locator('.srnew a[href="gun/index.html#/db/roundsLog/new"]').count() === 1, 'home has + Rounds');
await open('gun/index.html#/db/roundsLog/new', 900);
const rlBefore = await page.evaluate(() => RB.db.roundsLog.length);
await page.fill('[data-k="rounds"]', '40'); await page.fill('[data-k="note"]', 'Shot by shooter xy');
ok(await page.locator('[data-k="munitionId"]').count() === 1, 'a rounds entry can name the ammunition');
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^save$/i.test(x.textContent.trim()) || x.id === 'saveTop' || x.getAttribute('aria-label') === 'Save'); b.click(); });
await page.waitForTimeout(400);
ok(await page.evaluate(n => { const L = JSON.parse(localStorage.getItem('m.db')).roundsLog; return L.length === n + 1 && L.some(r => r.note === 'Shot by shooter xy' && r.rounds === 40); }, rlBefore), 'rounds without a training are saved with their note');
await open('index.html', 600);
await page.click('[data-ov="guns"]'); await page.selectOption('#ovYear', ''); await page.waitForTimeout(200);
ok(/Extra rds/i.test(await page.evaluate(() => document.querySelector('#ovBody').innerText)), 'the guns overview counts the extra rounds');

// sheets of the other apps stay in database.xlsx (shared contract A)
const kept = await page.evaluate(() => {
  const X = window.XLSX, wb = X.read(SRX.write(SR.db, { by: 'test' }), { type: 'array' });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Gun', 'Owner'], ['W001', 'Manuel']]), 'GS_Owners');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['{"x":1}']]), '_GS_Data');
  wb.Workbook = { Sheets: wb.SheetNames.map(n => ({ name: n, Hidden: n.startsWith('_') ? 1 : 0 })) };
  const keep = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
  const out = X.read(SRX.write(SR.db, { by: 'test', keep }), { type: 'array' });
  const vis = Object.fromEntries((out.Workbook.Sheets || []).map(x => [x.name, x.Hidden || 0]));
  return { gs: !!out.Sheets.GS_Owners && X.utils.sheet_to_json(out.Sheets.GS_Owners)[0].Owner === 'Manuel', hid: vis._GS_Data === 1 && vis._StoicRanger === 1, once: out.SheetNames.filter(n => n === 'Weapons').length === 1 };
});
ok(kept.gs && kept.hid && kept.once, 'writing database.xlsx keeps the sheets of other apps (hidden ones stay hidden), its own sheets once');

// Nextcloud
await page.evaluate(() => { localStorage.removeItem('m.xlinked'); localStorage.removeItem('m.dav'); localStorage.removeItem('m.nc'); });
await open('index.html#/data', 600);
ok(await page.locator('#stMode').count() === 1, 'Data shows where the data is stored, with the Nextcloud choice');
await page.click('#stMode [data-m="nextcloud"]');
await page.fill('#stUrl', 'https://cloud.test'); await page.fill('#stUser', 'u'); await page.fill('#stPw', 'wrong');
await page.click('#stGo'); await page.waitForTimeout(300);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('m.nc') || '{}').mode !== 'nextcloud'), 'a wrong app password is refused and nothing is stored');
await page.fill('#stPw', 'app-pw'); await page.click('#stGo'); await page.waitForTimeout(500);
let dav = await page.evaluate(() => JSON.parse(localStorage.getItem('m.dav')));
ok(dav.files['database.xlsx'] && dav.dirs.includes('') && dav.dirs.includes('backups'), 'connecting uploads database.xlsx into the folder (and makes backups/)');
ok(await page.evaluate(() => { const n = JSON.parse(localStorage.getItem('m.nc')); return n.mode === 'nextcloud' && !('password' in n) && !JSON.stringify(SR.db).includes('app-pw'); }), 'the password is never in the setting the page keeps or in the database');
ok(/Synced with/.test(await page.evaluate(() => document.querySelector('#stCard').innerText)), 'Data shows the sync status');
// someone else adds a gun on Nextcloud (another phone / the PC)
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('m.dav')), u = JSON.parse(JSON.stringify(SR.db));
  u.weapons.push({ id: 'W900', uid: 'uid-nc-gun', name: 'Cloud Rifle', type: 'Rifle' });
  const b = SRX.write(u, { by: 'other', keep: Uint8Array.from(atob(d.files['database.xlsx'].b64), c => c.charCodeAt(0)) });
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  d.n++; d.files['database.xlsx'] = { b64: btoa(s), etag: '"e' + d.n + '"', t: 1700000000000 + d.n * 1000 }; localStorage.setItem('m.dav', JSON.stringify(d));
});
const inR = await page.evaluate(() => { const r = SR.xlsx.syncIn(); return { ok: !r || !r.error, gun: SR.db.weapons.some(w => w.name === 'Cloud Rifle') }; });
ok(inR.ok && inR.gun, 'a change made elsewhere comes in from Nextcloud (merged)');
// a save on Nextcloud between the look and the upload: 412, read, merge, upload again
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('m.dav')); d.bump = 1; localStorage.setItem('m.dav', JSON.stringify(d)); SR.db.weapons.push({ id: 'W901', uid: 'uid-local-gun', name: 'Local Rifle', type: 'Rifle' }); SR.save(); });
const outR = await page.evaluate(() => SR.xlsx.syncOut());
dav = await page.evaluate(() => JSON.parse(localStorage.getItem('m.dav')));
const remote = await page.evaluate(b64 => { const F = SRX.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); return F.db.weapons.map(w => w.name); }, dav.files['database.xlsx'].b64);
ok(outR && outR.ok && dav.bumped === 1 && remote.includes('Local Rifle') && remote.includes('Cloud Rifle'), 'a conflicting save on Nextcloud (412) is merged and uploaded again, nothing lost');
ok(Object.keys(dav.files).some(n => /^backups\/database-\d{8}-\d{6}\.xlsx$/.test(n)), 'a copy goes to backups/ before each upload');
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('m.dav')); for (let i = 0; i < 35; i++) d.files['backups/database-20250101-' + String(1000000 + i).slice(1) + '.xlsx'] = d.files['database.xlsx']; localStorage.setItem('m.dav', JSON.stringify(d)); SR.db.weapons[0].notes = 'prune'; SR.save(); SR.xlsx.syncOut(); });
dav = await page.evaluate(() => JSON.parse(localStorage.getItem('m.dav')));
ok(Object.keys(dav.files).filter(n => n.startsWith('backups/')).length === 30, 'only the newest 30 backups are kept');
// offline: the app keeps working, the change goes out later
await page.evaluate(() => { localStorage.setItem('m.davdown', '1'); SR.db.weapons[0].notes = 'offline edit'; SR.save(); });
const off = await page.evaluate(() => SR.flush());
ok(off && off.offline && await page.evaluate(() => !!SR.xlsx.state().dirty), 'offline: nothing is lost, the change waits');
await page.evaluate(() => localStorage.removeItem('m.davdown'));
await page.evaluate(() => SR.xlsx.syncOut());
ok(await page.evaluate(() => !SR.xlsx.state().dirty), 'and goes out when Nextcloud is back');
// back to this phone only
const davFiles = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('m.dav')).files).length);
const lr = await page.evaluate(() => SR.storage.local());
ok(lr.ok && await page.evaluate(n => JSON.parse(localStorage.getItem('m.nc')).mode === 'local' && Object.keys(JSON.parse(localStorage.getItem('m.dav')).files).length === n && SR.db.weapons.some(w => w.name === 'Local Rifle'), davFiles), 'stop syncing: data stays here, nothing deleted on Nextcloud');
// shared storage setting with linked apps (contract C)
await page.evaluate(() => { localStorage.setItem('m.linked', JSON.stringify([{ app: 'at.stoicranger.gunsafe', mode: 'nextcloud', url: 'https://cloud.test', user: 'u', folder: '/Stoic Ranger/', file: 'database.xlsx', changed: '2099-01-01T00:00:00.000Z' }])); });
await open('nothing.html', 100).catch(() => { }); await open('index.html', 600);
ok(await page.evaluate(() => localStorage.getItem('m.adopted') === 'at.stoicranger.gunsafe' && JSON.parse(localStorage.getItem('m.nc')).mode === 'nextcloud'), 'a newer setting of a linked app (SR GunSafe switched to Nextcloud) is taken over when the app opens');
await page.evaluate(() => SR.storage.local());
ok(await page.evaluate(() => +localStorage.getItem('m.pushed') >= 1), 'switching here is pushed to the linked apps');
await page.evaluate(() => { localStorage.setItem('m.nc', JSON.stringify({ mode: 'local' })); localStorage.removeItem('m.linked'); });
// barrels from SR GunSafe (contract D)
const wid = await page.evaluate(() => SR.db.weapons.find(w => !w.example).id);
const oldB = await page.evaluate(w => { const b = SR.db.barrels.find(x => x.weaponId === w && !x.removed); return b ? b.id : ''; }, wid);
await page.evaluate(([w, ob]) => localStorage.setItem('m.inbox', JSON.stringify([{ barrels: [{ id: 'B-777', isNew: true, weaponId: w, name: 'GunSafe barrel', installed: '2026-11-07', removed: '' }].concat(ob ? [{ id: ob, removed: '2026-11-07' }] : []) }])), [wid, oldB]);
await open('index.html', 600);
ok(await page.evaluate(ob => SR.db.barrels.some(b => b.name === 'GunSafe barrel' && b.id === 'B-777' && b.uid) && (!ob || SR.db.barrels.find(b => b.id === ob).removed === '2026-11-07') && !localStorage.getItem('m.inbox'), oldB), 'a barrel switch made in SR GunSafe arrives when the app opens (new barrel in, old one removed)');

await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
