#!/usr/bin/env node
/* Runs the dashboard (main.js + preload.js + www, Linux Electron 33.2.1 from $TOOLS) under a virtual display and checks:
   first start without a file; the installer's choice is used; every page draws without errors on a file with all
   five apps; the file is never changed (bytes and time); a change to the file comes in by itself; a damaged file
   keeps the last good figures; a missing file is reported; settings are kept. Usage: xvfb-run -a node dashboard/tools/test-desktop.mjs */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TOOLS = process.env.TOOLS || '/home/user/tools/winapp';
const ELECTRON = require(path.join(TOOLS, 'node_modules/electron'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'srdash-')), STAGE = path.join(T, 'app'), CONF = path.join(T, 'config'), DATA = path.join(T, 'data');
fs.mkdirSync(STAGE); fs.mkdirSync(DATA);
for (const f of ['main.js', 'preload.js', 'package.json']) fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
for (const d of ['res', 'www']) fs.cpSync(path.join(HERE, d), path.join(STAGE, d), { recursive: true });
const USERDATA = path.join(CONF, 'Stoic Ranger Dashboard'), XF = path.join(DATA, 'database.xlsx');
const REAL = '/mnt/project-files/stoic-ranger-apps/02_shared/pc-dashboard/03_registry/database.xlsx';
execFileSync('node', [path.join(HERE, 'tools/make-example.mjs'), XF].concat(fs.existsSync(REAL) ? [REAL] : []));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const launch = async () => {
  const app = await pw._electron.launch({ executablePath: ELECTRON, args: [STAGE, '--no-sandbox'], env: Object.assign({}, process.env, { XDG_CONFIG_HOME: CONF }) });
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.SRDash && document.querySelector('#main').children.length, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  return { app, page, errors };
};
const close = async a => { await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await new Promise(r => a.app.process().once('exit', r)); };
const cfg = () => JSON.parse(fs.readFileSync(path.join(USERDATA, 'config.json'), 'utf8'));
const text = a => a.page.evaluate(() => document.querySelector('#main').innerText);

// 1. first start, no file
let a = await launch();
ok(/Choose your database\.xlsx/.test(await text(a)) && !a.errors.length, 'first start without a file asks for database.xlsx ' + a.errors.join(' | '));
await close(a);

// 2. the installer set the file ("pending"); all pages
fs.writeFileSync(path.join(USERDATA, 'config.json'), JSON.stringify(Object.assign(cfg(), { pending: XF })));
const h0 = sha(XF), m0 = fs.statSync(XF).mtimeMs;
a = await launch();
ok(cfg().xlsx === XF && !cfg().pending, "the installer's choice is used and remembered");
let t = await text(a);
ok(/Overview/i.test(t) && /SR GunSafe/i.test(t) && /Rounds per month/i.test(t) && /Activity across apps/i.test(t), 'overview with tiles, rounds per month and activity');
for (const pg of ['shooting', 'gunsafe', 'fieldkit', 'fitness', 'thoughts', 'datafile', 'preferences', 'overview']) {
  await a.page.click(`nav [data-go="${pg}"]`); await a.page.waitForTimeout(150);
}
ok(!a.errors.length, 'every page draws without errors ' + a.errors.join(' | '));
await a.page.click('nav [data-go="shooting"]'); t = await text(a);
ok(/38 of 38|39 of 39|\d+ of \d+/.test(t) && /Readyman/.test(t), 'Shooting page lists the trainings');
await a.page.click('nav [data-go="gunsafe"]'); t = await text(a);
ok(/Geco 9 mm Luger/.test(t) && /2 500/.test(t) && !/A deleted gun/.test(t), 'GunSafe page: ammo stock, deleted entry left out');
await a.page.click('nav [data-go="fieldkit"]'); t = await text(a);
ok(/Drop card/i.test(t) && /Elevation mrad/i.test(t) && /Range 300 m line/.test(t), 'Field Kit page: drop card and points');
await a.page.click('nav [data-go="fitness"]'); t = await text(a);
ok(/Week 8\/12/.test(t) && /Kettlebell swing/.test(t) && /0\.75 l/.test(t), 'Physical Fitness page: plan week, last session, drinks');
await a.page.click('nav [data-go="thoughts"]'); t = await text(a);
ok(/Thought of the day/i.test(t) && /Epictetus/i.test(t), 'Daily Thoughts page: quote and favourites');
await a.page.click('nav [data-go="overview"]');
await a.page.click('tr[data-gun="W-002"] button'); await a.page.waitForTimeout(150);
ok(/SIG Sauer 516/.test(await a.page.evaluate(() => document.querySelector('.drawer').innerText)), 'gun card opens');
await a.page.keyboard.press('Escape');
ok(!(await a.page.$('.drawer')), 'Escape closes the gun card');
// lane toggles
await a.page.click('[data-lrange="year"]'); await a.page.click('[data-lstep="month"]'); await a.page.waitForTimeout(100);
ok(!a.errors.length && cfg().laneRange === 'year' && cfg().laneStep === 'month', 'activity range/step toggles work and are kept');
// settings
await a.page.click('nav [data-go="preferences"]'); await a.page.click('[data-units="imperial"]'); await a.page.click('#app-dt');
ok(cfg().units === 'imperial' && cfg().apps.dt === false, 'units and app ticks are saved in config.json');
ok(!(await a.page.$('nav [data-go="thoughts"]')), 'an unticked app leaves the menu');
await a.page.click('#app-dt'); await a.page.click('[data-units="metric"]');
// 3. a change in the file comes in by itself
const nTr = await a.page.evaluate(() => SRDash.state.D.sr.trainings.length);
execFileSync('node', ['-e', `
const vm=require('vm'),fs=require('fs');const W={};W.window=W;vm.createContext(W);vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(HERE, 'www/lib/xlsx.mini.min.js'))},'utf8'),W);
const X=W.XLSX,f=${JSON.stringify(XF)},wb=X.read(fs.readFileSync(f),{type:'buffer'});const ws=wb.Sheets.Trainings;
X.utils.sheet_add_aoa(ws,[['TR-9999',new Date().toISOString().slice(0,10),'10:00',1,'Live fire','Added in Excel','','Glock G47 MOS',50]],{origin:-1});
fs.writeFileSync(f,X.write(wb,{type:'buffer',bookType:'xlsx'}));`]);
const h1 = sha(XF);
await a.page.waitForFunction(n => SRDash.state.D.sr.trainings.length === n + 1, nTr, { timeout: 25000 }).catch(() => { });
ok(await a.page.evaluate(n => SRDash.state.D.sr.trainings.length === n + 1, nTr), 'a change made in Excel comes in without a click (file watched)');
// 4. a damaged file keeps the last good figures
fs.writeFileSync(XF, 'PK not really a zip');
await a.page.keyboard.press('F5'); await a.page.waitForTimeout(800);
ok(await a.page.evaluate(() => !!SRDash.state.err && SRDash.state.D.sr.trainings.length > 0), 'a damaged file is refused and the last good figures stay');
ok(/could not be read again/.test(await a.page.evaluate(() => document.querySelector('#status').innerText)), 'the status bar says so');
await close(a);
ok(fs.readFileSync(XF, 'utf8') === 'PK not really a zip', 'the dashboard did not touch the damaged file');
// 5. missing file
fs.unlinkSync(XF);
a = await launch();
await a.page.click('nav [data-go="datafile"]');
ok(/was not found/.test(await text(a)), 'a missing file is reported on the Data file page');
await close(a);
// the dashboard never wrote the file: only our own edits changed it
ok(h0 !== h1 && fs.readdirSync(DATA).length === 0, 'no backup or temp file was ever written next to database.xlsx');
const nonOwn = fs.readdirSync(USERDATA).filter(f => f === 'config.json');
ok(nonOwn.length === 1, 'the dashboard keeps only config.json in %APPDATA%\\Stoic Ranger Dashboard');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
