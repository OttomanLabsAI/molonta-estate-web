#!/usr/bin/env node
/* measure-font.js — fetch the real font files from npm @fontsource so the site
 * self-hosts them and verify-layout measures line boxes with the true metrics,
 * even in a sandbox that blocks webfont CDNs.
 *
 *   node scripts/measure-font.js "<Family Name>" <outDir> [--weights 400,700] [--subset latin]
 *
 * Writes <outDir>/<slug>-<subset>-<weight>-normal.woff2 files and appends the
 * matching @font-face blocks to <outDir>/fonts.css. Dependency-free: talks to
 * registry.npmjs.org directly and unpacks the tarball itself.
 *
 * Exit 0: files written.  Exit 3: no such @fontsource package — pick the
 * closest published family (see house-style.md defaults) and rerun.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

function get(url, asBuffer) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'site-pitch/1.0', accept: '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(get(new URL(res.headers.location, url).href, asBuffer));
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(asBuffer ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Minimal tar reader: 512-byte headers, size in octal, data padded to 512.
function* tarEntries(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const block = buf.subarray(off, off + 512);
    if (block.every(b => b === 0)) break;
    const str = (a, b) => block.subarray(a, b).toString('utf8').replace(/\0.*$/, '');
    const name = (str(345, 500) ? str(345, 500) + '/' : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(block[156] || 48);
    const data = buf.subarray(off + 512, off + 512 + size);
    if (type === '0' || type === '\0') yield { name, data };
    off += 512 + Math.ceil(size / 512) * 512;
  }
}

async function main() {
  const family = process.argv[2];
  const outDir = process.argv[3];
  if (!family || !outDir) { console.error('usage: node measure-font.js "<Family Name>" <outDir> [--weights 400,700] [--subset latin]'); process.exit(1); }
  const argOf = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const weights = argOf('--weights', '400,700').split(',').map(s => s.trim()).filter(Boolean);
  const subset = argOf('--subset', 'latin');
  const slug = family.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');

  let meta;
  try { meta = JSON.parse(await get(`https://registry.npmjs.org/@fontsource/${slug}`)); }
  catch (e) { console.error(`@fontsource/${slug} not found on npm (${e.message}).`); process.exit(3); }
  const version = meta['dist-tags'] && meta['dist-tags'].latest;
  const tarball = version && meta.versions[version].dist.tarball;
  if (!tarball) { console.error(`No published version for @fontsource/${slug}.`); process.exit(3); }

  const tar = zlib.gunzipSync(await get(tarball, true));
  fs.mkdirSync(outDir, { recursive: true });

  const wanted = new Set(weights.map(w => `${slug}-${subset}-${w}-normal.woff2`));
  const written = [];
  const availableWeights = new Set();
  for (const entry of tarEntries(tar)) {
    const base = path.posix.basename(entry.name);
    const m = base.match(new RegExp(`^${slug}-${subset}-(\\d+)-normal\\.woff2$`));
    if (m) availableWeights.add(m[1]);
    if (wanted.has(base)) {
      fs.writeFileSync(path.join(outDir, base), entry.data);
      written.push(base);
    }
  }
  if (!written.length) {
    console.error(`No ${subset} woff2 files matched weights ${weights.join(',')} in @fontsource/${slug}@${version}. Available ${subset} weights: ${[...availableWeights].sort().join(', ') || 'none'}.`);
    process.exit(3);
  }

  const cssPath = path.join(outDir, 'fonts.css');
  let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  for (const file of written) {
    const weight = file.match(/-(\d+)-normal\.woff2$/)[1];
    const block = `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("./${file}") format("woff2");}\n`;
    if (!css.includes(block)) css += block;
  }
  fs.writeFileSync(cssPath, css);

  console.log(JSON.stringify({
    ok: true, family, package: `@fontsource/${slug}@${version}`, subset,
    written, missed: weights.filter(w => !written.some(f => f.includes(`-${w}-`))),
    css: cssPath,
    note: 'Link fonts.css before the site stylesheet; verify-layout --fonts asserts these families resolve.',
  }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
