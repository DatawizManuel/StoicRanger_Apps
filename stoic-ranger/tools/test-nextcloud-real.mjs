/* Stoic Ranger Shooting — the sync against a REAL Nextcloud (1.3.1).
   node stoic-ranger/tools/test-nextcloud-real.mjs <https base> <user> <app password> <excel-made database.xlsx>
   The page runs with a bridge whose ncRequest does what Nextcloud.java/DavHttp does, as a synchronous request to the
   server (tools/test-nextcloud.sh starts Nextcloud in Docker with an https proxy that allows the test page in).
   Checks: first connect with a file made in Excel (no hidden sheet, no Source uid) pulls its data, adds nothing twice,
   repeated syncs add nothing, the file on Nextcloud opens (zip + sheets) after every upload, backups are made. */
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const [BASE, USER, PW, XLSX] = process.argv.slice(2);
const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../app/src/main/assets/www');
const ORIGIN = 'https://appassets.androidplatform.net';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const FOLDER = 'SR real ' + Date.now();
const auth = 'Basic ' + Buffer.from(USER + ':' + PW).toString('base64');
const dav = (m, name, body, h = {}) => fetch(`${BASE}/remote.php/dav/files/${encodeURIComponent(USER)}/${encodeURIComponent(FOLDER)}/${name}`, { method: m, headers: Object.assign({ Authorization: auth }, h), body });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const MOCK = (cfg) => {
  const L = localStorage, g = k => L.getItem(k), s = (k, v) => L.setItem(k, v);
  const enc = x => encodeURIComponent(x);
  const urlOf = (o, name) => { let b = o.url.replace(/\/+$/, ''); if (!b.includes('/remote.php/')) b += '/remote.php/dav/files/' + enc(o.user); (o.folder + '/' + name).split('/').filter(Boolean).forEach(x => { b += '/' + enc(x); }); return b + (name ? '' : '/'); };
  const req = (o, pw, m, name, hj, b64) => {
    try {
      const h = JSON.parse(hj || '{}'), x = new XMLHttpRequest();
      if (h['X-Dest-Name']) { h.Destination = urlOf(o, h['X-Dest-Name']); delete h['X-Dest-Name']; }
      x.open(m, urlOf(o, name), false);
      x.overrideMimeType('text/plain; charset=x-user-defined');
      x.setRequestHeader('Authorization', 'Basic ' + btoa(o.user + ':' + pw));
      Object.entries(h).forEach(([k, v]) => x.setRequestHeader(k, v));
      x.send(b64 ? Uint8Array.from(atob(b64), c => c.charCodeAt(0)) : null);
      const hs = {}; x.getAllResponseHeaders().trim().split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) hs[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
      let bin = ''; const t = x.responseText || ''; for (let i = 0; i < t.length; i++) bin += String.fromCharCode(t.charCodeAt(i) & 255);
      return JSON.stringify({ status: x.status, headers: hs, body: btoa(bin) });
    } catch (e) { return JSON.stringify({ status: 0, error: String(e) }); }
  };
  window.SRNative = {
    loadDb: () => g('m.db') || '', saveDb: t => { s('m.db', t); return true; }, backupDb: () => true, loadDbBackup: () => '',
    loadData: n => n === 'xlsxbase' ? g('m.xb') || '' : '', saveData: (n, t) => { if (n === 'xlsxbase') s('m.xb', t); return true; },
    backupData: () => true, loadDataBackup: () => '', isNight: () => false, getSecret: () => '', setSecret() { },
    appInfo: () => JSON.stringify({ version: '1.3.1', code: 14, android: '14', device: 'test' }),
    shareFile() { }, shareText() { }, print() { }, printSized() { },
    ncState: () => g('m.nc') || JSON.stringify({ mode: 'local', folder: '/Stoic Ranger/', hasPassword: false }),
    ncSet: (json, pw) => { const o = JSON.parse(json), cur = JSON.parse(g('m.nc') || '{}'); Object.assign(cur, o); if (pw) { cur.hasPassword = true; s('m.pw', pw); } s('m.nc', JSON.stringify(cur)); return true; },
    ncTry: (json, pw, m, name, hj) => req(JSON.parse(json), pw, m, name, hj, ''),
    ncRequest: (m, name, hj, b64) => req(JSON.parse(g('m.nc')), g('m.pw'), m, name, hj, b64),
    takeLinkInbox: () => '', linkStorage: () => '[]', linkAdopt: () => false, linkPush: () => '[]',
  };
};
const sheetsOf = buf => {   // the file on Nextcloud: a valid xlsx? its sheets and row counts (python openpyxl, like Excel would check)
  const f = '/tmp/claude-nc-check.xlsx'; fs.writeFileSync(f, buf);
  try { return JSON.parse(execFileSync('python3', ['-I', '-c', `import openpyxl,json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip()
wb=openpyxl.load_workbook(sys.argv[1],read_only=True)
print(json.dumps({'ok':bad is None,'sheets':{ws.title:sum(1 for r in ws.iter_rows(values_only=True) if any(c not in (None,'') for c in r)) for ws in wb.worksheets}}))`, f]).toString()); }
  catch (e) { return { ok: false, error: String(e.stderr || e) }; }
};

// the Excel-made file goes to Nextcloud first (like Manuel did)
ok((await dav('MKCOL', '')).status === 201, 'test folder made on Nextcloud');
const src = fs.readFileSync(XLSX);
ok((await dav('PUT', 'database.xlsx', src)).status === 201, 'Excel-made database.xlsx uploaded (' + src.length + ' bytes)');
const before = sheetsOf(src);
console.log('  file has', JSON.stringify(before.sheets));

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 393, height: 852 } });
await ctx.route(ORIGIN + '/**', r => {
  const p = decodeURIComponent(new URL(r.request().url()).pathname), f = path.join(WWW, p.replace(/^\/www\//, ''));
  if (!p.startsWith('/www/') || !f.startsWith(WWW) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: 'nf' });
  r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
// the page talks to https://cloud.test; each request is passed on to the real Nextcloud by this script (no CORS on the server)
const CLOUD = 'https://cloud.test';
const CORS = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'GET,HEAD,PUT,DELETE,MKCOL,COPY,MOVE,PROPFIND', 'access-control-allow-headers': 'authorization,depth,destination,overwrite,if-match,if-none-match,content-type', 'access-control-expose-headers': 'etag,oc-etag,last-modified,content-length', 'access-control-allow-private-network': 'true' };
await ctx.route(CLOUD + '/**', async r => {
  const q = r.request();
  if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
  const h = Object.assign({}, await q.allHeaders()); ['origin', 'referer', 'host', 'content-length'].forEach(k => delete h[k]);
  Object.keys(h).forEach(k => { if (k.startsWith('sec-') || k.startsWith(':')) delete h[k]; });
  if (h.destination) h.destination = h.destination.replace(CLOUD, BASE);
  const res = await fetch(q.url().replace(CLOUD, BASE), { method: q.method(), headers: h, body: q.postDataBuffer() || undefined, redirect: 'manual' });
  const rh = {}; res.headers.forEach((v, k) => { if (k !== 'set-cookie' && k !== 'content-encoding' && k !== 'transfer-encoding') rh[k] = v; });
  r.fulfill({ status: res.status, headers: Object.assign(rh, CORS), body: Buffer.from(await res.arrayBuffer()) });
});
await ctx.addInitScript(MOCK);
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${ORIGIN}/www/index.html`); await page.waitForTimeout(800);
const count = () => page.evaluate(() => { const d = SR.db, n = t => (d[t] || []).filter(r => !r.example).length, ex = t => (d[t] || []).filter(r => r.example).length;
  return { weapons: n('weapons'), munitions: n('munitions'), shooters: n('shooters'), trainers: n('trainers'), trainings: n('trainings'), barrels: n('barrels'), exMunitions: ex('munitions'), shooterNames: (d.shooters || []).filter(r => !r.example).map(r => r.name).sort() }; });
// like a new phone: the Gun Database's example data is in (Manuel still saw the sample ammunition after the sync)
await page.goto(`${ORIGIN}/www/gun/index.html`); await page.waitForTimeout(800);
await page.evaluate(() => RB.loadExamples()); await page.waitForTimeout(300);
await page.goto(`${ORIGIN}/www/index.html`); await page.waitForTimeout(800);
const c0 = await count(); console.log('  app before:', JSON.stringify(c0));
ok(c0.exMunitions > 0, 'example ammunition is there before the sync (' + c0.exMunitions + ')');
const r1 = await page.evaluate(([u, us, f, pw]) => SR.storage.connect({ url: u, user: us, folder: f }, pw), ['https://cloud.test', USER, FOLDER, PW]);
ok(r1.ok, 'connect and first sync: ' + JSON.stringify(r1.ok ? r1.merged && r1.merged.stats : r1.msg));
const c1 = await count(); console.log('  app after connect:', JSON.stringify(c1));
const want = before.sheets;
ok(c1.exMunitions === 0, 'the example ammunition is gone once the real ammunition came in');
ok(c1.munitions >= (want.Munitions || 1) - 1, `ammunition from the file is in the app (${c1.munitions}, file rows incl. header ${want.Munitions})`);
ok(c1.weapons >= (want.Weapons || 1) - 1, `guns from the file are in the app (${c1.weapons})`);
const dupes = c1.shooterNames.filter((n, i, a) => a.indexOf(n) !== i);
ok(!dupes.length, 'no shooter twice after the first sync ' + JSON.stringify(c1.shooterNames));
let got = Buffer.from(await (await dav('GET', 'database.xlsx')).arrayBuffer());
let chk = sheetsOf(got); ok(chk.ok, 'database.xlsx on Nextcloud opens after the first upload ' + JSON.stringify(chk.sheets || chk.error).slice(0, 300));
for (let i = 2; i <= 4; i++) {
  await page.evaluate(() => { SR.flush(); SR.xlsx.syncIn(); SR.xlsx.syncOut(); });
  await page.reload(); await page.waitForTimeout(600);
}
const c4 = await count(); console.log('  app after 4 syncs:', JSON.stringify(c4));
ok(JSON.stringify(c4) === JSON.stringify(c1), 'four more syncs (with app restarts) change nothing');
got = Buffer.from(await (await dav('GET', 'database.xlsx')).arrayBuffer());
chk = sheetsOf(got); ok(chk.ok, 'database.xlsx on Nextcloud still opens');
ok(chk.sheets && chk.sheets.Shooters === want.Shooters, `Shooters sheet has as many rows as before (${chk.sheets && chk.sheets.Shooters} vs ${want.Shooters})`);
// Manuel's case: the Excel-made file (no Source uid) is put on Nextcloud again over the app's file
ok((await dav('PUT', 'database.xlsx', src)).status === 204, 'the Excel-made file uploaded again over the synced one');
await page.evaluate(() => { SR.flush(); SR.xlsx.syncIn(); SR.xlsx.syncOut(); }); await page.reload(); await page.waitForTimeout(600);
const c5 = await count(); console.log('  app after the Excel file came back:', JSON.stringify(c5));
ok(JSON.stringify(c5) === JSON.stringify(c1), 'nothing added twice when the Excel file comes back (shooters ' + JSON.stringify(c5.shooterNames) + ', trainings ' + c5.trainings + ')');
got = Buffer.from(await (await dav('GET', 'database.xlsx')).arrayBuffer()); chk = sheetsOf(got);
ok(chk.ok && chk.sheets.Shooters === want.Shooters && chk.sheets.Trainings === want.Trainings, 'the file on Nextcloud has no copies either ' + JSON.stringify(chk.sheets));
// a change in Excel comes in: a new ammunition row added on the PC (no uid) arrives once
// 1.3.0 left copies behind: three of every shooter, trainings twice → 1.3.1 merges them once, trainings keep pointing right
await page.evaluate(() => {
  const d = SR.db, cp = (r, id) => Object.assign(JSON.parse(JSON.stringify(r)), { id, uid: 'dup-' + Math.random().toString(36).slice(2) });
  const sh = d.shooters.filter(r => !r.example), n = sh.length;
  sh.forEach((r, i) => { d.shooters.push(cp(r, 'S-' + String(10 + i).padStart(3, '0'))); d.shooters.push(cp(r, 'S-' + String(20 + i).padStart(3, '0'))); });
  const t0 = d.trainings.find(t => t.shooterId); if (t0) { const c = cp(t0, t0.id); c.shooterId = 'S-010'; d.trainings.push(c); }
  delete d.settings.common.cleanup131; SR.save(true);
});
const dirty = await count(); console.log('  app with 1.3.0 copies:', JSON.stringify(dirty));
await page.reload(); await page.waitForTimeout(800);
const c6 = await count(); console.log('  app after the 1.3.1 clean-up:', JSON.stringify(c6));
ok(dirty.shooters === c1.shooters * 3 && JSON.stringify(c6) === JSON.stringify(c1), 'the copies are merged back into one (shooters ' + dirty.shooters + ' → ' + c6.shooters + ', trainings ' + dirty.trainings + ' → ' + c6.trainings + ')');
ok(await page.evaluate(() => SR.db.trainings.every(t => !t.shooterId || SR.db.shooters.some(s => s.id === t.shooterId))), 'every training still points at an existing shooter');
await page.evaluate(() => { SR.flush(); SR.xlsx.syncOut(); });
got = Buffer.from(await (await dav('GET', 'database.xlsx')).arrayBuffer()); chk = sheetsOf(got);
ok(chk.ok && chk.sheets.Shooters === want.Shooters, 'the cleaned list is on Nextcloud too ' + JSON.stringify(chk.sheets && chk.sheets.Shooters));
const prop = await (await dav('PROPFIND', 'backups', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>', { Depth: '1' })).text();
ok(/database-\d{8}-\d{6}\.xlsx/.test(prop), 'backups/ holds copies made before the uploads');
ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
await dav('DELETE', '');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
