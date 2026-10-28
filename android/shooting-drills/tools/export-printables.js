/* Writes all printable targets into one A4 PDF (for printing on a PC): node tools/export-printables.js out.pdf */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const out = process.argv[2] || 'sr-printables.pdf';
const srv = http.createServer((q, r) => { const f = path.join(WWW, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto(`http://localhost:${srv.address().port}/index.html#/printables`); await p.waitForTimeout(400);
  const html = await p.evaluate(() => `<!doctype html><html><head><meta charset="utf-8"><style>${SD.FONTS_CSS}@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm;page-break-after:always}</style></head><body>${SD.PRINTABLES.map(x => SD.printableSvg(x.id)).join('')}</body></html>`);
  await p.evaluate(h => { document.open(); document.write(h); document.close(); }, html); await p.waitForTimeout(600);
  await p.pdf({ path: out, width: '210mm', height: '297mm', printBackground: true });
  await b.close(); srv.close(); console.log(out);
});
