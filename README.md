# molonta-estate-web

Site-pitch demo for **Molonta Heritage Estate** (molontaheritageestate.com) — a
private waterfront villa estate in Molunat, near Dubrovnik. Three pages wired
together by a demo bar:

| Route | Page |
| --- | --- |
| `/` | The new site — one page, their brand, house style |
| `/original/` | Their current site (live-site frame — see note below) |
| `/offer/` | The offer — tale of the tape, £500 / £50, terms |

A Cloudflare Workers static-assets site: everything served lives in `public/`,
there is no build step.

## Structure

```
public/
  index.html           the new one-page site
  original/index.html  frame of the live site (capture fallback)
  offer/index.html     the offer page
  fonts/               self-hosted Cormorant Garamond + Inter (@fontsource)
  404.html  favicon.svg  robots.txt  _headers
wrangler.jsonc         assets-only Worker config
scripts/               site-pitch build + verify tooling (not deployed)
work/brief.json        the sourced brief every on-page fact traces to
```

## Local development

```bash
npm install
npm run dev        # wrangler dev
npm run check      # wrangler deploy --dry-run
npm run verify     # layout gate: 320→1920 sweep, fonts, leak scan
```

Note: `verify-layout.js` needs an **absolute** `--dir` (the npm script handles
it) and a Chromium on PATH.

## Deployment

Connected to Cloudflare Workers Builds: every push to `main` deploys to
production. The social thumbnail (`public/og.jpg`) is referenced by
absolute URL in each page's Open Graph tags — repoint those URLs when the site
moves to its own domain. This is a pitch demo — `robots.txt` disallows everything, every
page carries `noindex,nofollow`, and an `X-Robots-Tag` header backs both up.

## External resources

- The photographs on `/` are served from the estate's own Wix media
  library (`static.wixstatic.com`) — they could not be vendored from the build
  environment, and they remain the estate's property, shown back to them in
  their own pitch. Swap to locally hosted files on transfer.
- `/original/` embeds the live `www.molontaheritageestate.com` in an iframe: a
  clean copy could not be made because the build environment's network policy
  blocks the site. The strip on that page says so and links the live site.
- Press links on `/` point to cntraveler.com and architecturaldigest.com
  stories the estate's own homepage cites.

## Provenance

Every fact on the new page traces to `work/brief.json` — source and date per
entry. Unconfirmed items and open questions for the client live there too.
