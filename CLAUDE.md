# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AnimeVerse is an anime recommendation web app: a React 19 + Vite + TypeScript SPA backed by a single Express + Prisma + Postgres API, orchestrated with Docker Compose. Supabase is used exclusively for Storage (avatar images) — not for auth or as the primary database. There is no separate Node/Flask microservice tier anymore; everything the old five-service split used to do now lives in one Express app.

> This describes the current (rewritten) architecture. The prior static-site + Node + 4-Flask-microservice architecture is preserved under the `legacy-static-site` git tag and archived at `docs/legacy-static-site-readme.md`.

## Architecture

**Frontend** (repo root, `src/`): React SPA built with Vite. Routes live in `src/App.tsx` — `/`, `/login`, `/signup`, `/privacy-policy` are public; `/preferences`, `/recommendations`, `/profile` are wrapped in `ProtectedRoute` (redirects to `/login` if no JWT in `localStorage`). `src/services/` holds one thin fetch wrapper per backend resource (`api.ts` is the shared base — reads `VITE_API_URL`, attaches `Authorization: Bearer <token>`); `src/services/anilist.ts` calls the public AniList GraphQL API directly from the browser, bypassing the backend entirely (recommendations, trending, new releases, random anime).

**Backend** (`anime-verse-backend/`): Single Express 5 + TypeScript API on port **8000**. Routers live in `api/*.ts` and are aggregated in `api/index.ts`, mounted at `/`:
- `api/users.ts` — `POST /users` (signup), `POST /users/login`, `GET /users/me`, `PATCH /users/me/password`
- `api/preferences.ts` — `GET /preferences/me`, `PUT /preferences/me` (full-replace upsert)
- `api/watchlist.ts`, `api/reviews.ts` — CRUD, `requireAuth` + ownership via JWT `sub` claim (provisioned; no frontend page consumes these yet)
- `api/quotes.ts`, `api/titles.ts` — `GET /quotes/random`, `GET /titles/random`, served from Postgres (seeded from `data/quotes.json` / `data/titles.json`)
- `api/avatar.ts` — `POST /avatar`, multer + Supabase Storage upload + RabbitMQ publish

Auth is self-issued JWTs (`lib/auth.ts`: `generateToken`/`verifyToken`/`requireAuth` middleware, `bcryptjs` for password hashing) — no third-party auth provider. Data access is Prisma (`lib/prisma.ts`, `PrismaPg` adapter reading `POSTGRES_URL`) against Postgres. Request bodies are validated with Zod schemas in `lib/zod.ts`; `server.ts`'s centralized error handler turns `ZodError` into 400s and Prisma `P2003`/`P2025` into 400/404.

**Avatar upload pipeline** (async, the most complex feature in the app): `POST /avatar` uploads the original to the `avatars` Supabase Storage bucket, saves `avatarUrl` on the `User` row immediately, and publishes a message to the `avatar-thumbnails` RabbitMQ queue. A separate `consumer.ts` process (started as its own Docker Compose service) consumes that queue, downloads the original, resizes it to 128x128 via `sharp`, uploads the result to the `avatar-thumbnails` bucket, and writes `avatarThumbnailUrl` back via Prisma. See `docs/avatar-upload-pipeline.md` for the full request lifecycle.

**Data model** (`prisma/schema.prisma`): `User` (email, bcrypt `password`, `avatarUrl`, `avatarThumbnailUrl`), `Preference` (1:1 with User, `genres: String[]`), `WatchlistItem` and `Review` (both unique on `(userId, animeId)`), `Quote` and `Title` (static seed content, no user association).

**Orchestration** (`anime-verse-backend/compose.yml`): `api`, `consumer`, `postgres` (health-checked), `rabbitmq` (health-checked), `initdb` (runs `prisma migrate deploy` + the seed script once, then exits). `api` and `consumer` both depend on `postgres`, `rabbitmq`, and `initdb` completing successfully.

### Known quirks worth checking before assuming behavior

- AniList calls happen entirely client-side (`src/services/anilist.ts`) — the Express API has no route that proxies or caches AniList data for browsing (that changes once the recommendation-engine plan adds a server-side `Anime` cache). Don't look for a backend endpoint for trending/new-releases/random; there isn't one yet.
- AniList's `description(asHtml: false)` field still contains embedded HTML tags in practice — always render synopses through `animeSynopsis()`, never the raw `description` field.
- Watchlist and Reviews are fully implemented on the backend (models, Zod schemas, REST routes, ownership checks) but have zero frontend consumers — this is a deliberate scope decision from the modernization rewrite, not a bug or an oversight.
- `SUPABASE_KEY` must be the Supabase **service_role** key and is server-side only (`lib/supabase.ts`); it must never be sent to or read by the frontend.
- The avatar upload response returns `avatarUrl` immediately but `avatarThumbnailUrl` is only populated after the RabbitMQ consumer finishes processing — the frontend (`Profile.tsx`) shows a "Generating thumbnail..." state in the gap. Don't assume both URLs are present right after upload.
- No production deployment target is configured yet. `.github/workflows/static.yml` still targets GitHub Pages from the old static-site era and cannot host this stack (it needs a running Postgres + RabbitMQ + Express process, not just static files).

## Common Commands

Frontend (repo root):
```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
```

Backend — full stack via Docker Compose (recommended):
```bash
cd anime-verse-backend
docker compose up   # postgres, rabbitmq, api (:8000), consumer, initdb (migrate+seed, runs once)
```

Backend — local dev without Docker:
```bash
cd anime-verse-backend
npm install
npm run initdb     # prisma migrate deploy && prisma generate, then seeds Quote/Title
npm run dev        # tsx watch server.ts, http://localhost:8000
npx tsx consumer.ts  # run separately to process avatar-thumbnail jobs; needs a local RabbitMQ
```

To exercise the full app (especially the profile page's avatar upload), the API, Postgres, RabbitMQ, and the consumer must all be running — `docker compose up` is the simplest way to get all four at once.
