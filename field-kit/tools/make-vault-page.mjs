// Builds vault-page/vault/index.html (the decrypt page for the website) from vault-page/template.html + the emblem.
// Upload the whole folder vault-page/vault/ (index.html, vault.css, vault.js, .htaccess) as /vault/ on the website.
// node field-kit/tools/make-vault-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const em = readFileSync(join(R, 'app/src/main/assets/www/js/emblem.js'), 'utf8');
const svg = JSON.parse(em.slice(em.indexOf('"'), em.indexOf('";') + 1)).replace(/<title>[^<]*<\/title>/, '');
const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
const symbol = '<symbol id="sr-seal" viewBox="40 40 432 432">' + inner + '</symbol>';
writeFileSync(join(R, 'vault-page/vault/index.html'), readFileSync(join(R, 'vault-page/template.html'), 'utf8').replace('__SYMBOL__', symbol));
console.log('vault-page/vault/index.html written');
