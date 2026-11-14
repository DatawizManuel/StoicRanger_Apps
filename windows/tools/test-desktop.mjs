#!/usr/bin/env node
/* Runs the Windows app's shell (main.js + preload.js, Linux Electron 33.2.1 from $TOOLS) with the page code under a
   virtual display and checks: the app starts with no database.xlsx; the installer's choice ("pending") is linked at
   start and merged (nothing lost, the file is not overwritten before its rows are in); a change in the app goes out to
   the file when the window loses focus / the app closes (backup first); a change made in Excel comes in at the next
   start; a locked file is not damaged. Usage: xvfb-run -a node windows/tools/test-desktop.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), ROOT = path.dirname(HERE);
const TOOLS = process.env.TOOLS || '/home/user/tools/winapp';
const ELECTRON = require(path.join(TOOLS, 'node_modules/electron'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// stage like build-win.sh
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'srdesk-'));
const STAGE = path.join(T, 'app'), CONF = path.join(T, 'config'), DATA = path.join(T, 'data-folder');
fs.mkdirSync(STAGE); fs.mkdirSync(DATA);
for (const f of ['main.js', 'preload.js', 'package.json']) fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
fs.cpSync(path.join(HERE, 'res'), path.join(STAGE, 'res'), { recursive: true });
fs.cpSync(path.join(ROOT, 'stoic-ranger/app/src/main/assets/www'), path.join(STAGE, 'www'), { recursive: true });
const USERDATA = path.join(CONF, 'Stoic Ranger');
const XLSX_FILE = path.join(DATA, 'database.xlsx');

const launch = async (extra = {}) => {
  // --password-store=basic: Linux has no DPAPI; safeStorage then works without a keyring (Windows always has DPAPI)
  const app = await pw._electron.launch({ executablePath: ELECTRON, args: [STAGE, '--no-sandbox', '--password-store=basic'], env: Object.assign({}, process.env, { XDG_CONFIG_HOME: CONF }, extra) });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.SR && document.querySelector('#view') && document.querySelector('#view').children.length, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { app, page, errors };
};
const close = async a => { await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await new Promise(r => a.app.process().once('exit', r)); };
const cfg = () => JSON.parse(fs.readFileSync(path.join(USERDATA, 'config.json'), 'utf8'));
const db = () => JSON.parse(fs.readFileSync(path.join(USERDATA, 'data', 'db.json'), 'utf8'));

// 1. first start, nothing linked: say "Later" to the question
fs.mkdirSync(USERDATA, { recursive: true });
fs.writeFileSync(path.join(USERDATA, 'config.json'), JSON.stringify({ asked: true }));
let a = await launch();
ok(!a.errors.length && await a.page.evaluate(() => SR.xlsx.canLink() && !SR.xlsx.linked() && /Training Log/i.test(document.body.innerText)), 'starts, home shows the parts, no database.xlsx linked yet ' + a.errors.join(' | '));
ok(await a.page.evaluate(() => JSON.parse(SRNative.appInfo()).windows === true), 'the app knows it runs on Windows');
await a.page.evaluate(() => { location.href = 'training/index.html'; });
await a.page.waitForFunction(() => window.TL, null, { timeout: 15000 }); await a.page.waitForTimeout(800);
await a.page.evaluate(() => { TL.db.weapons.push({ id: 'W-701', uid: 'u-desk-701', name: 'Desk Gun' }); TL.save(true); });
await close(a);
ok(db().weapons.some(s => s.uid === 'u-desk-701'), "the app's own data is saved in %APPDATA%\\Stoic Ranger\\data\\db.json");

// 2. the installer put an existing database.xlsx (the real PC dashboard file, if there) in place
const real = '/mnt/project-files/stoic-ranger-apps/02_shared/pc-dashboard/03_registry/database.xlsx';
if (fs.existsSync(real)) fs.copyFileSync(real, XLSX_FILE);
else execSync(`node ${path.join(HERE, 'tools/make-template.mjs')} "${XLSX_FILE}"`);
const before = fs.readFileSync(XLSX_FILE);
fs.writeFileSync(path.join(USERDATA, 'config.json'), '﻿' + JSON.stringify(Object.assign(cfg(), { pending: XLSX_FILE })));   // PowerShell may write a BOM
a = await launch();
await a.page.waitForTimeout(2500);
const c1 = cfg();
ok(c1.xlsx === XLSX_FILE && !c1.pending, "the installer's database.xlsx is linked at the first start");
let d = db();
ok(d.weapons.some(s => s.uid === 'u-desk-701') && (fs.existsSync(real) ? d.weapons.length >= 6 && d.trainings.length >= 38 : true), `its entries came in, the app's stayed (${d.weapons.length} guns, ${d.trainings.length} trainings)`);
const bk = path.join(DATA, 'backups');
ok(fs.existsSync(bk) && fs.readdirSync(bk).some(f => f.startsWith('database_before-app_') && fs.readFileSync(path.join(bk, f)).equals(before)), 'the file as it was is kept in backups\\ before the first write');
const rd = await a.page.evaluate(() => { const r = SRX.read(Uint8Array.from(atob(SRNative.xlsxRead()), c => c.charCodeAt(0))); return { s: r.db.weapons.map(x => x.name), w: r.db.weapons.length, t: r.db.trainings.length }; });
ok(rd.s.includes('Desk Gun') && rd.w === d.weapons.length && rd.t === d.trainings.length, 'database.xlsx now also holds the app\'s entries');

// 3. a change in the app goes out when the window loses focus
await a.page.evaluate(() => { location.href = 'drills/index.html'; });
await a.page.waitForFunction(() => window.SD, null, { timeout: 15000 }); await a.page.waitForTimeout(800);
await a.page.evaluate(() => { SD.db.weapons.push({ id: 'W-702', uid: 'u-desk-702', name: 'Blur Gun' }); SD.save(true); });
await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].emit('blur'));
await a.page.waitForTimeout(1500);
ok(await a.page.evaluate(() => SRX.read(Uint8Array.from(atob(SRNative.xlsxRead()), c => c.charCodeAt(0))).db.weapons.some(s => s.name === 'Blur Gun')), 'leaving the window writes the change to database.xlsx');
// 4. locked file: the write fails cleanly, the file stays whole
const lockedBefore = fs.readFileSync(XLSX_FILE);
fs.mkdirSync(XLSX_FILE + '.sr-tmp');          // the write cannot happen (like a file Excel holds open)
await a.page.evaluate(() => { SD.db.weapons.push({ id: 'W-703', uid: 'u-desk-703', name: 'Locked Gun' }); SD.save(true); });
const lr = await a.page.evaluate(() => SR.flush());
fs.rmdirSync(XLSX_FILE + '.sr-tmp');
ok(lr && lr.error && fs.readFileSync(XLSX_FILE).equals(lockedBefore), 'a locked file is left whole and the app says so: ' + (lr && lr.error));
await close(a);

// 5. Excel changes the file while the app is closed
execSync(`python3 - <<'PY'
import openpyxl
wb = openpyxl.load_workbook(r'''${XLSX_FILE}''')
ws = wb['Weapons']; head = [c.value for c in ws[1]]
row = [None] * len(head); row[head.index('Name')] = 'Excel Gun'; ws.append(row)
wb.save(r'''${XLSX_FILE}''')
PY`);
a = await launch();
await a.page.waitForTimeout(1000);
d = db();
ok(!a.errors.length && d.weapons.some(s => s.name === 'Excel Gun') && d.weapons.some(s => s.name === 'Locked Gun'), 'a row added in Excel comes in at the next start; nothing of the app was lost ' + a.errors.join(' | '));
await close(a);
const fin = await (async () => { const b2 = await pw.chromium.launch(), p = await b2.newPage(); await p.setContent('<html></html>');
  for (const f of ['gun/lib/xlsx.mini.min.js', 'sr/drill-names.js', 'sr/xlsxdb.js']) await p.addScriptTag({ path: path.join(STAGE, 'www', f) });
  const r = await p.evaluate(b64 => SRX.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0))).db.weapons.map(s => s.name), fs.readFileSync(XLSX_FILE).toString('base64')); await b2.close(); return r; })();
ok(['Desk Gun', 'Blur Gun', 'Locked Gun', 'Excel Gun'].every(n => fin.includes(n)), 'at the end database.xlsx holds every entry (the failed write was done again later): ' + fin.join(', '));

// 1.3.0: database.xlsx on Nextcloud (remark #15): a small WebDAV server over https on this machine
{
  const https = require('node:https');
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${T}/k.pem -out ${T}/c.pem -days 1 -subj /CN=127.0.0.1 2>/dev/null`);
  const files = {}, dirs = new Set(), auth = []; let n = 0;
  const srv = https.createServer({ key: fs.readFileSync(`${T}/k.pem`), cert: fs.readFileSync(`${T}/c.pem`) }, (req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      auth.push(req.headers.authorization || '');
      const name = decodeURIComponent(req.url.replace(/^\/remote\.php\/dav\/files\/u\/Stoic Ranger\/?|^\/remote\.php\/dav\/files\/u\/Stoic%20Ranger\/?/, '')).replace(/\/$/, '');
      const f = files[name], hd = x => ({ ETag: x.etag, 'Last-Modified': new Date(x.t).toUTCString(), 'Content-Length': x.b.length });
      if (req.method === 'PROPFIND') { res.writeHead(207); return res.end('<d:multistatus xmlns:d="DAV:"></d:multistatus>'); }
      if (req.method === 'MKCOL') { res.writeHead(dirs.has(name) ? 405 : 201); dirs.add(name); return res.end(); }
      if (req.method === 'HEAD' || req.method === 'GET') { if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, hd(f)); return res.end(req.method === 'GET' ? f.b : undefined); }
      if (req.method === 'COPY') { const d = decodeURIComponent(new URL(req.headers.destination).pathname).replace(/^.*Stoic Ranger\//, ''); if (f) files[d] = f; res.writeHead(f ? 201 : 404); return res.end(); }
      if (req.method === 'PUT') {
        if ((req.headers['if-match'] && (!f || f.etag !== req.headers['if-match'])) || (req.headers['if-none-match'] === '*' && f)) { res.writeHead(412); return res.end(); }
        n++; files[name] = { b: Buffer.concat(chunks), etag: '"w' + n + '"', t: 1700000000000 + n * 1000 }; res.writeHead(201, { ETag: files[name].etag }); return res.end();
      }
      res.writeHead(405); res.end();
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'https://127.0.0.1:' + srv.address().port;
  a = await launch({ NODE_TLS_REJECT_UNAUTHORIZED: '0', SR_TEST: '1' });
  ok(await a.page.evaluate(() => SR.storage.available() && SR.storage.state().windows === true), 'Windows: Data offers Nextcloud');
  const r = await a.page.evaluate(u => SR.storage.connect({ url: u, user: 'u', folder: 'Stoic Ranger' }, 'app-pw-123'), url);
  ok(r.ok && files['database.xlsx'] && dirs.has('backups'), 'Windows: connecting uploads database.xlsx to Nextcloud ' + JSON.stringify(r).slice(0, 200));
  ok(auth.includes('Basic ' + Buffer.from('u:app-pw-123').toString('base64')), 'Windows: the requests log in with the app password');
  const c = cfg();
  ok(c.nc && c.nc.mode === 'nextcloud' && !JSON.stringify(c).includes('app-pw-123'), 'Windows: the password is not in config.json in clear text (DPAPI / safeStorage)');
  await a.page.evaluate(() => { SR.db.weapons.push({ id: 'W-990', uid: 'u-nc-990', name: 'Cloud Gun' }); SR.save(); });
  const o = await a.page.evaluate(() => SR.xlsx.syncOut());
  ok(o && o.ok && Object.keys(files).some(k => /^backups\/database-\d{8}-\d{6}\.xlsx$/.test(k)), 'Windows: the next upload makes a backup copy first');
  await close(a);
  srv.close();
}

fs.rmSync(T, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
