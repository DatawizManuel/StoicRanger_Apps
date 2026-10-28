#!/usr/bin/env node
/* Builds the Stoic Ranger web apps (for iPhone/iPad "Add to Home Screen", or any browser) into dist/.
   The app code is taken unchanged from the Android projects (android/<app>/app/src/main/assets/www); only
   index.html gets the web start-up, and a few Android-only sentences are reworded (PATCHES, each must match).
   Usage: node tools/build-web.mjs   → dist/index.html, dist/database/, dist/training-log/, dist/shooting-drills/ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');

export const APPS = [
  { id: 'gundb', dir: 'database', src: 'gun-database', prefix: 'RB', name: 'Stoic Ranger - Gun Database', short: 'SR_Database', color: '#111111',
    desc: 'Guns, barrels, ammunition, shooters, datasheets, dope cards.' },
  { id: 'training-log', dir: 'training-log', src: 'training-log', prefix: 'TL', name: 'Stoic Ranger - Training Log', short: 'SR_Training Log', color: '#4B5320',
    desc: 'Every training: who, when, guns, rounds, trainer.' },
  { id: 'shooting-drills', dir: 'shooting-drills', src: 'shooting-drills', prefix: 'SD', name: 'Stoic Ranger - Shooting Drills', short: 'SR_Shooting Drills', color: '#5C462A',
    desc: 'Pistol and rifle drills, results, printable targets.' },
];

const NOT_HERE = 'is not set up on this device yet (open it once from the same Stoic Ranger web address). Your data here stays as it is.';
const PATCHES = {
  gundb: {
    'js/views-more.js': [
      ["(and in Android's own device backup, if it is on). Save a backup now and then, for example to Google Drive.",
        "(in this browser's storage for this web address). Save a backup now and then, for example to iCloud Drive or Files: deleting the Home Screen icon or the website data deletes the entries."],
      ['· Android ${esc(info.android || \'\')} ·', '· web app ·'],
    ],
  },
  'training-log': {
    'js/views-more.js': [['· Android ${esc(info.android || \'\')}', '· web app']],
    'js/print.js': [['In the Android print dialog choose <b>Save as PDF</b> as printer to get a PDF file you can share.',
      'On iPhone, tap the share button in the print options and choose <b>Save to Files</b> to get a PDF you can share; on a computer choose <b>Save as PDF</b> as printer.']],
    'js/link.js': [['is not installed on this phone. Your data here stays as it is.', NOT_HERE], ['Linking only works in the Android app.', 'Linking is not available in this browser.']],
    'js/link-sd.js': [['is not installed on this phone. Your data here stays as it is.', NOT_HERE], ['Linking only works in the Android app.', 'Linking is not available in this browser.']],
  },
  'shooting-drills': {
    'js/views-more.js': [['· Android ${esc(info.android || \'\')}', '· web app']],
    'js/link.js': [['is not installed on this phone. Your data here stays as it is.', NOT_HERE], ['Linking only works in the Android app.', 'Linking is not available in this browser.']],
  },
};

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
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function versionOf(app) {
  const g = read(path.join(ROOT, 'android', app.src, 'app/build.gradle'));
  return { version: (g.match(/versionName\s+'([^']+)'/) || [])[1] || '0', code: +((g.match(/versionCode\s+(\d+)/) || [])[1] || 0) };
}

function buildApp(app) {
  const www = path.join(ROOT, 'android', app.src, 'app/src/main/assets/www');
  const out = path.join(DIST, app.dir);
  copyDir(www, out);
  for (const [file, list] of Object.entries(PATCHES[app.id] || {})) {
    let t = read(path.join(out, file));
    for (const [a, b] of list) {
      if (!t.includes(a)) throw new Error(`${app.id} ${file}: text to reword not found (Android code changed?): ${a}`);
      t = t.split(a).join(b);
    }
    fs.writeFileSync(path.join(out, file), t);
  }
  for (const s of [180, 192, 512, 32]) fs.copyFileSync(path.join(ROOT, 'web/icons', app.src, `icon-${s}.png`), path.join(out, `icon-${s}.png`));
  fs.copyFileSync(path.join(ROOT, 'web/shell/native-web.js'), path.join(out, 'native-web.js'));

  // index.html: the app scripts are loaded by native-web.js once the data is in memory
  let html = read(path.join(www, 'index.html'));
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>\s*/g)].map(m => m[1]);
  if (!scripts.length) throw new Error(app.id + ': no scripts in index.html');
  html = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
  const { version, code } = versionOf(app);
  const cfg = { app: app.id, prefix: app.prefix, version: version + '-web', code, scripts };
  html = html.replace('</head>', `<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-32.png">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${esc(app.short)}">
<meta name="theme-color" content="${app.color}">
</head>`).replace('</body>', `<script>window.SR_WEB=${JSON.stringify(cfg)};</script>
<script src="native-web.js"></script>
</body>`);
  fs.writeFileSync(path.join(out, 'index.html'), html);

  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
    name: app.name, short_name: app.short, id: './', start_url: './', scope: './', display: 'standalone',
    background_color: app.color, theme_color: app.color, description: app.desc,
    icons: [192, 512].map(s => ({ src: `icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
  }, null, 1));

  const files = walk(out).filter(f => f !== 'sw.js');
  const hash = crypto.createHash('sha256');
  files.sort().forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(out, f))); });
  const sw = read(path.join(ROOT, 'web/shell/sw.js')).replace('__VERSION__', version + '-' + hash.digest('hex').slice(0, 10))
    .replace('__FILES__', JSON.stringify(['./', ...files]));
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  return { ...app, version };
}

function landing(built) {
  const tpl = read(path.join(ROOT, 'web/landing/index.html'));
  const tiles = built.map(a => `<a class="app" href="${a.dir}/">
    <img src="${a.dir}/icon-180.png" alt="" width="64" height="64">
    <span><b>${esc(a.short)}</b><small>${esc(a.desc)}</small><small class="v">${esc(a.name)} · ${esc(a.version)}</small></span></a>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'index.html'), tpl.replace('<!--APPS-->', tiles));
  fs.copyFileSync(path.join(ROOT, 'web/icons/gun-database/icon-180.png'), path.join(DIST, 'apple-touch-icon.png'));
  fs.copyFileSync(path.join(ROOT, 'web/icons/gun-database/icon-32.png'), path.join(DIST, 'favicon.png'));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  const built = APPS.map(buildApp);
  landing(built);
  built.forEach(a => console.log(`${a.short.padEnd(20)} ${a.version}  → dist/${a.dir}/`));
}
