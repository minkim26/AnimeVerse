# Architecture

This is a deeper breakdown of AnimeVerse's services and how they talk to each other. For setup instructions, see the root [README.md](../README.md).

## System diagram

```
Browser (React SPA, Vite dev server on :5173 / vite preview or any static host)
  |
  |-- calls directly ------------------> AniList public API (src/services/anilist.ts)
  |
  |-- calls ------------------> Express API (:8000)
                                   |
                                   |-- Prisma ------> Postgres (users, preferences,
                                   |                   watchlist, reviews, quotes, titles)
                                   |
                                   |-- Redis -------> rate limiting (auth, avatar upload)
                                   |                   + response cache (users/me, preferences/me,
                                   |                   quotes/random, titles/random)
                                   |
                                   |-- avatar upload -> Supabase Storage (avatars bucket)
                                   |                     + publishes a message to RabbitMQ
                                   |
                                   |                   RabbitMQ (avatar-thumbnails queue,
                                   |                   dead-lettered to avatar-thumbnails.dlq
                                   |                   on failure)
                                   |                     |
                                   |                     v
                                   |                   consumer.ts worker
                                   |                     -- downloads original from Supabase
                                   |                     -- resizes to 128x128 via sharp
                                   |                     -- uploads thumbnail to Supabase Storage
                                   |                     -- writes avatarThumbnailUrl via Prisma
                                   |                     -- invalidates the cached users/me entry
```

Explore's Browse & Search and the profile page's random-anime feature call AniList directly from the browser. No backend route proxies or caches that traffic.

## Services

| Service | Tech | Runs where | Talks to |
|---|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Browser (dev server or static build) | Express API, AniList (directly) |
| API | Express 5 + TypeScript | `anime-verse-backend`, Docker `api` service | Postgres (via Prisma), Supabase Storage, RabbitMQ |
| Consumer | Node/TypeScript worker (`consumer.ts`) | Docker `consumer` service | RabbitMQ, Supabase Storage, Postgres (via Prisma) |
| Database | Postgres | Docker `postgres` service (or a hosted Postgres instance) | — |
| Queue | RabbitMQ | Docker `rabbitmq` service (management plugin enabled, UI on `:15672`) | — |
| Cache / rate limiter | Redis | Docker `redis` service | — |
| File storage | Supabase Storage | Hosted (Supabase project) | — |

There is no reverse proxy or API gateway — the frontend talks to the Express API and to AniList directly, over whatever origins `VITE_API_URL` and AniList's public GraphQL API resolve to.

## Request flow: a typical authenticated request

1. Browser sends a request with `Authorization: Bearer <jwt>` (attached by `src/services/api.ts`).
2. Express's `requireAuth` middleware (`lib/auth.ts`) verifies the JWT and attaches `req.user = { id: <userId> }` — the `userId` comes from the JWT's `sub` claim, stored as a string per JWT convention and parsed back to a number.
3. The route handler validates the request body with a Zod schema (`lib/zod.ts`), then reads/writes via Prisma, scoped to `req.user.id`. There is no separate authorization layer — ownership is enforced by always filtering/writing on the authenticated user's own ID, never a client-supplied one.
4. Errors thrown by Zod or Prisma are caught by `server.ts`'s centralized error handler and translated to an HTTP status (`ZodError` → 400, Prisma `P2003` invalid foreign key → 400, Prisma `P2025` record not found → falls through to the 404 handler).

## Request flow: AniList-backed pages (Browse & Search, random anime)

The frontend calls `https://graphql.anilist.co` directly from the browser (`src/services/anilist.ts`) — the Express API is not involved at all for this data. This means:

- No backend caching or rate-limiting sits in front of AniList; the app is subject to AniList's own public rate limits (30 requests/minute).
- If AniList is unreachable or changes its response shape, the Express API's health has no bearing on whether Browse & Search/random-anime work.

## Request flow: avatar upload (async)

See [avatar-upload-pipeline.md](avatar-upload-pipeline.md) for the full walkthrough — this is the one feature in the app with a genuinely async, multi-hop request lifecycle (HTTP response comes back before the thumbnail exists).

## Rate limiting and caching (Redis)

Both live in `lib/redis.ts`, `lib/cache.ts`, and `lib/rateLimit.ts`.

- **Rate limited** (`express-rate-limit` + `rate-limit-redis`, so limits are shared across all `api` instances rather than per-process): `POST /users` and `POST /users/login` (10 requests / 15 min, keyed by IP), and `POST /avatar` (20 requests / hour, keyed by authenticated user ID).
- **Cached, read-through, no invalidation needed**: `GET /quotes/random` and `GET /titles/random` cache the full seeded list for 1 hour — the random pick still happens per-request against the cached list. There's no write path for these tables at runtime, so there's nothing to invalidate.
- **Cached with explicit invalidation**: `GET /users/me` and `GET /preferences/me` (5 min TTL as a safety net). Every endpoint that mutates a field either response includes explicitly busts the corresponding key: `PATCH /users/me/password` and `POST /avatar` invalidate the user cache; `PUT /preferences/me` invalidates the preferences cache. Notably, **`consumer.ts` also invalidates the user cache** after it writes `avatarThumbnailUrl` — that field is a different process than the one that populated the cache, so without this the frontend could see a stale cached response even after the thumbnail finishes generating.

## Data model

```
User ──1:1── Preference
  │
  ├──1:N── WatchlistItem   (unique on userId + animeId)
  │
  └──1:N── Review          (unique on userId + animeId)

Quote   (no user association — static seed content)
Title   (no user association — static seed content)
```

`Quote` and `Title` replace what used to be hardcoded arrays inside `animeQuoteService.py` and `animeTitleService.py` in the pre-rewrite architecture; they're now seeded once from `data/quotes.json` and `data/titles.json` via `prisma/seed.ts` and served from Postgres.

## Why Supabase is Storage-only

Auth and primary data live in Postgres via Prisma with self-issued JWTs, not Supabase Auth or Supabase's hosted Postgres. This was a deliberate choice made during the modernization rewrite to keep authentication self-contained (matching the pattern from `assignment-3-minkim26`) while still getting Supabase's managed object storage for user-uploaded avatar images and generated thumbnails — the one place in the app where real binary file storage is actually needed.

## CI

`.github/workflows/ci.yml` runs three jobs on every push/PR to `main`: `frontend` (lint, build, Vitest), `backend` (type-check, migrate+seed, Vitest against real Postgres/Redis/RabbitMQ service containers), and `e2e` (starts the real Express API against the same kind of service containers, then runs the Playwright suite against a dedicated dev server on `:5174`). No job deploys anywhere — it's build/test verification only.

A fourth workflow, `.github/workflows/update-e2e-snapshots.yml`, is `workflow_dispatch`-only (manual trigger, never runs on push/PR). It regenerates the Linux Playwright visual-regression baselines and opens a PR with the diff — see `CLAUDE.md`'s "UI Change Workflow" section.

## Deployment status

AnimeVerse runs in production: frontend on Cloudflare Workers, backend on a home-lab Proxmox host behind a Cloudflare Tunnel, Postgres on Supabase. See the root [README.md](../README.md#deployment) for the current setup and deploy pipeline — this doc stays focused on how the services talk to each other, not where they run.
