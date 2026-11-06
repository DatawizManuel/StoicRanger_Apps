// Renders the launcher icons (res/mipmap-*) from store/*.svg with the preinstalled Chromium. Dev tool, run once per icon change.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = n => fs.readFileSync(path.join(root, 'store', n), 'utf8');
const bg = svg('bg.svg'), fg = svg('emblem-adaptive-foreground.svg'), mono = svg('emblem-adaptive-monochrome.svg');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const b = await chromium.launch(); const p = await b.newPage();
async function shot(html, size, file) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
const layer = (s, size) => s.replace(/<svg /, `<svg style="position:absolute;left:0;top:0;width:${size}px;height:${size}px" `);
for (const [d, k] of Object.entries(dens)) {
  const dir = path.join(root, 'app/src/main/res/mipmap-' + d); fs.mkdirSync(dir, { recursive: true });
  const A = Math.round(108 * k), L = Math.round(48 * k);
  await shot(layer(bg, A), A, path.join(dir, 'ic_launcher_background.png'));
  await shot(layer(fg, A), A, path.join(dir, 'ic_launcher_foreground.png'));
  await shot(layer(mono, A), A, path.join(dir, 'ic_launcher_monochrome.png'));
  // legacy icons: the 108 dp layers cropped to the middle 72 dp, rounded square and circle
  const inner = (r) => `<div style="position:relative;width:${L}px;height:${L}px;overflow:hidden;border-radius:${r}"><div style="position:absolute;left:${-L / 4}px;top:${-L / 4}px;width:${L * 1.5}px;height:${L * 1.5}px">${layer(bg, L * 1.5)}${layer(fg, L * 1.5)}</div></div>`;
  await shot(inner('18%'), L, path.join(dir, 'ic_launcher.png'));
  await shot(inner('50%'), L, path.join(dir, 'ic_launcher_round.png'));
}
// Play Store 512 px and a preview
await shot(`<div style="position:relative;width:512px;height:512px;overflow:hidden"><div style="position:absolute;left:-128px;top:-128px">${layer(bg, 768)}${layer(fg, 768)}</div></div>`, 512, path.join(root, 'store/play-store-512.png'));
await b.close(); console.log('icons written');
