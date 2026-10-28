/* Data-safety check (run before every release): node tools/test-data-safety.js
   Serves www, then checks with a headless browser that
   1. older/partial data loads without losing entries (ids/uids filled, numbers converted, unknown fields kept),
   2. uids stay the same across restarts,
   3. data from a newer app version is opened read-only and never overwritten,
   4. a damaged file falls back to the previous copy,
   5. a backup survives save → restore unchanged,
   6. every result still points at a drill in the library (drill ids are permanent),
   7. every drill renders its one-pager, diagram and printable without errors,
   8. 0.2.0: common names and keywords are searchable, Clear selection resets all filters,
   9. 0.2.0: link with the Training Log (mocked): shooters and guns merged without duplicates, locked fields,
      a result logged on a training date gets that training, unlinking keeps local copies. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200); r.end(d); }); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const all = d => ['shooters', 'weapons', 'results'].flatMap(t => d[t]);
srv.listen(0, async () => {
  const url = `http://localhost:${srv.address().port}/index.html`;
  const b = await chromium.launch();
  const errs = [];
  const page = async (store) => {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(url.replace('index.html', 'css/app.css'));
    await p.evaluate(s => { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, store);
    await p.goto(url); await p.waitForTimeout(400); return p;
  };
  const old = { schema: 1, shooters: [{ id: 'S-001', name: 'A' }, { name: 'B' }], weapons: [{ id: 'W-001', name: 'Tikka' }], favs: ['pst-01'],
    results: [{ id: 'R-0001', drillId: 'pst-01', date: '2026-10-20', timeS: '2,31', hits: '6', shooterId: 'S-001', future: 'kept' }, { drillId: 'rsu-01', date: '2026-10-21', mode: 'live' }] };
  let p = await page({ 'sd.db': JSON.stringify(old) });
  let d = await p.evaluate(() => SD.db);
  ok(d.results.length === 2 && d.shooters.length === 2 && d.weapons.length === 1 && d.favs.length === 1, 'entries kept');
  ok(all(d).every(r => r.uid && r.id), 'every record has id + permanent uid');
  ok(d.results[0].timeS === 2.31 && d.results[0].hits === 6, 'numbers converted');
  ok(d.results[0].future === 'kept', 'unknown fields kept');
  const uids = all(d).map(r => r.uid).join();
  await p.reload(); await p.waitForTimeout(300);
  d = await p.evaluate(() => SD.db);
  ok(all(d).map(r => r.uid).join() === uids, 'uids stable across restarts');
  ok(await p.evaluate(() => SD.db.results.every(r => SD.drill(r.drillId))), 'results point at drills in the library');
  const bak = await p.evaluate(() => JSON.stringify(SD.db));
  await p.close();

  p = await page({ 'sd.db': JSON.stringify(Object.assign({}, old, { schema: 99 })) });
  ok(await p.evaluate(() => SD.readOnly), 'newer data opens read-only');
  await p.evaluate(() => { SD.db.results.push({}); SD.save(true); });
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('sd.db'))).results.length === 2, 'newer data never overwritten');
  await p.close();

  p = await page({ 'sd.db': '{"results":[', 'sd.db.bak': bak });
  ok(await p.evaluate(() => SD.recovered && SD.db.results.length === 2), 'damaged file falls back to previous copy');
  await p.close();

  p = await page({ 'sd.db': bak });
  const re = await p.evaluate(b => { const j = SD.migrate(JSON.parse(b)); return j.results.length + '|' + j.results.map(t => t.uid).join(); }, bak);
  ok(re === JSON.parse(bak).results.length + '|' + JSON.parse(bak).results.map(t => t.uid).join(), 'backup restores unchanged');
  const lib = await p.evaluate(() => {
    const ids = SD.DRILLS.map(x => x.id), bad = [];
    SD.DRILLS.forEach(x => { try { SD.diagram(x); SD.drillPage(x); if (x.printable && !SD.printable(x.printable)) bad.push(x.id + ' printable'); } catch (e) { bad.push(x.id + ' ' + e.message); } });
    SD.PRINTABLES.forEach(x => { try { if (!SD.printableSvg(x.id).includes('STOIC RANGER')) bad.push(x.id + ' no logo'); } catch (e) { bad.push(x.id + ' ' + e.message); } });
    return { n: ids.length, unique: new Set(ids).size === ids.length, bad };
  });
  ok(lib.n >= 173 && lib.unique, `drill library: ${lib.n} drills, unique ids`);
  ok(!lib.bad.length, 'every drill and printable renders' + (lib.bad.length ? ': ' + lib.bad.join(', ') : ''));
  // 0.2.0: ids of 0.1.0 still there, search by common names, clear selection
  const srch = await p.evaluate(() => {
    const f = SD.emptyFilter(), q = s => SD.DRILLS.filter(d => SD.matches(d, Object.assign({}, f, { q: s }))).map(d => d.id);
    return { moz: q('mozambique'), fail: q('failure drill'), mal: q('malfunction').length, h: q('weapon handling').length, one: q('1 to 5').length, box: q('box drill') };
  });
  ok(srch.moz.includes('pst-05') && srch.fail.includes('pst-05') && srch.box.includes('pdt-08') && srch.mal >= 7 && srch.h >= 10 && srch.one >= 4, 'search finds common names and keywords (Mozambique, box drill, malfunction, weapon handling, 1 to 5)');
  await p.goto(url + '#/drills'); await p.waitForTimeout(150);
  await p.evaluate(() => { Object.assign(SD.db.settings.filter, { weapon: 'rifle', fire: 'dry', level: '2', fav: true, q: 'x' }); SD.route(); });
  await p.click('#dClear'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !SD.filterActive(SD.db.settings.filter) && document.querySelectorAll('#dList .item').length === SD.DRILLS.length), 'Clear selection resets every filter and shows all drills');
  // link with the Training Log (mock of its provider)
  const lk = await p.evaluate(() => {
    window.__linkMock = (m, a) => m === 'status' ? { app: 'training-log', version: '0.4.0', enabled: true }
      : m === 'shared' ? { shooters: [{ id: 'S-001', uid: 'tl-s1', name: 'a', status: 'Active' }, { id: 'S-009', uid: 'tl-s9', name: 'Manuel' }], weapons: [{ id: 'W-003', uid: 'tl-w3', name: 'Tikka', type: 'Rifle', caliber: '6.5 CM', zeroM: 100 }] }
      : m === 'trainings' ? { trainings: a.date === '2026-10-26' ? [{ id: 'TR-0007', uid: 'tl-t7', date: '2026-10-26', start: '09:00', desc: 'Range day', shooterId: 'S-009' }] : [] } : { error: 'unknown method' };
    const n0 = SD.db.shooters.length;
    SD.db.settings.link.enabled = true; const st = SD.linkSync(); SD.linkSync();
    const A = SD.db.shooters.find(x => x.name === 'A' || x.name === 'a'), T = SD.db.weapons.find(x => x.name === 'Tikka');
    return { st: st.state, shooters: SD.db.shooters.length, n0, aSrc: A && A.source && A.source.id, guns: SD.db.weapons.length, locked: SD.lockedKeys('weapons', T).join(), zero: T.zeroM };
  });
  ok(lk.st === 'ok' && lk.shooters === lk.n0 + 1 && lk.aSrc === 'S-001' && lk.guns === 1 && lk.zero === 100 && lk.locked.includes('name'), 'link: shooters/guns merged by name then by id, no duplicates, fields locked');
  await p.goto(url + '#/result/new?drill=pst-01'); await p.waitForTimeout(200);
  await p.fill('#rDate', '2026-10-26'); await p.dispatchEvent('#rDate', 'change'); await p.waitForTimeout(100);
  const pickd = await p.evaluate(() => [document.querySelector('#rTraining').value, document.querySelector('#rShooter').selectedOptions[0].textContent]);
  await p.click('#rSave'); await p.waitForTimeout(200);
  const saved = await p.evaluate(() => SD.db.results.find(r => r.date === '2026-10-26'));
  ok(pickd[0] === 'TR-0007' && pickd[1] === 'Manuel' && saved && saved.training && saved.training.uid === 'tl-t7', 'link: result on a training date is linked to that training (shooter taken from it)');
  const off = await p.evaluate(() => { SD.db.settings.link.enabled = false; SD.save(true); const T = SD.db.weapons.find(x => x.name === 'Tikka'); return [SD.db.weapons.length, SD.lockedKeys('weapons', T).length, !!SD.db.results.find(r => r.training)]; });
  ok(off[0] === 1 && off[1] === 0 && off[2], 'unlinking keeps local copies (editable again) and saved training links');
  for (const h of ['#/home', '#/drills', '#/drill/pdt-01', '#/printables', '#/printables/sr-grid', '#/result/new?drill=pst-01', '#/db/shooters', '#/more']) { await p.goto(url + h); await p.waitForTimeout(150); }
  ok(!errs.length, 'all screens open without script errors' + (errs.length ? ': ' + errs.join('; ') : ''));
  await p.close();
  await b.close(); srv.close();
});
