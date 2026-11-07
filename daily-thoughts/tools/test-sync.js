/* Nextcloud sync and Excel file check (run before every release): node tools/test-sync.js
   Runs the app in a headless browser with a stand-in for the Android side (DTNative: storage, ncDownload/ncUpload
   against an in-page "Nextcloud" file with ETags) and checks the shared contract v1:
   1. the first sync writes DT_Favourites + hidden _DT_Data and keeps every other sheet (hidden ones stay hidden),
   2. favourites from the file are added here, nothing on the phone is lost,
   3. a favourite removed in the app is removed from the file and does not come back; saved again, it returns,
   4. a row deleted in Excel (no deletion in the app) is kept: a sync never deletes,
   5. notes: the side that changed wins (three-way against the last sync),
   6. 412 (someone else wrote meanwhile): download, merge, upload again,
   7. a file from a newer Daily Thoughts is never written,
   8. offline: nothing lost, a status line says so,
   9. the web app's "Update an Excel file" merge keeps the other sheets too. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200, f.endsWith('.svg') ? { 'content-type': 'image/svg+xml' } : f.endsWith('.js') ? { 'content-type': 'application/javascript' } : {}); r.end(d); }); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

/* the Android side, in the page: storage setting, db.json in localStorage, a Nextcloud file in window.__nc */
const fakeNative = () => {
  const ls = localStorage;
  const nc = window.__nc = JSON.parse(ls.getItem('__nc') || '{"b64":"","etag":"","n":0,"fail412":0,"offline":false,"uploads":0}');
  const keep = () => ls.setItem('__nc', JSON.stringify(nc));
  const st = JSON.parse(ls.getItem('__st') || '{"mode":"nextcloud","url":"https://cloud.example.com","user":"manuel","folder":"/Stoic Ranger/","file":"database.xlsx","changed":"2026-11-07T10:00:00Z","hasPassword":true}');
  const answer = (cb, ok, data) => setTimeout(() => window.DTNativeCallback(cb, { ok, msg: '', data: JSON.stringify(data) }), 5);
  window.DTNative = {
    loadDb: () => ls.getItem('dt.db') || '', saveDb: t => { ls.setItem('dt.db', t); return true; },
    backupDb: n => { ls.setItem('bk.' + n, ls.getItem('dt.db') || ''); return true; }, loadDbBackup: () => '',
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.3.0', android: '14', device: 'test' }),
    saveFile: (n, m, b64, cb) => { window.__saved = { n, b64 }; answer(cb, true, {}); },
    openFile: (m, cb) => setTimeout(() => window.DTNativeCallback(cb, { ok: true, msg: 'database.xlsx', data: window.__open }), 5),
    shareFile() { }, shareText() { }, print() { },
    storageGet: () => JSON.stringify(Object.assign({ peers: [{ pkg: 'at.rangebook.app', installed: true, linked: true, name: 'SR Shooting' }] }, st)),
    storageSet: (j, pw) => { Object.assign(st, JSON.parse(j)); ls.setItem('__st', JSON.stringify(st)); return window.DTNative.storageGet(); },
    storageRefresh: () => false, linkSet: () => window.DTNative.storageGet(),
    ncDownload: cb => {
      if (nc.offline) return answer(cb, false, { status: 0, etag: '', error: 'Unable to resolve host' });
      if (!nc.b64) return answer(cb, false, { status: 404, etag: '' });
      answer(cb, true, { status: 200, etag: nc.etag, b64: nc.b64 });
    },
    ncUpload: (b64, etag, cb) => {
      if (nc.offline) return answer(cb, false, { status: 0, error: 'offline' });
      if (nc.fail412 > 0) { nc.fail412--; keep(); return answer(cb, false, { status: 412 }); }
      if ((nc.b64 && etag !== nc.etag) || (!nc.b64 && etag)) return answer(cb, false, { status: 412 });
      nc.b64 = b64; nc.etag = '"e' + (++nc.n) + '"'; nc.uploads++; keep();
      answer(cb, true, { status: nc.b64 ? 204 : 201, etag: nc.etag });
    },
  };
};

srv.listen(0, async () => {
  const url = `http://localhost:${srv.address().port}/index.html`;
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addInitScript(fakeNative);
  const errs = [];
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(url.replace('index.html', 'css/app.css'));
  // a database.xlsx from SR Shooting: its own sheets, a hidden _StoicRanger sheet, and favourites saved on another phone
  const db = { app: 'sr-daily-thoughts', schema: 1, favs: [{ id: 'q-marcus-aurelius-01', at: '2026-11-01T08:00:00.000Z' }, { id: 'q-seneca-03', at: '2026-11-02T08:00:00.000Z', note: 'phone note' }], settings: { theme: 'dark' } };
  await p.evaluate(d => { localStorage.clear(); localStorage.setItem('dt.db', JSON.stringify(d)); }, db);
  await p.goto(url); await p.waitForTimeout(300);
  await p.evaluate(async () => {
    const X = await DT.sync.lib();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['ID', 'Name', 'Caliber'], ['w1', 'Tikka T3x', '.308 Win']]), 'Weapons');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['json'], ['{"app":"stoic-ranger"}']]), '_StoicRanger');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Quote ID', 'Author', 'Quote', 'Saved at', 'Note'], ['q-epictetus-01', '', '', '2026-10-30T08:00:00.000Z', 'from Excel'], ['q-seneca-03', '', '', '2026-11-02T08:00:00.000Z', 'phone note']]), 'DT_Favourites');
    wb.Workbook = { Sheets: [{ name: 'Weapons', Hidden: 0 }, { name: '_StoicRanger', Hidden: 1 }, { name: 'DT_Favourites', Hidden: 0 }] };
    const u8 = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    window.__nc.b64 = DT.b64.fromBytes(u8); window.__nc.etag = '"e0"';
    localStorage.setItem('__nc', JSON.stringify(window.__nc));
  });
  const remote = () => p.evaluate(async () => {
    const X = await DT.sync.lib(), nc = window.__nc;
    if (!nc.b64) return null;
    const wb = X.read(DT.b64.toBytes(nc.b64), { type: 'array' });
    const r = DT.sync.parse(X, wb);
    return { names: wb.SheetNames, hidden: (wb.Workbook.Sheets || []).map(s => [s.name, s.Hidden || 0]), weapons: X.utils.sheet_to_json(wb.Sheets.Weapons || {}, { header: 1 }), sr: X.utils.sheet_to_json(wb.Sheets._StoicRanger || {}, { header: 1 }), favs: r.favs, tomb: r.tomb, settings: r.settings, schema: r.schema, rows: X.utils.sheet_to_json(wb.Sheets.DT_Favourites, { header: 1 }), uploads: nc.uploads };
  });
  const local = () => p.evaluate(() => ({ ids: DT.db.favs.map(f => f.id).sort(), favs: DT.db.favs, status: DT.sync.status() }));

  // 1 + 2: first sync
  let r = await p.evaluate(() => DT.sync.run('test'));
  let R = await remote(), L = await local();
  ok(r.ok, 'first sync ran ' + JSON.stringify(r));
  ok(L.ids.join() === 'q-epictetus-01,q-marcus-aurelius-01,q-seneca-03', 'favourite from the file added here, the phone\'s kept: ' + L.ids);
  ok(R.favs.map(f => f.id).sort().join() === L.ids.join(), 'file has the same favourites');
  ok(R.names.join() === 'Weapons,_StoicRanger,DT_Favourites,_DT_Data', 'other sheets kept, _DT_Data added: ' + R.names);
  ok(JSON.stringify(R.weapons) === JSON.stringify([['ID', 'Name', 'Caliber'], ['w1', 'Tikka T3x', '.308 Win']]) && R.sr[1][0] === '{"app":"stoic-ranger"}', 'SR Shooting\'s sheets unchanged');
  ok(JSON.stringify(R.hidden) === JSON.stringify([['Weapons', 0], ['_StoicRanger', 1], ['DT_Favourites', 0], ['_DT_Data', 1]]), 'hidden sheets stay hidden, _DT_Data hidden ' + JSON.stringify(R.hidden));
  ok(R.rows[0].join('|') === 'Quote ID|Author|Quote|Saved at|Note' && R.rows.some(x => x[0] === 'q-marcus-aurelius-01' && x[1] === 'Marcus Aurelius' && x[2].length > 10), 'DT_Favourites rows readable in Excel (author and quote text filled in)');
  ok(R.settings.theme === 'dark' && R.schema === 1, 'settings and data format in _DT_Data');
  ok(/Last sync/.test(L.status), 'status line: ' + L.status);
  const up1 = R.uploads;
  r = await p.evaluate(() => DT.sync.run('again'));
  ok(r.ok && (await remote()).uploads === up1, 'nothing changed: nothing uploaded');

  // 3: removed in the app → removed from the file, does not come back; saved again → back
  await p.evaluate(() => { DT.toggleFav('q-seneca-03'); DT.flush(); });
  await p.evaluate(() => DT.sync.run('change'));
  R = await remote(); L = await local();
  ok(!L.ids.includes('q-seneca-03') && !R.favs.some(f => f.id === 'q-seneca-03') && R.tomb['q-seneca-03'], 'removed in the app: gone from the file, deletion noted in _DT_Data');
  await p.evaluate(() => DT.sync.run('again'));
  ok(!(await local()).ids.includes('q-seneca-03'), 'and it does not come back');
  // another phone still had it with an older time: its sync must not bring it back either
  const otherOut = await p.evaluate(() => DT.sync.merge(null, { favs: [{ id: 'q-seneca-03', at: '2026-11-02T08:00:00.000Z', note: 'phone note' }], settings: {}, tomb: {} }, { favs: [], settings: {}, tomb: JSON.parse(JSON.stringify(DT.db.tomb)) }));
  ok(!otherOut.favs.some(f => f.id === 'q-seneca-03'), 'another phone learns of the deletion (no resurrection)');
  await p.evaluate(() => { DT.toggleFav('q-seneca-03'); DT.flush(); });
  await p.evaluate(() => DT.sync.run('change'));
  R = await remote();
  ok(R.favs.some(f => f.id === 'q-seneca-03') && !R.tomb['q-seneca-03'], 'saved again: back in the file');

  // 4: a row deleted in Excel (no deletion in the app) is kept
  await p.evaluate(async () => {
    const X = await DT.sync.lib(), nc = window.__nc;
    const wb = X.read(DT.b64.toBytes(nc.b64), { type: 'array' });
    const rows = X.utils.sheet_to_json(wb.Sheets.DT_Favourites, { header: 1 }).filter(x => x[0] !== 'q-marcus-aurelius-01');
    rows.forEach(x => { if (x[0] === 'q-epictetus-01') x[4] = 'edited in Excel'; });
    wb.Sheets.DT_Favourites = X.utils.aoa_to_sheet(rows);
    nc.b64 = DT.b64.fromBytes(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))); nc.etag = '"excel"';
  });
  await p.evaluate(() => DT.sync.run('open'));
  R = await remote(); L = await local();
  ok(L.ids.includes('q-marcus-aurelius-01') && R.favs.some(f => f.id === 'q-marcus-aurelius-01'), 'row deleted in Excel: kept here and written back (a sync never deletes)');
  // 5: notes three-way
  ok(L.favs.find(f => f.id === 'q-epictetus-01').note === 'edited in Excel', 'note changed only in Excel: Excel wins');
  await p.evaluate(() => { DT.db.favs.find(f => f.id === 'q-epictetus-01').note = 'changed on the phone'; DT.save(true); });
  await p.evaluate(() => DT.sync.run('change'));
  R = await remote();
  ok(R.favs.find(f => f.id === 'q-epictetus-01').note === 'changed on the phone', 'note changed only on the phone: the phone wins');

  // 6: 412 once → again from the top
  await p.evaluate(() => { window.__nc.fail412 = 1; DT.toggleFav('q-plato-01'); DT.flush(); });
  r = await p.evaluate(() => DT.sync.run('change'));
  R = await remote();
  ok(r.ok && R.favs.some(f => f.id === 'q-plato-01'), '412: downloaded, merged and uploaded again');
  await p.evaluate(() => { window.__nc.fail412 = 5; DT.toggleFav('q-plato-02'); DT.flush(); });
  r = await p.evaluate(() => DT.sync.run('change'));
  ok(!r.ok && (await local()).ids.includes('q-plato-02') && /3 tries/.test((await local()).status), 'three 412s: stops, keeps everything here, says so');
  await p.evaluate(() => { window.__nc.fail412 = 0; });

  // 7: a newer file is not written
  const before = await p.evaluate(() => window.__nc.b64);
  await p.evaluate(async () => {
    const X = await DT.sync.lib(), nc = window.__nc;
    const wb = X.read(DT.b64.toBytes(nc.b64), { type: 'array' });
    wb.Sheets._DT_Data = X.utils.aoa_to_sheet([['x'], [JSON.stringify({ app: 'sr-daily-thoughts', schema: 9, settings: {}, tomb: {} })]]);
    nc.b64 = DT.b64.fromBytes(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))); nc.etag = '"future"';
    DT.toggleFav('q-plato-03'); DT.flush();
  });
  const fut = await p.evaluate(() => window.__nc.b64);
  await p.evaluate(() => DT.sync.run('change'));
  ok((await p.evaluate(() => window.__nc.b64)) === fut && /newer Daily Thoughts/.test((await local()).status), 'file from a newer app version: not written, status says why');
  await p.evaluate(b64 => { window.__nc.b64 = b64; window.__nc.etag = '"back"'; }, before);

  // 8: offline
  await p.evaluate(() => { window.__nc.offline = true; DT.toggleFav('q-plato-04'); DT.flush(); });
  r = await p.evaluate(() => DT.sync.run('change'));
  L = await local();
  ok(!r.ok && L.ids.includes('q-plato-04') && /offline/i.test(L.status), 'offline: favourite kept on the phone, status: ' + L.status);
  await p.evaluate(() => { window.__nc.offline = false; });
  r = await p.evaluate(() => DT.sync.run('now'));
  ok(r.ok && (await remote()).favs.some(f => f.id === 'q-plato-04'), 'back online: Sync now brings it to the file');

  // the More page shows the setting, never the password
  await p.evaluate(() => DT.go('#/more')); await p.waitForTimeout(200);
  const ui = await p.evaluate(() => ({ on: !!document.querySelector('[data-mode="nextcloud"].on'), url: document.querySelector('#stUrl').value, pw: document.querySelector('#stPw').value, status: document.querySelector('#syncStatus').textContent, link: !!document.querySelector('[data-link="at.rangebook.app"]:checked') }));
  ok(ui.on && ui.url === 'https://cloud.example.com' && ui.pw === '' && /Last sync/.test(ui.status) && ui.link, 'More page: setting, status line and link shown, password field empty ' + JSON.stringify(ui));
  // switch back to local: nothing deleted here
  const n = (await local()).ids.length;
  await p.click('[data-mode="local"]'); await p.waitForTimeout(200);
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('__st'))).mode === 'local' && (await local()).ids.length === n, 'back to "this phone only": every favourite stays');

  // the note box on a favourite's page
  await p.evaluate(() => DT.go('#/q/q-plato-01')); await p.waitForTimeout(200);
  await p.fill('[data-note-for="q-plato-01"] textarea', 'my note'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => DT.db.favs.find(f => f.id === 'q-plato-01').note === 'my note'), 'note typed under the quote is kept with the favourite');
  ok(errs.length === 0, 'no script errors ' + errs.join(' | '));
  await ctx.close();

  // 9: web app (no DTNative): Update an Excel file keeps the other sheets
  const w = await b.newPage(); const werr = []; w.on('pageerror', e => werr.push(e.message));
  await w.goto(url.replace('index.html', 'css/app.css'));
  await w.evaluate(d => { localStorage.clear(); localStorage.setItem('dt.unlocked', '2026-11-07'); localStorage.setItem('dt.db', JSON.stringify(d)); }, db);
  await w.goto(url); await w.waitForTimeout(300);
  const web = await w.evaluate(async () => {
    const X = await DT.sync.lib();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['ID', 'Name'], ['w1', 'Tikka']]), 'Weapons');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Quote ID', 'Author', 'Quote', 'Saved at', 'Note'], ['q-epictetus-01', '', '', '', '']]), 'DT_Favourites');
    const bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    DT.openFile = async () => ({ ok: true, name: 'database.xlsx', bytes });
    let saved; DT.saveFile = async (n, m, u8) => { saved = { n, u8 }; return { ok: true, msg: n }; };
    await DT.sync.updateFile();
    const out = X.read(saved.u8, { type: 'array' });
    return { name: saved.n, sheets: out.SheetNames, favs: DT.sync.parse(X, out).favs.map(f => f.id).sort(), here: DT.db.favs.map(f => f.id).sort(), section: (DT.go('#/more'), true) };
  });
  ok(web.name === 'database.xlsx' && web.sheets.join() === 'Weapons,DT_Favourites,_DT_Data', 'web: Update an Excel file keeps the other sheets ' + web.sheets);
  ok(web.favs.join() === 'q-epictetus-01,q-marcus-aurelius-01,q-seneca-03' && web.here.join() === web.favs.join(), 'web: merged both ways ' + web.favs);
  await w.waitForTimeout(200);
  ok(await w.evaluate(() => /Where your data lives/i.test(document.body.innerText) && !document.querySelector('#stUrl')), 'web: More page offers the Excel file, no Nextcloud fields');
  ok(werr.length === 0, 'web: no script errors ' + werr.join(' | '));
  await b.close(); srv.close();
});
