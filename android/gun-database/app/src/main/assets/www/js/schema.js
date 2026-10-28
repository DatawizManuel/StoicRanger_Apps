/* Stoic Ranger — table definitions. One list per table drives the edit forms, the list cards and the
   database.xlsx import/export (column headers match 03_registry/database.xlsx on the PC). */
'use strict';
(() => {
// [key, label (xlsx header), type, options]
// types: text | num | int | date | select | area | ref:<table> ; opts.span = grid width (2,3,4,6), opts.unit
RB.TABLES = {
  weapons: {
    title: 'Guns', one: 'gun', prefix: 'W', sheet: 'Weapons',
    fields: [
      ['id', 'ID', 'id'], ['name', 'Name', 'text', { span: 6, req: true }],
      ['type', 'Type', 'select', { span: 3, options: ['Rifle', 'Pistol', 'Shotgun', 'Other'] }],
      ['aliases', 'Aliases (as written on sheets)', 'text', { span: 6, hint: 'Other spellings, separated by ;' }],
      ['make', 'Make', 'text', { span: 3 }], ['model', 'Model', 'text', { span: 3 }],
      ['caliber', 'Caliber', 'text', { span: 3, list: 'calibers' }], ['barrelLengthMm', 'Barrel length mm', 'num', { span: 3, u: 'len' }],
      ['twist', 'Twist', 'text', { span: 3 }], ['thread', 'Muzzle thread', 'text', { span: 3 }],
      ['optic', 'Optic', 'text', { span: 6 }], ['mount', 'Mount', 'text', { span: 6 }],
      ['accessories', 'Accessories', 'text', { span: 6 }],
      ['weightKg', 'Weight bare kg', 'num', { span: 2, u: 'kg' }], ['serial', 'Serial no.', 'text', { span: 4 }],
      ['sightHeightMm', 'Sight height mm', 'num', { span: 3, u: 'len', hint: 'Bore centre to scope centre (dope card)' }], ['zeroM', 'Zero distance m', 'num', { span: 3, u: 'dist' }],
      ['scopeUnit', 'Scope turrets', 'select', { span: 3, options: ['mrad', 'MOA'] }], ['clickValue', 'Click value', 'num', { span: 3, hint: 'e.g. 0.1 (mrad) or 0.25 (MOA)' }],
      ['added', 'Added', 'date', { span: 3 }], ['status', 'Status', 'select', { span: 3, options: ['Active', 'Sold', 'Retired'] }],
      ['roundsBeforeLog', 'Rounds before log', 'int', { span: 3, hint: 'Rounds fired before this logbook' }], ['countedOn', 'Counted on', 'date', { span: 3 }],
      ['notes', 'Notes', 'area'],
    ],
  },
  barrels: {
    title: 'Barrels', one: 'barrel', prefix: 'B', sheet: 'Barrels',
    fields: [
      ['id', 'ID', 'id'], ['weaponId', 'Weapon ID', 'ref:weapons', { span: 6, req: true }],
      ['name', 'Barrel', 'text', { span: 6, req: true, hint: 'e.g. Factory #1' }],
      ['installed', 'Installed', 'date', { span: 3 }], ['removed', 'Removed', 'date', { span: 3 }],
      ['roundsAtInstall', 'Rounds at install', 'int', { span: 3 }], ['lifeRounds', 'Expected life rds', 'int', { span: 3, hint: 'Empty = typical for the calibre' }],
      ['notes', 'Notes', 'area'],
    ],
  },
  munitions: {
    title: 'Ammunition', one: 'ammunition', prefix: 'M', sheet: 'Munitions',
    fields: [
      ['id', 'ID', 'id'], ['name', 'Name', 'text', { span: 6, req: true, hint: 'One entry per load / lot you want to compare' }],
      ['aliases', 'Aliases (as written on sheets)', 'text', { span: 6 }],
      ['type', 'Type', 'select', { span: 3, options: ['Factory', 'Handload'] }], ['caliber', 'Caliber', 'text', { span: 3, list: 'calibers' }],
      ['manufacturer', 'Manufacturer', 'text', { span: 3 }], ['bullet', 'Bullet', 'text', { span: 3 }],
      ['bulletWeightG', 'Bullet weight g', 'num', { span: 2, u: 'mass' }], ['bcG1', 'BC G1', 'num', { span: 2 }], ['bcG7', 'BC G7', 'num', { span: 2 }],
      ['bulletDiaMm', 'Bullet diameter mm', 'num', { span: 3, u: 'len' }], ['bulletLengthMm', 'Bullet length mm', 'num', { span: 3, u: 'len' }],
      ['nominalV0', 'Manufacturer V0 m/s', 'num', { span: 3, u: 'vel', alias: 'Nominal V0 m/s' }], ['mfrBarrelMm', 'Manufacturer test barrel mm', 'num', { span: 3, u: 'len', hint: 'Barrel length the maker measured with' }],
      ['powder', 'Powder', 'text', { span: 3, hl: true }], ['chargeG', 'Charge g', 'num', { span: 3, hl: true, u: 'mass' }],
      ['primer', 'Primer', 'text', { span: 3, hl: true }], ['brass', 'Brass', 'text', { span: 3, hl: true }],
      ['cbtoMm', 'CBTO mm', 'num', { span: 2, hl: true, u: 'len' }], ['coalMm', 'COAL mm', 'num', { span: 2, hl: true, u: 'len' }], ['lot', 'Lot', 'text', { span: 2 }],
      ['added', 'Added', 'date', { span: 3 }], ['status', 'Status', 'select', { span: 3, options: ['Active', 'Used up', 'Retired'] }],
      ['notes', 'Notes', 'area'],
    ],
  },
  shooters: {
    title: 'Shooters', one: 'shooter', prefix: 'S', sheet: 'Shooters',
    fields: [
      ['id', 'ID', 'id'], ['name', 'Name', 'text', { span: 6, req: true }], ['aliases', 'Aliases (as written on sheets)', 'text', { span: 6 }],
      ['added', 'Added', 'date', { span: 3 }], ['status', 'Status', 'select', { span: 3, options: ['Active', 'Inactive'] }], ['notes', 'Notes', 'area'],
    ],
  },
  targets: {
    title: 'Targets', one: 'target', prefix: 'TG', sheet: 'Targets',
    fields: [
      ['id', 'ID', 'id'], ['name', 'Name', 'text', { span: 6, req: true }],
      ['type', 'Type', 'select', { span: 3, options: ['Rings', 'Steel plate', 'Other'] }],
      ['rings', 'Scoring rings', 'int', { span: 3, hint: '10 = rings 1–10; 6 = rings 5–10; 1 = plate / single zone' }],
      ['d10', '10-ring or plate diameter mm', 'num', { span: 3, u: 'len', req: true }], ['w', 'Ring width mm', 'num', { span: 3, u: 'len', hint: 'Plates: any value (used for the drawing)' }],
      ['xd', 'Inner ten (X) diameter mm', 'num', { span: 3, u: 'len' }], ['distM', 'Intended distance m', 'num', { span: 3, u: 'dist' }],
      ['sizeMm', 'Card / plate size', 'text', { span: 6 }], ['source', 'Source', 'text', { span: 6, hint: 'Rulebook, maker or web page the dimensions come from' }],
      ['notes', 'Notes', 'area'],
    ],
  },
  trainers: {
    title: 'Trainers', one: 'trainer', prefix: 'T', sheet: 'Trainers',
    fields: [
      ['id', 'ID', 'id'], ['name', 'Name', 'text', { span: 6, req: true }],
      ['contact', 'Contact person', 'text', { span: 6 }],
      ['phone', 'Phone', 'text', { span: 3 }], ['email', 'E-mail', 'text', { span: 3 }],
      ['website', 'Website', 'text', { span: 6 }],
      ['notes', 'Notes', 'area'],
    ],
  },
  roundsLog: {
    title: 'Rounds log', one: 'rounds log entry', prefix: 'R', sheet: 'Rounds_Log',
    fields: [
      ['id', 'ID', 'id'], ['date', 'Date', 'date', { span: 3, req: true }], ['rounds', 'Rounds', 'int', { span: 3, req: true }],
      ['weaponId', 'Weapon ID', 'ref:weapons', { span: 6, req: true }], ['barrelId', 'Barrel ID', 'ref:barrels', { span: 6, hint: 'Empty = barrel fitted on that date' }],
      ['note', 'Note', 'text', { span: 6, hint: 'Hunting, fouling shots, practice without a sheet …' }],
    ],
  },
};
RB.CALIBERS = ['6.5 Creedmoor', '.308 Win', '.223 Rem', '5.56x45', '6mm Creedmoor', '6.5 PRC', '.300 Win Mag', '.338 Lapua Mag', '.243 Win', '7mm Rem Mag', '.22 LR'];

/* Datasheet record keys (same as the datasheet page and the 02_archive JSON files) */
RB.SHEET_KEYS = ['no', 'date', 'time', 'shooter', 'purpose', 'discipline', 'position', 'series', 'rounds', 'gun', 'barrel', 'optic', 'caliber', 'ammo', 'bullet', 'v0', 'v0sd',
  'zero', 'dialE', 'dialW', 'range', 'coords', 'elev', 'dist', 'setting', 'temp', 'hum', 'press', 'wind', 'light', 'preset', 'bd', 'd10', 'w', 'remarks'];
/** Unit kind of each numeric datasheet field (stored metric, shown per Settings › Units) */
RB.SHEET_UNITS = { bullet: 'mass', v0: 'vel', v0sd: 'vel', zero: 'dist', dialE: 'ang', dialW: 'ang', elev: 'alt', dist: 'dist', temp: 'temp', press: 'press', bd: 'len', d10: 'len', w: 'len' };
RB.blankSheet = () => { const s = {}; RB.SHEET_KEYS.forEach(k => s[k] = ''); s.hits = []; return s; };
})();
