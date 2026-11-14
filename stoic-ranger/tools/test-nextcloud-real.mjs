/* Stoic Ranger Shooting — the sync against a REAL Nextcloud (1.3.1, 1.4.0).
   node stoic-ranger/tools/test-nextcloud-real.mjs <https base> <user> <app password> <excel-made database.xlsx>
   The page runs with a bridge whose ncRequest does what Nextcloud.java/DavHttp does, as a synchronous request to the
   server (tools/test-nextcloud.sh starts Nextcloud in Docker with an https proxy that allows the test page in).
   Checks: first connect with a file made in Excel (no hidden sheet, no Source uid) pulls its data, adds nothing twice,
   repeated syncs add nothing, the file on Nextcloud opens (zip + sheets) after every upload, backups are made.
   1.4.0: no shooter in the data any more ("Shot by <name>" for others), Excel drop-downs kept (also where a column moved),
   delete on all devices with two devices (two browser contexts = two phones): a delete reaches the other device and
   stays gone, also when the old Excel file comes back; Undo comes back everywhere; Replace makes a backup first. */
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
    loadDb: () => g('m.db') || '', saveDb: t => { s('m.db', t); return true; }, backupDb: n => { s('m.backup.' + n, g('m.db') || ''); return true; }, loadDbBackup: () => '',
    loadData: n => n === 'xlsxbase' ? g('m.xb') || '' : '', saveData: (n, t) => { if (n === 'xlsxbase') s('m.xb', t); return true; },
    backupData: () => true, loadDataBackup: () => '', isNight: () => false, getSecret: () => '', setSecret() { },
    appInfo: () => JSON.stringify({ version: '1.4.0', code: 15, android: '14', device: cfg || 'test' }),
    deviceName: () => cfg || 'test',
    shareFile() { }, shareText() { }, print() { }, printSized() { },
    ncState: () => g('m.nc') || JSON.stringify({ mode: 'local', folder: '/Stoic Ranger/', hasPassword: false }),
    ncSet: (json, pw) => { const o = JSON.parse(json), cur = JSON.parse(g('m.nc') || '{}'); Object.assign(cur, o); if (pw) { cur.hasPassword = true; s('m.pw', pw); } s('m.nc', JSON.stringify(cur)); return true; },
    ncTry: (json, pw, m, name, hj) => req(JSON.parse(json), pw, m, name, hj, ''),
    ncRequest: (m, name, hj, b64) => req(JSON.parse(g('m.nc')), g('m.pw'), m, name, hj, b64),
    takeLinkInbox: () => '', linkStorage: () => '[]', linkAdopt: () => false, linkPush: () => '[]',
  };
};
const sheetsOf = buf => {   // the file on Nextcloud: a valid xlsx? its sheets and row counts, drop-downs by column header (openpyxl, like Excel)
  const f = '/tmp/claude-nc-check.xlsx'; fs.writeFileSync(f, buf);
  try { return JSON.parse(execFileSync('python3', ['-I', '-c', `import openpyxl,json,sys,zipfile,re
z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip()
wb=openpyxl.load_workbook(sys.argv[1])
dv=[]
for ws in wb.worksheets:
  head=[c.value for c in ws[1]]
  for v in ws.data_validations.dataValidation:
    for rg in str(v.sqref).split():
      col=openpyxl.utils.column_index_from_string(re.match('[A-Z]+',rg).group(0))
      dv.append(ws.title+'.'+str(head[col-1] if col<=len(head) else '?')+'='+str(v.formula1))
heads={ws.title:[c.value for c in ws[1]] for ws in wb.worksheets}
print(json.dumps({'ok':bad is None,'sheets':{ws.title:sum(1 for r in ws.iter_rows(values_only=True) if any(c not in (None,'') for c in r)) for ws in wb.worksheets},'dv':sorted(dv),'heads':heads}))`, f]).toString()); }
  catch (e) { return { ok: false, error: String(e.stderr || e) }; }
};

// the Excel-made file goes to Nextcloud first (like Manuel did)
ok((await dav('MKCOL', '')).status === 201, 'test folder made on Nextcloud');
const src = fs.readFileSync(XLSX);
ok((await dav('PUT', 'database.xlsx', src)).status === 201, 'Excel-made database.xlsx uploaded (' + src.length + ' bytes)');
const before = sheetsOf(src);
console.log('  file has', JSON.stringify(before.sheets));
console.log('  drop-downs', JSON.stringify(before.dv));

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const CLOUD = 'https://cloud.test';
const CORS = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'GET,HEAD,PUT,DELETE,MKCOL,COPY,MOVE,PROPFIND', 'access-control-allow-headers': 'authorization,depth,destination,overwrite,if-match,if-none-match,content-type', 'access-control-expose-headers': 'etag,oc-etag,last-modified,content-length', 'access-control-allow-private-network': 'true' };
const errors = [];
/** One phone: its own browser context (own storage), the app pages from the source, Nextcloud through this script. */
async function device(name) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 393, height: 852 } });
  await ctx.route(ORIGIN + '/**', r => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname), f = path.join(WWW, p.replace(/^\/www\//, ''));
    if (!p.startsWith('/www/') || !f.startsWith(WWW) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  // the page talks to https://cloud.test; each request is passed on to the real Nextcloud by this script (no CORS on the server)
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
  await ctx.addInitScript(MOCK, name);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto(`${ORIGIN}/www/index.html`); await page.waitForTimeout(800);
  return page;
}
const count = pg => pg.evaluate(() => { const d = SR.db, n = t => (d[t] || []).filter(r => !r.example).length, ex = t => (d[t] || []).filter(r => r.example).length;
  return { weapons: n('weapons'), munitions: n('munitions'), trainers: n('trainers'), trainings: n('trainings'), results: n('results'), barrels: n('barrels'), exMunitions: ex('munitions'),
    shooters: 'shooters' in d, shotBy: (d.trainings || []).filter(t => /Shot by/.test(t.remarks || '')).map(t => t.id + ':' + t.remarks).sort(),
    withShooter: ['trainings', 'results', 'sheets', 'roundsLog'].reduce((a, t) => a + (d[t] || []).filter(r => 'shooterId' in r).length, 0) }; });
const sync = pg => pg.evaluate(() => { SR.flush(); const a = SR.xlsx.syncIn(), b = SR.xlsx.syncOut(); return (a && a.error) || (b && b.error) || ''; });
const fileNow = async () => sheetsOf(Buffer.from(await (await dav('GET', 'database.xlsx')).arrayBuffer()));

const A = await device('Phone A');
// like a new phone: the Gun Database's example data is in (Manuel still saw the sample ammunition after the sync)
await A.goto(`${ORIGIN}/www/gun/index.html`); await A.waitForTimeout(800);
await A.evaluate(() => RB.loadExamples()); await A.waitForTimeout(300);
await A.goto(`${ORIGIN}/www/index.html`); await A.waitForTimeout(800);
const c0 = await count(A); console.log('  app before:', JSON.stringify(c0));
ok(c0.exMunitions > 0, 'example ammunition is there before the sync (' + c0.exMunitions + ')');
const connect = pg => pg.evaluate(([u, us, f, pw]) => SR.storage.connect({ url: u, user: us, folder: f }, pw), ['https://cloud.test', USER, FOLDER, PW]);
const r1 = await connect(A);
ok(r1.ok, 'connect and first sync: ' + JSON.stringify(r1.ok ? r1.merged && r1.merged.stats : r1.msg));
const c1 = await count(A); console.log('  app after connect:', JSON.stringify(c1));
const want = before.sheets;
ok(c1.exMunitions === 0, 'the example ammunition is gone once the real ammunition came in');
ok(c1.munitions >= (want.Munitions || 1) - 1, `ammunition from the file is in the app (${c1.munitions}, file rows incl. header ${want.Munitions})`);
ok(c1.weapons >= (want.Weapons || 1) - 1, `guns from the file are in the app (${c1.weapons})`);
ok(c1.trainings === (want.Trainings || 1) - 1, `every training of the file is in the app (${c1.trainings})`);
ok(!c1.shooters && !c1.withShooter, '1.4.0 (#20): no shooters table and no shooter field in the app');
const others = await A.evaluate(() => SR.db.settings.common.meName);
console.log('  the user is', others, '· others:', JSON.stringify(c1.shotBy));
let chk = await fileNow(); ok(chk.ok, 'database.xlsx on Nextcloud opens after the first upload ' + JSON.stringify(chk.sheets || chk.error).slice(0, 300));
ok(!chk.sheets.Shooters && !chk.heads.Trainings.includes('Shooter') && !chk.heads.Drill_Results.includes('Shooter') && !chk.heads.Datasheets.includes('Shooter'), '1.4.0 (#20): the file has no Shooters sheet and no Shooter column');
const wantDv = before.dv.filter(x => !x.startsWith('Shooters.'));
ok(JSON.stringify(chk.dv) === JSON.stringify(wantDv), `#25: the Excel drop-downs are kept, on the right columns (${chk.dv.length} of ${before.dv.length}; the Shooters sheet's one went with it) ` + JSON.stringify(chk.dv));
for (let i = 2; i <= 4; i++) { await sync(A); await A.reload(); await A.waitForTimeout(600); }
const c4 = await count(A);
ok(JSON.stringify(c4) === JSON.stringify(c1), 'four more syncs (with app restarts) change nothing');
chk = await fileNow(); ok(chk.ok && JSON.stringify(chk.dv) === JSON.stringify(wantDv), 'database.xlsx on Nextcloud still opens, drop-downs still there');
// Manuel's case: the Excel-made file (no Source uid, still with shooters) is put on Nextcloud again over the app's file
ok((await dav('PUT', 'database.xlsx', src)).status === 204, 'the Excel-made file uploaded again over the synced one');
await sync(A); await A.reload(); await A.waitForTimeout(600);
const c5 = await count(A);
ok(JSON.stringify(c5) === JSON.stringify(c1), 'nothing added twice and no second "Shot by" when the old Excel file comes back (trainings ' + c5.trainings + ')');
chk = await fileNow();
ok(chk.ok && chk.sheets.Trainings === want.Trainings && !chk.sheets.Shooters, 'the file on Nextcloud has no copies either ' + JSON.stringify(chk.sheets));

// two devices: phone B joins the same folder
const B = await device('Phone B');
const rB = await connect(B);
const cB = await count(B);
ok(rB.ok && cB.weapons === c1.weapons && cB.trainings === c1.trainings && cB.munitions === c1.munitions, 'phone B connects and has the same data ' + JSON.stringify(cB));
// delete a gun on A
const gone = await A.evaluate(() => { const w = SR.db.weapons.filter(x => !x.example).find(x => SR.db.trainings.some(t => (t.weapons || []).some(g => g.weaponId === x.id))) || SR.db.weapons.filter(x => !x.example)[0]; return { id: w.id, uid: w.uid, name: w.name }; });
await A.goto(`${ORIGIN}/www/gun/index.html`); await A.waitForTimeout(800);
await A.evaluate(id => { RB.db.weapons = RB.db.weapons.filter(x => x.id !== id); RB.save(true); }, gone.id);
await A.goto(`${ORIGIN}/www/index.html`); await A.waitForTimeout(800);
let e = await sync(A);
const inA = await A.evaluate(id => ({ has: SR.db.weapons.some(w => w.id === id), tomb: SR.db.deleted.some(d => d.id === id), list: SR.deleted.recent().map(d => d.label) }), gone.id);
ok(!e && !inA.has && inA.tomb && inA.list.includes(gone.name), `delete "${gone.name}" on phone A: gone, in Recently deleted, tombstone made`);
chk = await fileNow();
ok(chk.ok && chk.sheets._Deleted === 2 && chk.sheets.Weapons === want.Weapons - 1, 'Nextcloud: the gun is out of Weapons, the _Deleted sheet has its row');
ok(chk.sheets.Rounds_Log === want.Rounds_Log, `Rounds_Log holds only rounds entered by hand, not the ones made from trainings (${chk.sheets.Rounds_Log} rows, the PC dashboard would count them twice)`);
const keptT = await A.evaluate(id => SR.db.trainings.filter(t => (t.weapons || []).some(w => w.weaponId === id && w.name)).length, gone.id);
ok(keptT > 0 && (await count(A)).trainings === c1.trainings, `the trainings with that gun stay, with its name (${keptT})`);
e = await sync(B);
ok(!e && !(await B.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id)), 'phone B syncs: the gun is gone there too');
await sync(B); await sync(A); await sync(B);
ok(!(await A.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id)) && !(await B.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id)), 'more syncs both ways: it does not come back');
// the old Excel file (with that gun, no _Deleted sheet) comes back once more
await dav('PUT', 'database.xlsx', src);
await sync(B); await sync(A);
ok(!(await A.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id)) && !(await B.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id)), 'even the old Excel file with its row does not bring it back');
console.log('  A guns:', JSON.stringify(await A.evaluate(() => SR.db.weapons.map(w => w.id + ' ' + w.name + ' ' + (w.uid || '').slice(0, 8)))), ' B guns:', JSON.stringify(await B.evaluate(() => SR.db.weapons.map(w => w.id + ' ' + w.name + ' ' + (w.uid || '').slice(0, 8)))), JSON.stringify(gone));
chk = await fileNow(); ok(chk.ok && chk.sheets._Deleted === 2 && chk.sheets.Weapons === want.Weapons - 1, 'and the file is right again after the next upload ' + JSON.stringify(chk.sheets));
// Undo on A comes back on B
const key = await A.evaluate(() => SR.deleted.recent()[0].key);
await A.evaluate(k => SR.deleted.undo(k), key);
await sync(A); await sync(B);
ok(await B.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id) && await A.evaluate(id => SR.db.weapons.some(w => w.id === id), gone.id), 'Undo on phone A: the gun is back on both phones');
// Replace on B: a local entry that never went out goes, a backup first
await B.evaluate(() => { SR.db.weapons.push({ id: 'W-LOCAL', uid: 'uid-local-only', name: 'Only on B', type: 'Rifle' }); SR.save(); });
const rr = await B.evaluate(() => SR.storage.replace());
const cR = await count(B);
ok(rr.ok && !(await B.evaluate(() => SR.db.weapons.some(w => w.uid === 'uid-local-only'))) && cR.weapons === c1.weapons && await B.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('m.backup.db-before-replace-'))), 'Replace on phone B: same data as Nextcloud, the local-only entry went, a backup was made first');
chk = await fileNow(); ok(chk.ok && JSON.stringify(chk.dv) === JSON.stringify(wantDv), 'the file on Nextcloud opens and keeps its drop-downs at the end ' + JSON.stringify(chk.sheets));
const prop = await (await dav('PROPFIND', 'backups', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>', { Depth: '1' })).text();
ok(/database-\d{8}-\d{6}\.xlsx/.test(prop), 'backups/ holds copies made before the uploads');
ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
await dav('DELETE', '');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
