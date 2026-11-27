// SR Field Kit 0.8.0 vault tests (no phone needed): node field-kit/tools/test-vault.mjs
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
  const st = window.__b = { bio: { avail: true, on: false, account: '', boot: 5, bootNow: 5, key: '', answer: 'ok', prompts: 0 }, db: '', files: {}, etags: {}, shares: {}, nextShare: 7, blob: new Uint8Array(0), building: null, shared: [], opened: [], saved: [], secure: [], wipes: 0, pick: null, calls: [] };
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
      if (m === 'PROPFIND') { const n = Object.keys(st.files).filter(k => k.startsWith(path)).length; return later(cb, { status: 207, body: btoa('<d:multistatus>' + '<d:response></d:response>'.repeat(n + 1) + '</d:multistatus>') }); }
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
    vaultMove: (from, to, cb) => { st.calls.push('MOVE ' + from + ' ' + to);
      if (Object.keys(st.files).some(k => k.startsWith(to))) return later(cb, { status: 412 });
      Object.keys(st.files).filter(k => k.startsWith(from)).forEach(k => { const n = to + k.slice(from.length); st.files[n] = st.files[k]; st.etags[n] = st.etags[k]; delete st.files[k]; delete st.etags[k]; });
      later(cb, { status: 201 }); },
    vaultBioState: () => JSON.stringify({ avail: st.bio.avail, on: st.bio.on, account: st.bio.on ? st.bio.account : '', boot: st.bio.boot, bootNow: st.bio.bootNow }),
    vaultBioOn: (acc, key, cb) => { st.bio.prompts++; if (st.bio.answer !== 'ok') return later(cb, { ok: false, msg: 'cancelled' }); Object.assign(st.bio, { on: true, account: acc, key, boot: st.bio.bootNow }); later(cb, { ok: true, msg: '' }); },
    vaultBioUnlock: (acc, cb) => { st.bio.prompts++; if (!st.bio.on || acc !== st.bio.account) return later(cb, { ok: false, msg: 'off' }); if (st.bio.answer !== 'ok') return later(cb, { ok: false, msg: 'cancelled' }); later(cb, { ok: true, msg: st.bio.key }); },
    vaultBioOff: () => { st.bio.on = false; st.bio.key = ''; },
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
await B(() => FK.resume());

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

// ---------- 0.8.0 #24b: fingerprint unlock ----------
await p.click('#vtSet'); await W('#vtSBio');
await p.check('#vtSBio'); await p.waitForFunction(() => __b.bio.on, null, { timeout: 10000 });
ok(await B(() => __b.bio.on && __b.bio.key.length > 40 && __b.bio.account === 'https://cloud.example.com|u'), 'fingerprint unlock turned on in the settings (vault key handed to the Keystore side)');
await B(() => FK.back());
await p.click('#vtLockNow'); await W('.vtrow', 10000);
ok(await B(() => FKVault.isOpen() && __b.bio.prompts === 2), 'after locking, the fingerprint prompt comes up by itself and opens the vault');
await B(() => { __b.bio.answer = 'cancel'; }); await p.click('#vtLockNow'); await W('#vtBio'); await p.waitForTimeout(300);
ok(!(await B(() => FKVault.isOpen())) && await p.isVisible('#vtPw') && !(await p.textContent('#vtLkMsg')), '"Use password" on the prompt leaves the password field, no error');
await B(() => { __b.bio.answer = 'ok'; }); await p.click('#vtBio'); await W('.vtrow', 10000);
ok(true, 'Unlock with fingerprint button opens it');
// restart: password needed once, then fingerprint works again
await B(() => { __b.bio.bootNow = 6; }); await p.click('#vtLockNow'); await W('#vtUnlock');
ok(!(await p.$('#vtBio')) && /restarted/.test(await p.textContent('#v-vault')), 'after a phone restart no fingerprint button, the password is asked once');
await p.fill('#vtPw', PW2); await p.click('#vtUnlock'); await W('.vtrow', 30000);
await p.waitForFunction(() => __b.bio.boot === 6, null, { timeout: 10000 });
ok(true, 'after the password, fingerprint unlock is armed again');
// leaving the app locks; coming back asks for the fingerprint
await B(() => { FKVault.state.awayOk = 0; FK.pause(); }); await W('#vtBio');
const pr = await B(() => __b.bio.prompts); await p.waitForTimeout(400);
ok((await B(() => __b.bio.prompts)) === pr, 'no fingerprint prompt while the app is in the background');
await B(() => FK.resume()); await W('.vtrow', 10000);
ok(true, 'coming back to the app: fingerprint prompt, vault open');

// ---------- #24c: back to the link after a trip to another app (e.g. Secure Folder) ----------
await p.click('.vtrow'); await W('#vtSend'); await p.click('#vtSend'); await W('#vtSGo');
const SPW2 = await p.inputValue('#vtSPw');
await p.click('#vtSGo'); await W('#vtShL', 30000);
await p.click('#vtShL');
ok((await p.textContent('#vtShL')) === 'Share link again', 'Share link marks itself as done');
await B(() => { FKVault.state.awayOk = 0; FK.pause(); }); await W('#vtBio');
await B(() => FK.resume()); await W('#vtShP', 10000);
ok(/where you left off/.test(await p.textContent('.vtsheet')) && (await p.textContent('#vtShL')) === 'Share link again' && (await p.textContent('#vtShP')) === 'Share password', 'after unlocking, the same link opens again with "Share password" ready');
await p.click('#vtShP');
ok(await B(pw => __b.shared[__b.shared.length - 1][1] === pw, SPW2), 'password shared from the reopened sheet');
await p.click('#vtDone');
await p.click('[data-vt="sent"]'); await p.click('#vtSList .vtrow');
ok((await p.textContent('#vtLp')) === SPW2, 'Sent links shows link and password again');
await B(() => FK.back()); await p.click('[data-vt="files"]');

// ---------- #26: vault folder ----------
await p.click('#vtSet'); await W('#vtFolderC'); await p.click('#vtFolderC'); await W('#vtFIn');
ok((await p.inputValue('#vtFIn')) === '/Stoic Ranger/vault/', 'folder setting shows today\'s folder');
await p.fill('#vtFIn', '/Stoic Ranger/vault/sub'); await p.click('#vtFGo');
ok(/inside/.test(await p.textContent('#vtFMsg2')), 'a folder inside the vault folder is refused');
await p.fill('#vtFIn', 'Private\\Vault'); await p.click('#vtFGo'); await W('#vtFMove');
await p.click('#vtFMove'); await W('.vtrow', 10000); await p.waitForTimeout(200);
const mv = await B(() => ({ k: !!__b.files['/Private/Vault/keys.json'], i: !!__b.files['/Private/Vault/index.bin'], old: Object.keys(__b.files).filter(k => k.startsWith('/Stoic Ranger/vault/')), note: __b.files['/Stoic Ranger/vault/moved.json'] && new TextDecoder().decode(__b.files['/Stoic Ranger/vault/moved.json']) }));
ok(mv.k && mv.i && mv.old.length === 1 && /"movedTo":"\/Private\/Vault\/"/.test(mv.note || ''), 'Move the vault: everything now in /Private/Vault/, only moved.json left behind');
ok(await B(() => FKVault.isOpen()) && (await p.textContent('#vtFList')).includes('Serials.txt'), 'vault stays open with its files after the move');
const filesB64 = await B(() => { const o = {}; for (const k in __b.files) o[k] = __b.b64(__b.files[k]); return o; });
// a second phone still set to the old folder finds the vault
const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('p2 ' + e));
await p2.addInitScript(BRIDGE); await p2.goto(URL0); await p2.waitForTimeout(300);
await p2.evaluate(f => { for (const k in f) __b.files[k] = __b.unb64(f[k]); location.hash = '#vault'; }, filesB64);
await p2.waitForSelector('#vtMvUse', { timeout: 10000 });
ok(/\/Private\/Vault\//.test(await p2.textContent('#v-vault')), 'other phone: "The vault has moved" with the new folder (no new vault offered)');
await p2.click('#vtMvUse'); await p2.waitForSelector('#vtUnlock', { timeout: 10000 });
await p2.fill('#vtPw', PW2); await p2.click('#vtUnlock'); await p2.waitForSelector('.vtrow', { timeout: 30000 });
ok((await p2.textContent('#vtFList')).includes('Serials.txt'), 'other phone opens the moved vault');
await p2.close();
// switch to a vault that already exists elsewhere (the old place now only has moved.json, so pretend one exists)
await B(() => { __b.files['/Other/Vault/keys.json'] = new TextEncoder().encode('{}'); });
await p.click('#vtSet'); await W('#vtFolderC'); await p.click('#vtFolderC'); await W('#vtFIn');
await p.fill('#vtFIn', '/Other/Vault/'); await p.click('#vtFGo'); await W('#vtFSw');
ok(/already exists/.test(await p.textContent('#vtFAsk')), 'existing vault in the new folder: offers to switch, never mixes the two');
await p.click('#vtFBack'); await p.click('#vtFNo');
ok(await B(() => __b.bio.on), 'fingerprint unlock kept after the move (same vault)');

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
