# AnimeVerse

AnimeVerse is an anime recommendation web app. Users sign up, pick genre preferences, and get personalized, trending, new-release, and random anime recommendations pulled from the [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/). A profile page lets users manage their account, upload a real profile picture, and play with random anime quote/title/picture generators.

The app is a React SPA backed by a single Express + Prisma + Postgres API, orchestrated with Docker Compose. Supabase is used exclusively for file storage (avatar images); it is not used for auth or as the primary database.

> Looking for the old static-site version of this project (vanilla JS frontend + Node auth API + four Flask microservices)? It's archived at [docs/legacy-static-site-readme.md](docs/legacy-static-site-readme.md) and preserved under the `legacy-static-site` git tag.

## Features

- **Signup / Login:** email + password auth against the API, JWT stored in `localStorage`.
- **Preferences:** pick favorite genres (action, comedy, fantasy, horror, mystery, romance, thriller), persisted per-user in Postgres.
- **Recommendations:** genre-matched picks, trending-now, new releases, and a random selection, fetched directly from AniList in the browser.
- **Profile:** change password, upload a real profile picture (async thumbnail generation), view saved preferences, and fetch a random anime, anime title, and anime quote.
- **Auth gating:** `/preferences`, `/recommendations`, and `/profile` redirect to `/login` if no token is present (see `src/components/ProtectedRoute.tsx`).

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript, Tailwind CSS v4, react-router v8 |
| Backend | Express 5 + TypeScript, Prisma 7 (Postgres), Zod 4 validation |
| Auth | Self-issued JWTs (`jsonwebtoken` + `bcryptjs`), not a third-party auth provider |
| File storage | Supabase Storage (avatar originals + generated thumbnails) |
| Async processing | RabbitMQ + a standalone `consumer.ts` worker using `sharp` for thumbnailing |
| Caching / rate limiting | Redis (`express-rate-limit` + `rate-limit-redis` on auth/avatar endpoints, response caching on read-heavy GETs) |
| Orchestration | Docker Compose (`api`, `consumer`, `postgres`, `rabbitmq`, `redis`, `initdb`) |

## Architecture

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

Recommendations and the profile page's random-anime feature call AniList directly from the browser. No backend route proxies or caches that traffic.

See [docs/architecture.md](docs/architecture.md) for a deeper breakdown of each service and [docs/avatar-upload-pipeline.md](docs/avatar-upload-pipeline.md) for the full avatar upload request lifecycle.

## Prerequisites

- Node.js and npm
- Docker and Docker Compose (recommended: runs Postgres, RabbitMQ, and the API together)
- A Supabase project with two public Storage buckets (`avatars`, `avatar-thumbnails`). See [docs/supabase-setup.md](docs/supabase-setup.md) if you need to create one

## Setup and Running

### 1. Backend: Docker Compose (recommended)

```bash
cd anime-verse-backend
cp .env.example .env.production   # fill in JWT_SECRET, SUPABASE_URL, SUPABASE_KEY
docker compose up
```

This starts Postgres, RabbitMQ, the API (`:8000`), and the thumbnail consumer, and runs migrations + seeds the `Quote`/`Title` tables on first boot via the `initdb` service.

### 2. Backend: local dev without Docker

```bash
cd anime-verse-backend
npm install
cp .env.example .env.local        # point POSTGRES_URL at a local or Supabase-hosted Postgres
npm run initdb                    # runs migrations + seeds Quote/Title tables
npm run dev                       # tsx watch, http://localhost:8000
```

To exercise the avatar upload pipeline outside Docker you also need a local RabbitMQ instance and to run the consumer separately:

```bash
npx tsx consumer.ts
```

### 3. Frontend

```bash
npm install
cp .env.example .env              # VITE_API_URL, defaults to http://localhost:8000
npm run dev                       # http://localhost:5173
```

## Environment Variables

### `anime-verse-backend/.env.local` / `.env.production`

| Variable | Purpose |
|---|---|
| `POSTGRES_URL` | Prisma connection string. `postgres` as host inside Docker Compose, `localhost` outside it. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Used by the official `postgres` image to initialize the database (Docker Compose only). |
| `JWT_SECRET` | Signs/verifies auth JWTs. Use a long random value outside local dev. |
| `PORT` | API listen port (defaults to `8000`). |
| `SUPABASE_URL` | The AnimeVerse Supabase project's API URL. |
| `SUPABASE_KEY` | Supabase **service_role** key. Server-side only, never shipped to the frontend. |
| `RABBITMQ_URL` | RabbitMQ connection string. `rabbitmq` as host inside Docker Compose, `localhost` outside it. |
| `REDIS_URL` | Redis connection string, used for rate limiting and response caching. `redis` as host inside Docker Compose, `localhost` outside it. |
| `FRONTEND_URL` | Origin allowed to make cross-origin requests to the API (CORS). The server refuses to start if this is unset. |

### root `.env` (Vite, safe to expose client-side)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the Express API (defaults to `http://localhost:8000`). |

## Available Scripts

### Frontend (repo root)

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and produce a production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the Vitest unit suite |
| `npm run test:e2e` | Full Playwright suite (functional + visual regression). Needs the backend running on `:8000` |
| `npm run test:e2e:update` | Refresh this machine's visual-regression baselines (`-darwin` on macOS) for `e2e/visual.spec.ts` only. Runs without the backend |

### Backend (`anime-verse-backend/`)

| Script | Purpose |
|---|---|
| `npm run dev` | `tsx watch server.ts`, restarts on file change |
| `npm start` | Run the API once (used by the Docker image) |
| `npm run initdb` | Run Prisma migrations, then seed `Quote`/`Title` from `data/*.json` |
| `npm run build` | Type-check only (`tsc --noEmit`) |
| `npm test` | Run the Vitest suite (`test/`, plus unit tests colocated with their source files) against a real Postgres/Redis/RabbitMQ. Start those first via `docker compose up postgres redis rabbitmq initdb` |

## API Reference

Base URL: `http://localhost:8000`. Routes marked **auth** require an `Authorization: Bearer <token>` header.

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/users` | | `{ email, password }` | Signup. Rate limited (10 requests / 15 min / IP). |
| POST | `/users/login` | | `{ email, password }` | Returns `{ token }`. Rate limited (10 requests / 15 min / IP). |
| GET | `/users/me` | ✓ | | Current user (password field stripped). Cached in Redis for 5 min. |
| PATCH | `/users/me/password` | ✓ | `{ oldPassword, newPassword }` | Re-verifies `oldPassword` via bcrypt before updating |
| GET | `/preferences/me` | ✓ | | Returns `{ genres: [] }` if none saved. Cached in Redis for 5 min. |
| PUT | `/preferences/me` | ✓ | `{ genres: string[] }` | Full-replace upsert |
| GET | `/watchlist` | ✓ | | No frontend page consumes this yet |
| POST | `/watchlist` | ✓ | `{ animeId, title?, posterUrl? }` | Upsert on `(userId, animeId)` |
| DELETE | `/watchlist/:animeId` | ✓ | | |
| GET | `/reviews` | ✓ | | No frontend page consumes this yet |
| POST | `/reviews` | ✓ | `{ animeId, rating, reviewText }` | Upsert on `(userId, animeId)` |
| DELETE | `/reviews/:animeId` | ✓ | | |
| GET | `/quotes/random` | | | `{ quote, character, anime }`. Full list cached in Redis for 1 hour. |
| GET | `/titles/random` | | | `{ title, episodes }`. Full list cached in Redis for 1 hour. |
| POST | `/avatar` | ✓ | `multipart/form-data`, field `file` | Uploads original to Supabase, publishes a thumbnail job, returns `{ avatarUrl }`. Rate limited (20 requests / hour / user). |
| GET | `/health` | | | `{ status: 'ok' }` |

## Project Structure

```
.
├── src/                                  # React frontend
│   ├── pages/                            # Home, Login, Signup, Preferences,
│   │                                      # Recommendations, Profile, PrivacyPolicy, NotFound
│   ├── components/                       # Navbar, Footer, ProtectedRoute, AnimeCard, GenreCheckboxGroup
│   ├── services/                         # api.ts (fetch wrapper), auth, preferences, anilist,
│   │                                      # quotes, titles, avatar (one client per resource)
│   └── data/genres.ts
├── docs/
│   ├── architecture.md
│   ├── supabase-setup.md
│   ├── avatar-upload-pipeline.md
│   ├── legacy-static-site-readme.md      # archived pre-rewrite README
│   └── microservice-a-profile-image.md   # archived original microservice README
└── anime-verse-backend/
    ├── api/                              # users, preferences, watchlist, reviews, quotes, titles, avatar
    ├── lib/                              # prisma.ts, auth.ts, zod.ts, supabase.ts, redis.ts,
    │                                      # cache.ts, rateLimit.ts, queue.ts
    ├── prisma/                           # schema.prisma, migrations, seed.ts
    ├── data/                             # quotes.json, titles.json (seed source)
    ├── server.ts                         # Express app + error handler
    ├── consumer.ts                       # RabbitMQ worker, avatar thumbnailing
    ├── compose.yml
    └── Dockerfile
```

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`, in three jobs: `frontend` (lint, build, Vitest), `backend` (type-check, migrate+seed, Vitest against real Postgres/Redis/RabbitMQ service containers), and `e2e` (boots the real backend against service containers, then runs the Playwright suite from the root package). None of the jobs deploy anywhere.

A separate workflow, `.github/workflows/update-e2e-snapshots.yml`, is `workflow_dispatch`-only (manual trigger, never runs on push/PR) and regenerates the Linux visual-regression baselines in `e2e/visual.spec.ts-snapshots/`, then opens a PR with the result. See `CLAUDE.md`'s "UI Change Workflow" section for when to run it.

## Known Limitations

- Watchlist and Reviews have full Prisma models and REST endpoints but no frontend UI. Nothing in the app calls them.
- No production deployment target is configured. CI only lints, builds, and tests. A host (Railway, Render, Fly.io, or a VPS running Docker Compose) is needed before the app can run outside local dev.
- The Playwright E2E suite drives a real signup/login and lets the browser hit AniList's real GraphQL API. Nothing is mocked, so a slow AniList response can fail the suite even when the app code is correct.

## Deployment

Not configured. See [Known Limitations](#known-limitations) above.
