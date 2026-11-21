/* Writes an example database.xlsx with sheets of all five Stoic Ranger apps, for the tests and to try the dashboard:
   SR Shooting sheets copied from a real file when one is given (else a few example rows), plus example GunSafe,
   Field Kit, Physical Fitness and Daily Thoughts sheets in each app's own layout, a hidden _Deleted list and a
   hidden _StoicRanger sheet. Dates are relative to today. Usage: node tools/make-example.mjs <out.xlsx> [real database.xlsx] */
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const W = {}; W.window = W; vm.createContext(W); vm.runInContext(fs.readFileSync(path.join(HERE, 'www/lib/xlsx.mini.min.js'), 'utf8'), W);
const X = W.XLSX, [out, real] = process.argv.slice(2);
const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const wb = X.utils.book_new(), add = (n, aoa, hidden) => { X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), n); if (hidden) { wb.Workbook = wb.Workbook || { Sheets: [] }; } };
if (real && fs.existsSync(real)) {
  const r = X.read(fs.readFileSync(real), { type: 'buffer', cellDates: true });
  for (const n of r.SheetNames) X.utils.book_append_sheet(wb, r.Sheets[n], n);
} else {
  add('Weapons', [['ID', 'Name', 'Make', 'Caliber', 'Type', 'Rounds before log', 'Source uid'], ['W-001', 'Test Rifle', 'Tikka', '6.5 Creedmoor', 'Rifle', 100, 'u1'], ['W-002', 'Test Pistol', 'Glock', '9 mm', 'Pistol', 0, 'u2']]);
  add('Barrels', [['ID', 'Weapon ID', 'Barrel', 'Installed', 'Removed', 'Rounds at install', 'Expected life rds'], ['B-001', 'W-001', 'Factory #1', '', '', 100, 3000]]);
  add('Munitions', [['ID', 'Name', 'Caliber', 'Manufacturer'], ['M-001', 'Hornady ELD Match 140', '6.5 Creedmoor', 'Hornady']]);
  add('Trainings', [['ID', 'Date', 'Start', 'Duration h', 'Type', 'Description', 'Trainer / organizer', 'Weapon 1', 'Rounds 1', 'Weapon 2', 'Rounds 2', 'Remarks', 'Source uid'],
    ['TR-0001', d(40), '19:00', 2, 'Live fire', 'Practical shooting', 'plan b', 'Test Pistol', 200, '', '', '', 't1'], ['TR-0002', d(10), '09:00', 3, 'Live fire', 'Long range', '', 'Test Rifle', 40, 'Test Pistol', 100, '', 't2'],
    ['TR-0003', d(3), '18:00', 1, 'Dry fire', 'Dry fire at home', '', 'Test Pistol', 300, '', '', '', 't3']]);
  add('Rounds_Log', [['Date', 'Weapon ID', 'Barrel ID', 'Rounds', 'Note', 'ID', 'Munition ID'], [d(5), 'W-001', '', 20, 'zeroing', 'R-001', 'M-001']]);
}
const has = n => wb.SheetNames.includes(n);
if (!has('Datasheets')) {
  add('Datasheets', [['ID', 'Date', 'Purpose', 'Rounds', 'Gun', 'Weapon ID', 'Ammunition', 'Munition ID', 'Distance m', 'V0 m/s', 'Hits', 'Source uid'], ['S-001', d(26), 'Test', 5, 'Tikka T3x TAC A1', 'W-001', 'Hornady ELD Match 9.1 g', 'GM-05', 100, 812, 5, 's1']]);
  add('Shots', [['Sheet ID', 'Date', 'Shot', 'X mm', 'Y mm'], ['S-001', d(26), 1, 2, 4], ['S-001', d(26), 2, -6, 1], ['S-001', d(26), 3, 5, -8], ['S-001', d(26), 4, 9, 3], ['S-001', d(26), 5, -2, -3]]);
}
if (!wb.SheetNames.includes('Drill_Results') || !X.utils.sheet_to_json(wb.Sheets['Drill_Results']).length) {
  const i = wb.SheetNames.indexOf('Drill_Results'); if (i >= 0) { wb.SheetNames.splice(i, 1); delete wb.Sheets['Drill_Results']; }
  add('Drill_Results', [['ID', 'Date', 'Drill ID', 'Drill', 'Weapon ID', 'Mode', 'Time s', 'Hits', 'Shots', 'Points', 'Distance m', 'Pass', 'Training ID', 'Notes', 'Source uid'],
    ['DR-001', d(42), 'bill', 'Bill Drill', 'W-004', 'timed', 2.41, 6, 6, '', 7, 'yes', '', '', 'r1'], ['DR-002', d(62), 'mozambique', 'Failure to Stop', 'W-002', 'timed', 3.1, 3, 3, '', 7, 'yes', '', '', 'r2'],
    ['DR-003', d(62), 'bill', 'Bill Drill', 'W-004', 'timed', 2.55, 5, 6, '', 7, 'no', '', '', 'r3']]);
}
// SR GunSafe (gun-safe/www/js/xlsx.js layout)
add('GS_Owners', [['ID', 'Name', 'Notes', 'Updated'], ['O-001', 'Manuel', '', ''], ['O-002', 'Ines', '', '']]);
add('GS_Guns', [['ID', 'Name', 'Type', 'Caliber', 'Make', 'Model', 'Rounds before log', 'Status', 'Notes', 'Updated'], ['G-001', 'Ruger 10/22', 'Rifle', '.22 LR', 'Ruger', '10/22', 2000, 'Active', '', '']]);
add('GS_Gun_Info', [['Gun ID', 'Owner IDs', 'Also takes calibres'], ['W-002', 'O-001', '5.56 NATO'], ['W-003', 'O-001', '5.56 NATO'], ['W-004', 'O-001', ''], ['W-005', 'O-001; O-002', ''], ['G-001', 'O-002', '']]);
add('GS_Barrels', [['ID', 'Gun ID', 'Barrel', 'Length mm', 'Twist', 'Installed', 'Removed', 'Notes', 'Updated'], ['GB-001', 'G-001', 'Factory', 470, '1:16', '', '', '', '']]);
add('GS_Components', [['ID', 'Gun ID', 'Type', 'Name', 'Fitted', 'Removed', 'Updated']]);
add('GS_Service_Log', [['ID', 'Date', 'Gun ID', 'Kind', 'Cleaning done', 'What was done', 'Changes', 'Updated'],
  ['E-001', d(26), 'W-001', 'Cleaning', 'yes', 'Cleaned after zeroing', '', ''], ['E-002', d(60), 'W-004', 'Cleaning', 'yes', 'Full clean', '', ''],
  ['E-003', d(97), 'W-002', 'Cleaning', 'yes', 'Full clean, gas piston', '', ''], ['E-004', d(27), 'W-004', 'Service', 'no', 'Recoil spring changed', 'Recoil spring', ''],
  ['E-005', d(400), 'W-099', 'Cleaning', 'yes', 'A deleted gun', '', '']]);
add('GS_Munitions', [['ID', 'Name', 'Caliber', 'Manufacturer', 'Notes', 'Updated'], ['GM-01', 'Geco 9 mm Luger FMJ 8.0 g', '9 mm', 'Geco', '', ''], ['GM-03', 'PPU .223 Rem FMJ 3.6 g', '.223 Rem', 'PPU', '', ''],
  ['GM-05', 'Hornady 6.5 CM ELD Match 9.1 g', '6.5 Creedmoor', 'Hornady', '', '']]);
add('GS_Ammo_Moves', [['ID', 'Date', 'Munition ID', 'Kind', 'Rounds', 'Price EUR', 'Shop', 'Purpose', 'Updated'],
  ['A-001', d(280), 'GM-01', 'Purchase', 1000, 279, 'Waffen Lechner', '', ''], ['A-002', d(150), 'GM-01', 'Purchase', 1000, 289, 'Waffen Lechner', '', ''], ['A-003', d(50), 'GM-01', 'Purchase', 1000, 295, 'Online', '', ''],
  ['A-004', d(40), 'GM-01', 'Withdrawal', -200, '', '', 'Given to Ines for a course', ''], ['A-005', d(300), 'GM-03', 'Purchase', 1000, 495, 'Waffen Lechner', '', ''],
  ['A-006', d(32), 'GM-05', 'Purchase', 100, 215, 'Waffen Lechner', '', '']]);
add('GS_Rounds_Log', [['ID', 'Date', 'Gun ID', 'Munition ID', 'Rounds', 'Note', 'Updated'], ['R-001', d(20), 'G-001', '', 150, 'Plinking', ''], ['R-002', d(45), 'W-004', 'GM-01', 300, 'Club evening', '']]);
// SR Field Kit (field-kit/www/js/sync.js layout)
add('FK_Points', [['Name', 'Latitude', 'Longitude', 'MGRS', 'Source uid'], ['Range 300 m line', 47.2551, 9.611, '32T NT 4590 3475', 'p1'], ['Car park north', 47.2589, 9.6052, '32T NT 4546 3517', 'p2']]);
add('FK_Breathing', [['Date', 'Seconds', 'Minutes']].concat([0, 1, 2, 4, 5, 7, 9, 12, 15, 20].map((n, i) => [d(n), 300 + i * 60, (300 + i * 60) / 60])));
add('FK_DropWind', [['Key', 'Field', 'Value'], ['pre', 'Load', '6.5 CM ELD Match 140 gr'], ['bModel', 'Drag model', 'G7'], ['bBC', 'BC', 0.326], ['bMV', 'Muzzle velocity m/s', 810], ['bMass', 'Bullet g', 9.07],
  ['bSH', 'Sight height cm', 4.5], ['bZero', 'Zero m', 100], ['bWind', 'Wind km/h', 15], ['bClock', 'Wind from (clock value)', 3], ['bAlt', 'Altitude m', 450], ['bTemp', 'Temperature °C', 15], ['bMax', 'Out to m', 800], ['bStep', 'Step m', 100]]);
add('FK_Settings', [['Key', 'Value'], ['units', 'metric']]);
// SR Physical Fitness (physical-fitness/www/js/xlsx-db.js layout)
add('PF_Settings', [['key', 'value'], ['sessions', 3], ['minutes', 45], ['days', 'Mon, Wed, Fri'], ['drink_goal_ml', 3000], ['start_weight_kg', 84.6]]);
add('PF_Plans', [['id', 'block', 'start', 'status', 'prev', 'assessment', 'created', 'cfgHist', 'base', 'swaps', 'at'], ['pl1', 1, d(140), 'done', '', '', '', 'null', 'null', 'null', ''], ['pl2', 2, d(52), 'active', 'pl1', '', '', 'null', 'null', 'null', '']]);
const sess = [['id', 'plan', 'week', 'sess', 'date', 'done', 'note', 'at']]; let k = 0;
for (let n = 52; n >= 0; n--) { const dd = new Date(); dd.setDate(dd.getDate() - n); const wd = (dd.getDay() + 6) % 7; if ([0, 2, 4].includes(wd) && (n * 7) % 10 !== 3) { k++; sess.push(['s' + k, 'pl2', Math.floor((52 - n) / 7) + 1, wd / 2 + 1, d(n), 'yes', '', '']); } }
add('PF_Sessions', sess);
add('PF_Sets', [['id', 'date', 'plan', 'week', 'sess', 'slot', 'ex', 'exercise', 'set', 'reps', 'kg', 'sec', 'm', 'done', 'at']].concat(
  [['kb-swing', 'Kettlebell swing', 16, 15], ['pullup', 'Pull-up', '', 6], ['goblet', 'Goblet squat', 24, 10], ['pushup', 'Push-up', '', 18]].flatMap(([ex, n, kg, reps], i) => [1, 2, 3, 4].map(s => ['x' + i + s, sess[sess.length - 1][4], 'pl2', 8, 2, i, ex, n, s, reps, kg, '', '', 'yes', '']))));
add('PF_Activities', [['id', 'date', 'type', 'name', 'min', 'km', 'm', 'elev', 'kg', 'hr', 'rpe', 'note', 'at'], ['a1', d(2), 'ruck', 'Ruck', 135, 12.4, '', 310, 15, '', '', '', ''], ['a2', d(6), 'hike', 'Hike', 330, 18.2, '', 900, '', '', '', '', ''], ['a3', d(10), 'run', 'Run', 41, 7.1, '', '', '', '', '', '', '']]);
add('PF_Mobility', [['id', 'date', 'item', 'drill', 'at']].concat([0, 1, 2, 3, 5].map(n => ['m' + n, d(n), 'hips', 'Hip opener', ''])));
add('PF_Drinks', [['id', 'date', 'time', 'ml', 'at'], ['dr1', d(0), '07:30', 500, ''], ['dr2', d(0), '09:15', 250, ''], ['dr3', d(1), '08:00', 2750, '']]);
add('PF_Weight', [['id', 'date', 'kg', 'note', 'at']].concat([[90, 84.6], [76, 84.1], [62, 83.9], [48, 83.4], [34, 83.0], [20, 82.9], [13, 82.5], [6, 82.6], [0, 82.3]].map(([n, kg], i) => ['w' + i, d(n), kg, '', ''])));
// SR Daily Thoughts
add('DT_Favourites', [['Quote ID', 'Author', 'Quote', 'Saved at', 'Note'], ['q-epictetus-01', '', '', d(3) + 'T08:00:00.000Z', ''], ['q-seneca-03', '', '', d(12) + 'T08:00:00.000Z', '']]);
// shared hidden sheets
add('_StoicRanger', [['stoic-ranger-database', 1, 'Do not edit']]);
add('_Deleted', [['App', 'Table', 'ID', 'Source uid', 'Label', 'Deleted at', 'Deleted by'], ['GS', 'GS_Service_Log', 'E-005', '', 'Old cleaning', new Date().toISOString(), 'test']]);
wb.Workbook = { Sheets: wb.SheetNames.map(n => ({ name: n, Hidden: /^_/.test(n) ? 1 : 0 })) };
fs.writeFileSync(out, X.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('wrote', out, wb.SheetNames.length, 'sheets');
