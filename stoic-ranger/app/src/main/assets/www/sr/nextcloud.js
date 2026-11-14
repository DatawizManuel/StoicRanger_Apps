/* Stoic Ranger Shooting 1.3.1 — database.xlsx on the user's Nextcloud (remarks #13 and #15, Manuel 2026-11-07;
   shared contract 00_docs/SHARED-DB-CONTRACT.md, section B).
   The device always keeps its own copy and works offline; this file only moves database.xlsx to and from the
   Nextcloud folder over WebDAV. The native side (Android Nextcloud.java, Windows main.js) holds the address and the
   app password (encrypted, never in files or here) and runs one request at a time: RAW.ncRequest(method, name,
   headersJson, bodyB64) → {status, headers, body(base64)} or {status:0, error}. Merging is hub.js's three-way merge.
   - upload with If-Match: <ETag> (If-None-Match: * for a new file); 412 = someone else saved meanwhile
   - before each upload the file on Nextcloud is copied to <folder>/backups/<file>-YYYYMMDD-HHMMSS.xlsx; the newest
     30 copies are kept
   The iPhone web app cannot do this (Nextcloud blocks WebDAV from other websites): there database.xlsx is saved
   and opened by hand, e.g. into the Nextcloud app. */
'use strict';
(() => {
const RAW = window.SRNative || {};
const KEEP = 30;
const parse = t => { try { return JSON.parse(t); } catch (e) { return null; } };
const available = () => typeof RAW.ncRequest === 'function' && typeof RAW.ncState === 'function';
const state = () => (available() && parse(RAW.ncState())) || { mode: 'local' };
const active = () => { const s = state(); return s.mode === 'nextcloud' && !!s.url && !!s.user; };
const fileName = () => state().file || 'database.xlsx';

function req(method, name, headers = {}, body = '') {
  let r = null;
  try { r = parse(RAW.ncRequest(method, name, JSON.stringify(headers), body || '')); } catch (e) { r = null; }
  return r || { status: 0, error: 'no answer' };
}
const H = (r, k) => (r.headers && r.headers[k]) || '';
const etagOf = r => H(r, 'oc-etag') || H(r, 'etag');
const why = r => r.status === 401 ? 'Nextcloud did not accept the user name or app password.'
  : r.status === 0 ? 'Nextcloud could not be reached' + (r.error ? ' (' + r.error + ')' : '') + '.'
  : 'Nextcloud answered ' + r.status + '.';
const ok = r => r.status >= 200 && r.status < 300;
const xmlText = b => { try { return new TextDecoder().decode(Uint8Array.from(atob(b || ''), c => c.charCodeAt(0))); } catch (e) { return ''; } };

/** The file on Nextcloud: {linked, name, size, mtime, etag} (size 0 = not there yet) or {linked, error}. */
function info() {
  const r = req('HEAD', fileName());
  if (r.status === 404) return { linked: true, nextcloud: true, name: fileName(), size: 0, mtime: 0, etag: '' };
  if (!ok(r)) return { linked: true, nextcloud: true, name: fileName(), size: 0, mtime: 0, error: why(r) };
  const lm = Date.parse(H(r, 'last-modified')) || 0;
  let size = +H(r, 'content-length') || 0, etag = etagOf(r);
  if (!size) {                                                // some servers leave the size out of HEAD: ask WebDAV (1.3.1)
    const p = req('PROPFIND', fileName(), { Depth: '0', 'Content-Type': 'application/xml' }, btoa('<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getetag/></d:prop></d:propfind>'));
    const x = p.status === 207 ? xmlText(p.body) : '';
    size = +((/<(?:\w+:)?getcontentlength>(\d+)</.exec(x) || [])[1] || 0);
    etag = etag || ((/<(?:\w+:)?getetag>([^<]+)</.exec(x) || [])[1] || '').replace(/&quot;/g, '"');
  }
  return { linked: true, nextcloud: true, name: fileName(), size, mtime: lm, etag };
}
/** The file's bytes as base64 ('' if it could not be read) and its ETag. */
function read() {
  const r = req('GET', fileName());
  if (!ok(r)) return { b64: '', etag: '', error: r.status === 404 ? '' : why(r) };
  return { b64: r.body || '', etag: etagOf(r) };
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
let dirsMade = false;
/** The folder and its backups folder (MKCOL; 405 = there already). */
function ensureDirs() {
  if (dirsMade) return null;
  const tryDir = name => { const r = req('MKCOL', name); return ok(r) || r.status === 405 ? null : r; };
  let r = tryDir('');
  if (r && r.status === 409) return 'The folder\'s parent folder does not exist on Nextcloud: create it there first, or choose a folder at the top level.';
  if (r) return why(r);
  r = tryDir('backups');
  if (r) return why(r);
  dirsMade = true;
  return null;
}
/** Keeps the newest KEEP copies of this file in backups/ (copies of other files there are left alone). */
function prune() {
  const r = req('PROPFIND', 'backups', { Depth: '1', 'Content-Type': 'application/xml' }, btoa('<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>'));
  if (r.status !== 207) return;
  const stem = fileName().replace(/\.xlsx$/i, '');
  const re = new RegExp('^' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{8}-\\d{6}\\.xlsx$');
  const names = [...xmlText(r.body).matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/g)].map(m => decodeURIComponent(m[1].replace(/\/$/, '').split('/').pop())).filter(n => re.test(n)).sort();
  names.slice(0, Math.max(0, names.length - KEEP)).forEach(n => req('DELETE', 'backups/' + n));
}
const same64 = (a, b) => String(a || '').replace(/\s+/g, '') === String(b || '').replace(/\s+/g, '');
const isXlsx = b => { try { return atob(String(b || '').slice(0, 8)).slice(0, 2) === 'PK'; } catch (e) { return false; } };
/** Uploads database.xlsx (base64). etag = the version this upload is based on ('' = the file must not exist yet).
    1.3.1: the file is read back after the upload; if Nextcloud does not give back exactly what was sent, it is sent
    once more, and if it is still wrong the copy made just before goes back in place, so a broken file never stays.
    {ok, etag, size, mtime} or {ok:false, conflict:true} (412) or {ok:false, msg}. */
function write(b64, etag) {
  if (!isXlsx(b64)) return { ok: false, msg: 'Nothing was uploaded: the file to send was not an Excel file.' };
  const e = ensureDirs(); if (e) return { ok: false, msg: e };
  let backup = '';
  if (etag) {                                                 // a copy of what is there now, before it is replaced
    backup = 'backups/' + fileName().replace(/\.xlsx$/i, '') + '-' + stamp() + '.xlsx';
    const c = req('COPY', fileName(), { 'X-Dest-Name': backup, Overwrite: 'F' });
    if (c.status === 404) backup = '';
    else if (!ok(c)) return { ok: false, msg: 'No backup copy could be made on Nextcloud, so nothing was uploaded (' + why(c) + ')' };
    prune();
  }
  const put = h => req('PUT', fileName(), Object.assign({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, h), b64);
  let r = put(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' });
  if (r.status === 412) return { ok: false, conflict: true };
  if (!ok(r)) return { ok: false, msg: why(r) };
  let tag = etagOf(r);
  for (let n = 0; n < 2; n++) {
    const back = read();
    if (back.b64 && same64(back.b64, b64)) { const i = info(); return { ok: true, etag: back.etag || tag || i.etag || '', size: i.size, mtime: i.mtime, verified: true }; }
    if (n === 0 && back.etag) { r = put({ 'If-Match': back.etag }); if (!ok(r)) break; tag = etagOf(r); }
  }
  if (backup) req('COPY', backup, { 'X-Dest-Name': fileName(), Overwrite: 'T' });   // the last good file goes back
  return { ok: false, msg: 'database.xlsx did not arrive on Nextcloud intact' + (backup ? ', so the previous version was put back' : '') + '. Nothing is lost on this device; try Sync now again.' };
}
/** Checks a setting before it is stored: can we log in and reach (or make) the folder? */
function check(setting, password) {
  if (!RAW.ncTry) return { ok: false, msg: 'Not available on this device.' };
  if (!/^https:\/\//i.test(setting.url || '')) return { ok: false, msg: 'The address must start with https://' };
  const call = (m, name, h) => parse(RAW.ncTry(JSON.stringify(setting), password || '', m, name, JSON.stringify(h || {}))) || { status: 0 };
  let r = call('PROPFIND', '', { Depth: '0' });
  if (r.status === 404) r = call('MKCOL', '', {});
  if (r.status === 207 || ok(r) || r.status === 405) return { ok: true };
  if (r.status === 409) return { ok: false, msg: 'The folder\'s parent folder does not exist on Nextcloud: create it there first, or choose a folder at the top level.' };
  return { ok: false, msg: why(r) };
}
window.SRNC = { available, state, active, info, read, write, check, KEEP, resetDirs: () => { dirsMade = false; } };
})();
