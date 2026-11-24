// SR Field Kit 0.7.0 vault tests (no phone needed): node field-kit/tools/test-vault.mjs
// Runs the real page with a fake Android bridge: blob, an in-memory Nextcloud (WebDAV + share API), share menu.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'www');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (q, r) => { try { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const b = await readFile(join(WWW, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(b); } catch (e) { r.writeHead(404); r.end(); } });
await new Promise(ok => srv.listen(0, ok));
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const BRIDGE = () => {
  const st = window.__b = { db: '', files: {}, etags: {}, shares: {}, nextShare: 7, blob: new Uint8Array(0), building: null, shared: [], opened: [], saved: [], secure: [], wipes: 0, pick: null, calls: [] };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  st.b64 = b64; st.unb64 = unb64;
  const later = (cb, res) => setTimeout(() => FKNativeCallback(cb, res), 3);
  let et = 1;
  window.FKNative = {
    loadDb: () => st.db, loadDbBackup: () => '', saveDb: t => { st.db = t; return true; }, backupDb: () => true,
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.7.0', code: 11 }), keepScreenOn: () => {}, hasLocation: () => false,
    srStatus: () => JSON.stringify({ installed: false }), srCall: () => '{}',
    syncGet: () => JSON.stringify({ mode: 'local', url: 'https://cloud.example.com', user: 'u', folder: '/Stoic Ranger/', hasPassword: true }), syncSet: () => true,
    ncRequest: (m, path, body, ifm, depth, cb) => { st.calls.push(m + ' ' + path);
      if (m === 'MKCOL') return later(cb, { status: 201 });
      if (m === 'DELETE') { const had = path in st.files; delete st.files[path]; return later(cb, { status: had ? 204 : 404 }); }
      later(cb, { status: 404 }); },
    vaultBlobSize: () => st.blob.length,
    vaultBlobRead: (o, l) => b64(st.blob.subarray(o, o + l)),
    vaultBlobStart: () => { st.building = []; }, vaultBlobAppend: s => { st.building.push(unb64(s)); return true; },
    vaultBlobEnd: () => { const n = st.building.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let p = 0; st.building.forEach(x => { o.set(x, p); p += x.length; }); st.blob = o; st.building = null; return n; },
    vaultWipe: () => { st.blob = new Uint8Array(0); st.wipes++; },
    vaultNc: (m, path, ifm, cb) => { st.calls.push('V' + m + ' ' + path);
      if (m === 'GET') { if (!(path in st.files)) return later(cb, { status: 404 }); st.blob = st.files[path].slice(); return later(cb, { status: 200, etag: st.etags[path], size: st.blob.length }); }
      if (ifm === '*new*' && path in st.files) return later(cb, { status: 412 });
      if (ifm && ifm !== '*new*' && st.etags[path] !== ifm) return later(cb, { status: 412 });
      st.files[path] = st.blob.slice(); st.etags[path] = '"e' + (et++) + '"'; later(cb, { status: 201, etag: st.etags[path] }); },
    vaultShare: (m, sub, form, cb) => { st.calls.push('S' + m + ' ' + sub + ' ' + form);
      if (m === 'POST') { const f = new URLSearchParams(form), id = st.nextShare++, token = 'Tok' + id + 'abcXYZ'; st.shares[id] = { path: f.get('path'), exp: f.get('expireDate'), type: f.get('shareType'), perm: f.get('permissions'), token };
        return later(cb, { status: 200, body: JSON.stringify({ ocs: { meta: { statuscode: 200 }, data: { id, token } } }) }); }
      if (m === 'DELETE') { const id = sub.slice(1), had = id in st.shares; delete st.shares[id]; return later(cb, { status: had ? 200 : 404, body: JSON.stringify({ ocs: { meta: { statuscode: had ? 200 : 404, message: had ? '' : 'Wrong share ID, share does not exist' } } }) }); }
      later(cb, { status: 400, body: '' }); },
    vaultPick: cb => { const p = st.pick; st.blob = p.bytes; later(cb, { ok: true, msg: JSON.stringify({ name: p.name, type: p.type, size: p.bytes.length }) }); },
    vaultShareText: (t, title) => st.shared.push([title, t]),
    vaultOpen: (name, type, cb) => { st.opened.push([name, new TextDecoder().decode(st.blob)]); later(cb, { ok: true, msg: '' }); },
    vaultSave: (name, type, cb) => { st.saved.push([name, new TextDecoder().decode(st.blob)]); later(cb, { ok: true, msg: name }); },
    vaultSecure: on => st.secure.push(on),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
const p = await ctx.newPage(); const errors = [];
p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.addInitScript(BRIDGE);
await p.goto(URL0); await p.waitForTimeout(300);
const W = (sel, t = 20000) => p.waitForSelector(sel, { timeout: t });
const B = (f, a) => p.evaluate(f, a);

ok(await p.isVisible('a.srpart.vt'), 'home has a Vault row');
await p.click('a.srpart.vt'); await W('#vtCreate');
ok((await p.textContent('#hTitle')) === 'Vault', 'header says Vault');
await p.fill('#vtP1', 'short'); await p.fill('#vtP2', 'short'); await p.click('#vtCreate');
ok(/12 characters/.test(await p.textContent('#vtSetMsg')), 'too short password refused');
const PW = 'anchor river falcon stone';
await p.fill('#vtP1', PW); await p.fill('#vtP2', PW + 'x'); await p.click('#vtCreate');
ok(/different/.test(await p.textContent('#vtSetMsg')), 'mismatched passwords refused');
await p.fill('#vtP2', PW); await p.click('#vtCreate'); await W('#vtRecKey');
const REC = (await p.textContent('#vtRecKey')).trim();
ok(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/.test(REC), 'recovery key shown: ' + REC);
const keys = await B(() => new TextDecoder().decode(__b.files['/Stoic Ranger/vault/keys.json']));
ok(keys.includes('SR-Vault-1') && !keys.includes('anchor') && !keys.includes(REC.replace(/-/g, '')), 'keys.json holds no password or recovery key');
ok(await B(() => !!__b.files['/Stoic Ranger/vault/index.bin'] && !new TextDecoder().decode(__b.files['/Stoic Ranger/vault/index.bin']).includes('files')), 'index.bin created and encrypted');
ok(await B(() => __b.calls.includes('MKCOL /Stoic Ranger/vault/shared/')), 'vault/shared/ folder created');
ok(await p.isDisabled('#vtRecGo'), 'Open waits for "I wrote the key down"');
await p.check('#vtRecOk'); await p.click('#vtRecGo'); await W('#vtAdd');
ok(await B(() => __b.secure[__b.secure.length - 1] === true), 'screenshots blocked while open (FLAG_SECURE)');

const SECRET = 'Serial A1B2C3 · ownership card 0000-1111 · Ümlaut test';
await B(s => { __b.pick = { name: 'Serials.txt', type: 'text/plain', bytes: new TextEncoder().encode(s) }; }, SECRET);
await p.click('#vtAdd'); await W('.vtrow');
ok((await p.textContent('#vtFList')).includes('Serials.txt'), 'file listed after adding');
const enc = await B(() => Object.keys(__b.files).filter(k => /vault\/[0-9a-f]{32}\.bin$/.test(k)));
ok(enc.length === 1, 'one encrypted file with a random name on Nextcloud');
ok(await B(k => !new TextDecoder().decode(__b.files[k]).includes('Serial'), enc[0]), 'file content is encrypted on Nextcloud');
ok(await B(() => __b.blob.length === 0), 'blob wiped after upload');

// lock + unlock
await p.click('#vtLockNow'); await W('#vtUnlock');
ok(await B(() => __b.secure[__b.secure.length - 1] === false), 'FLAG_SECURE off when locked');
await p.fill('#vtPw', 'wrong password here'); await p.click('#vtUnlock');
await p.waitForFunction(() => /Wrong password/.test(document.getElementById('vtLkMsg').textContent), null, { timeout: 20000 });
ok(true, 'wrong password refused');
await p.fill('#vtPw', PW); await p.click('#vtUnlock'); await W('.vtrow');
ok(true, 'right password opens the vault');

// open (viewer)
await p.click('.vtrow'); await W('#vtOpen'); await p.click('#vtOpen'); await W('.vtviewer pre');
ok((await p.textContent('.vtviewer pre')) === SECRET, 'text file decrypted and shown inside the app');
ok(await B(() => FK.back()) && !(await p.$('.vtviewer')), 'phone Back closes the viewer first');

// send encrypted
await p.click('.vtrow'); await W('#vtSend'); await p.click('#vtSend'); await W('#vtSGo');
const SPW = await p.inputValue('#vtSPw');
ok(/^([a-z]+-){6}\d{2}$/.test(SPW), 'generated receiver password: ' + SPW);
await p.click('#vtExp button[data-d="1"]');
await p.click('#vtSGo'); await W('#vtShL', 30000);
const link = await p.textContent('#vtLk');
const sh = await B(() => Object.values(__b.shares)[0]);
ok(sh && sh.type === '3' && sh.perm === '1' && /^\d{4}-\d\d-\d\d$/.test(sh.exp), 'public read-only link created with expiry ' + (sh && sh.exp));
ok(link === 'https://stoic-ranger.com/vault/#cloud.example.com/' + sh.token, 'link: ' + link);
const pkgOk = await B(async ([path, pw, s]) => { const r = await FKVaultCrypto.shareUnpack(pw, __b.files[path]); return r.meta.name === 'Serials.txt' && new TextDecoder().decode(r.bytes) === s; }, [sh.path, SPW, SECRET]);
ok(pkgOk, 'shared copy opens with the receiver password');
const wrongOk = await B(async ([path]) => { try { await FKVaultCrypto.shareUnpack('nope nope nope nope', __b.files[path]); return false; } catch (e) { return true; } }, [sh.path]);
ok(wrongOk, 'shared copy does not open with a wrong password');
ok(await B(p => !new TextDecoder().decode(__b.files[p]).includes('Serial'), sh.path), 'shared copy is encrypted');
await p.click('#vtShL'); await p.click('#vtShP');
const shared = await B(() => __b.shared);
ok(shared.length === 2 && shared[0][1] === link && shared[1][1] === SPW, 'Share link and Share password open the share menu separately');
// leaving for the share menu does not lock; leaving otherwise does
await B(() => FK.pause()); await B(() => FK.resume());
ok(await p.isVisible('#vtCancel'), 'vault stays open after its own share menu');
await p.click('#vtCancel'); await p.waitForFunction(() => !document.querySelector('#vtCancel'), null, { timeout: 20000 });
ok(await B(() => Object.keys(__b.shares).length === 0), 'Cancel link removes the Nextcloud link');
ok(await B(p => !(p in __b.files), sh.path), 'Cancel link deletes the shared copy');
await p.click('[data-vt="sent"]');
ok((await p.textContent('#vtSList')).includes('Cancelled'), 'Sent links shows it as cancelled');
await p.click('[data-vt="files"]');

// save a copy (explicit, unencrypted)
await p.click('.vtrow'); await W('#vtSave'); await p.click('#vtSave'); await p.click('#vtSaveYes');
await p.waitForFunction(() => __b.saved.length === 1, null, { timeout: 20000 });
ok(await B(s => __b.saved[0][1] === s, SECRET), 'Save a copy hands the decrypted file to the phone only after the warning');
await B(() => FK.back());

// pause locks
await B(() => { FKVault.state.awayOk = 0; FK.pause(); }); await W("#vtUnlock");
ok(/left the app/.test(await p.textContent('#v-vault')), 'leaving the app locks the vault');
ok(await B(() => __b.wipes > 0), 'blob and open copies wiped on lock');

// recovery key → new password
await p.click('#vtForgot'); await W('#vtRcIn');
await p.fill('#vtRcIn', REC.toLowerCase().replace(/-/g, ' ')); await p.click('#vtRcGo'); await W('#vtN1', 30000);
const PW2 = 'new vault password two';
await p.fill('#vtN1', PW2); await p.fill('#vtN2', PW2); await p.click('#vtNGo');
await W('#vtAdd', 30000);
ok(true, 'recovery key unlocks and a new password is saved');
await p.click('#vtLockNow'); await W('#vtUnlock');
await p.fill('#vtPw', PW); await p.click('#vtUnlock');
await p.waitForFunction(() => /Wrong password/.test(document.getElementById('vtLkMsg').textContent), null, { timeout: 20000 });
ok(true, 'old password no longer works');
await p.fill('#vtPw', PW2); await p.click('#vtUnlock'); await W('.vtrow', 30000);
ok(true, 'new password works');

// idle lock
await B(() => { FKVault.state.left = 1; }); await W('#vtUnlock', 5000);
ok(/without use/.test(await p.textContent('#v-vault')), 'vault locks itself when idle');
await p.fill('#vtPw', PW2); await p.click('#vtUnlock'); await W('.vtrow', 30000);

// delete
await p.click('.vtrow'); await W('#vtDel'); await p.click('#vtDel'); await p.click('#vtDelYes');
await W('.vtempty');
ok(await B(() => !Object.keys(__b.files).some(k => /vault\/[0-9a-f]{32}\.bin$/.test(k))), 'Delete removes the file from Nextcloud');

// leaving the vault page locks it
await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(200);
ok(!(await B(() => FKVault.isOpen())), 'going back home locks the vault');
ok(/Locked/.test(await p.textContent('#hVt')), 'home line says Locked');

// remarks #21 (Update button) and #22 ("Out to" typed in)
await p.evaluate(() => { location.hash = '#shoot'; }); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.getElementById('bMax').tagName === 'INPUT' && document.getElementById('bMax').type === 'number'), '#22 "Out to" is a number field');
const t0 = await p.innerHTML('#bTable');
await p.fill('#bWind', '30'); await p.fill('#bMax', '1500'); await p.waitForTimeout(200);
ok((await p.innerHTML('#bTable')) === t0 && await p.evaluate(() => document.getElementById('bUpd').classList.contains('stale')), '#21 changing values does not recalculate, Update is highlighted');
await p.click('#bUpd'); await p.waitForTimeout(300);
const lastR = await p.evaluate(() => { const r = document.querySelectorAll('#bTable tr'); return r[r.length - 1].cells[0].textContent; });
ok((await p.innerHTML('#bTable')) !== t0 && lastR === '1500' && !(await p.evaluate(() => document.getElementById('bUpd').classList.contains('stale'))), '#21/#22 Update calculates the table out to the typed 1500 m');
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'all vault tests passed');
process.exit(fails ? 1 : 0);
