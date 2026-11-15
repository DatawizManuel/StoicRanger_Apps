/* SR Physical Fitness 0.3.0 — the sync against a REAL Nextcloud (run by tools/test-nextcloud.sh, which starts one).
   node tools/test-nextcloud-real.cjs <bridge port> <database.xlsx from the PC>
   The page's sync (js/sync.js) runs in a headless browser; its Android calls (ncDownload / ncUpload) go to NcBridge,
   i.e. the app's own WebDav.java + NcFile.java on the JVM, which talk to Nextcloud over https. Checks:
   the PC's database.xlsx keeps every other part byte for byte, repeated syncs add nothing (no doubled rows, no
   uploads without a change), two phones exchange drinks, weights and deletes, backups are made, a wrong password is
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
  const answer = (cb, r) => window.PFNativeCallback(cb, { ok: r.status >= 200 && r.status < 300, msg: r.error || '', data: JSON.stringify(r) });
  const post = (p, body) => fetch(bridge + p, { method: 'POST', body }).then(r => r.json()).catch(e => ({ status: 0, error: String(e) }));
  window.__uploads = 0;
  window.PFNative = {
    loadDb: () => ls.getItem('pf.db') || '', saveDb: t => { ls.setItem('pf.db', t); return true; },
    backupDb: n => true, loadDbBackup: () => '', isNight: () => false,
    appInfo: () => JSON.stringify({ version: '0.3.0', android: '14', device: 'test' }),
    saveFile() { }, openFile() { }, shareFile() { }, shareText() { }, print() { },
    storageGet: () => JSON.stringify(Object.assign({ peers: [] }, st)), storageSet: () => window.PFNative.storageGet(),
    storageRefresh: () => false, linkSet: () => window.PFNative.storageGet(),
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
    await p.evaluate(d => { localStorage.clear(); if (d) localStorage.setItem('pf.db', JSON.stringify(d)); }, favs);
    await p.goto(url); await p.waitForTimeout(2500);            // the sync on open runs by itself
    await p.evaluate(() => { PF.sync.soon = () => { }; });       // from here on the test syncs by hand
    for (let i = 0; i < 40 && await p.evaluate(() => PF.sync.busy); i++) await p.waitForTimeout(250);
    return p;
  };
  const sync = p => p.evaluate(() => PF.sync.run());
  const ids = (p, t) => p.evaluate(t => PF.db[t].map(f => f.id).sort().join(), t);
  const remote = async () => {
    const d = await call('/download');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-nc-')), 'database.xlsx');
    fs.writeFileSync(f, Buffer.from(d.b64, 'base64'));
    return f;
  };
  const check = (file, label) => {
    const r = spawnSync('python3', [path.join(__dirname, 'check-xlsx-parts.py'), REAL, file], { encoding: 'utf8' });
    for (const l of (r.stdout + r.stderr).trim().split('\n')) if (l) console.log(l.replace(/^(PASS|FAIL) /, `$1 ${label}: `));
    if (r.status !== 0) process.exitCode = 1;
    const m = /PF_Weight rows in file: (\d+)/.exec(r.stdout), d = /PF_Drinks rows in file: (\d+)/.exec(r.stdout); return { w: m ? +m[1] : -1, d: d ? +d[1] : -1 };
  };

  // 2. phone A with drinks, two weights and an activity syncs on open
  const now = new Date().toISOString(), day = k => new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
  const A = await phone({ app: 'sr-physical-fitness', schema: 2, created: now, updated: now, plans: [], sets: [],
    settings: { sessions: 3, minutes: 45, days: ['Mon', 'Wed', 'Fri'], profile: { startKg: 85, startDate: day(30), heightCm: 181, goalKg: 79, drinkMl: 2500 } },
    drinks: [{ id: 'd1', at: now, date: day(0), time: '08:00', ml: 250 }, { id: 'd2', at: now, date: day(0), time: '12:30', ml: 500 }],
    weights: [{ id: 'w1', at: now, date: day(7), kg: 84.2, note: 'Ä morning & <fasted>' }, { id: 'w2', at: now, date: day(0), kg: 83.6, note: '' }],
    activities: [{ id: 'a1', at: now, date: day(1), type: 'ruck', min: 90, km: 8, kg: 15 }] });
  ok(/Last sync/.test(await A.evaluate(() => PF.sync.status())), 'phone A synced on open: ' + await A.evaluate(() => PF.sync.status()));
  let n = check(await remote(), 'after phone A');
  ok(n.w === 2 && n.d === 2, 'file has phone A\'s 2 weights and 2 drinks');
  // 3. syncing again and again adds nothing and uploads nothing
  const up = await A.evaluate(() => window.__uploads);
  for (let i = 0; i < 3; i++) await sync(A);
  ok(await A.evaluate(() => window.__uploads) === up, 'three more syncs without a change: nothing uploaded');
  n = check(await remote(), 'after 3 more syncs');
  ok(n.w === 2 && n.d === 2 && await ids(A, 'weights') === 'w1,w2', 'still 2 weights and 2 drinks, nothing doubled');
  // 4. phone B (empty) gets everything, adds a drink and a weight; A gets them
  const Bp = await phone(null);
  ok(await ids(Bp, 'weights') === 'w1,w2' && await ids(Bp, 'drinks') === 'd1,d2' && await ids(Bp, 'activities') === 'a1', 'phone B got weights, drinks and the activity on open');
  ok(await Bp.evaluate(() => (PF.db.weights.find(w => w.id === 'w1') || {}).note) === 'Ä morning & <fasted>' && await Bp.evaluate(() => PF.db.settings.profile.goalKg === 79 && PF.db.settings.profile.startKg === 85), 'notes arrive exactly (umlauts, & and <>), profile arrives ' + await Bp.evaluate(() => JSON.stringify([(PF.db.weights.find(w => w.id === 'w1') || {}).note, PF.db.settings.profile, PF.db.settings.at])));
  await Bp.evaluate(() => { PF.body.addDrink(330); PF.body.logWeight(PF.iso(PF.addDays(PF.today(), -3)), 83.9); PF.flush(); });
  ok((await sync(Bp)).ok, 'phone B uploaded its drink and weight');
  await sync(A);
  ok(await A.evaluate(() => PF.db.drinks.length === 3 && PF.db.weights.length === 3), 'phone A got phone B\'s drink and weight');
  // 5. deleted on A → gone on B, not back
  await A.evaluate(() => { PF.del('weights', 'w1', 'Weight test'); PF.flush(); });
  await sync(A); await sync(Bp); await sync(A);
  ok(!(await ids(Bp, 'weights')).includes('w1') && await ids(A, 'weights') === await ids(Bp, 'weights'), 'delete on phone A reached phone B and did not come back');
  n = check(await remote(), 'after both phones');
  ok(n.w === 2 && n.d === 3, 'file has 2 weights and 3 drinks');
  // 6. both phones write at once: one gets 412, merges, both drinks end up in the file
  await A.evaluate(() => { PF.body.addDrink(200); PF.flush(); });
  await Bp.evaluate(() => { PF.body.addDrink(400); PF.flush(); });
  const both = await Promise.all([sync(A), sync(Bp)]);
  await sync(A); await sync(Bp);
  ok(both.every(r => r.ok) && await ids(A, 'drinks') === await ids(Bp, 'drinks') && await A.evaluate(() => PF.db.drinks.length === 5), 'two phones at the same moment: merged, nothing lost (' + await A.evaluate(() => PF.db.drinks.map(d => d.ml).join()) + ')');
  n = check(await remote(), 'after simultaneous writes');
  // 7. Replace with the Nextcloud copy on B
  await Bp.evaluate(() => { PF.db.drinks.push({ id: 'junk', at: PF.now(), date: PF.todayIso(), time: '01:00', ml: 9999 }); PF.flush(); });
  const rep = await Bp.evaluate(async () => { const r = await PF.sync.replace(false); return r.ok && !PF.db.drinks.some(d => d.id === 'junk') && PF.db.drinks.length === 5; });
  ok(rep, 'Replace with the Nextcloud copy on the real server');
  // 8. backups
  const bk = await call('/list');
  ok(bk.filter(x => /^database-\d{8}-\d{6}\.xlsx$/.test(x)).length >= 3 && bk.length <= 31, `backups made before uploads (${bk.length} in backups/)`);
  // 9. wrong password
  await call('/password', 'wrong-password');
  const r = await sync(A);
  ok(!r.ok && /refused the login/.test(await A.evaluate(() => PF.sync.status())), 'wrong app password reported: ' + await A.evaluate(() => PF.sync.status()));
  await call('/password', process.env.NC_PASS || 'test-pass-123');
  ok(A.errs.length === 0 && Bp.errs.length === 0, 'no script errors ' + A.errs.concat(Bp.errs).join(' | '));
  await b.close(); srv.close();
});
