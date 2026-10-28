// Loads a schema-1 database (0.1.0 format) into the browser build and checks that nothing is lost.
// Usage: (cd app/src/main/assets/www && python3 -m http.server 8765) & node tools/test-migration.js
const { chromium } = require('playwright');
const fs = require('fs');
const old = JSON.parse(fs.readFileSync(__dirname + '/../app/src/main/assets/www/data/demo.json'));
old.schema = 1; delete old.history; if (old.settings) delete old.settings.dashFilter;
delete old.sheets[0].id; old.sheets[1].v0 = String(old.sheets[1].v0 || 800).replace('.', ',') + ',5'.slice(String(old.sheets[1].v0 || 800).includes('.') ? 2 : 0);
old.sheets[3].purpose = 'Wettkampf'; old.sheets[4].purpose = 'Test';
old.sheets[5].preset = 'issf300'; old.sheets[6].preset = 'issf50'; old.settings.preset = 'issf50'; delete old.settings.units; delete old.targets;
old.shooters.push({ id: 'EX-S-009', name: 'Example shooter 2', example: true }); old.weapons.forEach(w => delete w.type);
old.sheets[2].hits = (old.sheets[2].hits || []).map(h => ({ x: String(h.x).replace('.', ','), y: String(h.y) }));
const exN = 1; const before0 = Object.fromEntries(['weapons', 'barrels', 'munitions', 'shooters', 'roundsLog', 'sheets'].map(k => [k, old[k].length])); const before = Object.assign({}, before0, { shooters: before0.shooters - exN });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 380, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/data/demo.json');   // same origin, without the app (it would save on unload)
  await p.evaluate(j => { localStorage.clear(); localStorage.setItem('rb.db', JSON.stringify(j)); }, old);
  await p.goto('http://localhost:8765/index.html#/dash'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('rb.db')); return { schema: d.schema, counts: Object.fromEntries(['weapons', 'barrels', 'munitions', 'shooters', 'roundsLog', 'sheets'].map(k => [k, d[k].length])), noId: d.sheets.filter(s => !s.id).length, v0: d.sheets[1].v0, hit: d.sheets[2].hits[0], hist: d.history, p3: d.sheets[3].purpose, p4: d.sheets[4].purpose, purposes: (d.settings.purposes || []).map(p => p.id + ':' + p.evalAs).join(','), pre: !!localStorage.getItem('rb.db.pre1'), toast: document.querySelector('#toast').textContent, filt: d.settings.dashFilter, targets: (d.targets || []).length, t5: d.sheets[5].preset, t6: d.sheets[6].preset, defPreset: d.settings.preset, units: d.settings.units, trainers: Array.isArray(d.trainers), wtype: d.weapons.map(w => w.type).join(','), ex: d.shooters.filter(x => x.example).length }; });
  console.log(JSON.stringify(r)); console.log('before', JSON.stringify(before));
  const ok = r.schema === 5 && r.trainers && /^Rifle(,Rifle)*$/.test(r.wtype) && r.ex === 0 && r.targets >= 10 && r.t5 === 'T-ISSF300' && r.t6 === 'T-ISSF50' && r.defPreset === 'T-ISSF50' && r.units === 'metric' && r.p4 === 'test' && r.p3 === 'p-wettkampf' && r.purposes.includes('p-wettkampf:rounds') && JSON.stringify(r.counts) === JSON.stringify(before) && !r.noId && r.pre && typeof r.hit.x === 'number';
  // damaged file -> previous copy
  await p.goto('http://localhost:8765/data/demo.json');
  await p.evaluate(() => { localStorage.setItem('rb.db.bak', localStorage.getItem('rb.db')); localStorage.setItem('rb.db', '{"sheets":[broken'); });
  await p.goto('http://localhost:8765/index.html#/dash'); await p.waitForTimeout(800);
  const rec = await p.evaluate(() => ({ sheets: RB.db.sheets.length, recovered: RB.recovered, toast: document.querySelector('#toast').textContent }));
  console.log('recover', JSON.stringify(rec));
  // newer data -> read-only
  await p.goto('http://localhost:8765/data/demo.json');
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('rb.db.bak')); d.schema = 99; localStorage.setItem('rb.db', JSON.stringify(d)); });
  await p.goto('http://localhost:8765/index.html#/dash'); await p.waitForTimeout(800);
  await p.evaluate(() => { RB.db.sheets.length = 0; RB.save(true); });
  const ro = await p.evaluate(() => ({ ro: RB.readOnly, kept: JSON.parse(localStorage.getItem('rb.db')).sheets.length, banner: !!document.querySelector('.banner') }));
  console.log('readonly', JSON.stringify(ro));
  console.log('errors', errs);
  console.log(ok && rec.sheets === before.sheets && ro.ro && ro.kept === before.sheets && ro.banner && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
