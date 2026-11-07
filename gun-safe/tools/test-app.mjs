// SR GunSafe — browser tests (Chromium/Playwright) for the web part of the app.
//   node gun-safe/tools/test-app.mjs
// A: browser mode (localStorage): owners, guns, cleaning, service (parts, barrels, Cleaning done), rounds, ammo
//    purchases / take-outs / stock per gun, xlsx round trip, deletes with tombstones, phone Back.
// B: Android mode with a fake GSNative: link with SR Shooting (consent, cached guns/ammo/rounds, barrel switch via
//    putBarrels), Nextcloud sync against an in-memory WebDAV (upload, merge from another device, other apps' sheets
//    kept, backups, 412 retry), storage setting shared with the linked app, read-only data from a newer version.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + path.join(ROOT, 'app/src/main/assets/www/index.html');
let fails = 0, passes = 0;
const ok = (c, name) => { if (c) passes++; else { fails++; console.log('FAIL ' + name); } };

const browser = await chromium.launch();

/* ---------------- A: browser mode ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  const txt = async () => page.locator('#screen').textContent();
  const back = () => page.evaluate(() => GS.back());
  ok(/No guns yet/i.test(await txt()), 'empty home');
  ok(/on this phone/i.test(await txt()), 'local storage line');

  // owners
  await page.click('#menuBtn');
  await page.fill('#owName', 'Manuel'); await page.click('#owAdd');
  await page.fill('#owName', 'Ines'); await page.click('#owAdd');
  ok((await txt()).includes('Ines'), 'owners added');
  await back();
  ok((await page.evaluate(() => location.hash)) !== '#settings', 'back leaves settings');

  // gun
  await page.evaluate(() => GS.go('#gunedit/new'));
  await page.fill('#gName', 'Tikka T3x'); await page.fill('#gCal', '6.5 Creedmoor'); await page.fill('#gBefore', '1200');
  await page.fill('#gBarrel', 'Factory'); await page.fill('#gBLen', '610');
  await page.click('#fGun button[type=submit]');
  ok(/#gun\/G1/.test(await page.evaluate(() => location.hash)), 'gun saved, opened');
  await page.waitForFunction(() => /Tikka/.test(document.getElementById('hTitle').textContent));
  ok(/1\D?200/.test(await txt()), 'rounds before log counted');
  await page.click('[data-gown="O1"]'); await page.click('[data-gown="O2"]');
  ok((await page.evaluate(() => GSModel.gunOwners('G1'))).length === 2, 'two owners on a gun');

  // rounds fired, then cleaning → since = 0
  await page.evaluate(() => GS.go('#fire/G1'));
  await page.fill('#fQty', '80'); await page.click('#fFire button[type=submit]');
  let fig = await page.evaluate(() => GSModel.gunFig('G1'));
  ok(fig.total === 1280 && fig.since === 80, 'rounds fired counted ' + JSON.stringify(fig));
  await page.evaluate(() => GS.go('#clean/G1'));
  ok((await txt()).includes('80'), 'cleaning shows current count');
  await page.click('#fClean button[type=submit]');
  fig = await page.evaluate(() => GSModel.gunFig('G1'));
  ok(fig.since === 0 && fig.total === 1280, 'cleaning resets since, keeps total');
  await page.evaluate(() => GS.go('#fire/G1'));
  await page.fill('#fQty', '20'); await page.click('#fFire button[type=submit]');
  ok((await page.evaluate(() => GSModel.gunFig('G1'))).since === 20, 'rounds after a same-day cleaning count');

  // service: add a part, new barrel, without cleaning
  await page.evaluate(() => GS.go('#service/G1'));
  await page.click('#aOpen'); await page.selectOption('#aType', 'Optic'); await page.fill('#aName', 'Vortex Razor'); await page.click('#aOk');
  await page.check('input[name=brl][value=new]'); await page.fill('#bName', 'Bartlein #2'); await page.fill('#bLen', '660');
  await page.fill('#sNote', 'new barrel and scope');
  await page.uncheck('#sClean');
  ok((await page.inputValue('#bName')) === 'Bartlein #2' && (await page.inputValue('#sNote')).includes('scope'), 'service form keeps typed text across redraws');
  await page.click('#sSave');
  let st = await page.evaluate(() => ({ b: GSModel.currentBarrel('G1').name, n: GSModel.barrels('G1').length, c: GSModel.components('G1').length, since: GSModel.gunFig('G1').since, ev: GSStore.data.service.slice(-1)[0] }));
  ok(st.b === 'Bartlein #2' && st.n === 2 && st.c === 1, 'service: barrel and part ' + JSON.stringify(st));
  ok(st.since === 20 && st.ev.cleaningDone === false && st.ev.changes.length === 2, 'service without cleaning keeps count');
  // service: swap back to the old barrel, remove the part, cleaning done
  await page.evaluate(() => GS.go('#service/G1'));
  await page.check('input[name=brl][value=swap]');
  await page.click('[data-rm="C1"]');
  await page.click('#sSave');
  st = await page.evaluate(() => ({ b: GSModel.currentBarrel('G1').name, c: GSModel.components('G1').length, since: GSModel.gunFig('G1').since }));
  ok(st.b === 'Factory' && st.c === 0 && st.since === 0, 'service: swap barrel, remove part, cleaning done ' + JSON.stringify(st));

  // ammo: purchases, price, stock per gun, take-out
  await page.evaluate(() => GS.go('#buy/'));
  await page.fill('#nName', 'RWS Target Elite'); await page.fill('#nCal', '6.5 Creedmoor');
  await page.fill('#bDate', '2026-01-10'); await page.fill('#bQty', '200'); await page.fill('#bPrice', '420,00'); await page.fill('#bShop', 'Waffen Ortner');
  ok((await page.locator('#bBox').innerText()).includes('2,10'), 'cost per round preview');
  await page.click('#fBuy button[type=submit]');
  await page.evaluate(() => GS.go('#buy/GM1'));
  await page.fill('#bDate', '2026-06-01'); await page.fill('#bQty', '100'); await page.fill('#bPrice', '230'); await page.click('#fBuy button[type=submit]');
  await page.evaluate(() => GS.go('#buy/'));
  await page.selectOption('#bMun', 'new'); await page.fill('#nName', 'Hornady ELD-M'); await page.fill('#nCal', '6.5 creedmoor');
  await page.fill('#bQty', '50'); await page.fill('#bPrice', '150'); await page.click('#fBuy button[type=submit]');
  await page.evaluate(() => GS.go('#out/GM1'));
  await page.fill('#oQty', '100'); await page.click('#fOut button[type=submit]');
  ok(/purpose/i.test(await page.locator('#oErr').innerText()), 'take-out needs a purpose');
  await page.fill('#oPurp', 'Handed over to Ines for training xy'); await page.click('#fOut button[type=submit]');
  const mf = await page.evaluate(() => GSModel.munFig('GM1'));
  ok(mf.stock === 200 && mf.bought === 300 && Math.abs(mf.avg - 650 / 300) < 1e-9 && Math.abs(mf.last - 2.3) < 1e-9, 'stock and prices ' + JSON.stringify(mf));
  await page.evaluate(() => GS.go('#mun/GM1'));
  ok(await page.locator('svg.chart').count() === 1, 'price chart after two purchases');
  ok((await txt()).includes('Handed over to Ines'), 'take-out listed with purpose');
  await page.evaluate(() => GS.go('#ammo'));
  await page.click('[data-tab=gun]');
  ok(/Tikka T3x\s*250 rds/i.test(await txt()), 'stock per gun sums all fitting ammo (case-insensitive calibre)');

  // xlsx round trip (other sheets kept)
  const rt = await page.evaluate(() => {
    const X = XLSX, wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['ID', 'Name'], ['W1', 'Sako']]), 'Weapons');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['x']]), '_SR_Hidden');
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
    const other = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    const bytes = GSX.write(GSStore.data, other, 'test');
    const back = GSX.read(bytes);
    const wb2 = X.read(bytes, { type: 'array' });
    const same = JSON.stringify(GSX.tablesOf(back.data)) === JSON.stringify(GSX.tablesOf(GSStore.data));
    const hid = wb2.Workbook.Sheets[wb2.SheetNames.indexOf('_SR_Hidden')].Hidden;
    return { same, names: wb2.SheetNames, hid, weapons: X.utils.sheet_to_json(wb2.Sheets.Weapons)[0].Name };
  });
  ok(rt.same, 'xlsx round trip keeps all GunSafe data');
  ok(rt.names.includes('Weapons') && rt.weapons === 'Sako' && rt.hid === 1 && rt.names.includes('GS_Service_Log'), 'xlsx keeps other apps\' sheets ' + rt.names.join(','));
  // edited in Excel: visible sheet wins over the hidden copy
  const ex = await page.evaluate(() => {
    const X = XLSX, wb = X.read(GSX.write(GSStore.data, null, 't'), { type: 'array' });
    const ws = wb.Sheets.GS_Owners; ws.B2 = { t: 's', v: 'Manuel F.' }; X.utils.sheet_add_aoa(ws, [['O9', 'Paul', '']], { origin: -1 });
    const r = GSX.read(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))).data;
    const m = GSX.merge(GSX.tablesOf(GSStore.data), GSX.tablesOf(GSStore.data), r, GSStore.data.deleted);
    return { o1: m.data.owners.find(o => o.id === 'O1').name, n: m.data.owners.length, added: m.added, changed: m.changed };
  });
  ok(ex.o1 === 'Manuel F.' && ex.n === 3 && ex.added === 1 && ex.changed === 1, 'Excel edits merge in ' + JSON.stringify(ex));

  // delete with confirm; Back closes the confirm first
  await page.evaluate(() => GS.go('#svclog'));
  const n0 = await page.evaluate(() => GSStore.data.service.length);
  await page.locator('[data-del^="service|"]').first().click();
  ok(await page.locator('.overlay').count() === 1, 'delete asks first');
  await back();
  ok(await page.locator('.overlay').count() === 0 && (await page.evaluate(() => location.hash)) === '#svclog', 'Back closes the confirm, stays on the page');
  await page.locator('[data-del^="service|"]').first().click(); await page.click('[data-x=ok]');
  const del = await page.evaluate(() => ({ n: GSStore.data.service.length, t: GSStore.data.deleted.length, bk: Object.keys(localStorage).some(k => k.includes('.backup.before-delete')) }));
  ok(del.n === n0 - 1 && del.t === 1 && del.bk, 'deleted with tombstone and backup');
  // a tombstoned row is not brought back by a merge
  const tomb = await page.evaluate(() => { const old = JSON.parse(JSON.stringify(GSX.tablesOf(GSStore.data))); old.service.push({ id: GSStore.data.deleted[0], date: '2026-01-01', weaponId: 'G1', kind: 'Cleaning', cleaningDone: true, changes: [] }); return GSX.merge(null, GSX.tablesOf(GSStore.data), old, GSStore.data.deleted).data.service.length === GSStore.data.service.length; });
  ok(tomb, 'tombstones keep deleted rows deleted');

  // Back: pages → home → double-Back closes
  await page.evaluate(() => { GS.go('#ammo'); });
  await page.evaluate(() => GS.go('#mun/GM1'));
  await back(); ok((await page.evaluate(() => location.hash)) === '#ammo', 'Back to previous page');
  await page.evaluate(() => location.replace('#home'));
  await page.waitForTimeout(50);
  ok(await back() === true, 'first Back on home stays');
  ok(await back() === false, 'second Back on home closes');

  // data kept after reload
  await page.evaluate(() => GSStore.flush());
  await page.reload();
  ok(/Tikka T3x/.test(await txt()) && (await page.evaluate(() => GSStore.data.moves.length)) === 4, 'data kept after reload ' + (await page.evaluate(() => GSStore.data.moves.length)) + (await txt()).slice(0, 300));
  // dark mode tokens exist
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)', 'dark theme background ' + bg);
  await page.screenshot({ path: path.join(ROOT, 'build', 'test-home-dark.png') }).catch(() => {});
  ok(errors.length === 0, 'no page errors (A): ' + errors.join(' | '));
  await page.close();
}

/* ---------------- B: Android mode with a fake GSNative ---------------- */
const FAKE = () => {
  const mem = { db: '', bak: '', aux: {}, backups: [], storage: { mode: 'local', folder: '/Stoic Ranger/' }, srStorage: null, dav: {}, etagN: 0, puts: 0, force412: 0, srBarrels: null };
  window.__mem = mem;
  const cb = (id, o) => setTimeout(() => window.GSNativeCallback(id, o), 5);
  const pub = s => { const o = Object.assign({}, s); o.pwSet = !!o.pw; delete o.pw; return JSON.stringify(o); };
  const sr = {
    weapons: [{ id: 'W1', name: 'Sako TRG 22', caliber: '.308 Win' }],
    barrels: [{ id: 'B1', weaponId: 'W1', name: 'Factory 660', lengthMm: 660, installed: '2024-01-01', removed: '' }],
    munitions: [{ id: 'M1', name: 'Lapua Scenar 167', caliber: '.308 Win' }],
    rounds: [{ date: '2023-05-01', weaponId: 'W1', munitionId: 'M1', rounds: 500, source: 'datasheet', ref: 'T0' },
      { date: '2026-03-01', weaponId: 'W1', munitionId: 'M1', rounds: 60, source: 'datasheet', ref: 'T1' }],
  };
  window.__sr = sr;
  window.GSNative = {
    loadDb: () => mem.db, saveDb: t => { mem.bak = mem.db; mem.db = t; return true; }, loadDbBackup: () => mem.bak,
    backupDb: n => { mem.backups.push(n); return true; }, loadAux: n => mem.aux[n] || '', saveAux: (n, s) => { mem.aux[n] = s; return true; },
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.1.0' }), backLog: () => 'fake',
    saveFile: (n, m, b, id) => cb(id, { ok: true, msg: n }), openFile: id => cb(id, { ok: false, msg: 'cancelled' }),
    srStatus: () => JSON.stringify({ installed: true, version: '1.3.0' }),
    srCall: (m, arg) => {
      if (m === 'gunsafe') return JSON.stringify(sr);
      // like SR Shooting 1.3.0: new ids B-nnn come back at once, the change itself is applied at SR's next start
      if (m === 'putBarrels') { const b = JSON.parse(arg).barrels; mem.srBarrels = b; const ids = b.map((x, i) => x.id || 'B-' + String(100 + i)); mem.srApply = () => b.forEach((x, i) => { x = Object.assign({}, x, { id: ids[i] }); const j = sr.barrels.findIndex(y => y.id === x.id); if (j >= 0) sr.barrels[j] = x; else sr.barrels.push(x); }); return JSON.stringify({ ok: true, ids }); }
      return '{"error":"unknown method"}';
    },
    storageGet: () => pub(mem.storage),
    storageSet: j => { const o = JSON.parse(j); const pw = o.password; delete o.password; mem.storage = Object.assign({}, o, { pw: pw || mem.storage.pw, changed: new Date().toISOString() }); if (o.mode === 'local') delete mem.storage.pw; return pub(mem.storage); },
    storagePush: pkgs => { mem.srStorage = Object.assign({}, mem.storage); return true; },
    storagePull: pkgs => { if (mem.srStorage && mem.srStorage.changed > (mem.storage.changed || '')) { mem.storage = Object.assign({}, mem.srStorage); return JSON.stringify(Object.assign(JSON.parse(pub(mem.storage)), { adopted: true })); } return pub(mem.storage); },
    nc: (op, p, b64, ifMatch, id) => {
      const f = mem.dav[p];
      if (op === 'get') return cb(id, f ? { ok: true, status: 200, data: f.data, etag: f.etag } : { ok: false, status: 404 });
      if (op === 'put' || op === 'putNew') {
        if (op === 'putNew' && f) return cb(id, { ok: false, status: 412 });
        if (op === 'put' && mem.force412 > 0) { mem.force412--; mem.dav[p] = { data: f.data, etag: 'e' + (++mem.etagN) }; return cb(id, { ok: false, status: 412 }); }
        if (op === 'put' && f && ifMatch && ifMatch !== f.etag) return cb(id, { ok: false, status: 412 });
        mem.puts++; mem.dav[p] = { data: b64, etag: 'e' + (++mem.etagN) }; return cb(id, { ok: true, status: 201 });
      }
      if (op === 'mkdirs') return cb(id, { ok: true });
      if (op === 'list') { const pre = p; return cb(id, { ok: true, names: Object.keys(mem.dav).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => k.slice(pre.length)) }); }
      if (op === 'delete') { delete mem.dav[p]; return cb(id, { ok: true }); }
      cb(id, { ok: false, msg: 'op?' });
    },
  };
};
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  const txt = async () => page.locator('#screen').textContent();
  ok(/SR Shooting is installed/.test(await txt()), 'asks before linking');
  ok(!(await txt()).includes('Sako'), 'nothing read before consent');
  await page.click('#lnYes');
  ok((await txt()).includes('Sako TRG 22') && (await txt()).includes('560'), 'linked: SR gun with SR rounds ' + await txt());
  ok((await page.evaluate(() => GSSync.fileName())) === 'database.xlsx', 'linked uses database.xlsx');

  // stock of SR ammo: SR rounds before the first purchase do not count
  await page.evaluate(() => GS.go('#buy/M1'));
  await page.fill('#bDate', '2026-02-01'); await page.fill('#bQty', '500'); await page.fill('#bPrice', '700'); await page.click('#fBuy button[type=submit]');
  ok((await page.evaluate(() => GSModel.munFig('M1').stock)) === 440, 'SR rounds after the purchase reduce the stock');

  // service on an SR gun: new barrel goes to SR Shooting
  await page.evaluate(() => GS.go('#service/W1'));
  await page.check('input[name=brl][value=new]'); await page.fill('#bName', 'Bartlein 26"'); await page.fill('#bLen', '660');
  await page.click('#sSave');
  const pb = await page.evaluate(() => ({ sent: __mem.srBarrels, cur: GSModel.currentBarrel('W1').name, since: GSModel.gunFig('W1').since }));
  ok(pb.sent && pb.sent.length === 2 && pb.sent[1].removed && pb.cur === 'Bartlein 26"', 'barrel switch on SR gun via putBarrels ' + JSON.stringify(pb.sent));
  ok(pb.since === 0, 'service with cleaning done on SR gun resets since');
  const ap = await page.evaluate(() => { __mem.srApply(); GSLink.refresh(); return { pend: GSStore.data.srPending.length, cur: GSModel.currentBarrel('W1').id, n: GSModel.barrels('W1').length }; });
  ok(ap.pend === 0 && ap.cur === 'B-100' && ap.n === 2, 'pending barrel change ends once SR Shooting applied it ' + JSON.stringify(ap));

  // Nextcloud: set up, first sync uploads
  await page.evaluate(() => GS.go('#settings'));
  await page.check('input[name=stm][value=nextcloud]');
  await page.fill('#ncUrl', 'https://cloud.example.com'); await page.fill('#ncUser', 'manuel'); await page.fill('#ncPw', 'abcde-fghij');
  await page.click('#ncSync');
  await page.waitForFunction(() => !GSSync.state().busy && Object.keys(__mem.dav).length > 0);
  await page.waitForTimeout(50);
  let m = await page.evaluate(() => ({ files: Object.keys(__mem.dav), st: __mem.storage, push: __mem.srStorage, page: document.getElementById('screen').innerText }));
  ok(m.files.includes('Stoic Ranger/database.xlsx'), 'first sync uploads database.xlsx ' + m.files);
  ok(m.push && m.push.mode === 'nextcloud', 'setting pushed to SR Shooting');
  ok(!JSON.stringify(await page.evaluate(() => GSSync.setting())).includes('abcde'), 'password never comes back to the page');
  ok(!Object.values(await page.evaluate(() => __mem.aux)).join('').includes('abcde') && !(await page.evaluate(() => __mem.db)).includes('abcde'), 'password not in data files');

  // another device / SR Shooting changes the file: adds a sheet and an owner → merge in, keep the sheet, back up
  await page.evaluate(() => {
    const p = 'Stoic Ranger/database.xlsx', X = XLSX, wb = X.read(GSSync.unb64(__mem.dav[p].data), { type: 'array' });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['ID', 'Name'], ['W1', 'Sako TRG 22']]), 'Weapons');
    X.utils.sheet_add_aoa(wb.Sheets.GS_Owners, [['O7', 'Ines (from PC)', '']], { origin: -1 });
    __mem.dav[p] = { data: GSSync.b64(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))), etag: 'pc1' };
  });
  await page.evaluate(() => { GSStore.data.owners.push({ id: 'O1', name: 'Manuel', notes: '' }); GSStore.changed('owner'); });
  await page.evaluate(() => { __mem.force412 = 1; });
  const r = await page.evaluate(() => GSSync.sync('now'));
  m = await page.evaluate(() => {
    const p = 'Stoic Ranger/database.xlsx', wb = XLSX.read(GSSync.unb64(__mem.dav[p].data), { type: 'array' });
    return { names: wb.SheetNames, owners: GSStore.data.owners.map(o => o.name), backups: Object.keys(__mem.dav).filter(k => k.includes('/backups/')), remoteOwners: XLSX.utils.sheet_to_json(wb.Sheets.GS_Owners).map(o => o.Name) };
  });
  ok(r.ok, 'sync with a changed file ok: ' + r.msg);
  ok(m.owners.includes('Ines (from PC)') && m.owners.includes('Manuel'), 'merged both sides ' + m.owners);
  ok(m.remoteOwners.includes('Manuel') && m.remoteOwners.includes('Ines (from PC)'), 'uploaded merged file');
  ok(m.names.includes('Weapons'), 'other apps\' sheets kept on Nextcloud');
  ok(m.backups.length >= 1 && /backups\/database-\d{8}-\d{6}\.xlsx$/.test(m.backups[0]), 'backup before upload ' + m.backups);

  // nothing changed → no upload
  const puts = await page.evaluate(() => __mem.puts);
  await page.evaluate(() => GSSync.sync('now'));
  ok((await page.evaluate(() => __mem.puts)) === puts, 'no upload when nothing changed');
  // a change syncs by itself a few seconds later
  await page.evaluate(() => { GSStore.data.owners.push({ id: 'O2', name: 'Paul', notes: '' }); GSStore.changed('owner'); });
  await page.waitForFunction(() => __mem.puts > 0 && XLSX.utils.sheet_to_json(XLSX.read(GSSync.unb64(__mem.dav['Stoic Ranger/database.xlsx'].data), { type: 'array' }).Sheets.GS_Owners).some(o => o.Name === 'Paul'), null, { timeout: 8000 }).then(() => ok(true, ''), () => ok(false, 'auto sync after a change'));

  // SR Shooting switched to local → GunSafe adopts it on start
  await page.evaluate(() => { __mem.srStorage = { mode: 'local', folder: '/Stoic Ranger/', changed: new Date(Date.now() + 1000).toISOString() }; GSSync.pull(); });
  ok((await page.evaluate(() => GSSync.state().on)) === false, 'adopts phone-only from the linked app');
  // switching to local here asks first, Back cancels and the radio stays
  await page.evaluate(() => { __mem.storage = Object.assign({}, __mem.storage, { mode: 'nextcloud', url: 'https://cloud.example.com', user: 'manuel', pw: 'x' }); });
  await page.evaluate(() => { location.hash = '#home'; }); await page.evaluate(() => GS.go('#settings'));
  await page.check('input[name=stm][value=local]');
  ok(await page.locator('.overlay').count() === 1, 'going local asks first');
  await page.evaluate(() => GS.back());
  ok((await page.locator('input[name=stm][value=nextcloud]').isChecked()) && (await page.evaluate(() => __mem.storage.mode)) === 'nextcloud', 'Back cancels going local');
  await page.check('input[name=stm][value=local]'); await page.click('[data-x=ok]');
  const loc = await page.evaluate(() => ({ me: __mem.storage.mode, sr: __mem.srStorage.mode, pw: !!__mem.storage.pw }));
  ok(loc.me === 'local' && loc.sr === 'local' && !loc.pw, 'phone only here → SR Shooting goes local too ' + JSON.stringify(loc));
  ok(errors.length === 0, 'no page errors (B): ' + errors.join(' | '));
  await ctx.close();
}

/* ---------------- C: newer data opens read-only ---------------- */
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(FAKE);
  await ctx.addInitScript(() => { window.__mem.db = JSON.stringify({ app: 'sr-gunsafe', format: 99, data: { guns: [{ id: 'G1', name: 'Future gun' }], futureTable: [1] } }); });
  const page = await ctx.newPage();
  await page.goto(URL);
  const t = await page.locator('#screen').textContent();
  ok(/newer version/i.test(t) && t.includes('Future gun') && !t.includes('Add a gun'), 'newer data: read-only notice, shown, no edits ' + t);
  await page.evaluate(() => { GSStore.changed('x'); GSStore.flush(); });
  ok((await page.evaluate(() => JSON.parse(__mem.db).format)) === 99, 'newer data never written');
  await ctx.close();
}

await browser.close();
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
