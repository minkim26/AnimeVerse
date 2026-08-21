# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AnimeVerse is an anime recommendation web app: a React 19 + Vite + TypeScript SPA backed by a single Express + Prisma + Postgres API, orchestrated with Docker Compose. Supabase is used exclusively for Storage (avatar images) — not for auth or as the primary database. There is no separate Node/Flask microservice tier anymore; everything the old five-service split used to do now lives in one Express app.

> This describes the current (rewritten) architecture. The prior static-site + Node + 4-Flask-microservice architecture is preserved under the `legacy-static-site` git tag and archived at `docs/legacy-static-site-readme.md`.

## Architecture

**Frontend** (repo root, `src/`): React SPA built with Vite. Routes live in `src/App.tsx` — `/`, `/login`, `/signup`, `/privacy-policy` are public; `/preferences`, `/explore`, `/profile` are wrapped in `ProtectedRoute` (redirects to `/login` if no JWT in `localStorage`). `src/services/` holds one thin fetch wrapper per backend resource (`api.ts` is the shared base — reads `VITE_API_URL`, attaches `Authorization: Bearer <token>`); `src/services/anilist.ts` is the exception (see Known Quirks below).

**Backend** (`anime-verse-backend/`): Single Express 5 + TypeScript API on port **8000**. Routers live in `api/*.ts` (`users`, `preferences`, `watchlist`, `reviews`, `quotes`, `titles`, `avatar`) and are aggregated in `api/index.ts`, mounted at `/`. See the README's API Reference table for the full route list.

**Caching and rate limiting** (`lib/redis.ts`, `lib/cache.ts`, `lib/rateLimit.ts`): Redis backs both. `express-rate-limit` + `rate-limit-redis` gate `POST /users`, `POST /users/login` (10/15min, keyed by IP) and `POST /avatar` (20/hour, keyed by user) — shared across `api` instances, not per-process. Read-heavy GETs (`/users/me`, `/preferences/me`, `/quotes/random`, `/titles/random`) are cached with explicit invalidation on the writes that would make them stale; `consumer.ts` also busts the `users/me` cache after it writes `avatarThumbnailUrl`, since that happens in a different process than the one that populated the cache.

**Avatar upload pipeline** (async, the most complex feature in the app): `POST /avatar` uploads the original to the `avatars` Supabase Storage bucket, saves `avatarUrl` on the `User` row immediately, and publishes a message to the `avatar-thumbnails` RabbitMQ queue. A separate `consumer.ts` process (started as its own Docker Compose service, with its own `/health` on port **8001**) consumes that queue, downloads the original, resizes it to 128x128 via `sharp`, uploads the result to the `avatar-thumbnails` bucket, and writes `avatarThumbnailUrl` back via Prisma. Messages nacked without requeue route to the `avatar-thumbnails.dlq` dead-letter queue (`lib/queue.ts`) instead of being dropped. See `docs/avatar-upload-pipeline.md` for the full request lifecycle.

**CI** (`.github/workflows/ci.yml`): `frontend`, `backend`, and `e2e` jobs run on every push/PR to `main`; `update-e2e-snapshots.yml` handles visual-regression baselines separately — see Known Quirks below and "UI Change Workflow" for trigger/deploy behavior.

### Known quirks worth checking before assuming behavior

- AniList calls happen entirely client-side (`src/services/anilist.ts`) — the Express API has no route that proxies or caches AniList data for browsing. Don't look for a backend endpoint for Discover, Browse & Search, or the profile page's random-anime widget; there isn't one.
- AniList's `description(asHtml: false)` field still contains embedded HTML tags in practice — always render synopses through `animeSynopsis()`, never the raw `description` field.
- Watchlist and Reviews are fully implemented on the backend (models, Zod schemas, REST routes, ownership checks) but have zero frontend consumers — this is a deliberate scope decision from the modernization rewrite, not a bug or an oversight.
- `SUPABASE_KEY` must be the Supabase **service_role** key and is server-side only (`lib/supabase.ts`); it must never be sent to or read by the frontend.
- The avatar upload response returns `avatarUrl` immediately but `avatarThumbnailUrl` is only populated after the RabbitMQ consumer finishes processing — the frontend (`Profile.tsx`) shows a "Generating thumbnail..." state in the gap. Don't assume both URLs are present right after upload.
- No production deployment target is configured. The old GitHub Pages workflow (`static.yml`) is gone entirely — `ci.yml` only lints/builds/tests, it has no deploy step. A real host (Railway, Render, Fly.io, or a VPS running Docker Compose) is still needed before this app is reachable outside local dev.
- The Playwright E2E suite (`e2e/explore.spec.ts`) drives a real signup/login against the live backend and lets the browser hit AniList's actual GraphQL API — there's no mocking, so a slow or flaky AniList response can fail that test even when the app code is correct.
- `update-e2e-snapshots.yml` fires automatically on push to `main` when `src/pages/**` or `src/components/**` changes, and stays available via `workflow_dispatch` for manual reruns. It requires the repo's "Allow GitHub Actions to create and approve pull requests" setting (Settings → Actions → General → Workflow permissions) to be enabled, or the PR-creation step fails even though the baseline branch pushes fine. The PR it opens sets `--auto` merge (needs the repo's "Allow auto-merge" setting), but that only actually waits on `frontend`/`backend`/`e2e` if `main` has branch protection requiring those checks — without it, the PR merges as soon as GitHub considers it mergeable, not once its own CI run finishes.
- `api`, `consumer`, and `initdb` are all `build: .` in `compose.yml` with no source volume mount, so editing backend code on the host does nothing to an already-running `docker compose up` stack. A code change needs `docker compose up -d --build <service>` (or a full `docker compose up --build`) before it takes effect, otherwise you'll be debugging against a stale binary and the symptoms won't make sense.
- Postgres runs the `pgvector/pgvector` image (not plain `postgres`), because `Anime.tasteVector` is a pgvector column (`Unsupported("vector(335)")` in `prisma/schema.prisma`); reads and writes go through `lib/animeCache.ts`'s raw SQL, never Prisma Client directly. If you swap the compose/CI Postgres image back to plain `postgres`, `CREATE EXTENSION vector` in the migration will fail.
- `POST /swipes` takes the anime's AniList metadata (title/poster/synopsis/tags) in its request body instead of fetching it server-side, because a per-swipe AniList fetch would blow the 30 req/min limit under concurrent onboarding. Don't add a backend AniList client for this without re-checking that constraint.
- `lib/animeCache.ts`'s `upsertAnime` writes that client-supplied metadata once and never refreshes it: the first swipe on a given `animeId` sets its cached title/poster/synopsis/tags permanently, and every later swipe on that ID is a no-op. This is deliberate (the metadata is unverified and the row is shared across all users, so refreshing it would let any user overwrite another anime's cache with fabricated data), not a bug — don't add a staleness refresh without also verifying the incoming metadata against AniList first.
- Files in `public/` (`robots.txt`, `sitemap.xml`) do NOT get `%VITE_VAR%` substitution — Vite copies `public/` byte-for-byte with no templating. They hardcode the placeholder domain `https://animeverse.example` instead, with an inline comment; both need a manual domain swap alongside setting the real `VITE_SITE_URL` once a production host exists.
- An unset `VITE_SITE_URL` at build time leaves the literal `%VITE_SITE_URL%` string in `index.html`'s canonical/og:image/og:url/JSON-LD tags (Vite's HTML substitution doesn't fall back the way `src/lib/site.ts`'s JS-side `SITE_URL` constant does) — must be set to the real domain before any real production build, not just for local dev.
- `GET /recommendations/for-you` computes a user's taste vector fresh from their `Swipe` rows on every request — there's no stored per-user vector and no cache, so a swipe's effect on recommendations is immediate. It only excludes anime the caller has personally swiped; a title they've only watchlisted (not swiped) can still be recommended, since `WatchlistItem` isn't FK'd to `Anime` yet.
- `Anime.isAdult`, like the rest of the cached row, is client-supplied and write-once (set by whichever swipe first caches that anime, never corrected afterward). A client that misreports it stays wrong for that anime's lifetime in the cache — same accepted trust model as `title`/`synopsis`/`tags`.
- `Anime.isAdult` is written by `postSwipe` (`src/services/swipes.ts`) as AniList's own flag OR'd with the `Ecchi` genre tag. `GET /recommendations/for-you` (`api/recommendations.ts`) is the column's only reader, so despite the name it means "hide from For You unless the viewer allows adult content," not literally AniList's raw `isAdult` field — this keeps For You's filtering in step with the two-part `adultContentFilter` Discover, Profile's random-anime widget, and Browse & Search already apply straight against AniList.
- `Preference.genres` is currently display/edit-only: saved via `POST /preferences` and shown back on `Preferences.tsx`/`Profile.tsx`, but no longer consumed by any recommendation or Discover logic — that's now driven entirely by swipes and `showAdultContent`. Planned removal in a future pass.
- `Recommendations.tsx` was renamed to `Explore.tsx` (route `/recommendations` → `/explore`) once its "Browse & Search" section shipped; there's no redirect from the old path since no production deployment exists to have indexed or bookmarked it.
- Explore's "Browse & Search" section queries AniList directly, same as Discover's swipe pool and Profile's random-anime widget. There's still no backend endpoint for browsing. Its results are cached client-side (`src/services/anilist.ts`'s `mediaListCache`, 5-minute TTL, keyed on the full filter combination; selected genres are sorted before building that key so toggling chips in a different order still hits the same cache entry) and its filter changes are debounced 400ms; both exist to reduce request volume under repeated filter changes, though neither guarantees staying under AniList's 30 req/min limit under sustained rapid clicking (each settled filter state still fires its own request, and there's no in-flight dedupe or 429 backoff beyond surfacing a readable error). The "Shuffle" sort is this app's own sentinel (not a real AniList `MediaSort`) and deliberately bypasses that cache, since a repeat call should sample a new random page, not repeat the last one.
- `GET /recommendations/for-you` excludes every anime the caller has already swiped from its candidate pool. Since `Anime` only gains rows through swipes (see above), a fresh or low-traffic database can end up with a candidate pool smaller than any one user's own swipe history, in which case For You legitimately has nothing left to recommend and shows its empty state. This isn't a bug in the query; it's a cold-start property of a cache that only grows from user activity. `anime-verse-backend/scripts/seed-anime-cache.ts` (see Common Commands) fixes it by pre-populating the cache directly from AniList, without requiring swipes.

## Writing Style

Run the `/humanizer` skill on any prose written for this repo before presenting it: documentation (`README.md`, `CLAUDE.md`, `docs/*.md`), commit messages, and PR descriptions. For commit messages specifically, run it whenever possible, even for a quick one-line commit.

Keep it short and keep it accurate. Less is more. Default to a subject line alone with no body. Only add a body when the change genuinely can't be understood from the diff and subject together, and keep it to one to three short paragraphs, not a design doc. Cut any sentence that defends a decision nobody questioned. Never trade a correct detail for a smoother sentence, and if a claim isn't verified, say so or leave it out.

No em dashes, no conventional-commit prefixes, no AI attribution, no emoji.

## UI Change Workflow

When you change anything in `src/pages/` or `src/components/` that affects layout, use the `ui-change-workflow` skill to regenerate and verify Playwright visual-regression baselines before committing.

## Common Commands

Frontend (repo root):
```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm test                 # vitest run
npm run test:e2e         # playwright test (full suite) — boots its own dev server on :5174; needs the backend running on :8000
npm run test:e2e:update  # playwright test e2e/visual.spec.ts --update-snapshots — refreshes local (-darwin) screenshot baselines; no backend needed
```

Backend — full stack via Docker Compose (recommended):
```bash
cd anime-verse-backend
docker compose up   # postgres, rabbitmq, redis, api (:8000), consumer (health on :8001), initdb (migrate+seed, runs once)
```

Backend — local dev without Docker:
```bash
cd anime-verse-backend
npm install
npm run initdb     # prisma migrate deploy && prisma generate, then seeds Quote/Title
npm run dev        # tsx watch server.ts, http://localhost:8000
npx tsx consumer.ts  # run separately to process avatar-thumbnail jobs; needs a local RabbitMQ + Redis
npx tsx scripts/seed-anime-cache.ts  # pre-populates the Anime cache from AniList so For You has candidates on a fresh DB; safe to rerun, not wired into initdb
```

To exercise the full app (especially the profile page's avatar upload), the API, Postgres, RabbitMQ, Redis, and the consumer must all be running — `docker compose up` is the simplest way to get all five at once.
