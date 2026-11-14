/* Daily Thoughts 0.3.1 — the sync against a REAL Nextcloud (run by tools/test-nextcloud.sh, which starts one).
   node tools/test-nextcloud-real.js <bridge port> <database.xlsx from the PC>
   The page's sync (js/sync.js) runs in a headless browser; its Android calls (ncDownload / ncUpload) go to NcBridge,
   i.e. the app's own WebDav.java + NcFile.java on the JVM, which talk to Nextcloud over https. Checks:
   the PC's database.xlsx keeps every other part byte for byte, repeated syncs add nothing (no doubled rows, no
   uploads without a change), two phones exchange favourites and removals, backups are made, a wrong password is
   reported, the WebDAV basics (401, 412, COPY, PROPFIND) work on the real server. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const [BRIDGE, REAL] = [process.argv[2], process.argv[3]];
const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const B = `http://127.0.0.1:${BRIDGE}`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const call = (p, body = '') => fetch(B + p, { method: 'POST', body }).then(r => r.json());
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200, f.endsWith('.svg') ? { 'content-type': 'image/svg+xml' } : f.endsWith('.js') ? { 'content-type': 'application/javascript' } : {}); r.end(d); }); });

/* the Android side in the page: storage + db.json in localStorage, the network through the bridge (real Java code) */
const fakeNative = bridge => {
  const ls = localStorage;
  const st = { mode: 'nextcloud', url: 'https://localhost:8443', user: 'tester', folder: '/Stoic Ranger/', file: 'database.xlsx', changed: '2026-11-14T10:00:00Z', hasPassword: true };
  const answer = (cb, r) => window.DTNativeCallback(cb, { ok: r.status >= 200 && r.status < 300, msg: r.error || '', data: JSON.stringify(r) });
  const post = (p, body) => fetch(bridge + p, { method: 'POST', body }).then(r => r.json()).catch(e => ({ status: 0, error: String(e) }));
  window.__uploads = 0;
  window.DTNative = {
    loadDb: () => ls.getItem('dt.db') || '', saveDb: t => { ls.setItem('dt.db', t); return true; },
    backupDb: n => true, loadDbBackup: () => '', isNight: () => false,
    appInfo: () => JSON.stringify({ version: '0.3.1', android: '14', device: 'test' }),
    saveFile() { }, openFile() { }, shareFile() { }, shareText() { }, print() { },
    storageGet: () => JSON.stringify(Object.assign({ peers: [] }, st)), storageSet: () => window.DTNative.storageGet(),
    storageRefresh: () => false, linkSet: () => window.DTNative.storageGet(),
    ncDownload: cb => { post('/download', '').then(r => answer(cb, r)); },
    ncUpload: (b64, etag, cb) => { window.__uploads++; post('/upload', etag + '\n' + b64).then(r => answer(cb, r)); },
  };
};

srv.listen(0, async () => {
  const url = `http://localhost:${srv.address().port}/index.html`;
  // 0. WebDAV basics with the Android code
  const pr = await call('/probe');
  pr.lines.forEach(l => console.log(l)); if (pr.fails) process.exitCode = 1;
  // 1. the PC's database.xlsx is on Nextcloud
  const real = fs.readFileSync(REAL);
  const seed = await call('/seed', real.toString('base64'));
  ok(seed.status === 201 || seed.status === 204, 'PC database.xlsx put on Nextcloud (' + seed.status + ')');

  const b = await chromium.launch();
  const phone = async (favs) => {
    const ctx = await b.newContext(); await ctx.addInitScript(fakeNative, B);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (/zip patch/.test(m.text())) p.errs.push(m.text()); });
    await p.goto(url.replace('index.html', 'css/app.css'));
    await p.evaluate(d => { localStorage.clear(); if (d) localStorage.setItem('dt.db', JSON.stringify(d)); }, favs && { app: 'sr-daily-thoughts', schema: 1, favs, settings: { theme: 'auto' } });
    await p.goto(url); await p.waitForTimeout(2500);            // the sync on open runs by itself
    await p.evaluate(() => { DT.sync.soon = () => { }; });       // from here on the test syncs by hand
    for (let i = 0; i < 40 && await p.evaluate(() => DT.sync.busy); i++) await p.waitForTimeout(250);
    return p;
  };
  const sync = p => p.evaluate(() => DT.sync.run('test'));
  const ids = p => p.evaluate(() => DT.db.favs.map(f => f.id).sort().join());
  const remote = async () => {
    const d = await call('/download');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dt-nc-')), 'database.xlsx');
    fs.writeFileSync(f, Buffer.from(d.b64, 'base64'));
    return f;
  };
  const check = (file, label) => {
    const r = spawnSync('python3', [path.join(__dirname, 'check-xlsx-parts.py'), REAL, file], { encoding: 'utf8' });
    for (const l of (r.stdout + r.stderr).trim().split('\n')) if (l) console.log(l.replace(/^(PASS|FAIL) /, `$1 ${label}: `));
    if (r.status !== 0) process.exitCode = 1;
    const m = /favourites in file: (\d+)/.exec(r.stdout); return m ? +m[1] : -1;
  };

  // 2. phone A with two favourites syncs on open
  const A = await phone([{ id: 'q-marcus-aurelius-01', at: '2026-11-01T08:00:00.000Z', note: 'Ä note with umlauts & <signs>' }, { id: 'q-seneca-03', at: '2026-11-02T08:00:00.000Z' }]);
  ok(/Last sync/.test(await A.evaluate(() => DT.sync.status())), 'phone A synced on open: ' + await A.evaluate(() => DT.sync.status()));
  let n = check(await remote(), 'after phone A');
  ok(n === 2, 'file has phone A\'s 2 favourites');
  // 3. syncing again and again adds nothing and uploads nothing
  const up = await A.evaluate(() => window.__uploads);
  for (let i = 0; i < 3; i++) await sync(A);
  ok(await A.evaluate(() => window.__uploads) === up, 'three more syncs without a change: nothing uploaded');
  n = check(await remote(), 'after 3 more syncs');
  ok(n === 2 && await ids(A) === 'q-marcus-aurelius-01,q-seneca-03', 'still 2 favourites, nothing doubled');
  // 4. phone B (empty) gets them, adds one; A gets that
  const Bp = await phone(null);
  ok(await ids(Bp) === 'q-marcus-aurelius-01,q-seneca-03', 'phone B got the favourites on open');
  ok(await Bp.evaluate(() => (DT.db.favs.find(f => f.id === 'q-marcus-aurelius-01') || {}).note) === 'Ä note with umlauts & <signs>', 'notes arrive exactly (umlauts, & and <>)');
  await Bp.evaluate(() => { DT.toggleFav('q-epictetus-01'); DT.flush(); });
  ok((await sync(Bp)).ok, 'phone B uploaded its new favourite');
  await sync(A);
  ok(await ids(A) === 'q-epictetus-01,q-marcus-aurelius-01,q-seneca-03', 'phone A got phone B\'s favourite');
  // 5. removed on A → gone on B, not back
  await A.evaluate(() => { DT.toggleFav('q-seneca-03'); DT.flush(); });
  await sync(A); await sync(Bp); await sync(A);
  ok(await ids(Bp) === 'q-epictetus-01,q-marcus-aurelius-01' && await ids(A) === await ids(Bp), 'removal on phone A reached phone B and did not come back');
  n = check(await remote(), 'after both phones');
  ok(n === 2, 'file has the 2 favourites left');
  // 6. both phones write at once: one gets 412, merges, both favourites end up in the file
  await A.evaluate(() => { DT.toggleFav('q-plato-01'); DT.flush(); });
  await Bp.evaluate(() => { DT.toggleFav('q-plato-02'); DT.flush(); });
  const both = await Promise.all([sync(A), sync(Bp)]);
  await sync(A); await sync(Bp);
  ok(both.every(r => r.ok) && await ids(A) === await ids(Bp) && (await ids(A)).includes('q-plato-01') && (await ids(A)).includes('q-plato-02'), 'two phones at the same moment: merged, nothing lost ' + await ids(A));
  n = check(await remote(), 'after simultaneous writes');
  // 7. backups
  const bk = await call('/list');
  ok(bk.filter(x => /^database-\d{8}-\d{6}\.xlsx$/.test(x)).length >= 3 && bk.length <= 31, `backups made before uploads (${bk.length} in backups/)`);
  // 8. wrong password
  await call('/password', 'wrong-password');
  const r = await sync(A);
  ok(!r.ok && /refused the login/.test(await A.evaluate(() => DT.sync.status())), 'wrong app password reported: ' + await A.evaluate(() => DT.sync.status()));
  await call('/password', process.env.NC_PASS || 'test-pass-123');
  ok(A.errs.length === 0 && Bp.errs.length === 0, 'no script errors ' + A.errs.concat(Bp.errs).join(' | '));
  await b.close(); srv.close();
});
