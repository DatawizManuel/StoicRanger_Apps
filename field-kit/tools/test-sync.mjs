// SR Field Kit 0.2.0 Nextcloud sync tests, against a fake Nextcloud (WebDAV) inside the page:
//   node field-kit/tools/test-sync.mjs
// Checks SHARED-DB-CONTRACT v1: only FK_ sheets + hidden _FK_Data are written, every other sheet (hidden ones too) is
// kept, backups before each upload (newest 30), If-Match + retry on 412, three-way merge, tombstones, no deletes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = createServer(async (q, r) => { try { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const b = await readFile(join(WWW, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(b); } catch (e) { r.writeHead(404); r.end(); } });
await new Promise(ok => srv.listen(0, ok));
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

function BRIDGE(init) {
  // persistent across reloads: sessionStorage
  const S = k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const W = (k, v) => sessionStorage.setItem(k, JSON.stringify(v));
  if (!S('init')) { W('init', 1); W('db', init.db || ''); W('cfg', { mode: 'local', url: '', user: '', folder: '/Stoic Ranger/', file: 'fieldkit.xlsx', changed: '' }); W('pw', ''); W('files', {}); W('log', []); }
  const files = () => S('files'), saveFiles = f => W('files', f), log = e => { const l = S('log'); l.push(e); W('log', l); };
  let n = 0;
  window.__nc = { files, saveFiles, log: () => S('log'), hook: null };
  window.FKNative = {
    loadDb: () => S('db') || '', loadDbBackup: () => '', saveDb: t => { W('db', t); return true; }, backupDb: () => true,
    isNight: () => false, appInfo: () => '{"version":"0.2.0","code":6}', keepScreenOn() {}, hasLocation: () => false, openAppSettings() {},
    srStatus: () => JSON.stringify({ installed: !!init.sr, version: '1.3.0' }), srCall: () => init.srJson || '{"error":"no-provider"}',
    print() {}, printAsset() {}, shareAsset() {}, saveFile() {}, backLog: () => '',
    syncGet: () => { const c = S('cfg'); return JSON.stringify(Object.assign({}, c, { hasPassword: !!S('pw') })); },
    syncSet: (j, pw, ch) => { const o = JSON.parse(j); if (o.mode === 'nextcloud' && !/^https:\/\//.test(o.url)) return false; W('cfg', Object.assign(o, { changed: ch || new Date().toISOString() })); if (pw != null) W('pw', pw); return true; },
    linkCall: (pkg, m) => m === 'storage' ? JSON.stringify(init.srStorage || { error: 'unknown method' }) : JSON.stringify(init.srStorage ? { ok: true } : { error: 'unknown method' }),
    linkAdoptStorage: () => { if (!init.srStorage) return false; W('cfg', Object.assign({}, init.srStorage)); W('pw', 'from-sr'); return true; },
    ncRequest: (method, path, b64, ifMatch, depth, cb) => {
      setTimeout(() => {
        const f = files(); let r = { status: 0 };
        log([method, path, ifMatch || '']);
        if (window.__nc.hook) window.__nc.hook(method, path);
        const F = files();
        if (S('pw') !== 'secret' && S('pw') !== 'from-sr') r = { status: 401 };
        else if (method === 'MKCOL') r = { status: F[path] ? 405 : 201 }, F[path] = F[path] || { dir: true }, saveFiles(F);
        else if (method === 'GET') r = F[path] && !F[path].dir ? { status: 200, etag: F[path].etag, body: F[path].b64 } : { status: 404 };
        else if (method === 'PUT') {
          const cur = F[path];
          if (ifMatch === '*new*' && cur) r = { status: 412 };
          else if (ifMatch && ifMatch !== '*new*' && (!cur || cur.etag !== ifMatch)) r = { status: 412 };
          else { F[path] = { b64, etag: '"e' + (++n) + Date.now() + '"' }; saveFiles(F); r = { status: cur ? 204 : 201 }; }
        } else if (method === 'DELETE') { delete F[path]; saveFiles(F); r = { status: 204 }; }
        else if (method === 'PROPFIND') {
          const xml = '<d:multistatus xmlns:d="DAV:">' + Object.keys(F).filter(k => k.startsWith(path) && k !== path).map(k => '<d:response><d:href>/remote.php/dav/files/u' + encodeURI(k) + '</d:href></d:response>').join('') + '</d:multistatus>';
          r = { status: 207, body: btoa(xml) };
        }
        window.FKNativeCallback(cb, r);
      }, 5);
    },
  };
}
const browser = await chromium.launch();
async function open(init) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  await p.addInitScript(BRIDGE, init);
  await p.goto(URL0); await p.waitForTimeout(400);
  return p;
}
const wbInfo = (p, path) => p.evaluate(path => { const f = __nc.files()[path]; if (!f) return null; const wb = XLSX.read(Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)), { type: 'array' });
  return { names: wb.SheetNames, hidden: (wb.Workbook && wb.Workbook.Sheets || []).filter(s => s.Hidden).map(s => s.name), pts: wb.Sheets.FK_Points ? XLSX.utils.sheet_to_json(wb.Sheets.FK_Points) : [], weapons: wb.Sheets.Weapons ? XLSX.utils.sheet_to_json(wb.Sheets.Weapons) : null }; }, path);
const syncSettle = async p => { await p.waitForTimeout(100); await p.evaluate(() => FKSync.sync('test')); await p.waitForTimeout(600); };

// --- 1: linked with Stoic Ranger, database.xlsx already holds SR's sheets ---
const db = JSON.stringify({ app: 'sr-field-kit', format: 1, data: { link: { linked: true }, 'sr-points': [{ uid: 'p-a', name: 'Car', lat: 47.1, lon: 13.1 }, { uid: 'p-b', name: 'Camp', lat: 47.2, lon: 13.2 }], 'sr-breath': { '2026-11-06': 300 } } });
const p = await open({ db, sr: true, srJson: '{"weapons":[],"munitions":[],"v0":{}}' });
await p.evaluate(() => { // SR's existing file, made the way SR writes it (Weapons + hidden _StoicRanger)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'Name'], ['W-001', 'Tikka']]), 'Weapons');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['stoic-ranger-database', 1], ['{"x":1}']]), '_StoicRanger');
  wb.Workbook = { Sheets: [{ name: 'Weapons', Hidden: 0 }, { name: '_StoicRanger', Hidden: 1 }] };
  const u8 = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); let s = ''; u8.forEach(c => s += String.fromCharCode(c));
  const F = __nc.files(); F['/Stoic Ranger/database.xlsx'] = { b64: btoa(s), etag: '"sr1"' }; __nc.saveFiles(F);
});
await p.click('#aboutBtn');
await p.check('input[name="stm"][value="nextcloud"]');
await p.fill('#ncUrl', 'http://cloud.example.com'); await p.click('#ncSave');
ok(/https/.test(await p.$eval('#ncStatus', e => e.textContent)), 'Nextcloud address must be https');
await p.fill('#ncUrl', 'https://cloud.example.com'); await p.fill('#ncUser', 'manuel'); await p.fill('#ncPw', 'secret');
ok(/database\.xlsx/.test(await p.$eval('#ncFileNote', e => e.textContent)), 'linked: the shared file is database.xlsx');
await p.click('#ncSave'); await p.waitForTimeout(800);
let w = await wbInfo(p, '/Stoic Ranger/database.xlsx');
ok(w && w.names.includes('Weapons') && w.names.includes('_StoicRanger') && w.weapons[0].Name === 'Tikka', 'Stoic Ranger sheets kept unchanged');
ok(w.hidden.includes('_StoicRanger') && w.hidden.includes('_FK_Data'), 'hidden sheets stay hidden (_StoicRanger, _FK_Data)');
ok(['FK_Points', 'FK_Breathing', 'FK_DropWind', 'FK_Settings'].every(n => w.names.includes(n)) && w.pts.length === 2, 'Field Kit sheets written (2 points)');
const bk = Object.keys(await p.evaluate(() => __nc.files())).filter(k => k.startsWith('/Stoic Ranger/backups/database-'));
ok(bk.length === 1, 'backup of the old file before the upload');
ok((await p.evaluate(() => __nc.log())).some(l => l[0] === 'PUT' && l[1] === '/Stoic Ranger/database.xlsx' && l[2] === '"sr1"'), 'upload with If-Match: the downloaded ETag');
ok(/Synced with Nextcloud/.test(await p.$eval('#ncStatus', e => e.textContent)), 'status line shows the last sync');
ok(!(await p.evaluate(() => JSON.stringify(sessionStorage))).includes('"password"') && !(await p.evaluate(() => sessionStorage.getItem('db'))).includes('secret'), 'app password not in db.json');

// --- 2: edited in Excel + deleted on the phone ---
await p.evaluate(() => {
  const F = __nc.files(), f = F['/Stoic Ranger/database.xlsx'];
  const wb = XLSX.read(Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.FK_Points, { header: 1 });
  rows[1][0] = 'Car park';                                  // renamed in Excel
  rows.push(['Spring', 47.3, 13.3, '', '']);                // new row in Excel, no uid
  wb.Sheets.FK_Points = XLSX.utils.aoa_to_sheet(rows);
  const u8 = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); let s = ''; u8.forEach(c => s += String.fromCharCode(c));
  F['/Stoic Ranger/database.xlsx'] = { b64: btoa(s), etag: '"excel1"' }; __nc.saveFiles(F);
  const pts = FKStore.get('sr-points', []).filter(x => x.uid !== 'p-b'); FKStore.put('sr-points', pts); FKStore.flush();   // Camp deleted on the phone
});
await syncSettle(p); await p.waitForTimeout(800);
const names = await p.evaluate(() => FKStore.get('sr-points', []).map(x => x.name).sort().join(','));
ok(names === 'Car park,Spring', 'merge: renamed in Excel + added in Excel come in, deleted on the phone stays deleted (' + names + ')');
w = await wbInfo(p, '/Stoic Ranger/database.xlsx');
ok(w.pts.length === 2 && w.pts.every(r => r['Source uid']), 'file has the merged points, each with a Source uid');

// --- 3: 412 when someone saves in between → retry ---
await p.evaluate(() => { let once = true; __nc.hook = (m, path) => { if (once && m === 'PUT' && path === '/Stoic Ranger/database.xlsx') { once = false; const F = __nc.files(); F[path].etag = '"other"'; __nc.saveFiles(F); } }; });
const r412 = await p.evaluate(() => FKSync.sync('test'));
ok(r412 && r412.ok, 'saved elsewhere in between (412): downloads, merges and retries ' + JSON.stringify(r412) + ' ' + JSON.stringify((await p.evaluate(() => __nc.log())).slice(-8)));
await p.evaluate(() => { __nc.hook = null; });

// --- 4: newest 30 backups kept, only our own file's ---
await p.evaluate(() => { const F = __nc.files(); for (let i = 0; i < 35; i++) F['/Stoic Ranger/backups/database-202601' + String(i % 28 + 1).padStart(2, '0') + '-0000' + String(i).padStart(2, '0') + '.xlsx'] = { b64: '', etag: 'x' }; F['/Stoic Ranger/backups/gunsafe-20260101-000000.xlsx'] = { b64: '', etag: 'x' }; __nc.saveFiles(F); });
await syncSettle(p);
const all = Object.keys(await p.evaluate(() => __nc.files()));
ok(all.filter(k => k.startsWith('/Stoic Ranger/backups/database-')).length === 30 && all.includes('/Stoic Ranger/backups/gunsafe-20260101-000000.xlsx'), 'backups: newest 30 of database.xlsx kept, other apps\' backups untouched');

// --- 4b (0.5.0, #17): nothing new → no reload; new data → reload once, same topic and sub-tab open again ---
await p.evaluate(() => { location.hash = '#nav'; window.__marker = 1; document.querySelector('[data-ntab="map"]').click(); });
await p.waitForTimeout(15000); const r0 = await p.evaluate(() => FKSync.sync('test')); await p.waitForTimeout(800);
ok(r0 && r0.ok && r0.changed === false && await p.evaluate(() => window.__marker === 1), 'sync with nothing new: no change reported, page not reloaded (' + JSON.stringify(r0) + ')');
ok(await p.evaluate(() => FKSync.same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })), 'same(): key order does not matter');
await p.evaluate(() => { const F = __nc.files(), f = F['/Stoic Ranger/database.xlsx']; const wb = XLSX.read(Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.FK_Points, { header: 1 }); rows.push(['Hut', 47.4, 13.4, '', '']); wb.Sheets.FK_Points = XLSX.utils.aoa_to_sheet(rows);
  const u8 = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })); let s = ''; u8.forEach(c => s += String.fromCharCode(c)); F['/Stoic Ranger/database.xlsx'] = { b64: btoa(s), etag: '"excel2"' }; __nc.saveFiles(F); });
await p.evaluate(() => FKSync.sync('test')); await p.waitForTimeout(2500);
ok(await p.evaluate(() => window.__marker === undefined && FKStore.get('sr-points', []).some(x => x.name === 'Hut')), 'new data from Nextcloud: page reloaded once with the new point');
ok(await p.evaluate(() => location.hash === '#nav' && document.querySelector('[data-ntab="map"]').getAttribute('aria-pressed') === 'true'), 'after the reload the same topic and sub-tab (Navigate › Map & routes) are open');
await p.waitForTimeout(2500);
const r1 = await p.evaluate(() => { window.__marker = 2; return FKSync.sync('test'); }); await p.waitForTimeout(800);
ok(r1 && r1.changed === false && await p.evaluate(() => window.__marker === 2), 'the sync after the reload finds nothing new: no reload loop');

// --- 5: back to local: nothing deleted on Nextcloud ---
await p.click('#aboutBtn'); await p.check('input[name="stm"][value="local"]'); await p.click('#ncSave'); await p.waitForTimeout(300);
ok((await p.evaluate(() => __nc.files()))['/Stoic Ranger/database.xlsx'] && !(await p.evaluate(() => __nc.log())).some(l => l[0] === 'DELETE' && !l[1].includes('/backups/')), 'back to local: the file stays on Nextcloud, phone data kept');
ok(await p.evaluate(() => FKStore.get('sr-points', []).length) === 3, 'back to local: points still on the phone');
ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
await p.context().close();

// --- 6: wrong app password ---
{
  const q = await open({ db: '' });
  await q.click('#aboutBtn'); await q.check('input[name="stm"][value="nextcloud"]');
  await q.fill('#ncUrl', 'https://cloud.example.com'); await q.fill('#ncUser', 'm'); await q.fill('#ncPw', 'wrong'); await q.click('#ncSave'); await q.waitForTimeout(500);
  ok(/refused the login/.test(await q.$eval('#ncStatus', e => e.textContent)), 'wrong app password: clear message');
  ok(/fieldkit\.xlsx/.test(await q.$eval('#ncFileNote', e => e.textContent)), 'not linked: own file fieldkit.xlsx');
  await q.context().close();
}
// --- 7: linked app has a newer Nextcloud setting → adopted on start ---
{
  const q = await open({ db: JSON.stringify({ app: 'sr-field-kit', format: 1, data: { link: { linked: true } } }), sr: true, srJson: '{"weapons":[],"munitions":[],"v0":{}}',
    srStorage: { mode: 'nextcloud', url: 'https://cloud.example.com', user: 'manuel', folder: '/Stoic Ranger/', file: 'database.xlsx', changed: '2099-01-01T00:00:00Z', hasPassword: true } });
  await q.waitForTimeout(2500);
  const c = await q.evaluate(() => FKSync.cfg());
  ok(c.mode === 'nextcloud' && c.file === 'database.xlsx', 'linked app\'s newer storage setting adopted on start (one setting for all linked apps)');
  ok(!!(await q.evaluate(() => __nc.files()))['/Stoic Ranger/database.xlsx'], 'and synced into the shared database.xlsx');
  await q.context().close();
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
