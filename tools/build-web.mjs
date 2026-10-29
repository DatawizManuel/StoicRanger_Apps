#!/usr/bin/env node
/* Builds the Stoic Ranger web app (iPhone/iPad "Add to Home Screen", or any browser) into dist/.
   The app code is taken unchanged from the Android project (stoic-ranger/app/src/main/assets/www): one app,
   one database, four pages (home, gun/, training/, drills/; Daily Thoughts is its own app again since 1.1.0). Each page gets the web start-up
   (stoic-ranger/web/native-web.js stands in for the Android shell); one manifest and one service worker cover all.
   Usage: node tools/build-web.mjs   → dist/ (published by .github/workflows/pages.yml) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const APP = path.join(ROOT, 'stoic-ranger');
const WWW = path.join(APP, 'app/src/main/assets/www');
const PAGES = ['index.html', 'gun/index.html', 'training/index.html', 'drills/index.html'];
const NAME = 'Stoic Ranger', COLOR = '#111111';

/* One-time password asked on the first start on a device (Manuel 2026-10-28). Only the PBKDF2-SHA-256 hash is
   stored here; the password itself is never written into this repository. To change it, put a new salt and
   hash here (node -e "…pbkdf2Sync(pw, Buffer.from(saltHex, 'hex'), 310000, 32, 'sha256')"): every device then asks once more. */
const LOCK = { salt: '21fbdf046e21e67ad88b40be9843df02', iterations: 310000, hash: 'bccf652dd654cb634c30bb28ecb9b372be39e65209e98f74efc80b8b8882f8c0' };

const read = p => fs.readFileSync(p, 'utf8');
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
};
const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]);

export function versionOf() {
  const g = read(path.join(APP, 'app/build.gradle'));
  return { version: (g.match(/versionName\s+'([^']+)'/) || [])[1] || '0', code: +((g.match(/versionCode\s+(\d+)/) || [])[1] || 0) };
}

export function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(WWW, DIST);
  for (const s of [180, 192, 512, 32]) fs.copyFileSync(path.join(ROOT, 'web/icons/stoic-ranger', `icon-${s}.png`), path.join(DIST, `icon-${s}.png`));
  fs.copyFileSync(path.join(APP, 'web/native-web.js'), path.join(DIST, 'native-web.js'));
  const { version, code } = versionOf();

  // every page: its scripts are loaded by native-web.js once the data is in memory
  for (const page of PAGES) {
    const root = page.includes('/') ? '../' : '';
    let html = read(path.join(WWW, page));
    const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>\s*/g)].map(m => m[1]);
    if (!scripts.length) throw new Error(page + ': no scripts');
    html = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
    const cfg = { version: version + '-web', code, root, scripts, lock: LOCK };
    html = html.replace('</head>', `<link rel="manifest" href="${root}manifest.webmanifest">
<link rel="icon" type="image/png" href="${root}icon-32.png">
<link rel="apple-touch-icon" href="${root}icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${NAME}">
<meta name="theme-color" content="${COLOR}">
</head>`).replace('</body>', `<script>window.SR_WEB=${JSON.stringify(cfg)};</script>
<script src="${root}native-web.js"></script>
</body>`);
    fs.writeFileSync(path.join(DIST, page), html);
  }

  fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
    name: NAME, short_name: NAME, id: './', start_url: './', scope: './', display: 'standalone',
    background_color: COLOR, theme_color: COLOR,
    description: 'Gun Database, Training Log and Shooting Drills in one app, with a shared database.xlsx.',
    icons: [192, 512].map(s => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
  }, null, 1));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  const files = walk(DIST).filter(f => f !== 'sw.js' && f !== '.nojekyll');
  const hash = crypto.createHash('sha256');
  files.sort().forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(DIST, f))); });
  const sw = read(path.join(ROOT, 'web/shell/sw.js')).replace('__VERSION__', version + '-' + hash.digest('hex').slice(0, 10))
    .replace('__FILES__', JSON.stringify(['./', ...files]));
  fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
  return { version, files: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = build();
  console.log(`Stoic Ranger ${r.version} web app → dist/ (${r.files} files)`);
}
