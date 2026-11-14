/* SR GunSafe — the sync against a REAL Nextcloud (0.1.1). Started by tools/test-nextcloud.sh (Docker, https proxy).
   node gun-safe/tools/test-nextcloud-real.mjs <https base> <user> <app password> <database.xlsx>   (env NC_CLI)
   The page runs with a GSNative whose nc() calls the app's own WebDAV code (Nextcloud.java on the JVM, via NC_CLI).
   Checks: the WebDAV ops (bytes identical, If-Match/If-None-Match 412, wrong password 401); linked with SR Shooting,
   GunSafe syncs into SR Shooting's database.xlsx and keeps every SR Shooting sheet with the same cells (values and
   formulas); the file opens after each upload (zip test + openpyxl); backups are made; rows typed in Excel without ID
   come in once over repeated syncs; a file changed by someone else meanwhile is merged, not overwritten;
   0.1.2: delete on all devices with a second phone (_Deleted sheet, Recently deleted, Undo wins, other apps'
   tombstones kept) and "Replace this phone's data with the Nextcloud copy". */
import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const [BASE, USER, PW, XLSX] = process.argv.slice(2);
const CLI = process.env.NC_CLI;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PAGE = 'file://' + path.join(ROOT, 'app/src/main/assets/www/index.html');
const FOLDER = 'GS real ' + Date.now() + '/';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-nc-'));
let fails = 0, n = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

/** One op of Nextcloud.java, like MainActivity.nc: b64 in, {ok,status,etag,msg,names,data} out. */
function nc(op, p, b64, ifMatch, pw = PW) {
  const inF = path.join(TMP, 'in' + (++n)), outF = path.join(TMP, 'out' + n);
  if (b64) fs.writeFileSync(inF, Buffer.from(b64, 'base64'));
  const o = JSON.parse(execFileSync(CLI, [BASE, USER, pw, op, p, b64 ? inF : '-', ifMatch || '-', outF], { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  if (o.hasData) o.data = fs.readFileSync(outF).toString('base64');
  return o;
}
/** The file as Excel would see it: zip intact, every sheet's cells (values and formulas). */
function cells(buf) {
  const f = path.join(TMP, 'check' + (++n) + '.xlsx'); fs.writeFileSync(f, buf);
  try {
    return JSON.parse(execFileSync('python3', ['-I', '-c', `import openpyxl,json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip()
wb=openpyxl.load_workbook(sys.argv[1])
out={}
for ws in wb.worksheets:
  out[ws.title]={'state':ws.sheet_state,'rows':[[('' if c is None else str(c)) for c in r] for r in ws.iter_rows(values_only=True)]}
print(json.dumps({'ok':bad is None,'sheets':out}))`, f]).toString());
  } catch (e) { return { ok: false, error: String(e.stderr || e) }; }
}
const trim = rows => rows.map(r => { const a = r.slice(); while (a.length && a[a.length - 1] === '') a.pop(); return a; }).filter(r => r.length);

// ---- 1. the WebDAV code itself ----
const orig = fs.readFileSync(XLSX), o64 = orig.toString('base64'), FILE = FOLDER + 'database.xlsx';
ok(nc('mkdirs', FOLDER).ok, 'MKCOL folder');
const p1 = nc('putNew', FILE, o64); ok(p1.ok, 'PUT new file (If-None-Match *) ' + p1.status);
ok(nc('putNew', FILE, o64).status === 412, 'PUT new on an existing file → 412');
const g1 = nc('get', FILE); ok(g1.ok && g1.data === o64 && g1.etag, 'GET gives the same bytes and an ETag');
ok(nc('put', FILE, o64, '"stale-etag"').status === 412, 'PUT with an old ETag → 412');
const p2 = nc('put', FILE, o64, g1.etag); ok(p2.ok, 'PUT with the current ETag');
ok(nc('get', FILE, '', '', 'wrong-password').status === 401, 'wrong password → 401');
ok((nc('list', FOLDER).names || []).includes('database.xlsx'), 'PROPFIND lists the file');
const before = cells(orig); ok(before.ok, 'the test file opens: ' + Object.keys(before.sheets || {}).join(', '));

// ---- 2. the app page syncing through it ----
const browser = await chromium.launch();
const errors = [];
const INIT = cfg => {
  const mem = { db: JSON.stringify({ app: 'sr-gunsafe', format: 1, data: { link: { sr: 'allowed' }, srCache: { weapons: [{ id: 'W1', name: 'SR gun', caliber: '6.5 Creedmoor' }], barrels: [], munitions: [], rounds: [], at: '' } } }), aux: {} };
  window.__mem = mem;
  window.GSNative = {
    loadDb: () => mem.db, saveDb: t => { mem.db = t; return true; }, loadDbBackup: () => '', backupDb: () => true,
    loadAux: k => mem.aux[k] || '', saveAux: (k, v) => { mem.aux[k] = v; return true; },
    isNight: () => false, appInfo: () => '{"version":"0.1.1"}', backLog: () => '',
    srStatus: () => '{"installed":false}', srCall: () => '{"error":"no-provider"}',
    storageGet: () => JSON.stringify({ mode: 'nextcloud', url: cfg.base, user: cfg.user, folder: '/' + cfg.folder, file: 'database.xlsx', changed: '', pwSet: true }),
    storageSet: j => j, storagePush: () => '{}', storagePull: () => window.GSNative.storageGet(), setLinked() { },
    nc: (op, p, b64, ifm, id) => { window.__nc(op, p, b64, ifm).then(o => window.GSNativeCallback(id, o)); },
  };
};
/** One phone: its own data, the same Nextcloud folder. */
async function phone() {
  const ctx = await browser.newContext(), p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e)));
  await p.exposeFunction('__nc', (op, q, b64, ifm) => nc(op, q, b64, ifm));
  await p.addInitScript(INIT, { base: BASE, user: USER, folder: FOLDER });
  await p.goto(PAGE);
  await p.waitForFunction(() => !GSSync.state().busy, null, { timeout: 60000 });
  return p;
}
const page = await phone();
const first = await page.evaluate(() => GSSync.state().last);
ok(first.ok, 'first sync on open: ' + first.msg);
await page.evaluate(() => {
  const d = GSStore.data;
  d.owners.push({ id: 'O1', name: 'Manuel', notes: '' });
  d.guns.push({ id: 'G1', name: 'Glock 17', type: 'Pistol', caliber: '9x19', roundsBeforeLog: 500, status: 'Active' });
  d.gunInfo.push({ id: 'W1', owners: ['O1'], fits: [] });
  d.service.push({ id: 'E1', date: '2026-11-14', weaponId: 'W1', kind: 'Cleaning', cleaningDone: true, note: 'ä ö ü ß €', changes: [], seq: 1 });
  d.munitions.push({ id: 'GM1', name: 'RWS 140', caliber: '6.5 Creedmoor' });
  d.moves.push({ id: 'A1', date: '2026-11-01', munitionId: 'GM1', kind: 'Purchase', qty: 200, price: 420, shop: 'Ortner', purpose: '' });
  GSStore.changed('sync');
});
const s2 = await page.evaluate(() => GSSync.sync('now')); ok(s2.ok, 'sync with GunSafe data: ' + s2.msg);
let g = nc('get', FILE), after = cells(Buffer.from(g.data, 'base64'));
ok(after.ok, 'the file on Nextcloud opens after the upload (zip test + openpyxl)');
const srSheets = Object.keys(before.sheets).filter(n => !/^(GS_|_GS_)/.test(n));
const diff = srSheets.filter(n => !after.sheets[n] || JSON.stringify(trim(after.sheets[n].rows)) !== JSON.stringify(trim(before.sheets[n].rows)) || after.sheets[n].state !== before.sheets[n].state);
ok(!diff.length, 'every SR Shooting sheet kept with the same cells and visibility (' + srSheets.length + ' sheets)' + (diff.length ? ' changed: ' + diff.join(', ') : ''));
ok(after.sheets.GS_Owners && after.sheets.GS_Service_Log.rows.some(r => r.includes('ä ö ü ß €')) && after.sheets._GS_Data.state === 'hidden', 'GS_ sheets written (umlauts kept), _GS_Data hidden');
const bk = (nc('list', FOLDER + 'backups/').names || []).filter(x => /^database-\d{8}-\d{6}\.xlsx$/.test(x));
ok(bk.length >= 1, 'backup made before the upload: ' + bk.join(', '));
const bk0 = nc('get', FOLDER + 'backups/' + bk[0]); ok(bk0.data === o64 || cells(Buffer.from(bk0.data, 'base64')).ok, 'the backup is the file as it was');

// ---- 3. edited in Excel elsewhere: a row without ID, and SR Shooting's data changed meanwhile ----
const edited = await page.evaluate(b64 => {
  const wb = XLSX.read(GSSync.unb64(b64), { type: 'array' });
  XLSX.utils.sheet_add_aoa(wb.Sheets.GS_Owners, [['', 'Ines', 'typed in Excel']], { origin: -1 });
  return GSSync.b64(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}, g.data);
ok(nc('put', FILE, edited, g.etag).ok, 'someone else saves the file (Excel row without ID)');
const counts = [];
for (let i = 0; i < 3; i++) {
  const r = await page.evaluate(() => GSSync.sync('now'));
  counts.push(r.ok + ':' + (await page.evaluate(() => GSStore.data.owners.filter(o => o.name === 'Ines').length)));
  const c = cells(Buffer.from(nc('get', FILE).data, 'base64'));
  counts.push('file:' + (c.ok ? c.sheets.GS_Owners.rows.filter(r => r[1] === 'Ines').length : 'broken'));
}
ok(counts.join() === 'true:1,file:1,true:1,file:1,true:1,file:1', 'row without ID comes in once over 3 syncs, also in the file: ' + counts.join());
const ids = await page.evaluate(() => GSStore.data.owners.map(o => o.id));
ok(new Set(ids).size === ids.length && ids.length === 2, 'owners keep unique IDs ' + ids);

// ---- 4. nothing changed → no upload ----
const e1 = nc('get', FILE).etag; await page.evaluate(() => GSSync.sync('now'));
const dbg = await page.evaluate(b64 => { const f = GSX.tablesOf(GSX.read(GSSync.unb64(b64)).data), a = GSX.tablesOf(GSStore.data); return GSX.TABLES.filter(t => JSON.stringify(f[t]) !== JSON.stringify(a[t])).map(t => t + ' file=' + JSON.stringify(f[t]).slice(0, 300) + ' app=' + JSON.stringify(a[t]).slice(0, 300)); }, nc('get', FILE).data);
const same = nc('get', FILE).etag === e1;
ok(same, 'a sync without changes uploads nothing' + (same ? '' : ' ' + dbg.join(' || ')));
// ---- 5. delete on all devices (contract E), with a second phone ----
const phone2 = await phone();
const p2s = await phone2.evaluate(() => GSStore.data.owners.map(o => o.name).sort().join());
ok(p2s === 'Ines,Manuel', 'second phone gets the data on its first sync: ' + p2s);
await page.evaluate(() => { GS.go('#settings'); });
await page.waitForTimeout(100);
await page.locator('[data-delown]').last().click(); await page.click('[data-x=ok]');      // delete "Ines" on phone 1
const d1 = await page.evaluate(() => GSSync.sync('now'));
const c5 = cells(Buffer.from(nc('get', FILE).data, 'base64'));
ok(d1.ok && c5.ok && c5.sheets._Deleted && c5.sheets._Deleted.state === 'hidden' && c5.sheets._Deleted.rows.some(r => r[0] === 'GS' && r[1] === 'GS_Owners' && r[4] === 'Ines'), 'the delete is in the hidden _Deleted sheet on Nextcloud');
ok(c5.ok && !c5.sheets.GS_Owners.rows.some(r => r[1] === 'Ines'), 'the deleted owner left the GS_Owners sheet');
const d2 = await phone2.evaluate(() => GSSync.sync('now'));
const p2d = await phone2.evaluate(() => ({ owners: GSStore.data.owners.map(o => o.name).join(), trash: GSStore.data.trash.map(x => x.row.name + ' by ' + x.by).join() }));
ok(d2.ok && p2d.owners === 'Manuel' && /Ines by another device/.test(p2d.trash), 'phone 2: the owner is gone, listed in Recently deleted ' + JSON.stringify(p2d) + ' ' + d2.msg);
// phone 2 still had the old row: it must not bring it back to phone 1
await page.evaluate(() => GSSync.sync('now'));
ok(!(await page.evaluate(() => GSStore.data.owners.some(o => o.name === 'Ines'))), 'phone 1 does not get the deleted owner back');
// Undo on phone 2 wins everywhere
await phone2.evaluate(() => GS.go('#settings')); await phone2.waitForTimeout(100);
await phone2.click('[data-undo]');
await phone2.evaluate(() => GSSync.sync('now')); await page.evaluate(() => GSSync.sync('now'));
ok(await page.evaluate(() => GSStore.data.owners.some(o => o.name === 'Ines')), 'Undo on phone 2 brings the owner back on phone 1');
// another app's tombstone in the file stays
const g6 = nc('get', FILE);
const withSr = await page.evaluate(b64 => { const wb = XLSX.read(GSSync.unb64(b64), { type: 'array' }); XLSX.utils.sheet_add_aoa(wb.Sheets._Deleted, [['SR', 'Weapons', 'W9', 'uid-9', 'Old Sako', '2026-11-14T09:00:00.000Z', 'SR Shooting']], { origin: -1 }); return GSSync.b64(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); }, g6.data);
nc('put', FILE, withSr, g6.etag);
await page.evaluate(() => { GSStore.data.owners.push({ id: 'O7', name: 'Paul', notes: '' }); GSStore.changed('owner'); return GSSync.sync('now'); });
const c6 = cells(Buffer.from(nc('get', FILE).data, 'base64'));
ok(c6.ok && c6.sheets._Deleted.rows.some(r => r[0] === 'SR' && r[2] === 'W9'), 'SR Shooting\'s tombstone kept when GunSafe writes');
// replace phone 2's data with the Nextcloud copy
await phone2.evaluate(() => { GSStore.data.owners.push({ id: 'O50', name: 'Only on phone 2', notes: '' }); });
const rp = await phone2.evaluate(() => GSSync.replaceFromRemote());
const p2r = await phone2.evaluate(() => GSStore.data.owners.map(o => o.name).sort().join());
ok(rp.ok && p2r === 'Ines,Manuel,Paul', 'replace with the Nextcloud copy: ' + p2r + ' · ' + rp.msg);
ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
