// Dev tool: contact sheet of exercise drawings → PNG.  node tools/sheet.mjs out.png [filter] [t=0|1|both] [cols]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const www = path.join(root, 'app/src/main/assets/www');
const [out = '/tmp/sheet.png', filter = '', mode = 'both', cols = '6', theme = 'light'] = process.argv.slice(2);
const css = ['css/app.css', 'css/figure.css'].map(f => fs.existsSync(path.join(www, f)) ? fs.readFileSync(path.join(www, f), 'utf8') : '').join('\n');
const exf = fs.existsSync(path.join(www, 'js/ex')) ? ['base.js', ...fs.readdirSync(path.join(www, 'js/ex')).filter(f => f.endsWith('.js') && f !== 'base.js').sort()].map(f => 'js/ex/' + f) : [];
const js = ['js/figure.js', 'js/musclemap.js', ...exf].map(f => fs.existsSync(path.join(www, f)) ? fs.readFileSync(path.join(www, f), 'utf8') : '').join('\n;\n') + (process.env.TESTPOSES ? fs.readFileSync(path.join(root, 'tools/test-poses.js'), 'utf8') : '');
const html = `<!doctype html><html data-theme="${theme}"><head><style>${css}
body{margin:0;padding:8px;background:var(--bg)} .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px}
.c{background:var(--surface2);border:1px solid var(--line);border-radius:6px;padding:4px;font:11px sans-serif;color:var(--ink)} .c b{display:block;height:14px;overflow:hidden}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:2px}</style></head><body><div class="g" id="g"></div><script>${js}
const F=${JSON.stringify(filter)}, MODE=${JSON.stringify(mode)};
const list=(window.EXLIST||window.TEST_EX||[]).filter(e=>!F||e.g===F||new RegExp(F).test(e.id));
document.getElementById('g').innerHTML=list.map(e=>'<div class="c"><b>'+e.id+'</b>'+(MODE==='both'?'<div class="pair">'+FIG.svg(e,0)+FIG.svg(e,1)+'</div>':MODE==='map'?MMAP.svg(e.prim,e.sec):FIG.svg(e,+MODE))+'</div>').join('');
</script></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.setContent(html); await p.waitForTimeout(200);
await p.screenshot({ path: out, fullPage: true }); console.log(errs.join('\n') || 'ok', await p.evaluate(() => document.querySelectorAll('.c').length));
await b.close();
