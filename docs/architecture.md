# Architecture

This is a deeper breakdown of AnimeVerse's services and how they talk to each other. For setup instructions, see the root [README.md](../README.md).

## Services

| Service | Tech | Runs where | Talks to |
|---|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Browser (dev server or static build) | Express API, AniList (directly) |
| API | Express 5 + TypeScript | `anime-verse-backend`, Docker `api` service | Postgres (via Prisma), Supabase Storage, RabbitMQ |
| Consumer | Node/TypeScript worker (`consumer.ts`) | Docker `consumer` service | RabbitMQ, Supabase Storage, Postgres (via Prisma) |
| Database | Postgres | Docker `postgres` service (or a hosted Postgres instance) | — |
| Queue | RabbitMQ | Docker `rabbitmq` service | — |
| File storage | Supabase Storage | Hosted (Supabase project) | — |

There is no reverse proxy or API gateway — the frontend talks to the Express API and to AniList directly, over whatever origins `VITE_API_URL` and AniList's public GraphQL API resolve to.

## Request flow: a typical authenticated request

1. Browser sends a request with `Authorization: Bearer <jwt>` (attached by `src/services/api.ts`).
2. Express's `requireAuth` middleware (`lib/auth.ts`) verifies the JWT and attaches `req.user = { id: <userId> }` — the `userId` comes from the JWT's `sub` claim, stored as a string per JWT convention and parsed back to a number.
3. The route handler validates the request body with a Zod schema (`lib/zod.ts`), then reads/writes via Prisma, scoped to `req.user.id`. There is no separate authorization layer — ownership is enforced by always filtering/writing on the authenticated user's own ID, never a client-supplied one.
4. Errors thrown by Zod or Prisma are caught by `server.ts`'s centralized error handler and translated to an HTTP status (`ZodError` → 400, Prisma `P2003` invalid foreign key → 400, Prisma `P2025` record not found → falls through to the 404 handler).

## Request flow: AniList-backed pages (Recommendations, random anime)

The frontend calls `https://graphql.anilist.co` directly from the browser (`src/services/anilist.ts`) — the Express API is not involved at all for this data. This means:

- No backend caching or rate-limiting sits in front of AniList; the app is subject to AniList's own public rate limits (30 requests/minute).
- If AniList is unreachable or changes its response shape, the Express API's health has no bearing on whether Recommendations/random-anime work.

## Request flow: avatar upload (async)

See [avatar-upload-pipeline.md](avatar-upload-pipeline.md) for the full walkthrough — this is the one feature in the app with a genuinely async, multi-hop request lifecycle (HTTP response comes back before the thumbnail exists).

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

## Deployment status

No production deployment target is configured. `.github/workflows/static.yml` predates this rewrite and only deploys to GitHub Pages, which cannot run Postgres, RabbitMQ, or the Express API — only static files. Running this stack anywhere other than local Docker Compose currently requires manually provisioning a host that can run `docker compose up` (Railway, Render, Fly.io, or a VPS) and pointing `VITE_API_URL` at it.
