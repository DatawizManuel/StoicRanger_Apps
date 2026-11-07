/* Stoic Ranger Shooting 1.3.0 — database.xlsx on the user's Nextcloud (remarks #13 and #15, Manuel 2026-11-07;
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
  return { linked: true, nextcloud: true, name: fileName(), size: +H(r, 'content-length') || 0, mtime: lm, etag: etagOf(r) };
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
/** Uploads database.xlsx (base64). etag = the version this upload is based on ('' = the file must not exist yet).
    {ok, etag, size, mtime} or {ok:false, conflict:true} (412) or {ok:false, msg}. */
function write(b64, etag) {
  const e = ensureDirs(); if (e) return { ok: false, msg: e };
  if (etag) {                                                 // a copy of what is there now, before it is replaced
    const c = req('COPY', fileName(), { 'X-Dest-Name': 'backups/' + fileName().replace(/\.xlsx$/i, '') + '-' + stamp() + '.xlsx', Overwrite: 'F' });
    if (!ok(c) && c.status !== 404) return { ok: false, msg: 'No backup copy could be made on Nextcloud, so nothing was uploaded (' + why(c) + ')' };
    prune();
  }
  const r = req('PUT', fileName(), Object.assign({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }), b64);
  if (r.status === 412) return { ok: false, conflict: true };
  if (!ok(r)) return { ok: false, msg: why(r) };
  const i = info();
  return { ok: true, etag: etagOf(r) || i.etag || '', size: i.size, mtime: i.mtime };
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
