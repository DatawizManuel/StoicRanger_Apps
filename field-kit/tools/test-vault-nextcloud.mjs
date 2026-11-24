// SR Field Kit 0.7.0: vault end to end against a real Nextcloud (needs Docker; see tools/test-vault-nextcloud.sh).
//   NC=http://localhost:8080 NC_USER=admin NC_PASS=… node field-kit/tools/test-vault-nextcloud.mjs
// The app page (real js/vault.js) talks to Nextcloud through a bridge that does what Vault.java does (WebDAV + share
// API). Then a second browser opens the decrypt page as https://stoic-ranger.com/vault/ and loads the shared file
// from Nextcloud as https://cloud.test (forwarded to the container), checking Nextcloud's CORS header for the site.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const R = join(dirname(fileURLToPath(import.meta.url)), '..'), WWW = join(R, 'app/src/main/assets/www');
const NC = process.env.NC || 'http://localhost:8080', USER = process.env.NC_USER || 'admin', PASS = process.env.NC_PASS || 'Admin-Test-123';
const AUTH = 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer(async (q, r) => { try { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const b = await readFile(join(WWW, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); r.end(b); } catch (e) { r.writeHead(404); r.end(); } });
await new Promise(ok => srv.listen(0, ok));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const dav = p => NC + '/remote.php/dav/files/' + USER + p.split('/').map(encodeURIComponent).join('/');

// what Vault.java / NcClient do, over plain HTTP to the test container
async function ncCall(kind, method, path, b64, ifMatch, form) {
  try {
    let url, headers = { Authorization: AUTH, 'OCS-APIRequest': 'true' }, body;
    if (kind === 'share') { url = NC + '/ocs/v2.php/apps/files_sharing/api/v1/shares' + path + '?format=json'; headers.Accept = 'application/json'; if (method === 'POST') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = form; } }
    else { url = dav(path); if (b64 != null && method === 'PUT') body = Buffer.from(b64, 'base64'); if (ifMatch === '*new*') headers['If-None-Match'] = '*'; else if (ifMatch) headers['If-Match'] = ifMatch; }
    const r = await fetch(url, { method, headers, body });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, etag: r.headers.get('etag') || r.headers.get('oc-etag') || '', b64: buf.toString('base64'), text: buf.toString('utf8') };
  } catch (e) { return { status: 0, error: String(e) }; }
}
const BRIDGE = () => {
  const st = window.__b = { db: '', blob: new Uint8Array(0), building: null, pick: null, shared: [] };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const cb = (id, res) => FKNativeCallback(id, res);
  window.FKNative = {
    loadDb: () => st.db, loadDbBackup: () => '', saveDb: t => { st.db = t; return true; }, backupDb: () => true,
    isNight: () => false, appInfo: () => JSON.stringify({ version: '0.7.0', code: 11 }), keepScreenOn: () => {}, hasLocation: () => false,
    srStatus: () => JSON.stringify({ installed: false }), srCall: () => '{}',
    syncGet: () => JSON.stringify({ mode: 'local', url: 'https://cloud.test', user: 'admin', folder: '/Stoic Ranger/', hasPassword: true }), syncSet: () => true,
    ncRequest: (m, path, body, ifm, depth, id) => { window.ncCall('dav', m, path, null, '', '').then(r => cb(id, { status: r.status })); },
    vaultBlobSize: () => st.blob.length, vaultBlobRead: (o, l) => b64(st.blob.subarray(o, o + l)),
    vaultBlobStart: () => { st.building = []; }, vaultBlobAppend: s => { st.building.push(unb64(s)); return true; },
    vaultBlobEnd: () => { const n = st.building.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let p = 0; st.building.forEach(x => { o.set(x, p); p += x.length; }); st.blob = o; return n; },
    vaultWipe: () => { st.blob = new Uint8Array(0); },
    vaultNc: (m, path, ifm, id) => { window.ncCall('dav', m, path, m === 'PUT' ? b64(st.blob) : null, ifm, '').then(r => { if (m === 'GET' && r.status === 200) st.blob = unb64(r.b64); cb(id, { status: r.status, etag: r.etag, size: st.blob.length, error: r.error }); }); },
    vaultShare: (m, sub, form, id) => { window.ncCall('share', m, sub, null, '', form).then(r => cb(id, { status: r.status, body: r.text, error: r.error })); },
    vaultPick: id => { st.blob = st.pick.bytes; cb(id, { ok: true, msg: JSON.stringify({ name: st.pick.name, type: st.pick.type, size: st.pick.bytes.length }) }); },
    vaultShareText: (t, title) => st.shared.push([title, t]), vaultSecure: () => {}, vaultOpen: () => {}, vaultSave: () => {},
  };
};

// start clean: no vault folder, no links
await fetch(dav('/Stoic Ranger/vault/'), { method: 'DELETE', headers: { Authorization: AUTH } });
for (const sh of (JSON.parse((await ncCall('share', 'GET', '', null, '', '')).text).ocs.data || [])) await ncCall('share', 'DELETE', '/' + sh.id, null, '', '');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
await ctx.exposeFunction('ncCall', ncCall);
await ctx.addInitScript(BRIDGE);
const p = await ctx.newPage(); const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html#vault`);
const W = (sel, t = 30000) => p.waitForSelector(sel, { timeout: t });
const B = (f, a) => p.evaluate(f, a);
await W('#vtCreate');
const PW = 'test vault password one';
await p.fill('#vtP1', PW); await p.fill('#vtP2', PW); await p.click('#vtCreate'); await W('#vtRecKey');
await p.check('#vtRecOk'); await p.click('#vtRecGo'); await W('#vtAdd');
const keys = await ncCall('dav', 'GET', '/Stoic Ranger/vault/keys.json');
ok(keys.status === 200 && keys.text.includes('SR-Vault-1') && !keys.text.includes('test vault'), 'keys.json on Nextcloud, no password in it');
const SECRET = 'Range card · real Nextcloud test ' + Date.now();
await B(s => { __b.pick = { name: 'Range card.txt', type: 'text/plain', bytes: new TextEncoder().encode(s) }; }, SECRET);
await p.click('#vtAdd'); await W('.vtrow');
const ls = await fetch(dav('/Stoic Ranger/vault/'), { method: 'PROPFIND', headers: { Authorization: AUTH, Depth: '1' } }).then(r => r.text());
const names = [...ls.matchAll(/vault\/([0-9a-f]{32})\.bin/g)].map(m => m[1]);
ok(names.length === 1 && !ls.includes('Range card'), 'Nextcloud folder holds one file with a random name, no real file name');
const raw = await ncCall('dav', 'GET', '/Stoic Ranger/vault/' + names[0] + '.bin');
ok(raw.status === 200 && !raw.text.includes('Range card'), 'stored file is scrambled');

// send encrypted
await p.click('.vtrow'); await W('#vtSend'); await p.click('#vtSend'); await W('#vtSGo');
const SPW = await p.inputValue('#vtSPw');
await p.click('#vtSGo'); await W('#vtShL', 60000);
const link = await p.textContent('#vtLk');
ok(/^https:\/\/stoic-ranger\.com\/vault\/#cloud\.test\/[A-Za-z0-9]{10,}$/.test(link), 'link from the real Nextcloud: ' + link);
const shares = JSON.parse((await ncCall('share', 'GET', '', null, '', '')).text).ocs.data;
console.log('   share:', JSON.stringify({ t: shares[0] && shares[0].share_type, p: shares[0] && shares[0].permissions, e: shares[0] && shares[0].expiration }));
ok(shares.length === 1 && +shares[0].share_type === 3 && /\d{4}-\d\d-\d\d/.test(shares[0].expiration || '') && (+shares[0].permissions & 1) === 1 && !(+shares[0].permissions & 2), 'Nextcloud has one public read-only link with expiry ' + (shares[0] && shares[0].expiration));

// receiver: decrypt page on the website, Nextcloud as https://cloud.test
const VP = join(R, 'vault-page/vault');
const serveVault = async r => {   // the website folder /vault/: index.html, vault.css, vault.js
  const f = new URL(r.request().url()).pathname.split('/').pop() || 'index.html';
  const type = { 'index.html': 'text/html', 'vault.css': 'text/css', 'vault.js': 'text/javascript' }[f];
  if (!type) return r.fulfill({ status: 404, body: '' });
  await r.fulfill({ status: 200, contentType: type, body: await readFile(join(VP, f)) });
};
const rctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const seen = [];
await rctx.route('https://stoic-ranger.com/**', serveVault);
await rctx.route('https://cloud.test/**', async r => {
  const q = r.request(), u = new URL(q.url());
  const h = Object.assign({}, q.headers()); delete h.host;
  const res = await fetch(NC + u.pathname + u.search, { method: q.method(), headers: h });
  const hdrs = {}; res.headers.forEach((v, k) => { hdrs[k] = v; });
  seen.push([q.method(), u.pathname, res.status, hdrs['access-control-allow-origin'] || '', h.origin || '']);
  await r.fulfill({ status: res.status, headers: hdrs, body: Buffer.from(await res.arrayBuffer()) });
});
const rp = await rctx.newPage(); const rerr = []; rp.on('pageerror', e => rerr.push(String(e)));
await rp.goto(link); await rp.waitForSelector('#sPw:not([hidden])', { timeout: 20000 });
const get = seen.find(s => s[0] === 'GET' && /public\.php\/dav/.test(s[1]));
ok(get && get[2] === 200 && get[3] === 'https://stoic-ranger.com' && get[4] === 'https://stoic-ranger.com', 'decrypt page loaded the file straight from Nextcloud, which allowed stoic-ranger.com (CORS)');
await rp.fill('#pw', 'wrong-wrong-wrong-12'); await rp.click('#go');
await rp.waitForFunction(() => /Wrong password/.test(document.getElementById('msg').textContent), null, { timeout: 20000 });
ok(true, 'wrong password refused on the decrypt page');
await rp.fill('#pw', SPW); await rp.click('#go'); await rp.waitForSelector('#sDone:not([hidden])', { timeout: 20000 });
ok((await rp.textContent('#dName')) === 'Range card.txt' && (await rp.textContent('#dPrev pre')) === SECRET, 'right password: file name and content decrypted in the browser');
ok((await rp.getAttribute('#dSave', 'download')) === 'Range card.txt', 'Save file offers the original name');

// another website is not allowed
const other = await rctx.newPage();
await rctx.route('https://evil.example/**', serveVault);
seen.length = 0; await other.goto(link.replace('https://stoic-ranger.com/vault/', 'https://evil.example/x/'));
await other.waitForSelector('#sManual:not([hidden]), #sPw:not([hidden])', { timeout: 20000 });
const g2 = seen.find(s => s[0] === 'GET' && /public\.php\/dav/.test(s[1]));
console.log('   other site:', JSON.stringify(g2));
ok(g2 && !g2[3], 'Nextcloud gives a page on another website no CORS permission (a real browser then blocks the download)');

// cancel → link dead
await p.click('#vtCancel'); await p.waitForFunction(() => !document.querySelector('#vtCancel'), null, { timeout: 30000 });
const after = JSON.parse((await ncCall('share', 'GET', '', null, '', '')).text).ocs.data;
ok(after.length === 0, 'Cancel link removed the Nextcloud link');
const rp2 = await rctx.newPage(); await rp2.goto(link); await rp2.waitForSelector('#sGone:not([hidden]), #sManual:not([hidden])', { timeout: 20000 });
ok(await rp2.isVisible('#sGone') || await rp2.isVisible('#sManual'), 'after cancelling, the link no longer gives the file' + (await rp2.isVisible('#sGone') ? ' ("no longer works")' : ' (Nextcloud answered without 404)'));

ok(errors.length === 0 && rerr.length === 0, 'no script errors' + (errors.concat(rerr).length ? ': ' + errors.concat(rerr).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'all real-Nextcloud vault tests passed');
process.exit(fails ? 1 : 0);
