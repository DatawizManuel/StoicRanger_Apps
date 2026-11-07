/* A small WebDAV stand-in for Nextcloud (tests only): GET, PUT with If-Match / If-None-Match, MKCOL, COPY, PROPFIND
   depth 1, DELETE, Basic auth. Files live in memory under /remote.php/dav/files/<user>/.
   node tools/webdav-mock.js [port]  → prints the port; or require() it: start({user, password}) → {port, files, close} */
const http = require('http'), crypto = require('crypto');

function start({ user = 'manuel', password = 'app-pass-1', port = 0 } = {}) {
  const files = new Map(), dirs = new Set(['/']);
  const st = { files, dirs, log: [], fail412: 0 };
  const root = `/remote.php/dav/files/${encodeURIComponent(user)}`;
  const etag = b => '"' + crypto.createHash('md5').update(b).digest('hex') + '"';
  const srv = http.createServer((q, r) => {
    const chunks = [];
    q.on('data', c => chunks.push(c));
    q.on('end', () => {
      const body = Buffer.concat(chunks);
      const send = (code, h = {}, b = '') => { r.writeHead(code, h); r.end(b); };
      st.log.push(q.method + ' ' + q.url);
      if (q.headers.authorization !== 'Basic ' + Buffer.from(user + ':' + password).toString('base64')) return send(401, { 'WWW-Authenticate': 'Basic realm="Nextcloud"' });
      const u = new URL(q.url, 'http://x');
      if (!u.pathname.startsWith(root + '/')) return send(404);
      const p = decodeURIComponent(u.pathname.slice(root.length)) || '/';
      const parent = p.replace(/\/[^/]+\/?$/, '/') || '/';
      const method = q.headers['x-http-method-override'] || q.method;
      if (method === 'GET') {
        const f = files.get(p);
        return f ? send(200, { ETag: f.etag, 'Content-Type': 'application/octet-stream' }, f.data) : send(404);
      }
      if (method === 'PUT') {
        if (!dirs.has(parent)) return send(409);
        const f = files.get(p);
        if (st.fail412 > 0) { st.fail412--; return send(412); }        // someone else wrote meanwhile
        if (q.headers['if-none-match'] === '*' && f) return send(412);
        if (q.headers['if-match'] && (!f || f.etag !== q.headers['if-match'])) return send(412);
        files.set(p, { data: body, etag: etag(body + Date.now() + Math.random()) });
        return send(f ? 204 : 201, { ETag: files.get(p).etag });
      }
      if (method === 'MKCOL') {
        const d = p.endsWith('/') ? p : p + '/';
        if (dirs.has(d)) return send(405);
        if (!dirs.has(d.replace(/[^/]+\/$/, ''))) return send(409);
        dirs.add(d); return send(201);
      }
      if (method === 'COPY') {
        const f = files.get(p); if (!f) return send(404);
        const dest = decodeURIComponent(new URL(q.headers.destination).pathname.slice(root.length));
        if (!dirs.has(dest.replace(/\/[^/]+$/, '/'))) return send(409);
        if (files.has(dest) && q.headers.overwrite === 'F') return send(412);
        files.set(dest, { data: f.data, etag: etag(f.data + dest) }); return send(201);
      }
      if (method === 'DELETE') { return files.delete(p) ? send(204) : send(404); }
      if (method === 'PROPFIND') {
        const d = p.endsWith('/') ? p : p + '/';
        if (!dirs.has(d)) return send(404);
        const enc = s => s.split('/').map(encodeURIComponent).join('/');
        const hrefs = [root + enc(d)];
        for (const k of files.keys()) if (k.startsWith(d) && !k.slice(d.length).includes('/')) hrefs.push(root + enc(k));
        for (const k of dirs) if (k !== d && k.startsWith(d) && !k.slice(d.length, -1).includes('/')) hrefs.push(root + enc(k));
        const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs.map(h => `<d:response><d:href>${h}</d:href><d:propstat><d:prop><d:getetag>"x"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}</d:multistatus>`;
        return send(207, { 'Content-Type': 'application/xml; charset=utf-8' }, xml);
      }
      send(405);
    });
  });
  return new Promise(res => srv.listen(port, '127.0.0.1', () => res(Object.assign(st, { port: srv.address().port, close: () => srv.close() }))));
}
module.exports = { start };
if (require.main === module) start({ port: +process.argv[2] || 0 }).then(s => console.log(s.port));
