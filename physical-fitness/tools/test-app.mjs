// End-to-end test of the web app in Chromium (no native bridge: localStorage stands in for db.json).
// node tools/test-app.mjs [screenshotDir]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'app/src/main/assets/www/index.html');
const shots = process.argv[2]; if (shots) fs.mkdirSync(shots, { recursive: true });
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const b = await chromium.launch();
async function run(theme) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(url + '#today'); await p.waitForTimeout(300);
  const shot = async n => shots && p.screenshot({ path: path.join(shots, `${theme}-${n}.png`), fullPage: true });
  const go = async h => { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(150); };
  const click = async sel => { await p.click(sel); await p.waitForTimeout(120); };
  await shot('01-welcome');
  // setup: add dumbbells, save
  await go('#setup'); await click('[data-eqdb="10"]'); await click('[data-eqdb="12.5"]'); await click('[data-savesetup]');
  ok(await p.evaluate(() => PF.db.settings.eq.db.join() === '10,12.5'), 'setup saves dumbbells');
  await shot('02-setup');
  // assessment
  await go('#assess'); await click('[data-tav="swingKg|24"]'); await p.fill('[data-k=pullup]', '6'); await p.dispatchEvent('[data-k=pullup]', 'input');
  await shot('03-assess'); await click('[data-saveassess]');
  ok(await p.evaluate(() => PF.db.assessments.length === 1 && PF.db.assessments[0].swingKg === 24 && PF.db.assessments[0].pullup === 6), 'assessment saved');
  // new plan starting this week's Monday so week 1 is current
  await go('#new');
  await p.evaluate(() => { const d = PF.today(); const m = PF.addDays(d, -((d.getDay() + 6) % 7)); PF.ui.np.start = PF.iso(m); PF.rerender(); });
  await shot('04-new'); await click('[data-createplan]');
  ok(await p.evaluate(() => PF.db.plans.length === 1 && PF.plan.weekNo(PF.plan.current()) === 1), 'plan created, week 1');
  await go('#today'); await shot('05-today');
  await go('#plan'); await shot('06-plan');
  // open session 0, tick sets of first exercise, enter values, finish
  await go('#s/1/0'); await shot('07-session');
  const n = await p.$$eval('[data-setdone]', l => l.length); ok(n >= 6, 'session shows set rows: ' + n);
  await click('[data-setdone]'); await p.fill('[data-ch=set][data-f=reps]', '9'); await p.dispatchEvent('[data-ch=set][data-f=reps]', 'change');
  ok(await p.evaluate(() => PF.db.sets.length >= 1 && PF.db.sets.some(s => s.done)), 'set logged');
  // swap first exercise
  const sw = await p.$('[data-swap]'); await sw.click(); await p.waitForTimeout(150); await shot('08-swap');
  const picks = await p.$$('[data-pick]:not([disabled])'); if (picks.length) { await picks[0].click(); await p.waitForTimeout(150); }
  ok(await p.evaluate(() => (PF.plan.current().swaps || []).length === 1), 'swap stored');
  await click('[data-sdone]');
  ok(await p.evaluate(() => PF.db.sessions.some(s => s.done)), 'session finished');
  // mobility
  await go('#mobility'); await click('[data-mob]'); await click('[data-mobinfo]'); await shot('09-mobility');
  ok(await p.evaluate(() => PF.db.mobility.length === 1), 'mobility ticked');
  // activity
  await go('#act'); await click('[data-acttype=hike]'); await p.fill('#f-min', '120'); await p.dispatchEvent('#f-min', 'input'); await p.fill('#f-km', '9,5'); await p.dispatchEvent('#f-km', 'input');
  await click('[data-saveact]'); ok(await p.evaluate(() => PF.db.activities.length === 1 && PF.db.activities[0].km === 9.5), 'activity saved');
  await shot('10-activity');
  // library + detail (animation)
  await go('#library'); await shot('11-library');
  await go('#ex/kb_swing'); await p.waitForTimeout(700); await shot('12-exercise');
  // dashboard, next block preview
  await go('#dashboard'); await shot('13-dashboard');
  await go('#next'); await shot('14-next');
  // settings change on a running plan → asks where to apply
  await go('#setup'); await click('[data-mins="60"]'); await click('[data-savesetup]'); await shot('15-ask');
  await click('[data-apply=cur]');
  ok(await p.evaluate(() => PF.plan.current().cfgHist.slice(-1)[0].cfg.minutes === 60 && PF.plan.session(PF.plan.current(), 1, 0).cfg.minutes === 60), 'settings applied to current plan from this week');
  // muscle groups: leave chest + arms out during the block → asks, then no chest/arm-dominant exercise from this week on
  await go('#setup'); await click('[data-mg="chest"]'); await click('[data-mg="arms"]'); await shot('15b-muscles'); await click('[data-savesetup]');
  ok(await p.evaluate(() => /No longer targeted: Chest, Arms/.test(document.body.innerText)), 'muscle-group change listed in the question');
  await click('[data-apply=cur]');
  ok(await p.evaluate(() => { const P = PF.plan, pl = P.current(), w = P.curW(pl); const c = P.cfgAt(pl, w);
    if (c.skip.join() !== 'chest,arms') return false;
    for (let i = 0; i < P.sessionKeys(pl, w).length; i++) for (const r of P.session(pl, w, i).items) if (P.skipEx(r.id, c.skip)) return false;
    return P.session(pl, w, 0).items.length >= 3 && PF.db.settings.skip.join() === 'chest,arms'; }), 'not-targeted muscle groups left out of the current block');
  await go('#new'); ok(await p.evaluate(() => !!document.querySelector('[data-npmg="chest"]:not(.on)')), 'new plan starts with the saved muscle groups');
  await go('#setup'); await click('[data-mg="chest"]'); await click('[data-mg="arms"]'); await click('[data-savesetup]'); await click('[data-apply=new]');
  ok(await p.evaluate(() => PF.db.settings.skip.length === 0 && PF.plan.cfgAt(PF.plan.current(), PF.plan.curW(PF.plan.current())).skip.join() === 'chest,arms'), '"only new plans" keeps the running block as it was');
  // every view renders without errors
  for (const h of ['#today', '#plan', '#plan/12', '#mobility', '#library', '#dashboard', '#setup', '#assess', '#new', '#next', '#act', '#s/12/0', '#s/6/1']) await go(h);
  for (const e of await p.evaluate(() => EXLIST.map(e => e.id))) { await p.evaluate(h => location.hash = h, '#ex/' + e); }
  await p.waitForTimeout(200);
  // Excel round trip: export, parse, merge into an empty db → same rows; edit a cell → updated
  const rt = await p.evaluate(() => {
    const u8 = new Uint8Array(PF.xls.build()); const data = PF.xls.parse(u8);
    const empty = PF.normalize(PF.emptyDb()); const c = PF.xls.merge(empty, data);
    const same = PF.TABLES.every(t => empty[t].length === PF.db[t].length);
    const set0 = PF.db.sets[0]; const d2 = PF.xls.parse(u8); const r = d2.tables.Sets.find(x => x.id === set0.id); r.reps = 42;
    const copy = PF.clone(PF.db); const c2 = PF.xls.merge(copy, d2);
    const again = PF.xls.merge(PF.clone(PF.db), PF.xls.parse(u8));
    return { dbg: JSON.stringify([set0, r]), same, c, edited: copy.sets.find(x => x.id === set0.id).reps, c2, again, planOk: JSON.stringify(empty.plans[0].cfgHist) === JSON.stringify(PF.db.plans[0].cfgHist) };
  });
  ok(rt.same && rt.planOk, 'Excel round trip keeps every row (' + JSON.stringify(rt.c) + ')');
  ok(rt.edited === 42 && rt.c2.updated === 1, 'Excel edit is imported ' + (rt.edited === 42 ? '' : rt.dbg + JSON.stringify(rt.c2)));
  ok(rt.again.added === 0 && rt.again.updated === 0, 'importing the same file twice adds nothing');
  // shared-file layout: only PF_ sheets + hidden _PF_Data; other apps' sheets kept; 0.1.x files still import
  const lay = await p.evaluate(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'Name'], ['g1', 'Rifle']]), 'Weapons');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), '_StoicRanger');
    wb.Workbook = { Sheets: [{ name: 'Weapons', Hidden: 0 }, { name: '_StoicRanger', Hidden: 1 }] };
    const other = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    const out = new Uint8Array(PF.xls.build(PF.db, other)); const w2 = XLSX.read(out, { type: 'array' });
    const twice = XLSX.read(new Uint8Array(PF.xls.build(PF.db, out)), { type: 'array' });
    const names = w2.SheetNames; const hid = Object.fromEntries(w2.Workbook.Sheets.map(x => [x.name, x.Hidden]));
    const own = names.filter(n => n !== 'Weapons' && n !== '_StoicRanger').every(n => n.startsWith('PF_') || n === '_PF_Data' || n === '_Deleted');
    const kept = XLSX.utils.sheet_to_json(w2.Sheets.Weapons)[0].Name === 'Rifle' && hid._StoicRanger === 1 && hid._PF_Data === 1;
    const d = PF.xls.parse(out); const full = d.full && d.full.db.sets.length === PF.db.sets.length;
    // a 0.1.x file: sheets without prefix and a hidden _PF meta sheet
    const ow = XLSX.utils.book_new(); const set0 = PF.db.sets[0];
    XLSX.utils.book_append_sheet(ow, XLSX.utils.aoa_to_sheet([['id', 'plan', 'week', 'sess', 'slot', 'ex', 'set', 'reps', 'done', 'at'], ['old1', set0.plan, 1, 0, 'squat', 'goblet', 9, 7, 'yes', '2026-11-04T10:00:00.000Z']]), 'Sets');
    XLSX.utils.book_append_sheet(ow, XLSX.utils.aoa_to_sheet([['key', 'value'], ['app', 'sr-physical-fitness'], ['schema', 1]]), '_PF');
    const od = PF.xls.parse(new Uint8Array(XLSX.write(ow, { bookType: 'xlsx', type: 'array' })));
    const legacyOk = od.tables.Sets.length === 1 && od.tables.Sets[0].reps === 7;
    const settingsSkip = (() => { const c = PF.clone(PF.db); c.settings.skip = ['neck']; c.settings.at = '2099-01-01T00:00:00.000Z'; const dd = PF.xls.parse(new Uint8Array(PF.xls.build(c))); const e = PF.normalize(PF.emptyDb()); PF.xls.merge(e, dd); return e.settings.skip.join(); })();
    return { own, kept, full, legacyOk, settingsSkip, n: names.join(), twice: twice.SheetNames.length === names.length };
  });
  ok(lay.own && lay.kept && lay.twice, 'only PF_ sheets written, other apps\' sheets kept (' + lay.n + ')');
  ok(lay.full, 'hidden _PF_Data holds the full copy');
  ok(lay.legacyOk, '0.1.x Excel files still import');
  ok(lay.settingsSkip === 'neck', 'muscle groups travel in the Excel settings');
  // ---------- 0.3.0: drinks, weight, profile, recently deleted ----------
  await go('#setup');
  for (const [k, v] of [['startKg', '84.5'], ['startDate', ''], ['heightCm', '181'], ['goalKg', '79'], ['drinkMl', '2500']]) {
    if (k === 'startDate') await p.evaluate(() => { const i = document.querySelector('[data-k=startDate]'); i.value = PF.iso(PF.addDays(PF.today(), -40)); i.dispatchEvent(new Event('change', { bubbles: true })); });
    else { await p.fill(`[data-ch=prof][data-k=${k}]`, v); await p.dispatchEvent(`[data-ch=prof][data-k=${k}]`, 'change'); }
  }
  ok(await p.evaluate(() => { const r = PF.db.settings.profile; return r.startKg === 84.5 && r.heightCm === 181 && r.goalKg === 79 && r.drinkMl === 2500 && /^\d{4}-/.test(r.startDate); }), 'user profile saved (start weight + date, height, goals)');
  await p.fill('[data-ch=prof][data-k=heightCm]', '20'); await p.dispatchEvent('[data-ch=prof][data-k=heightCm]', 'change');
  ok(await p.evaluate(() => PF.db.settings.profile.heightCm === 181), 'nonsense profile value refused');
  await go('#dashboard');
  await click('[data-drink="250"]'); await click('[data-drink="500"]');
  await click('[data-drink="other"]'); await p.fill('#dkMl', '330'); await click('[data-dk]');
  ok(await p.evaluate(() => PF.db.drinks.length === 3 && PF.body.dayMl(PF.todayIso()) === 1080 && PF.db.drinks.every(d => !('type' in d))), 'drinks added: +250, +500, other 330 = 1080 ml, no drink types');
  ok(await p.evaluate(() => /1,080 ml/.test(document.getElementById('drinks').innerText) && /of 2,500 ml/.test(document.getElementById('drinks').innerText)), 'today against the goal shown');
  await p.evaluate(() => { for (let k = 1; k <= 7; k++) PF.put('drinks', { date: PF.iso(PF.addDays(PF.today(), -k)), time: '12:00', ml: 2100 }); });
  ok(await p.evaluate(() => Math.round(PF.body.avg7()) === 2100), '7-day average (days before today)');
  // weights: 5 weeks of entries going down, one per day; same date again updates that day
  await p.evaluate(() => { for (let k = 35; k >= 1; k -= 2) PF.body.logWeight(PF.iso(PF.addDays(PF.today(), -k)), 84 - (35 - k) * 0.08); });
  await click('[data-logw="1"]'); await p.fill('#wKg', '81,2'); await click('[data-wsave]');
  const nW = await p.evaluate(() => PF.db.weights.length);
  await click('[data-logw="1"]'); await p.fill('#wKg', '81.0'); await click('[data-wsave]');
  ok(await p.evaluate(n => PF.db.weights.length === n && PF.body.weights().slice(-1)[0].kg === 81, nW), 'log weight: one entry per day, same date updates it');
  const g = await p.evaluate(() => { const x = PF.body.goal(); return { togo: x.togo, eta: x.eta && PF.iso(x.eta), slope: x.slope }; });
  ok(Math.abs(g.togo - 2) < 0.01 && g.slope < 0 && !!g.eta, 'goal: kg to go and estimated date at the trend ' + JSON.stringify(g));
  ok(await p.evaluate(() => PF.body.series()[0].start === true && PF.body.series()[0].kg === 84.5), 'start weight from the profile is the first point');
  for (const tf of ['1M', '1Y', 'All', '3M']) {
    await click(`[data-wtf="${tf}"]`);
    const c = await p.evaluate(() => { const svg = document.querySelector('#weight svg'); const pl = svg.querySelectorAll('polyline'); return { lines: pl.length, primary: pl[pl.length - 1].getAttribute('stroke'), w: +pl[pl.length - 1].getAttribute('stroke-width'), tw: +pl[0].getAttribute('stroke-width'), dots: svg.querySelectorAll('circle').length, goal: !!svg.querySelector('line[stroke-dasharray]') }; });
    ok(c.lines === 2 && c.primary === 'var(--sect)' && c.w > c.tw && c.goal && (tf === '1M' || tf === '3M' ? c.dots > 0 : c.dots === 0), `weight graph ${tf}: measured primary bold, trend thin, goal dashed, dots ${c.dots}`);
  }
  ok(await p.evaluate(() => PF.db.ui.wtf === '3M'), 'timeframe remembered');
  await shot('16-drinks-weight');
  // delete + undo (Recently deleted)
  const wid = await p.evaluate(() => PF.body.weights()[3].id);
  await click('#weight summary');
  await click(`[data-delw="${wid}"]`); await click('[data-c="1"]');
  await click('[data-deldrink]');
  ok(await p.evaluate(id => !PF.db.weights.some(w => w.id === id) && PF.db.deleted.some(d => d.table === 'weights' && d.id === id) && PF.db.trash.length === 2, wid), 'delete leaves a tombstone and a Recently deleted entry');
  await go('#setup'); await shot('17-settings');
  ok(await p.evaluate(() => /Recently deleted/.test(document.getElementById('trash').innerText) && document.querySelectorAll('[data-undel]').length === 2), 'Settings shows Recently deleted');
  const undoIdx = await p.evaluate(id => PF.db.trash.findIndex(x => x.row.id === id), wid);
  await click(`[data-undel="${undoIdx}"]`);
  ok(await p.evaluate(id => { const w = PF.db.weights.find(x => x.id === id); const d = PF.db.deleted.find(x => x.id === id); return !!w && w.at > d.at && PF.db.trash.length === 1; }, wid), 'Undo brings it back, newer than the delete');
  await go('#today'); ok(await p.evaluate(() => /Your data:\s*only on this phone/.test(document.getElementById('dataLine').innerText)), '"Your data" line on the home page, links to Settings');
  ok(await p.evaluate(() => [...document.querySelectorAll('nav.tabs a')].some(a => a.textContent.trim() === 'Settings')), 'labelled Settings button');
  // Excel: drinks + weights + profile + _Deleted travel; zip patch keeps other parts byte-identical
  const xl = await p.evaluate(() => {
    const u8 = new Uint8Array(PF.xls.build()); const d = PF.xls.parse(u8);
    const e = PF.normalize(PF.emptyDb()); PF.xls.merge(e, d);
    const prof = JSON.stringify(e.settings.profile) === JSON.stringify(PF.db.settings.profile);
    const wb = XLSX.read(u8, { type: 'array' });
    const tomb = XLSX.utils.sheet_to_json(wb.Sheets._Deleted).some(r => r.App === 'PF' && r.Table === 'PF_Weight');
    const num = typeof wb.Sheets.PF_Weight.C2.v === 'number' && typeof wb.Sheets.PF_Drinks.D2.v === 'number';
    // an Excel row without id for a date that exists = the same entry; a new date = new entry
    const ws = wb.Sheets.PF_Weight; const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const day = rows[rows.length - 1].date;
    rows.push({ id: '', date: day, kg: 80.4, note: 'typed in Excel', at: '' }, { id: '', date: PF.iso(PF.addDays(PF.today(), -100)), kg: 86, note: '', at: '' });
    wb.Sheets.PF_Weight = XLSX.utils.json_to_sheet(rows);
    const d2 = PF.xls.parse(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })));
    const c2 = PF.clone(PF.db); const r = PF.xls.merge(c2, d2);
    const sameDay = c2.weights.filter(w => w.date === day);
    return { drinks: e.drinks.length === PF.db.drinks.length, weights: e.weights.length === PF.db.weights.length, prof, tomb, num, matched: sameDay.length === 1 && sameDay[0].kg === 80.4, added: r.added === 1 };
  });
  ok(xl.drinks && xl.weights && xl.prof, 'Excel round trip: PF_Drinks, PF_Weight and the profile');
  ok(xl.tomb, 'deletes go to the shared _Deleted sheet (App PF)');
  ok(xl.num, 'kg and ml written as numbers');
  ok(xl.matched && xl.added, 'Excel rows without id: same date = same weight entry, new date = new entry');
  const zp = await p.evaluate(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['ID', 'Name', 'Calibre'], ['g1', 'Rifle', '.308']]); ws['!cols'] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Weapons');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['App', 'Table', 'ID', 'Source uid', 'Label', 'Deleted at', 'Deleted by'], ['GS', 'GS_Guns', 'x1', '', 'Old gun', new Date().toISOString(), 'GunSafe']]), '_Deleted');
    wb.Workbook = { Sheets: [{ name: 'Weapons', Hidden: 0 }, { name: '_Deleted', Hidden: 1 }] };
    const other = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
    const out = new Uint8Array(PF.xls.build(PF.db, other));
    const A = XLSX.CFB.read(other, { type: 'array' }), Bz = XLSX.CFB.read(out, { type: 'array' });
    const part = (z, n) => { const e = XLSX.CFB.find(z, '/' + n); return e && e.content ? Array.from(e.content).join(',') : null; };
    const w2 = XLSX.read(out, { type: 'array' });
    const tombs = XLSX.utils.sheet_to_json(w2.Sheets._Deleted);
    return { weapons: part(A, 'xl/worksheets/sheet1.xml') === part(Bz, 'xl/worksheets/sheet1.xml'), styles: part(A, 'xl/styles.xml') === part(Bz, 'xl/styles.xml'),
      gs: tombs.some(r => r.App === 'GS' && r.ID === 'x1'), pf: tombs.some(r => r.App === 'PF'), hidden: w2.Workbook.Sheets.find(s => s.name === '_Deleted').Hidden === 1, pk: out[0] === 0x50 && out[1] === 0x4b };
  });
  ok(zp.weapons && zp.styles && zp.pk, 'zip patch: other apps\' sheet parts and styles stay byte-identical');
  ok(zp.gs && zp.pf && zp.hidden, 'shared _Deleted keeps the other apps\' rows and adds ours (hidden)');
  // ---------- 0.4.0: drinking reminders ----------
  await go('#setup');
  ok(await p.evaluate(() => /Drinking reminders/.test(document.getElementById('remind').innerText) && PF.db.settings.remind.n === 0), 'Settings shows drinking reminders, off by default');
  for (let i = 0; i < 4; i++) await click('[data-rmn="1"]');
  ok(await p.evaluate(() => PF.db.settings.remind.n === 4 && /At 11:00, 14:00, 17:00, 20:00/.test(document.getElementById('remind').innerText)), '4 reminders in 08:00-20:00: 11:00, 14:00, 17:00, 20:00 shown');
  await p.fill('#rmStart', '07:00'); await p.dispatchEvent('#rmStart', 'change');
  await p.fill('#rmEnd', '21:00'); await p.dispatchEvent('#rmEnd', 'change');
  ok(await p.evaluate(() => PF.db.settings.remind.start === '07:00' && PF.db.settings.remind.end === '21:00' && PF.body.remindTimes('07:00', '21:00', 4).join() === '630,840,1050,1260'), 'typical day changed, times follow');
  await p.fill('#rmEnd', '06:00'); await p.dispatchEvent('#rmEnd', 'change');
  ok(await p.evaluate(() => PF.db.settings.remind.end === '21:00'), 'a day ending before it starts is refused');
  ok(await p.evaluate(() => PF.body.onTrack(1000, 2000, '08:00', '20:00', 840) && !PF.body.onTrack(999, 2000, '08:00', '20:00', 840) && PF.body.onTrack(0, 0, '08:00', '20:00', 840)), 'on track = the goal\'s share of the day passed (same rule as the phone)');
  ok(await p.evaluate(() => /cannot send them/.test(document.getElementById('remind').innerText)), 'web: says reminders come from the Android app');
  const rx = await p.evaluate(() => { const d = PF.xls.parse(new Uint8Array(PF.xls.build())); const e = PF.normalize(PF.emptyDb()); PF.xls.merge(e, d); return JSON.stringify(e.settings.remind); });
  ok(rx === '{"n":4,"start":"07:00","end":"21:00"}', 'reminder settings travel in PF_Settings ' + rx);
  await shot('18-reminders');
  // persistence: reload keeps data
  await p.reload(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => PF.db.sets.length >= 1 && PF.db.plans.length === 1 && PF.db.activities.length === 1), 'data survives reload');
  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await ctx.close();
}
await run('light'); await run('dark');
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
