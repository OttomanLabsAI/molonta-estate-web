# CLAUDE.md

Standing policy for this repository. Read it before making any change here.

## What this repo is

A Cloudflare Workers static-assets site. Everything served lives in `public/`
and there is no build step - the files in that directory are the site. The repo
is connected to Cloudflare Workers Builds, so **every push to `main` deploys to
production**.

```
public/            everything served
  index.html       the new one-page site (site-pitch demo, tab 1)
  original/        frame of the client's live site (tab 2)
  offer/           the offer page (tab 3)
  fonts/           self-hosted webfonts
  404.html
  _headers         security + caching headers
  robots.txt       Disallow: / — this is a pitch demo, never indexed
wrangler.jsonc     assets-only config, no Worker script
package.json       wrangler + playwright-core devDependencies
scripts/           site-pitch capture/measure/verify tooling (not deployed)
work/brief.json    the sourced brief every on-page fact traces to
```

## Local development

```bash
npm install
npm run dev          # wrangler dev
```

## Verification - before every push to main

1. `npx wrangler deploy --dry-run`
2. `npm run verify` - the site-pitch layout gate (320→1920, real fonts, leak
   scan; `/original/` is a live-site frame by design, so the no-contact rule is
   scoped to `/` and `/offer/`).
3. Serve `public/`, render it with headless Chromium, and inspect the
   screenshots: styles applied, fonts loaded, layout intact.

Never leave pushed work unverified or half-finished. Work in small, complete
batches: implement, verify, commit, push.

## Git and release workflow

- Before committing: `git config user.name "Fid" && git config user.email "fid_kk@proton.me"`
- Develop on the working branch and push there first. Release verified work by
  fast-forwarding `main` onto it and pushing `main`.
- Every push to `main` is a release. Versions are an ascending `vMAJOR.MINOR`
  sequence starting at `v1.0`; every push bumps the minor regardless of size. A
  major bump is reserved for a ground-up overhaul.
- With every push to `main`, provide release-tag text in the reply, in exactly
  this shape. The owner creates the GitHub release manually - **never push tags**:

  ```
  Tag: v<next>  —  Title: <five to nine words, plain and evocative>
  Description: <one to three sentences of editorial prose describing what changed
  from the owner's point of view — outcomes, not implementation. No bullet lists,
  no jargon, no file names.>
  ```

- Append the release line to the ledger below as part of the same push.
- Commit messages: descriptive imperative first line (what the change does, not
  "update X"), then a short prose body; dash bullets are fine there. One commit
  per coherent piece of work; several may share a push, but each push gets
  exactly one version entry.
- Never include model names, AI attribution trailers, session links, or other
  tooling identifiers in commit messages, titles, or code.

## The page itself

The three pages were authored by the site-pitch run from `work/brief.json`;
from here on, content, design, and behaviour are as supplied. Do not tidy
markup, rename classes, rewrite copy, or modernise CSS unless asked - changes
to the design are their own release, requested deliberately. Facts on the page
must keep tracing to the brief: no invented prices, dates, or claims, ever.

## Release ledger

| Version | Title | Description |
| --- | --- | --- |
| v1.0 | The Molonta pitch demo, complete | New one-page site for the estate, their current site framed beside it, and the offer — verified 320→1920 and kept out of search indexes. |
| v1.1 | Dressed in the estate's own colours | The whole demo moves to the brand's Instagram identity — brown serif on white with cream panels — with the type confirmed against their own posts. |
| v1.2 | Softer, and all one colour | The brown lightens to caramel and the terracotta leaves entirely — the demo now reads as a single quiet colour on white. |
| v1.3 | The estate as one long story | The page becomes a cinematic scroll — a full-screen opening on the bay, four oversized ways in, and the estate unfolding section by section to a quiet close. |
| v1.4 | White, all the way down | Every ground on the page turns white — the cream panels go, and fine brown hairlines now carry the rhythm from the opening to the espresso close. |
| v1.5 | From brown to beige | The palette softens into sand — beige display type, a darker beige for reading, and the page's two dark anchors greyed off into taupe. |
| v1.6 | The Guest Guide, made a website | The estate's own brochure sets the brand — its gold, its nested wordmark, its olive branches — and every fact from the Guide and the whole site now lives on the page: the family's story since 1800, all services and prices, and the tables they trust. |
| v1.7 | The journal joins the page | Sanja's writing gets its own section — three featured pieces and the full nineteen-post shelf, every one opening on the estate's own site — and the stolen Beuchling painting enters the story. |
| v1.8 | The demo moves into its production home | The complete pitch — new site, current-site frame, and offer — now lives in the estate's own repository with its full history, checked end to end and set to publish automatically with every push. |
| v1.9 | The page learns the manners of a grand hotel | The demo takes the structure of a storied London hotel — the wordmark held in a fixed header, the rates in a booking band, every one of the estate's photographs gathered into a gallery, and the practicalities of a visit given their own quiet section — all in the estate's own gold, with nothing lost. |
| v1.10 | The wordmark opens and the gallery glides | The estate line now sits in a clear stripe cut straight through the big wordmark, the photograph showing through where a white block used to sit, and the whole lockup hangs true on its centre. The gallery becomes a gliding row — arrow to arrow, one photograph at a time. |
| v1.11 | The cut stops where the words do | The opening in the wordmark no longer runs edge to edge — it ends just beside HERITAGE ESTATE, the same small distance that holds above and below it, so the first and last letters stand whole again. |
| v1.12 | A hair's breadth around the estate line | The opening in the wordmark closes in until only a millimetre of light holds between HERITAGE ESTATE and the letters around it. |
| v1.13 | The Guest Guide, told in full sentences | The estate's brochure is rebuilt page for page — every photograph where it was, every price as printed — and each service now explains itself in a line or two: what it includes, its minimums, and how the family arranges it. |
| v1.14 | The window closes to the ink | The opening around HERITAGE ESTATE is measured from the letterforms themselves now — a bare millimetre of ground between the small caps and the big letters, above, below and beside. |
