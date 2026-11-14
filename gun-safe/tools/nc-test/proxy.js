// https on :8443 (self-signed) in front of the Nextcloud container on :8080, for the real-server test
const https = require('https'), http = require('http'), fs = require('fs'), d = process.argv[2];
https.createServer({ key: fs.readFileSync(d + '/key.pem'), cert: fs.readFileSync(d + '/cert.pem') }, (q, s) => {
  const h = Object.assign({}, q.headers);
  if (h.destination) h.destination = h.destination.replace('https://localhost:8443', 'http://127.0.0.1:8080');
  const p = http.request({ host: '127.0.0.1', port: 8080, method: q.method, path: q.url, headers: h }, r => { s.writeHead(r.statusCode, r.headers); r.pipe(s); });
  p.on('error', e => { s.writeHead(502); s.end(String(e)); }); q.pipe(p);
}).listen(8443);
