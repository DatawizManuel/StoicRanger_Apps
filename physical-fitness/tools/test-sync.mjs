// Nextcloud sync (js/sync.js) with fake Android bridges on two "phones" and one fake Nextcloud file (ETag, If-Match,
// 412, backups). The Java side (WebDav.java, NcFile.java) is tested by tools/test-nc.sh against a WebDAV stand-in.
// node tools/test-sync.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'app/src/main/assets/www/index.html#today');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const b = await chromium.launch();

/* one fake Nextcloud file shared by both phones */
const srv = { bytes: null, etag: '', uploads: 0, backups: [], fail412: 0, offline: false, calls: 0 };
const tag = buf => '"' + crypto.createHash('md5').update(buf).digest('hex') + '"';
async function nc(op, b64, etag) {
  srv.calls++;
  if (srv.offline) return { status: 0, error: 'Unable to resolve host' };
  if (op === 'get') return srv.bytes ? { status: 200, etag: srv.etag, b64: srv.bytes.toString('base64') } : { status: 404 };
  if (srv.fail412 > 0) { srv.fail412--; return { status: 412 }; }
  if (etag ? etag !== srv.etag : !!srv.bytes) return { status: 412 };
  if (srv.bytes) srv.backups.push(srv.bytes);                   // NcFile.upload copies the old file first
  srv.bytes = Buffer.from(b64, 'base64'); srv.etag = tag(srv.bytes); srv.uploads++;
  return { status: 201, etag: srv.etag };
}
const bridge = (name, mode) => `
  window.__files = {}; window.__backups = []; window.__mode = ${JSON.stringify(mode)};
  const cb = (id, r) => window.PFNativeCallback(id, { ok: r.status >= 200 && r.status < 300, msg: r.error || '', data: JSON.stringify(r) });
  window.PFNative = {
    loadDb: () => window.__files.db || '', loadDbBackup: () => window.__files.bak || '',
    saveDb: t => { window.__files.bak = window.__files.db || ''; window.__files.db = t; return true; },
    backupDb: n => { window.__backups.push(n); return true; },
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.2.0', android: '14', device: '${name}' }),
    saveFile: () => {}, openFile: () => {}, shareFile: () => {}, shareText: () => {}, print: () => {},
    storageGet: () => JSON.stringify({ mode: window.__mode, url: 'https://cloud.example.com', user: 'manuel', folder: '/Stoic Ranger/', file: 'fitness.xlsx', hasPassword: true, changed: '', peers: [{ pkg: 'at.stoicranger.dailythoughts', installed: true, linked: false, name: 'SR_Daily Thoughts' }] }),
    storageSet: (j, pw) => { window.__mode = JSON.parse(j).mode; return window.PFNative.storageGet(); },
    storageRefresh: () => false, linkSet: () => window.PFNative.storageGet(),
    ncTest: id => window.__nc('test').then(r => cb(id, r)),
    ncDownload: id => window.__nc('get').then(r => cb(id, r)),
    ncUpload: (b64, etag, id) => window.__nc('put', b64, etag).then(r => cb(id, r)) };`;
async function phone(name, mode = 'nextcloud') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.exposeFunction('__nc', nc);
  await p.addInitScript(bridge(name, mode)); await p.goto(url); await p.waitForTimeout(1200); p.errs = errs; p.ctx = ctx; return p;
}
const sync = p => p.evaluate(() => PF.sync.run());

// 0. data only on the phone: no network at all
let off = await phone('local', 'local');
await off.evaluate(() => PF.put('activities', { date: '2026-11-05', type: 'walk', min: 20 }));
await off.waitForTimeout(3000);
ok(srv.calls === 0 && !srv.bytes, '"This phone only": nothing is sent');
await off.ctx.close();

// a database.xlsx of another app already on Nextcloud: its sheets must survive
const A = await phone('A');
srv.bytes = Buffer.from(await A.evaluate(() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'Name'], ['g1', 'Rifle']]), 'Weapons'); return PF.b64.fromBytes(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))); }), 'base64');
srv.etag = tag(srv.bytes); srv.calls = 0;

// 1. phone A: plan, sets, an activity → first sync writes its sheets into the file
await A.evaluate(() => {
  PF.plan.create({ start: PF.todayIso(), cfg: { sessions: 3, minutes: 45, days: ['Mon', 'Wed', 'Fri'], eq: PF.clone(PF.db.settings.eq), skip: [] }, base: PF.plan.baseFrom(PF.plan.DEF_ASSESS) });
  const pl = PF.plan.current();
  PF.put('sets', { id: 's1', plan: pl.id, week: 1, sess: 0, slot: 'squat', ex: 'goblet', set: 1, reps: 10, kg: 16, done: true, date: PF.todayIso() });
  PF.put('sets', { id: 's2', plan: pl.id, week: 1, sess: 0, slot: 'squat', ex: 'goblet', set: 2, reps: 9, kg: 16, done: true, date: PF.todayIso() });
  PF.put('activities', { id: 'a1', date: '2026-11-05', type: 'ruck', min: 90, km: 8, kg: 15, note: 'hills' });
  PF.flush();
});
let r = await sync(A);
const sheets = await A.evaluate(b64 => XLSX.read(PF.b64.toBytes(b64), { type: 'array' }).SheetNames, srv.bytes.toString('base64'));
ok(r.ok && sheets.includes('Weapons') && sheets.includes('PF_Sets') && sheets.includes('_PF_Data'), 'first sync: PF_ sheets added, the other app\'s sheet kept (' + sheets.join(', ') + ')');
ok(srv.backups.length === 1, 'backup of the old file before the upload');
ok(await A.evaluate(() => /Last sync/.test(PF.sync.status())), 'status shows the last sync');

// 2. phone B (new phone, empty) gets everything
const B = await phone('B');
r = await sync(B);
ok(r.ok && await B.evaluate(() => PF.db.sets.length === 2 && PF.db.plans.length === 1 && PF.db.activities[0].note === 'hills'), 'second phone receives plans, sets and activities');
ok(await B.evaluate(() => PF.plan.current() && PF.plan.session(PF.plan.current(), 1, 0).items.length > 0), 'second phone can train from the synced plan');

// 3. both change: A deletes s2 and edits a1, B adds an activity and edits a1's other field
await A.evaluate(() => { PF.del('sets', 's2'); const a = PF.db.activities.find(x => x.id === 'a1'); a.min = 95; PF.put('activities', a); PF.flush(); });
await B.evaluate(() => { PF.put('activities', { id: 'b1', date: '2026-11-06', type: 'run', min: 30, km: 6 }); PF.flush(); });
const upBefore = srv.uploads;
ok((await sync(B)).ok && (await sync(A)).ok && (await sync(B)).ok, 'both phones sync after changes');
const st = p => p.evaluate(() => ({ sets: PF.db.sets.map(s => s.id).sort().join(), acts: PF.db.activities.map(a => a.id + ':' + a.min).sort().join() }));
const sa = await st(A), sb = await st(B);
ok(sa.sets === 's1' && sb.sets === 's1', 'a set deleted on one phone is deleted on the other (tombstone)');
ok(sa.acts === 'a1:95,b1:30' && sb.acts === sa.acts, 'changes from both phones merged: ' + sa.acts + ' / ' + sb.acts);
ok(srv.uploads > upBefore, 'uploads happened');
const noChange = srv.uploads; await sync(A);
ok(srv.uploads === noChange, 'nothing changed → nothing uploaded');

// 4. edited in Excel on the PC: a cell changed, a row typed in without id, a row deleted
const edited = await A.evaluate(b64 => {
  const wb = XLSX.read(PF.b64.toBytes(b64), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.PF_Activities, { defval: '' });
  rows.find(x => x.id === 'a1').note = 'hills, rain';
  rows.push({ id: '', date: '2026-11-07', type: 'swim', name: '', min: 40, km: '', m: '', elev: '', kg: '', hr: '', rpe: '', note: 'typed in Excel', at: '' });
  wb.Sheets.PF_Activities = XLSX.utils.json_to_sheet(rows.filter(x => x.id !== 'b1'));
  return PF.b64.fromBytes(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })));
}, srv.bytes.toString('base64'));
srv.bytes = Buffer.from(edited, 'base64'); srv.etag = tag(srv.bytes);
r = await sync(A);
const ex = await A.evaluate(() => ({ note: PF.db.activities.find(a => a.id === 'a1').note, swim: PF.db.activities.filter(a => a.type === 'swim' && a.id).length, b1: !!PF.db.activities.find(a => a.id === 'b1'), bk: window.__backups.filter(n => n.startsWith('db-before-sync')).length }));
ok(r.ok && ex.note === 'hills, rain', 'Excel cell edit arrives on the phone');
ok(ex.swim === 1, 'row typed in Excel without id is added (and gets an id)');
ok(ex.b1, 'a row deleted in Excel is NOT deleted on the phone (a sync never deletes)');
ok(ex.bk >= 1, 'copy of the phone data kept before the sync changed it');
await sync(A);
ok(await A.evaluate(b64 => XLSX.utils.sheet_to_json(XLSX.read(PF.b64.toBytes(b64), { type: 'array' }).Sheets.PF_Activities).filter(x => x.type === 'swim').length === 1, srv.bytes.toString('base64')), 'the Excel row is written back once, with its id');

// 5. someone else wrote meanwhile (412): download, merge, try again
srv.fail412 = 1; await A.evaluate(() => { PF.put('activities', { id: 'a9', date: '2026-11-07', type: 'yoga', min: 15 }); PF.flush(); });
r = await sync(A);
ok(r.ok && await A.evaluate(b64 => XLSX.utils.sheet_to_json(XLSX.read(PF.b64.toBytes(b64), { type: 'array' }).Sheets.PF_Activities).some(x => x.id === 'a9'), srv.bytes.toString('base64')), '412 → merged again and uploaded on the next try');
srv.fail412 = 5; await A.evaluate(() => { PF.put('activities', { id: 'a10', date: '2026-11-07', type: 'walk', min: 15 }); PF.flush(); });
r = await sync(A); srv.fail412 = 0;
ok(!r.ok && await A.evaluate(() => /3 tries/.test(PF.sync.status()) && !!PF.db.activities.find(a => a.id === 'a10')), 'after 3 refused uploads: message, phone data kept');

// 6. offline: message, nothing lost
srv.offline = true; r = await sync(A); srv.offline = false;
ok(!r.ok && await A.evaluate(() => /offline/.test(PF.sync.status()) && PF.db.activities.length >= 4), 'offline: message, data stays on the phone');

// 7. settings and muscle groups travel; a change elsewhere wins when this phone did not change it
await B.evaluate(() => PF.sync.run());
await B.evaluate(() => { PF.db.settings.skip = ['neck']; PF.db.settings.minutes = 60; PF.db.settings.at = PF.now(); PF.save(true); });
await sync(B); await sync(A);
ok(await A.evaluate(() => PF.db.settings.skip.join() === 'neck' && PF.db.settings.minutes === 60), 'settings changed on the other phone arrive');

// 8. the Setup screen shows the section; switching to "this phone only" stops syncing
await A.evaluate(() => PF.go('#setup')); await A.waitForTimeout(200);
ok(await A.evaluate(() => /Where your data lives/.test(document.body.innerText) && !!document.querySelector('[data-stsync]')), 'Setup shows "Where your data lives" with Sync now');
await B.ctx.close(); await A.waitForTimeout(500);                  // B's own pending sync must not count
await A.click('[data-stmode="local"]'); srv.calls = 0;
await A.evaluate(() => { PF.put('activities', { date: '2026-11-08', type: 'walk', min: 10 }); }); await A.waitForTimeout(3000);
ok(srv.calls === 0 && await A.evaluate(() => !PF.sync.enabled()), 'calls=' + srv.calls + ' mode=' + await A.evaluate(() => window.__mode) + ' back to "this phone only": no more syncing, nothing deleted');
ok(!A.errs.length && !B.errs.length, 'no console errors ' + A.errs.concat(B.errs).slice(0, 3).join(' | '));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
