# AnimeVerse

AnimeVerse is an anime recommendation web app. Users sign up, swipe through an AniList-backed deck to build a taste profile, and get personalized "For You" picks plus a genre/sort/search browser against the [AniList GraphQL API](https://anilist.gitbook.io/anilist-apiv2-docs/). A profile page lets users manage their account, upload a real profile picture, and play with random anime quote/title/picture generators.

The app is a React SPA backed by a single Express + Prisma + Postgres API, orchestrated with Docker Compose. Supabase is used exclusively for file storage (avatar images); it is not used for auth or as the primary database.

> Looking for the old static-site version of this project (vanilla JS frontend + Node auth API + four Flask microservices)? It's archived at [docs/legacy-static-site-readme.md](docs/legacy-static-site-readme.md) and preserved under the `legacy-static-site` git tag.

## Features

- **Signup / Login:** email + password auth against the API, JWT stored in `localStorage`.
- **Discover:** swipe (skip / like / love) through an AniList-backed deck; each swipe feeds a taste vector computed fresh from your swipe history.
- **Explore:** "For You" picks ranked by taste-vector similarity, plus Browse & Search (genre chips, sort, and text search against AniList's full catalog).
- **Profile:** change password, upload a real profile picture (async thumbnail generation), view saved preferences, and fetch a random anime, anime title, and anime quote.
- **Auth gating:** `/preferences`, `/discover`, `/explore`, and `/profile` redirect to `/login` if no token is present (see `src/components/ProtectedRoute.tsx`).

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript, Tailwind CSS v4, react-router v8 |
| Backend | Express 5 + TypeScript, Prisma 7 (Postgres + pgvector), Zod 4 validation |
| Auth | Self-issued JWTs (`jsonwebtoken` + `bcryptjs`), not a third-party auth provider |
| File storage | Supabase Storage (avatar originals + generated thumbnails) |
| Async processing | RabbitMQ + a standalone `consumer.ts` worker using `sharp` for thumbnailing |
| Caching / rate limiting | Redis (`express-rate-limit` + `rate-limit-redis` on auth/avatar endpoints, response caching on read-heavy GETs) |
| API docs | OpenAPI, served live at `/api-docs` |
| Orchestration | Docker Compose (`api`, `consumer`, `postgres`, `rabbitmq`, `redis`, `initdb`) |

## Architecture

The backend is one Express API, not the four-Flask-microservice split the pre-rewrite version used — see the legacy-site callout above. The one deliberately asynchronous piece is avatar uploads: the API responds as soon as the original lands in Supabase Storage, and a separate RabbitMQ-consuming worker (`consumer.ts`) generates the thumbnail in the background. AniList data (Discover's deck, Browse & Search, the random-anime widget) is fetched directly from the browser rather than proxied, since there's nothing there worth caching or gating server-side.

- [docs/architecture.md](docs/architecture.md) — full service breakdown and request-flow diagrams
- [docs/avatar-upload-pipeline.md](docs/avatar-upload-pipeline.md) — the avatar pipeline's full request lifecycle

## Prerequisites

- Node.js and npm
- Docker and Docker Compose (recommended: runs Postgres, RabbitMQ, and the API together)
- A Supabase project with two public Storage buckets (`avatars`, `avatar-thumbnails`). See [docs/supabase-setup.md](docs/supabase-setup.md) if you need to create one

## Setup and Running

### 1. Backend: Docker Compose (recommended)

```bash
cd anime-verse-backend
cp .env.example .env.production   # see Environment Variables below
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
cp .env.example .env              # see Environment Variables below
npm run dev                       # http://localhost:5173
```

## Environment Variables

Every variable is documented inline where you'll actually set it:

- Backend: [`anime-verse-backend/.env.example`](anime-verse-backend/.env.example) → copy to `.env.local` (local dev) or `.env.production` (Docker)
- Frontend: [`.env.example`](.env.example) → copy to `.env`

Never commit the filled-in files.

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

Full interactive docs are served at `/api-docs` on any running instance (`http://localhost:8000/api-docs` locally, `https://api.minkim26.tech/api-docs` in production), generated from OpenAPI annotations kept alongside each route.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`, in three jobs: `frontend` (lint, build, Vitest), `backend` (type-check, migrate+seed, Vitest against real Postgres/Redis/RabbitMQ service containers), and `e2e` (boots the real backend against service containers, then runs the Playwright suite from the root package). None of these jobs deploy anywhere themselves; `deploy.yml` runs separately once `ci.yml` succeeds on `main` (see [Deployment](#deployment)).

A separate workflow, `.github/workflows/update-e2e-snapshots.yml`, is `workflow_dispatch`-only (manual trigger, never runs on push/PR) and regenerates the Linux visual-regression baselines in `e2e/visual.spec.ts-snapshots/`, then opens a PR with the result. See `CLAUDE.md`'s "UI Change Workflow" section for when to run it.

## Known Limitations

- Watchlist and Reviews have full Prisma models and REST endpoints but no frontend UI. Nothing in the app calls them.
- The backend is a single Proxmox host with no redundancy. If it goes down, `api`, `consumer`, `rabbitmq`, `redis`, and `cloudflared` all go down together, taking the public site with them since `cloudflared` is the only path in. Accepted trade-off at this app's scale.
- `rabbitmq` and `redis` have no backups. Redis is pure cache, safe to lose. RabbitMQ persists its queues to the `rabbitmq_data` volume, so pending and dead-lettered messages survive a container restart or recreation, but not a lost or deleted volume.
- The Playwright E2E suite drives a real signup/login and lets the browser hit AniList's real GraphQL API. Nothing is mocked, so a slow AniList response can fail the suite even when the app code is correct.

## Deployment

The frontend deploys to Cloudflare Workers from `main` via Cloudflare's GitHub integration, live at https://animeverse.minkim26.tech. The backend runs on an LXC container on a home-lab Proxmox host (`anime-verse-backend/compose.prod.yml`: `api`, `consumer`, `rabbitmq`, `redis`, `cloudflared`), reachable through an outbound-only Cloudflare Tunnel, so the box has no public IP or inbound ports; Cloudflare's edge terminates TLS and proxies `https://api.minkim26.tech` straight to it. Postgres runs on Supabase, connected through its session pooler.

Backend deploys are automatic: `.github/workflows/deploy.yml` triggers on a successful `CI` run against `main`, joins the home-lab's Tailscale network to reach it, and runs `git pull && docker compose -f compose.prod.yml up -d --build` over SSH.

This setup has no ongoing hosting cost. A previous iteration ran on a GCP `e2-micro` VM behind Caddy, which carried a real ~$3.65/month charge for its reserved external IP; that VM and its GCP project have since been decommissioned. See [docs/superpowers/specs/2026-08-24-production-deployment-design.md](docs/superpowers/specs/2026-08-24-production-deployment-design.md) and [docs/superpowers/plans/2026-08-24-production-deployment.md](docs/superpowers/plans/2026-08-24-production-deployment.md) for that original design and the cost analysis that motivated moving off it — neither describes the current Proxmox/Cloudflare Tunnel setup.
