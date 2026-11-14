/* Packs the app for Windows x64 (Electron 33.2.1). Usage: node tools/pack.js <staging dir> <out dir> [electron zip dir] */
const { packager } = require('@electron/packager');
const [dir, out, zipDir] = process.argv.slice(2);
(async () => {
  const p = await packager({ dir, out, platform: 'win32', arch: 'x64', electronVersion: '33.2.1', electronZipDir: zipDir || undefined,
    executableName: 'StoicRanger', name: 'Stoic Ranger', asar: true, overwrite: true, prune: false });
  console.log(p.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
