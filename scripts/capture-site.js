#!/usr/bin/env node
/* capture-site.js — copy a prospect's rendered site for the /original/ tab.
 *
 *   node scripts/capture-site.js <url> <outdir>
 *
 * Writes <outdir>/index.html + <outdir>/assets/*, prints a JSON summary.
 * Exit 0: clean capture. Exit 2: capture failed — fall back to
 * assets/original-frame.html and say so (see references/capture.md).
 *
 * Needs: npm i -D playwright-core, plus a system Chromium (found below).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// Hosts whose iframes / hint links are stripped outright (scripts all go anyway).
const TRACKER_HOSTS = [
  'googletagmanager', 'google-analytics', 'doubleclick', 'facebook.net',
  'connect.facebook', 'hotjar', 'clarity.ms', 'segment.', 'mixpanel',
  'intercom', 'crisp.chat', 'tawk.to', 'tidio', 'drift.com', 'hs-scripts',
  'hubspot', 'livechatinc', 'zdassets', 'cookiebot', 'onetrust', 'cookieyes',
  'usercentrics',
];
const BANNER_SELECTORS = [
  '#onetrust-consent-sdk', '#CybotCookiebotDialog', '.cky-consent-container',
  '.cc-window', '#cookie-notice', '#cookie-law-info-bar',
  '[id*="cookie-banner"]', '[class*="cookie-consent"]', '[aria-label*="cookie" i]',
];

const EXT_BY_TYPE = {
  'text/css': '.css', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/x-icon': '.ico',
  'image/avif': '.avif', 'font/woff2': '.woff2', 'font/woff': '.woff',
  'font/ttf': '.ttf', 'application/font-woff2': '.woff2', 'application/font-woff': '.woff',
};

function skippable(u) {
  return !u || /^(data:|blob:|mailto:|tel:|javascript:|#|about:)/i.test(u.trim());
}
function localName(absUrl, contentType) {
  const hash = crypto.createHash('sha1').update(absUrl).digest('hex').slice(0, 8);
  let base = '';
  try { base = decodeURIComponent(path.posix.basename(new URL(absUrl).pathname)); } catch { /* noop */ }
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40);
  let ext = path.posix.extname(base);
  if (!ext && contentType) ext = EXT_BY_TYPE[contentType.split(';')[0].trim()] || '';
  if (!base || base === ext) base = 'asset' + ext;
  if (ext && !base.endsWith(ext)) base += ext;
  return `${hash}-${base}`;
}
async function main() {
  const [url, outdir] = process.argv.slice(2);
  if (!url || !outdir) { console.error('usage: node capture-site.js <url> <outdir>'); process.exit(1); }
  const chromium = findChromium();
  if (!chromium) { console.error('No system Chromium found — install one or extend CHROME_CANDIDATES.'); process.exit(1); }
  const { chromium: pw } = require('playwright-core');

  const assetsDir = path.join(outdir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const browser = await pw.launch({ executablePath: chromium, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fail = async (reason) => {
    console.log(JSON.stringify({ ok: false, reason }, null, 2));
    await browser.close(); process.exit(2);
  };

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(5000); }
    catch (e) { return fail(`page never loaded: ${e.message}`); }
  }
  // Trigger lazy-loading, then settle back at the top.
  await page.evaluate(async () => {
    await new Promise(res => {
      let y = 0; const step = () => {
        y += 700; scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 120); else { scrollTo(0, 0); setTimeout(res, 600); }
      }; step();
    });
  });
  await page.waitForTimeout(800);

  // In-page cleanup + asset manifest, before serialisation.
  const { manifest, textLen } = await page.evaluate(({ trackers, banners }) => {
    const isTracked = u => { try { return trackers.some(t => new URL(u, location.href).host.includes(t)); } catch { return false; } };
    document.querySelectorAll('script, noscript, base').forEach(n => n.remove());
    document.querySelectorAll('meta[http-equiv]').forEach(m => {
      if (/content-security-policy|refresh/i.test(m.httpEquiv)) m.remove();
    });
    document.querySelectorAll('link[rel~="preconnect"],link[rel~="dns-prefetch"],link[rel~="modulepreload"],link[rel~="preload"]').forEach(n => n.remove());
    document.querySelectorAll('iframe').forEach(f => { if (isTracked(f.src)) f.remove(); });
    banners.forEach(sel => { try { document.querySelectorAll(sel).forEach(n => n.remove()); } catch { /* bad sel */ } });
    document.querySelectorAll('form').forEach(f => {
      f.setAttribute('action', ''); f.setAttribute('onsubmit', 'return false');
    });
    document.querySelectorAll('img').forEach(img => {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      if (lazy && (!img.getAttribute('src') || /^data:/.test(img.getAttribute('src')))) img.setAttribute('src', lazy);
      if (img.currentSrc) img.setAttribute('src', img.currentSrc);
      img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('loading');
    });
    document.querySelectorAll('picture source').forEach(s => s.remove());
    if (!document.querySelector('meta[name="robots"]')) {
      const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow';
      document.head.appendChild(m);
    } else document.querySelector('meta[name="robots"]').content = 'noindex,nofollow';

    const manifest = [];
    const push = (raw, kind) => {
      if (!raw) return;
      try { manifest.push({ raw, abs: new URL(raw, location.href).href, kind }); } catch { /* unresolvable */ }
    };
    document.querySelectorAll('link[rel~="stylesheet"]').forEach(l => push(l.getAttribute('href'), 'css'));
    document.querySelectorAll('link[rel~="icon"],link[rel~="apple-touch-icon"]').forEach(l => push(l.getAttribute('href'), 'bin'));
    document.querySelectorAll('img[src]').forEach(i => push(i.getAttribute('src'), 'bin'));
    document.querySelectorAll('video[poster]').forEach(v => push(v.getAttribute('poster'), 'bin'));
    return { manifest, textLen: (document.body.innerText || '').trim().length };
  }, { trackers: TRACKER_HOSTS, banners: BANNER_SELECTORS });

  if (textLen < 40 && manifest.length === 0) return fail('page rendered empty — likely a bot wall or a login');

  let html = '<!DOCTYPE html>\n' + await page.evaluate(() => document.documentElement.outerHTML);

  const saved = new Map();   // abs url -> local filename
  const failed = [];
  const external = [];       // deliberately left absolute (video, embeds)
  async function fetchAsset(abs) {
    if (saved.has(abs)) return saved.get(abs);
    try {
      const resp = await page.request.get(abs, { timeout: 20000 });
      if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`);
      const name = localName(abs, resp.headers()['content-type'] || '');
      fs.writeFileSync(path.join(assetsDir, name), await resp.body());
      saved.set(abs, name);
      return name;
    } catch (e) { failed.push(`${abs} (${e.message})`); return null; }
  }

  // CSS: fetch, localise its url()/@import graph, rewrite internally.
  async function fetchCss(abs, depth = 0) {
    if (saved.has(abs)) return saved.get(abs);
    if (depth > 3) return null;
    try {
      const resp = await page.request.get(abs, { timeout: 20000 });
      if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`);
      let css = (await resp.body()).toString('utf8');
      const refs = new Set();
      for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) refs.add(m[2]);
      for (const m of css.matchAll(/@import\s+(?:url\()?\s*(['"])([^'"]+)\1/g)) refs.add(m[2]);
      for (const ref of refs) {
        if (skippable(ref)) continue;
        let refAbs; try { refAbs = new URL(ref, abs).href; } catch { continue; }
        const isCss = /\.css(\?|$)/i.test(refAbs);
        const name = isCss ? await fetchCss(refAbs, depth + 1) : await fetchAsset(refAbs);
        if (name) css = css.split(ref).join(name); // same dir — relative by filename
      }
      const name = localName(abs, 'text/css');
      fs.writeFileSync(path.join(assetsDir, name), css);
      saved.set(abs, name);
      return name;
    } catch (e) { failed.push(`${abs} (${e.message})`); return null; }
  }

  for (const item of manifest) {
    if (skippable(item.raw)) continue;
    if (/\.(mp4|webm|mov)(\?|$)/i.test(item.abs)) { external.push(item.abs); continue; }
    const name = item.kind === 'css' || /\.css(\?|$)/i.test(item.abs) ? await fetchCss(item.abs) : await fetchAsset(item.abs);
    if (!name) continue;
    for (const q of ['"', "'"]) {
      html = html.split(`${q}${item.raw}${q}`).join(`${q}assets/${name}${q}`);
    }
  }
  // url(...) in inline styles and <style> blocks, resolved against the page.
  const styleRefs = [...html.matchAll(/url\(\s*(&quot;|['"]?)([^'")&]+)\1\s*\)/g)].map(m => m[2]);
  for (const ref of new Set(styleRefs)) {
    if (skippable(ref) || ref.startsWith('assets/')) continue;
    let abs; try { abs = new URL(ref, url).href; } catch { continue; }
    const name = await fetchAsset(abs);
    if (name) html = html.split(ref).join(`assets/${name}`);
  }

  // Snapshot strip + demo-bar marker, straight after <body ...>.
  const host = new URL(url).host;
  const date = new Date().toISOString().slice(0, 10);
  const strip = `<!-- DEMO-BAR -->\n<div style="background:#111;color:#f5efe0;font:500 13px/1.5 system-ui,sans-serif;` +
    `padding:10px 16px;text-align:center">Snapshot of ${host}, captured ${date} — a working copy made for this demo. ` +
    `<a href="${url}" style="color:#e8b33a" rel="nofollow noopener" target="_blank">The live site is here.</a></div>`;
  html = html.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs}>\n${strip}`);

  fs.writeFileSync(path.join(outdir, 'index.html'), html);
  await browser.close();

  const summary = {
    ok: true, url, out: path.join(outdir, 'index.html'),
    assets: { saved: saved.size, failed, leftExternal: external },
    note: failed.length ? 'Failed assets keep their live URLs — verify-layout will flag any that matter.' : 'clean',
  };
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error(e); process.exit(2); });
