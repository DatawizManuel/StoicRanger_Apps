// Builds vault-page/index.html (the decrypt page for the website) from vault-page/template.html + the emblem.
// node field-kit/tools/make-vault-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const em = readFileSync(join(R, 'app/src/main/assets/www/js/emblem.js'), 'utf8');
const svg = JSON.parse(em.slice(em.indexOf('"'), em.indexOf('";') + 1)).replace(/<title>[^<]*<\/title>/, '');
writeFileSync(join(R, 'vault-page/index.html'), readFileSync(join(R, 'vault-page/template.html'), 'utf8').replace('__EMBLEM__', svg));
console.log('vault-page/index.html written');
