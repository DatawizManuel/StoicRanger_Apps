#!/usr/bin/env node
/* Writes an empty database.xlsx (all sheets, no entries) with the app's own writer, for the Windows package.
   Usage: node windows/tools/make-template.mjs <out.xlsx> */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../stoic-ranger/app/src/main/assets/www');
const b = await chromium.launch(), p = await b.newPage();
await p.setContent('<html></html>');
for (const f of ['gun/lib/xlsx.mini.min.js', 'sr/drill-names.js', 'sr/xlsxdb.js']) await p.addScriptTag({ content: fs.readFileSync(path.join(WWW, f), 'utf8') });
const b64 = await p.evaluate(() => {
  const t = new Date().toISOString();
  const db = { app: 'stoic-ranger', format: 1, created: t, updated: t, schemas: {}, settings: { common: {} }, history: [], favs: [] };
  SRX.TABLES.forEach(k => { db[k] = []; });
  const u8 = SRX.write(db, { by: 'Stoic Ranger (empty template)' });
  let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
});
fs.writeFileSync(process.argv[2], Buffer.from(b64, 'base64'));
await b.close();
console.log('empty database.xlsx →', process.argv[2]);
