# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AnimeVerse is an anime recommendation web app: a React 19 + Vite + TypeScript SPA backed by a single Express + Prisma + Postgres API, orchestrated with Docker Compose. Supabase is used exclusively for Storage (avatar images) — not for auth or as the primary database. There is no separate Node/Flask microservice tier anymore; everything the old five-service split used to do now lives in one Express app.

> This describes the current (rewritten) architecture. The prior static-site + Node + 4-Flask-microservice architecture is preserved under the `legacy-static-site` git tag and archived at `docs/legacy-static-site-readme.md`.

## Architecture

**Frontend** (repo root, `src/`): React SPA built with Vite. Routes live in `src/App.tsx` — `/`, `/login`, `/signup`, `/privacy-policy` are public; `/preferences`, `/recommendations`, `/profile` are wrapped in `ProtectedRoute` (redirects to `/login` if no JWT in `localStorage`). `src/services/` holds one thin fetch wrapper per backend resource (`api.ts` is the shared base — reads `VITE_API_URL`, attaches `Authorization: Bearer <token>`); `src/services/anilist.ts` calls the public AniList GraphQL API directly from the browser, bypassing the backend entirely (recommendations, trending, new releases, random anime).

**Backend** (`anime-verse-backend/`): Single Express 5 + TypeScript API on port **8000**. Routers live in `api/*.ts` (`users`, `preferences`, `watchlist`, `reviews`, `quotes`, `titles`, `avatar`) and are aggregated in `api/index.ts`, mounted at `/`. See the README's API Reference table for the full route list.

Auth is self-issued JWTs (`lib/auth.ts`: `generateToken`/`verifyToken`/`requireAuth` middleware, `bcryptjs` for password hashing) — no third-party auth provider. Data access is Prisma (`lib/prisma.ts`, `PrismaPg` adapter reading `POSTGRES_URL`) against Postgres. Request bodies are validated with Zod schemas in `lib/zod.ts`; `server.ts`'s centralized error handler turns `ZodError` into 400s and Prisma `P2003`/`P2025` into 400/404.

**Caching and rate limiting** (`lib/redis.ts`, `lib/cache.ts`, `lib/rateLimit.ts`): Redis backs both. `express-rate-limit` + `rate-limit-redis` gate `POST /users`, `POST /users/login` (10/15min, keyed by IP) and `POST /avatar` (20/hour, keyed by user) — shared across `api` instances, not per-process. Read-heavy GETs (`/users/me`, `/preferences/me`, `/quotes/random`, `/titles/random`) are cached with explicit invalidation on the writes that would make them stale; `consumer.ts` also busts the `users/me` cache after it writes `avatarThumbnailUrl`, since that happens in a different process than the one that populated the cache.

**Avatar upload pipeline** (async, the most complex feature in the app): `POST /avatar` uploads the original to the `avatars` Supabase Storage bucket, saves `avatarUrl` on the `User` row immediately, and publishes a message to the `avatar-thumbnails` RabbitMQ queue. A separate `consumer.ts` process (started as its own Docker Compose service, with its own `/health` on port **8001**) consumes that queue, downloads the original, resizes it to 128x128 via `sharp`, uploads the result to the `avatar-thumbnails` bucket, and writes `avatarThumbnailUrl` back via Prisma. Messages nacked without requeue route to the `avatar-thumbnails.dlq` dead-letter queue (`lib/queue.ts`) instead of being dropped. See `docs/avatar-upload-pipeline.md` for the full request lifecycle.

**Data model** (`prisma/schema.prisma`): `User` (email, bcrypt `password`, `avatarUrl`, `avatarThumbnailUrl`), `Preference` (1:1 with User, `genres: String[]`), `WatchlistItem` and `Review` (both unique on `(userId, animeId)`), `Quote` and `Title` (static seed content, no user association).

**Orchestration** (`anime-verse-backend/compose.yml`): `api`, `consumer`, `postgres`, `rabbitmq`, `redis` (all health-checked), `initdb` (runs `prisma migrate deploy` + the seed script once, then exits). `api` and `consumer` both depend on `postgres`, `rabbitmq`, `redis`, and `initdb` completing successfully.

**CI** (`.github/workflows/ci.yml`): three jobs on every push/PR to `main` — `frontend` (lint, `tsc -b` + vite build, Vitest), `backend` (`tsc --noEmit`, migrate+seed, Vitest against real Postgres/Redis/RabbitMQ service containers), and `e2e` (boots the real backend against the same kind of service containers, then runs the Playwright suite against a dedicated dev server on `:5174`). None of the jobs deploy anywhere — see the quirk below.

### Known quirks worth checking before assuming behavior

- AniList calls happen entirely client-side (`src/services/anilist.ts`) — the Express API has no route that proxies or caches AniList data for browsing (that changes once the recommendation-engine plan adds a server-side `Anime` cache). Don't look for a backend endpoint for trending/new-releases/random; there isn't one yet.
- AniList's `description(asHtml: false)` field still contains embedded HTML tags in practice — always render synopses through `animeSynopsis()`, never the raw `description` field.
- Watchlist and Reviews are fully implemented on the backend (models, Zod schemas, REST routes, ownership checks) but have zero frontend consumers — this is a deliberate scope decision from the modernization rewrite, not a bug or an oversight.
- `SUPABASE_KEY` must be the Supabase **service_role** key and is server-side only (`lib/supabase.ts`); it must never be sent to or read by the frontend.
- The avatar upload response returns `avatarUrl` immediately but `avatarThumbnailUrl` is only populated after the RabbitMQ consumer finishes processing — the frontend (`Profile.tsx`) shows a "Generating thumbnail..." state in the gap. Don't assume both URLs are present right after upload.
- No production deployment target is configured. The old GitHub Pages workflow (`static.yml`) is gone entirely — `ci.yml` only lints/builds/tests, it has no deploy step. A real host (Railway, Render, Fly.io, or a VPS running Docker Compose) is still needed before this app is reachable outside local dev.
- The Playwright E2E suite (`e2e/recommendations.spec.ts`) drives a real signup/login against the live backend and lets the browser hit AniList's actual GraphQL API — there's no mocking, so a slow or flaky AniList response can fail that test even when the app code is correct.

## Common Commands

Frontend (repo root):
```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm test          # vitest run
npm run test:e2e  # playwright test — boots its own dev server on :5174; needs the backend running on :8000
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
```

To exercise the full app (especially the profile page's avatar upload), the API, Postgres, RabbitMQ, Redis, and the consumer must all be running — `docker compose up` is the simplest way to get all five at once.
