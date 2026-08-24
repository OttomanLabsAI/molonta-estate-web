#!/usr/bin/env node
/* verify-layout.js — the stage-6 gate. Serves the built site and sweeps it
 * 320→1920 in headless Chromium with the real fonts loaded, measuring line
 * boxes. Fails loudly; exit 0 only when everything passes.
 *
 *   node scripts/verify-layout.js --dir public \
 *     [--routes "/,/original/,/offer/"] \
 *     [--fonts "Oswald,Inter"] \
 *     [--original-host theirgym.co.uk] \
 *     [--static-scan-exclude "original/"]
 *
 * Checks, per route × width:
 *   - route serves, non-empty
 *   - no horizontal overflow (document or any visible element)
 *   - every single-word h1–h3 and every [data-one-line] renders as ONE line box
 *   - the named font families actually resolved (document.fonts)
 *   - zero network requests to the original live host or any tracker host
 * Plus a static scan of the files for asset references (src/link-href/url())
 * that still point at the live host — anchors linking out are allowed, and
 * paths under --static-scan-exclude are skipped (a page that frames the live
 * site by design, like /original/, is exempt from the no-contact rule).
 *
 * Needs: npm i -D playwright-core, plus a system Chromium.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const CHROME_CANDIDATES = [
  'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable',
  'chrome', 'headless_shell',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
function findChromium() {
  for (const c of CHROME_CANDIDATES) {
    if (c.startsWith('/')) { if (fs.existsSync(c)) return c; continue; }
    try { return execSync(`command -v ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; }
    catch { /* keep looking */ }
  }
  return null;
}

const TRACKER_HOSTS = [
  'googletagmanager', 'google-analytics', 'doubleclick', 'facebook.net',
  'connect.facebook', 'hotjar', 'clarity.ms', 'segment.', 'mixpanel',
  'intercom', 'crisp.chat', 'tawk.to', 'tidio', 'drift.com', 'hubspot',
];
const WIDTHS = [320, 360, 390, 414, 480, 600, 768, 900, 1024, 1200, 1440, 1680, 1920];
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json',
};

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(dir, p);
    if (!file.startsWith(path.resolve(dir))) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port })));
}

// Static scan: asset references (not plain anchors) that still point at a host.
function staticLeakScan(dir, hosts, excludes = []) {
  const hits = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    const rel = path.relative(dir, p).split(path.sep).join('/');
    if (excludes.some(x => rel === x.replace(/\/$/, '') || rel.startsWith(x.replace(/\/$/, '') + '/'))) return;
    if (e.isDirectory()) return walk(p);
    if (!/\.(html|css|js)$/i.test(e.name)) return;
    const text = fs.readFileSync(p, 'utf8');
    for (const host of hosts) {
      const re = new RegExp(`(src\\s*=|<link[^>]{0,200}href\\s*=|url\\()\\s*['"\\(]?https?://(www\\.)?${host.replace(/\./g, '\\.')}`, 'gi');
      let m; while ((m = re.exec(text))) hits.push(`${path.relative(dir, p)}: asset ref to ${host} (…${text.slice(Math.max(0, m.index - 20), m.index + 60).replace(/\s+/g, ' ')}…)`);
    }
  });
  walk(dir);
  return hits;
}

async function main() {
  const dir = arg('--dir', 'public');
  const routes = arg('--routes', '/,/original/,/offer/').split(',').map(s => s.trim()).filter(Boolean);
  const fonts = arg('--fonts', '').split(',').map(s => s.trim()).filter(Boolean);
  const originalHost = (arg('--original-host', '') || '').replace(/^www\./, '');
  const staticExcludes = arg('--static-scan-exclude', '').split(',').map(s => s.trim()).filter(Boolean);

  const chromium = findChromium();
  if (!chromium) { console.error('No system Chromium found.'); process.exit(1); }
  const { chromium: pw } = require('playwright-core');

  const failures = [];
  if (originalHost) staticLeakScan(dir, [originalHost], staticExcludes).forEach(h => failures.push(`[static] ${h}`));

  const { server, port } = await serve(dir);
  const browser = await pw.launch({ executablePath: chromium, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const route of routes) {
    const page = await browser.newPage();
    const badRequests = [];
    page.on('request', req => {
      try {
        const host = new URL(req.url()).host.replace(/^www\./, '');
        if (originalHost && (host === originalHost || host.endsWith('.' + originalHost))) badRequests.push(req.url());
        if (TRACKER_HOSTS.some(t => host.includes(t))) badRequests.push(req.url());
      } catch { /* non-http */ }
    });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const where = `${route} @ ${width}px`;
      let resp;
      try { resp = await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load', timeout: 30000 }); }
      catch (e) { failures.push(`[route] ${where}: did not load (${e.message})`); break; }
      if (!resp || !resp.ok()) { failures.push(`[route] ${where}: HTTP ${resp && resp.status()}`); break; }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);

      const result = await page.evaluate((families) => {
        const out = { overflow: [], multiline: [], fontMisses: [], empty: false };
        out.empty = (document.body.innerText || '').trim().length === 0;
        const doc = document.documentElement;
        if (doc.scrollWidth > doc.clientWidth + 1) out.overflow.push(`document ${doc.scrollWidth}>${doc.clientWidth}`);
        const visible = el => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
          const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1;
        };
        for (const el of document.querySelectorAll('body *')) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right > innerWidth + 1 || r.left < -1) {
            let anc = el.parentElement, clipped = false;
            while (anc) { const o = getComputedStyle(anc).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break; } anc = anc.parentElement; }
            if (!clipped) {
              const id = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
              if (out.overflow.length < 6) out.overflow.push(`${id} right=${Math.round(r.right)}`);
            }
          }
        }
        const lineCount = el => {
          const range = document.createRange(); range.selectNodeContents(el);
          const tops = new Set();
          for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top / 2) * 2);
          return tops.size;
        };
        for (const el of document.querySelectorAll('h1, h2, h3, [data-one-line]')) {
          if (!visible(el)) continue;
          const text = (el.textContent || '').trim();
          const mustBeOne = el.hasAttribute('data-one-line') || (text && !/\s/.test(text));
          if (!mustBeOne || !text) continue;
          const n = lineCount(el);
          if (n > 1) out.multiline.push(`<${el.tagName.toLowerCase()}> "${text.slice(0, 30)}" → ${n} lines`);
        }
        for (const fam of families) if (!document.fonts.check(`16px "${fam}"`)) out.fontMisses.push(fam);
        return out;
      }, fonts);

      if (result.empty) failures.push(`[route] ${where}: page is empty`);
      result.overflow.forEach(o => failures.push(`[overflow] ${where}: ${o}`));
      result.multiline.forEach(m => failures.push(`[one-line] ${where}: ${m}`));
      result.fontMisses.forEach(f => failures.push(`[font] ${where}: "${f}" did not load`));
    }
    badRequests.forEach(u => failures.push(`[leak] ${route}: request escaped to ${u}`));
    await page.close();
  }

  await browser.close();
  server.close();

  const uniq = [...new Set(failures)];
  const report = { checked: { routes, widths: WIDTHS, fonts, originalHost: originalHost || null }, failures: uniq };
  fs.mkdirSync('.verify', { recursive: true });
  fs.writeFileSync('.verify/report.json', JSON.stringify(report, null, 2));
  if (uniq.length) {
    console.error(`FAIL — ${uniq.length} problem(s):`);
    uniq.forEach(f => console.error('  ' + f));
    console.error('Report: .verify/report.json');
    process.exit(1);
  }
  console.log(`PASS — ${routes.length} routes × ${WIDTHS.length} widths clean; fonts ${fonts.join(', ') || '(none named)'} loaded. Report: .verify/report.json`);
}
main().catch(e => { console.error(e); process.exit(1); });
