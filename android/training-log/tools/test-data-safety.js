/* Data-safety check (run before every release): node tools/test-data-safety.js
   Serves www, then checks with a headless browser that
   1. older/partial data loads without losing entries (ids/uids filled, counts unchanged),
   2. data from a newer app version is opened read-only and never overwritten,
   3. a damaged file falls back to the previous copy,
   4. a backup file survives save → restore unchanged (count + uids),
   5. 0.2.x → 0.3.0: example entries removed, examples used by own trainings kept as own, a pre-migration copy saved,
   6. database.xlsx export → import into an empty app gives the same trainings (uids, guns, rounds),
   7. 0.3.0 → 0.4.0: every training becomes live fire; dry fire never counts as rounds (dashboard, Gun Database),
      the Type column survives xlsx, results from Shooting Drills are read from the inbox and shown per training. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200); r.end(d); }); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
srv.listen(0, async () => {
  const url = `http://localhost:${srv.address().port}/index.html`;
  const b = await chromium.launch();
  const page = async (store) => {
    const p = await b.newPage();
    await p.goto(url.replace('index.html', 'css/app.css'));
    await p.evaluate(s => { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, store);
    await p.goto(url); await p.waitForTimeout(400); return p;
  };
  const old = { schema: 1, shooters: [{ id: 'S-001', name: 'A' }, { name: 'B' }], weapons: [{ id: 'W-001', name: 'Rifle' }], trainers: [],
    trainings: [{ id: 'TR-0001', shooterId: 'S-001', date: '2026-01-01', durationH: '2,5', desc: 'x', weapons: [{ weaponId: 'W-001', rounds: '40' }], future: 'kept' }, { shooterId: 'S-001', date: '2026-02-01', desc: 'y' }] };
  let p = await page({ 'tl.db': JSON.stringify(old) });
  let d = await p.evaluate(() => TL.db);
  ok(d.trainings.length === 2 && d.shooters.length === 2 && d.weapons.length === 1, 'entries kept');
  ok(TL_all(d).every(r => r.uid && r.id), 'every record has id + permanent uid');
  ok(d.trainings[0].durationH === 2.5 && d.trainings[0].weapons[0].rounds === 40, 'numbers converted');
  ok(d.trainings[0].future === 'kept', 'unknown fields kept');
  const uids = TL_all(d).map(r => r.uid).join();
  await p.reload(); await p.waitForTimeout(300);
  d = await p.evaluate(() => TL.db);
  ok(TL_all(d).map(r => r.uid).join() === uids, 'uids stable across restarts');
  const bak = await p.evaluate(() => JSON.stringify(TL.db));
  await p.close();

  const newer = Object.assign({}, old, { schema: 99 });
  p = await page({ 'tl.db': JSON.stringify(newer) });
  ok(await p.evaluate(() => TL.readOnly), 'newer data opens read-only');
  await p.evaluate(() => { TL.db.trainings.push({}); TL.save(true); });
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tl.db'))).trainings.length === 2, 'newer data never overwritten');
  await p.close();

  p = await page({ 'tl.db': '{"trainings":[', 'tl.db.bak': bak });
  ok(await p.evaluate(() => TL.recovered && TL.db.trainings.length === 2), 'damaged file falls back to previous copy');
  await p.close();

  p = await page({ 'tl.db': bak });
  const re = await p.evaluate(b => { const j = TL.migrate(JSON.parse(b)); return j.trainings.length + '|' + j.trainings.map(t => t.uid).join(); }, bak);
  ok(re === JSON.parse(bak).trainings.length + '|' + JSON.parse(bak).trainings.map(t => t.uid).join(), 'backup restores unchanged');
  await p.close();
  const v02 = { schema: 1, shooters: [{ id: 'S-001', uid: 'u-s1', name: 'Example shooter', example: true }, { id: 'S-002', uid: 'u-s2', name: 'Own' }],
    weapons: [{ id: 'W-001', uid: 'u-w1', name: 'Ex gun', example: true }, { id: 'W-002', uid: 'u-w2', name: 'Ex gun 2', example: true }], trainers: [{ id: 'T-001', uid: 'u-t1', name: 'Ex trainer', example: true }],
    trainings: [{ id: 'TR-0001', uid: 'u-1', shooterId: 'S-001', date: '2025-01-01', desc: 'example', weapons: [{ weaponId: 'W-002', rounds: 5 }], example: true },
      { id: 'TR-0002', uid: 'u-2', shooterId: 'S-001', date: '2026-01-01', desc: 'own', weapons: [{ weaponId: 'W-001', rounds: 40 }], trainerId: '' }] };
  p = await page({ 'tl.db': JSON.stringify(v02) });
  d = await p.evaluate(() => TL.db);
  ok(d.schema === 3 && d.trainings.length === 1 && d.trainings[0].uid === 'u-2', 'migration 2: example training gone, own training kept');
  ok(d.shooters.length === 2 && d.shooters.every(r => !r.example) && d.weapons.length === 1 && d.weapons[0].id === 'W-001' && !d.weapons[0].example && d.trainers.length === 0, 'migration 2: used examples become own, unused examples removed');
  ok(await p.evaluate(() => !!localStorage.getItem('tl.db.pre1')), 'migration 2: copy of the old data saved first');
  // xlsx round trip
  await p.evaluate(() => { TL.db.trainers.push({ id: 'T-001', uid: 'u-t9', name: 'Club', phone: '+43 1' }); TL.db.trainings[0].trainerId = 'T-001'; TL.db.trainings[0].weapons.push({ weaponId: 'W-001', rounds: 3 });
    TL.db.weapons[0].zeroM = 100; TL.save(true); });
  const bytes = await p.evaluate(() => Array.from(TL.exportXlsx()));
  await p.close();
  p = await page({});
  await p.evaluate(() => { TL.firstRun = false; });
  const res = await p.evaluate(b => { const pl = TL.planXlsx(new Uint8Array(b)); pl.apply(); return { c: pl.counts, d: TL.db }; }, bytes);
  const t0 = res.d.trainings[0];
  ok(res.d.trainings.length === 1 && t0.uid === 'u-2' && t0.weapons.length === 2 && t0.weapons[0].rounds === 40 && TL_name(res.d, 'trainers', t0.trainerId) === 'Club' && res.d.weapons[0].zeroM === 100, 'xlsx export → import keeps trainings, uids, guns, rounds, trainers, zero');
  const again = await p.evaluate(b => { const pl = TL.planXlsx(new Uint8Array(b)); pl.apply(); return [TL.db.trainings.length, TL.db.weapons.length, TL.db.shooters.length]; }, bytes);
  ok(again.join() === [1, res.d.weapons.length, res.d.shooters.length].join(), 'importing the same xlsx twice adds nothing');
  await p.close();
  const v03 = { schema: 2, shooters: [{ id: 'S-001', uid: 'u-s1', name: 'A' }], weapons: [{ id: 'W-001', uid: 'u-w1', name: 'G', source: { app: 'gundb', id: 'W-009' } }], trainers: [],
    trainings: [{ id: 'TR-0001', uid: 'u-1', shooterId: 'S-001', date: '2026-03-01', durationH: 2, desc: 'live', weapons: [{ weaponId: 'W-001', rounds: 50 }] },
      { id: 'TR-0002', uid: 'u-2', shooterId: 'S-001', date: '2026-03-02', durationH: 1, desc: 'dry', weapons: [{ weaponId: 'W-001', rounds: 200 }] }],
    settings: { link: { enabled: true }, dashFilter: { shooter: '', year: '', weapon: '', trainer: '' } } };
  p = await page({ 'tl.db': JSON.stringify(v03) });
  d = await p.evaluate(() => TL.db);
  ok(d.schema === 3 && d.trainings.length === 2 && d.trainings.every(t => t.fire === 'live') && d.trainings[0].weapons[0].rounds === 50, 'migration 3: all trainings kept as live fire, rounds unchanged');
  ok(await p.evaluate(() => !!localStorage.getItem('tl.db.pre2')), 'migration 3: copy of the old data saved first');
  const r3 = await p.evaluate(() => { TL.db.trainings[1].fire = 'dry'; TL.save(true); const s = TL.summary(TL.filtered({}), {});
    return { s, e: TL.linkEntries().map(e => e.rounds), dryOnly: TL.filtered({ fire: 'dry' }).length, liveOnly: TL.filtered({ fire: 'live' }).length }; });
  ok(r3.s.rounds === 50 && r3.s.reps === 200 && r3.s.nDry === 1 && r3.s.nLive === 1 && r3.s.hoursDry === 1 && r3.s.hoursLive === 2, 'dry fire: no rounds, time and count split live / dry');
  ok(r3.e.join() === '50' && r3.dryOnly === 1 && r3.liveOnly === 1, 'dry fire not sent to the Gun Database; type filter works');
  const b3 = await p.evaluate(() => Array.from(TL.exportXlsx()));
  await p.evaluate(() => { window.__sdInbox = JSON.stringify({ received: Date.now(), version: '0.2.0', results: [{ uid: 'r1', trainingUid: 'u-2', drill: 'Dot torture', result: '48/50' }, { uid: 'r2', trainingUid: 'nope', drill: 'X' }] });
    TL.db.settings.link.apps = { shootingDrills: { enabled: true } }; TL.sdSync(); });
  const sd = await p.evaluate(() => [TL.drillResultsOf(TL.training('TR-0002')).length, TL.drillResultsOf(TL.training('TR-0001')).length, TL.drillResultsFor(TL.training('TR-0002')).includes('Dot torture')]);
  ok(sd.join() === '1,0,true', 'Shooting Drills results read from the inbox and shown on their training');
  await p.close();
  p = await page({});
  await p.evaluate(() => { TL.firstRun = false; });
  const x3 = await p.evaluate(b => { TL.planXlsx(new Uint8Array(b)).apply(); return TL.db.trainings.map(t => t.uid + ':' + t.fire).sort().join(); }, b3);
  ok(x3 === 'u-1:live,u-2:dry', 'xlsx Type column keeps live / dry fire');
  await p.close();
  await b.close(); srv.close();
});
function TL_name(d, t, id) { const r = d[t].find(x => x.id === id); return r && r.name; }
function TL_all(d) { return ['shooters', 'weapons', 'trainers', 'trainings'].flatMap(t => d[t]); }
