#!/usr/bin/env node
/* Checks js/data.js (the reader and the figures) without a window: the real registry database.xlsx from the PC
   dashboard (if present) and the example file of tools/make-example.mjs with sheets of all five apps.
   Usage: node dashboard/tools/test-data.mjs */
import fs from 'fs'; import vm from 'vm'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process';
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const W = {}; W.window = W; vm.createContext(W);
for (const f of ['lib/xlsx.mini.min.js', 'js/ballistics.js', 'js/quotes.js', 'js/data.js']) vm.runInContext(fs.readFileSync(path.join(HERE, 'www', f), 'utf8'), W);
const SRD = W.SRD;
const REAL = '/mnt/project-files/stoic-ranger-apps/02_shared/pc-dashboard/03_registry/database.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srd-')), EX = path.join(tmp, 'example.xlsx');
execFileSync('node', [path.join(HERE, 'tools/make-example.mjs'), EX].concat(fs.existsSync(REAL) ? [REAL] : []));

// 1. not an xlsx
let threw = ''; try { SRD.read(Buffer.from('hello, not a workbook')); } catch (e) { threw = e.message; }
ok(/not an Excel workbook/.test(threw), 'a file that is no xlsx is refused with a clear message');

// 2. the real file (SR Shooting only, old layout with Shooters sheet and Shooter column)
if (fs.existsSync(REAL)) {
  const before = fs.readFileSync(REAL);
  const D = SRD.read(before), F = SRD.figures(D);
  ok(D.present.sh && !D.present.gs && !D.present.pf, 'real file: SR Shooting sheets found, no other app');
  ok(D.sr.weapons.length === 6 && D.sr.trainings.length === 38, `real file: 6 guns and 38 trainings (${D.sr.weapons.length}/${D.sr.trainings.length})`);
  ok(F.gunFig('W-002').total === 7250, 'real file: SIG 516 = 4 000 before the log + 3 250 from trainings = 7 250 (as Barrels › Rounds total)');
  ok(D.sr.trainings.every(t => t.guns.every(g => g.w)), 'real file: every gun named in Trainings is matched to a Weapons row');
  ok(D.sr.trainings.find(t => t.id === 'TR-0003').start === '19:00', 'real file: start times read');
  ok(Buffer.compare(before, fs.readFileSync(REAL)) === 0, 'real file unchanged');
} else console.log('SKIP real file not found');

// 3. the example file with all apps
const D = SRD.read(fs.readFileSync(EX)), F = SRD.figures(D);
ok(['sh', 'gs', 'fk', 'pf', 'dt'].every(k => D.present[k]), 'example: all five apps found');
ok(D.sheets.find(s => s.name === '_Deleted').hidden && D.sheets.find(s => s.name === '_Deleted').app === 'shared', 'hidden sheets are known as hidden');
ok(!D.gs.service.some(s => s.id === 'E-005'), 'an entry listed in _Deleted is left out');
ok(F.guns.some(g => g.id === 'G-001' && g.src === 'gs'), "GunSafe's own guns join SR Shooting's guns");
ok(F.gunFig('G-001').total === 2150 && F.gunFig('G-001').owners.join() === 'Ines', 'GunSafe gun: rounds before log + GunSafe rounds log, owner from GS_Gun_Info');
const glock = F.gunFig('W-004');
ok(glock.lastClean && glock.since === F.ev.filter(e => e.w === 'W-004' && e.date > glock.lastClean).reduce((a, e) => a + e.r, 0), 'rounds since cleaning = rounds after the last "Cleaning done" (not the later service without cleaning)');
const gm1 = F.ammo.find(a => a.id === 'GM-01');
ok(gm1 && gm1.stock === 3000 - 200 - 300, `ammo stock = purchases − withdrawal − rounds fired with it (${gm1 && gm1.stock})`);
ok(Math.abs(gm1.perRd - 0.295) < 1e-9, '€ per round from the last purchase');
const gm5 = F.ammo.find(a => a.id === 'GM-05');
ok(gm5.stock === 95, 'SR Shooting datasheet rounds with that ammo count from the first purchase on (100 − 5)');
ok(F.ammoFor('W-002').some(a => a.id === 'GM-03'), 'ammo that fits a gun follows its calibre');
ok(F.pf.plan && F.pf.plan.id === 'pl2' && F.pf.week === 8, 'Physical Fitness: active plan and its week');
ok(F.pf.perWeekDone.length === 8 && F.pf.perWeekDone.reduce((a, b) => a + b, 0) > 10, 'Physical Fitness: sessions per week, last 8 weeks');
ok(F.pf.drinksToday === 750 && F.pf.drinkGoal === 3000, 'drinks today and goal from PF_Settings');
ok(F.pf.lastSets.length === 4 && F.pf.lastSets[0].sets === 4, 'last session grouped by exercise');
ok(F.pf.streak >= 4, 'mobility streak ' + F.pf.streak);
ok(F.dope && F.dope.rows.length >= 8 && F.dope.rows[0].x === 100 && F.dope.rows[7].elev > 5 && F.dope.rows[7].elev < 9, 'Field Kit drop card from FK_DropWind (800 m ≈ 7 mrad)');
ok(F.quote && F.quote.text && W.SRQ.QUOTES.length > 400, 'thought of the day from the Daily Thoughts quotes');
ok(D.dt.favs.every(f => f.text && f.author), 'favourites get their text and author from the quote id');
// day order: same as Daily Thoughts DT.quoteOfDay for a fixed day
const dn = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5), Lq = W.SRQ.DAY_ORDER.length;
ok(F.quote.id === W.SRQ.DAY_ORDER[((dn % Lq) + Lq) % Lq], 'quote of the day uses the app\'s day number and order');
ok(F.ev.every(e => e.src !== 'training' || !e.ref.dry), 'dry-fire repetitions are never counted as rounds');
// 4. a hand-made file with only a few columns and German dates
const X = W.XLSX, wb = X.utils.book_new();
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['id', 'name', 'caliber'], ['W-9', 'Hand Gun', '9 mm']]), 'Weapons');
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Date', 'Weapon 1', 'Rounds 1'], ['03.11.2026', 'hand gun', '50']]), 'Trainings');
const H = SRD.read(X.write(wb, { type: 'array', bookType: 'xlsx' })), HF = SRD.figures(H);
ok(H.sr.trainings[0].date === '2026-11-03' && HF.gunFig('W-9').total === 50, 'a hand-made sheet (lower-case headers, dd.mm.yyyy, gun by name) still reads');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
