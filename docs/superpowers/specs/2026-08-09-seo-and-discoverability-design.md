# SEO and Discoverability Fixes

## Overview

A user-supplied checklist of 20 "signs a site was vibecoded" (SEO/metadata/build hygiene red flags) was checked against AnimeVerse's actual code and build output rather than assumed. Several items already don't apply (verified, not guessed); this spec covers the ones that do, plus the scope decisions made when the checklist's wording was ambiguous.

## Findings

Verified against the codebase before writing this spec:

| # | Item | Status |
|---|------|--------|
| 1 | vercel.app url | No hosting configured at all — not fixable without deploying somewhere. Prep work only (see [VITE_SITE_URL](#site-url--env-var)). |
| 2 | view-source empty | True (pure CSR SPA). Only fully fixed by SSR/prerendering — architectural change, out of scope. Partially mitigated by static `index.html` metadata. |
| 3 | no 404 page | Already handled client-side (`NotFound.tsx`, `path="*"`). True HTTP 404 status needs a host — same blocker as #1. |
| 4 | "vite + react browser" | Read as leftover default-scaffold branding (confirmed with user) — covered by the favicon fix. |
| 5 | same page titles | True — one static `<title>` for all routes. **Fixing.** |
| 6 | no meta description | True. **Fixing.** |
| 7 | no og:image | True. **Fixing.** |
| 8 | no structured data | True. **Fixing.** |
| 9 | multiple H1s | False — every page has exactly one `<h1>`. No action. |
| 10 | no H1s | False, same check as #9. No action. |
| 11 | no canonical tag | True. **Fixing.** |
| 12 | no llms.txt | True. **Fixing.** |
| 13 | AI blocked in robots.txt | No robots.txt exists at all. **Fixing** — adding one that blocks AI crawlers specifically (user's choice). |
| 14 | no favicon | True. **Fixing.** |
| 15 | no sitemap.xml | True. **Fixing.** |
| 16 | no lang attribute | False — `<html lang="en">` already set. No action. |
| 17 | missing alt text | Mostly false (4/5 images have real alt text). One empty `alt=""` on a non-decorative avatar image. **Fixing** (one line). |
| 18 | source maps shipped | False — confirmed `dist/` build output has zero `.map` files (Vite's `build.sourcemap` defaults to `false`). No action. |
| 19 | console errors | Existing `console.error()` calls are deliberate, caught-failure logging, not bugs. **Investigating** live for actual uncaught errors before deciding any fix. |
| 20 | massive JS bundle | False — main chunk is 85.21 kB gzipped, well within budget. No action. |

## Goals

- Give every route a distinct, accurate `<title>` and meta description.
- Make the site's identity render correctly when linked in Slack/Discord/social (OG tags, favicon).
- Add the discoverability files search engines and LLM tools expect (`robots.txt`, `sitemap.xml`, `llms.txt`), with `robots.txt` explicitly disallowing known AI-crawler user-agents per the user's choice.
- Add minimal `WebSite` structured data.
- Establish a `VITE_SITE_URL` env var so canonical/sitemap/robots/OG all reference a real (if placeholder) base URL now, and a one-line swap to a real domain once hosting exists.
- Find and fix any *actual* console errors during normal use — not remove deliberate error logging.

## Non-Goals

- No SSR or prerendering. Fixing "empty view-source" and true per-route static content for non-JS crawlers requires an architectural change (e.g. a prerendering plugin or a framework migration) that's out of scope for this pass. Flagged as a known, accepted limitation.
- No new npm dependency for meta-tag management (e.g. `react-helmet-async`) — a small custom hook covers this app's needs (9 static routes, no SSR) without adding one.
- No sitemap-generation tooling — 4 public URLs are hand-written directly.
- No changes to already-correct items (#9, #10, #16, #18, #20) — verified fine, not touched.
- No fix for #1 or the HTTP-status half of #3 — both require a real production host, which doesn't exist yet and isn't part of this spec.

## Components

### Site URL / env var

`src/lib/site.ts` exports:
- `SITE_URL` — `import.meta.env.VITE_SITE_URL`, falling back to `window.location.origin` so dev/preview/CI never break on an unset var.
- `SITE_NAME` — `"AnimeVerse"`.
- `DEFAULT_DESCRIPTION` — the site-level fallback description used in `index.html` and as a fallback in `usePageMeta`.

`.env.example` gains a documented `VITE_SITE_URL=` line.

### Per-route meta: `usePageMeta` hook

`src/hooks/usePageMeta.ts` — takes `{ title, description }`, and in a `useEffect`:
- Sets `document.title` to `` `${title} | ${SITE_NAME}` ``.
- Finds (or defensively creates) `<meta name="description">` and sets its `content`.
- Finds (or defensively creates) `<link rel="canonical">` and sets its `href` to `` `${SITE_URL}${pathname}` `` (via `useLocation`).

Called once near the top of each of the 9 route components (`Home`, `Login`, `Signup`, `PrivacyPolicy`, `Preferences`, `Discover`, `Recommendations`, `Profile`, `NotFound`) with page-specific copy.

### Static `index.html` additions

- `<meta name="description">` — site-level default, overridden per-route by the hook after mount.
- Open Graph: `og:title`, `og:description`, `og:image` (pointing at a new static OG image asset), `og:type=website`, `og:url`.
- `<link rel="canonical">` — site-level default.
- `<link rel="icon">` referencing the new favicon.
- One `<script type="application/ld+json">` block: minimal `WebSite` schema (`name`, `url`; no `SearchAction`, since there's no public site search).

### New static assets (`public/`)

- `favicon.svg` — a small mark echoing the navbar's `Sparkles` glyph in `--color-accent` on `--color-paper`, not a generic/stock icon.
- A static OG image (reuses the same visual language) for the `og:image` tag.
- `robots.txt` — `User-agent: *` / `Allow: /`, explicit `Disallow: /` blocks for a curated list of known AI-crawler user-agents (GPTBot, ChatGPT-User, CCBot, Google-Extended, anthropic-ai, ClaudeBot, Claude-Web, PerplexityBot, Bytespider, Applebot-Extended, Amazonbot, Diffbot, meta-externalagent, cohere-ai, Omgilibot, Timpibot, YouBot), plus a `Sitemap:` pointer.
- `sitemap.xml` — only the real public, unauthenticated routes: `/`, `/login`, `/signup`, `/privacy-policy`. Preferences/Discover/Recommendations/Profile are auth-gated and excluded.
- `llms.txt` — short plain-text description of what AnimeVerse is, for LLM tools a person explicitly points at the site. Not in tension with the AI-blocking `robots.txt`: one stops bulk automated crawling/training scrapes, the other serves a single user-invoked request — both are common together.

### Minor fix

- `src/pages/Profile.tsx:333` — `alt=""` on the user's avatar thumbnail becomes real alt text (e.g. `"Your avatar"`).

### Console-errors investigation (#19)

Run the full stack locally (backend via `docker compose up`, frontend via `npm run dev`) and drive the primary flows with Playwright — signup → login → Discover (swipe a few cards) → Recommendations → Profile → logout — with `page.on('console')` (filtered to `type() === 'error'`) and `page.on('pageerror')` listeners attached. Report exactly what's found. Only fix genuine uncaught errors/bugs; the existing intentional `console.error()` calls in `Discover.tsx`/`Recommendations.tsx` are left alone per the user's decision.

## Testing

- New Vitest test for `usePageMeta`: confirms it sets `document.title`, the description meta content, and the canonical href correctly for a given route.
- Per the `ui-change-workflow` skill (this touches `src/pages/`): the hook only mutates `document.head`, not rendered layout, so no visual diff is expected — will confirm zero Playwright visual-snapshot changes after implementing rather than assuming.
- The console-errors investigation is itself the test for #19 — a findings report precedes any fix.

## Open Risk

Without real hosting, `VITE_SITE_URL` will go unset in any real deploy until someone remembers to configure it, silently falling back to whatever origin actually served the page (correct behavior, but worth remembering when a host is finally chosen).
