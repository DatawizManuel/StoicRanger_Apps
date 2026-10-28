/* End-to-end link test in the browser (mocked provider): serve this app's www on :8765 and the Gun Database's www on :8766, then: node tools/test-link.js */
const { chromium } = require('playwright');
const OUT = require('os').tmpdir() + '/';
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const mk = async (url) => { const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.on('pageerror', e => errs.push(url + ' ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(url + ' ' + m.text())); return p; };
  // Gun DB with own data (examples converted to own), link on
  const g = await mk('gun');
  await g.goto('http://localhost:8766/data/demo.json'); await g.evaluate(() => localStorage.clear());
  await g.goto('http://localhost:8766/index.html'); await g.waitForTimeout(500);
  await g.evaluate(async () => { await RB.loadExamples(); ['weapons','barrels','munitions','shooters','roundsLog','sheets'].forEach(t => RB.db[t].forEach(r => delete r.example)); RB.db.weapons.push({ id: 'W-009', name: 'Second Rifle', caliber: '.308 Win', status: 'Active' }); RB.db.barrels.push({ id: 'B-009', weaponId: 'W-009', name: 'Factory', installed: '2020-01-01', roundsAtInstall: 100 }); RB.save(true); });
  await g.goto('http://localhost:8766/index.html#/more'); await g.waitForTimeout(400);
  await g.check('#mLink'); await g.waitForTimeout(300);
  await g.screenshot({ path: OUT + 'g-more-link.png', fullPage: true });
  const gun = await g.evaluate(() => ({ enabled: RB.db.settings.link.enabled, shooters: RB.db.shooters.map(({id,name,status,notes})=>({id,name,status,notes})), weapons: RB.db.weapons.map(({id,name,make,model,caliber,serial,status,notes})=>({id,name,make,model,caliber,serial,status,notes})), rl: RB.db.roundsLog.length }));
  console.log('gun', gun.enabled, gun.shooters.length, gun.weapons.length, 'roundsLog', gun.rl);
  // Training Log: one own weapon with the same name as a gun weapon, own training
  const t = await mk('tl');
  await t.goto('http://localhost:8765/css/app.css'); await t.evaluate(() => localStorage.clear());
  await t.addInitScript(gun => {
    window.__inbox = null; window.__gunOn = gun.enabled;
    window.__linkMock = (m, arg) => m === 'status' ? { app: 'gundb', version: '0.5.0', enabled: window.__gunOn } : !window.__gunOn ? { error: 'disabled' } : m === 'shared' ? { shooters: gun.shooters, weapons: gun.weapons } : m === 'putRounds' ? (window.__inbox = Object.assign({ received: Date.now() }, arg), { ok: true }) : { error: 'x' };
  }, gun);
  await t.goto('http://localhost:8765/index.html'); await t.waitForTimeout(400);
  await t.click('#wStart'); await t.waitForTimeout(200);
  await t.evaluate(name => { TL.addRecord('weapons', { name, type: 'Rifle', notes: 'my local note' }); TL.addRecord('shooters', { name: 'Local Shooter' }); }, gun.weapons[0].name);
  await t.goto('http://localhost:8765/index.html#/more'); await t.waitForTimeout(300);
  await t.check('#mLink'); await t.waitForTimeout(400);
  await t.screenshot({ path: OUT + 't-more-link.png', fullPage: true });
  let s = await t.evaluate(() => ({ st: TL.db.settings.link.status, w: TL.db.weapons.map(w => [w.id, w.name, w.source && w.source.id, w.notes]), sh: TL.db.shooters.map(x => [x.id, x.name, x.source && x.source.id]) }));
  console.log(JSON.stringify(s));
  // new training with two linked weapons
  await t.goto('http://localhost:8765/index.html#/training/new'); await t.waitForTimeout(300);
  await t.screenshot({ path: OUT + 't-form-linked.png', fullPage: true });
  await t.selectOption('#fShooter', { index: 1 }); await t.fill('#fDesc', 'Linked test'); await t.fill('#fDur', '3');
  const rows = await t.$$('.wrow'); for (const [i, n] of [[0, 30], [1, 20]]) { await (await rows[i].$('input[type=checkbox]')).check(); await (await rows[i].$('input[type=number]')).fill(String(n)); }
  await t.click('#tSave'); await t.waitForTimeout(400);
  let inbox = await t.evaluate(() => window.__inbox);
  console.log('inbox entries', inbox.entries.length, JSON.stringify(inbox.entries[0]));
  let r = await g.evaluate(i => { const n = RB.linkApplyInbox(i); return { n, rl: RB.db.roundsLog.filter(x => x.link).map(x => [x.id, x.date, x.rounds, x.weaponId, x.note]) }; }, inbox);
  console.log('gun applied', JSON.stringify(r));
  const D = await g.evaluate(() => RB.build().barrels.map(b => [b.id, b.total]));
  console.log('barrels', JSON.stringify(D));
  // edit: change rounds, then untick send -> entries removed in gun
  await t.goto('http://localhost:8765/index.html#/trainings'); await t.waitForTimeout(200);
  const id = await t.evaluate(() => TL.db.trainings[0].id);
  await t.goto('http://localhost:8765/index.html#/training/' + id); await t.waitForTimeout(300);
  await t.uncheck('#fSend'); await t.click('#tSave'); await t.waitForTimeout(300);
  inbox = await t.evaluate(() => window.__inbox);
  r = await g.evaluate(i => { const n = RB.linkApplyInbox(i); return { n, rl: RB.db.roundsLog.filter(x => x.link).length, total: RB.db.roundsLog.length }; }, inbox);
  console.log('after untick', inbox.entries.length, JSON.stringify(r), 'stored flag', await t.evaluate(() => TL.db.trainings[0].sendRounds));
  // linked weapon edit view
  const wid = await t.evaluate(() => TL.db.weapons.find(w => w.source).id);
  await t.goto('http://localhost:8765/index.html#/db/weapons/' + wid); await t.waitForTimeout(300);
  await t.screenshot({ path: OUT + 't-weapon-linked.png', fullPage: true });
  await t.goto('http://localhost:8765/index.html#/db/weapons'); await t.waitForTimeout(300);
  await t.screenshot({ path: OUT + 't-weapons-list.png', fullPage: true });
  // Gun DB switched off -> status text
  await t.evaluate(() => { window.__gunOn = false; TL.linkSync(); location.hash = '#/more'; }); await t.waitForTimeout(300);
  console.log('off-there:', await t.textContent('#mLinkSt'));
  await g.goto('http://localhost:8766/index.html#/db/roundsLog'); await g.waitForTimeout(400);
  await g.screenshot({ path: OUT + 'g-roundslog.png', fullPage: true });
  console.log('ERRORS', errs);
  await b.close();
})();
