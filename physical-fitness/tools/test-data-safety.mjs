// Data safety with a fake Android bridge (same calls as MainActivity): save/load, backup before migrating,
// newer data opens read-only and is never written, damaged file falls back to the previous copy, every drawing renders.
// node tools/test-data-safety.mjs
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'app/src/main/assets/www/index.html#today');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const b = await chromium.launch();
/* the fake bridge keeps its "files" in window.name-free storage injected per page */
const bridge = files => `
  window.__files = ${JSON.stringify(files)}; window.__writes = 0; window.__backups = [];
  window.PFNative = {
    loadDb: () => window.__files.db || '', loadDbBackup: () => window.__files.bak || '',
    saveDb: t => { window.__writes++; window.__files.bak = window.__files.db || ''; window.__files.db = t; return true; },
    backupDb: n => { window.__backups.push([n, window.__files.db || '']); return true; },
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.4.0', android: '14', device: 'test' }),
    saveFile: () => {}, openFile: () => {}, shareFile: () => {}, shareText: () => {}, print: () => {} };`;
async function page(files) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.addInitScript(bridge(files)); await p.goto(url); await p.waitForTimeout(250); p.errs = errs; p.ctx = ctx; return p;
}
const sample = (schema, extra = {}) => JSON.stringify(Object.assign({
  app: 'sr-physical-fitness', schema, settings: { sessions: 3, minutes: 45, days: ['Mon', 'Wed', 'Fri'], eq: { kb: [16] } },
  plans: [{ id: 'p1', block: 1, start: '2026-11-02', status: 'active', cfgHist: [{ from: 1, cfg: { sessions: 3, minutes: 45, days: ['Mon', 'Wed', 'Fri'], eq: { kb: [16], db: [], sb: [], bands: [], bar: true } } }], base: {}, swaps: [] }],
  sets: [{ id: 's1', plan: 'p1', week: 1, sess: 0, slot: 'squat', ex: 'goblet', set: 1, reps: 10, kg: 16, done: true, date: '2026-11-02', at: '2026-11-02T10:00:00Z' }],
  activities: [{ id: 'a1', date: '2026-11-01', type: 'ruck', min: 90, km: 8, kg: 15, futureField: 'keep me' }]
}, extra));

// 1. first start: empty, then saved through the bridge
let p = await page({});
ok(await p.evaluate(() => PF.firstRun && !PF.readOnly), 'first start: empty database');
await p.evaluate(() => { PF.put('activities', { date: '2026-11-03', type: 'walk', min: 30 }); PF.flush(); });
const saved = await p.evaluate(() => JSON.parse(window.__files.db));
ok(saved.app === 'sr-physical-fitness' && saved.schema === 2 && saved.activities.length === 1, 'saved to db.json via the bridge');
ok(!p.errs.length, 'no errors on first start ' + p.errs.join(' | ')); await p.ctx.close();

// 2. existing data of the same schema: loaded, unknown fields kept, nothing lost
p = await page({ db: sample(2) });
const r2 = await p.evaluate(() => { PF.put('activities', { date: '2026-11-04', type: 'run', min: 20 }); PF.flush(); const d = JSON.parse(window.__files.db); return { n: d.activities.length, keep: d.activities[0].futureField, sets: d.sets.length, backups: window.__backups.length }; });
ok(r2.n === 2 && r2.keep === 'keep me' && r2.sets === 1, 'existing data kept, unknown fields kept');
ok(r2.backups === 0, 'no migration backup needed for the same schema'); await p.ctx.close();

// 3. older schema: 0.2.0 data (schema 1) → 0.3.0 (schema 2: drinks, weights, profile): backup first, then converted
p = await page({ db: sample(1) });
const r3 = await p.evaluate(() => { PF.flush(); const d = JSON.parse(window.__files.db); return { migrated: PF.migrated, backups: window.__backups.map(b => b[0]), schema: PF.db.schema, sets: PF.db.sets.length, hist: PF.db.history.length,
  fresh: Array.isArray(PF.db.drinks) && Array.isArray(PF.db.weights) && PF.db.settings.profile && PF.db.settings.profile.drinkMl === 2000, keep: PF.db.activities[0].futureField, kb: PF.db.settings.eq.kb.join(), savedSchema: d.schema }; });
ok(r3.backups.length === 1 && /db-schema1-/.test(r3.backups[0]) && r3.schema === 2 && r3.sets === 1 && r3.hist === 1 && r3.fresh && r3.keep === 'keep me' && r3.kb === '16', 'older data (0.2.0): backup kept, then migrated without losing rows; drinks, weights, profile added'); await p.ctx.close();
// 3b. even older (schema 0): also goes through every step
p = await page({ db: sample(0) });
const r3b = await p.evaluate(() => ({ backups: window.__backups.map(b => b[0]), schema: PF.db.schema, sets: PF.db.sets.length }));
ok(r3b.backups.length === 1 && /db-schema0-/.test(r3b.backups[0]) && r3b.schema === 2 && r3b.sets === 1, 'schema 0 data: backup, migrated to 2'); await p.ctx.close();

// 4. newer schema: read-only, never written
p = await page({ db: sample(99) });
const r4 = await p.evaluate(async () => {
  const before = window.__files.db;
  PF.put('activities', { date: '2026-11-05', type: 'walk', min: 10 }); PF.save(true); PF.flush();
  location.hash = '#setup'; await new Promise(r => setTimeout(r, 100));
  return { ro: PF.readOnly, same: window.__files.db === before, writes: window.__writes, banner: !!document.querySelector('.robar') };
});
ok(r4.ro && r4.same && r4.writes === 0 && r4.banner, 'newer data opens read-only and is never overwritten');
ok(!p.errs.length, 'read-only views without errors ' + p.errs.join(' | ')); await p.ctx.close();

// 5. damaged db.json: previous copy used, damaged one kept
p = await page({ db: '{"app":"sr-physical-fit', bak: sample(2) });
const r5 = await p.evaluate(() => ({ rec: PF.recovered, sets: PF.db.sets.length, kept: window.__backups.some(b => /damaged/.test(b[0]) && b[1].startsWith('{"app"')) }));
ok(r5.rec && r5.sets === 1 && r5.kept, 'damaged file: previous copy restored, damaged file kept'); await p.ctx.close();

// 6. a file of another app is never taken as ours
p = await page({ db: JSON.stringify({ app: 'sr-daily-thoughts', favs: [] }) });
ok(await p.evaluate(() => PF.recovered && PF.db.app === 'sr-physical-fitness'), 'foreign file not used as fitness data'); await p.ctx.close();

// 7. every exercise drawing (start, middle, end) and muscle map renders without NaN
p = await page({});
const bad = await p.evaluate(() => { const out = []; for (const e of EXLIST) { for (const t of [0, 0.5, 1]) { const s = FIG.svg(e, t); if (/NaN|undefined/.test(s)) out.push(e.id + '@' + t); } if (/NaN/.test(MMAP.svg(e.prim, e.sec))) out.push(e.id + ' map'); for (const k of e.prim.concat(e.sec)) if (!FIG.MUSCLE_NAMES[k]) out.push(e.id + ' muscle ' + k); if (!e.how.length) out.push(e.id + ' no how-to'); for (const x of [e.easy, e.hard]) if (x && /^[a-z0-9_]+$/.test(x) && !EX[x]) out.push(e.id + ' link ' + x); } for (const m of MOB) if (!EX[m.ex]) out.push('mob ' + m.id); return out; });
ok(!bad.length, `all ${await p.evaluate(() => EXLIST.length)} exercises draw cleanly, links valid ${bad.slice(0, 10).join(', ')}`);
// 8. plan engine: every week/session of a plan with all equipment and with none fills the time budget
const r8 = await p.evaluate(() => {
  const P = PF.plan; const res = [];
  for (const eq of [PF.DEFAULT_SETTINGS().eq, { kb: [], db: [], sb: [], bands: [], bar: false, mini: false, bench: false }, Object.assign(PF.DEFAULT_SETTINGS().eq, { db: [10, 15], gripper: true, roller: true })])
    for (const [n, m] of [[2, 30], [3, 45], [4, 60], [6, 20]]) {
      const pl = { id: 't', block: 1, start: '2026-11-02', cfgHist: [{ from: 1, cfg: { sessions: n, minutes: m, days: PF.DAYS.slice(0, n), eq } }], base: P.baseFrom(P.DEF_ASSESS), swaps: [] };
      for (let w = 1; w <= 12; w++) for (let i = 0; i < n; i++) { const s = P.session(pl, w, i); const tot = s.warm + s.main + s.cool; if (s.items.length < 2 || tot > m + 8) res.push(`${n}x${m} w${w}s${i}: ${s.items.length} ex, ${Math.round(tot)} min`); for (const r of s.items) if (!P.available(eq, r.id)) res.push('needs equipment ' + r.id); }
    }
  return res;
});
ok(!r8.length, 'plans fit the time budget and the equipment ' + r8.slice(0, 6).join(' | '));
await p.ctx.close();
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
