# Anime Cache Verification Worker

## Overview

`lib/animeCache.ts`'s `upsertAnime` writes client-supplied AniList metadata (title/poster/synopsis/tags/isAdult) once per anime and never refreshes it — deliberate, since the `Anime` row is shared across all users and the metadata is otherwise unverified. CLAUDE.md flags the gap directly: no staleness refresh without first verifying the incoming data against AniList. This plan closes that gap with a scheduled job that re-fetches each cached anime from AniList server-side and overwrites the row with authoritative data, reusing the existing RabbitMQ consumer/DLQ infrastructure instead of adding anything new.

## Goals

- Periodically correct client-supplied `Anime` metadata against AniList's own data.
- Reuse existing infrastructure end to end: the RabbitMQ consumer process, its durable-queue + DLQ pattern, and the GitHub Actions cron pattern already used by `keep-alive.yml`.
- Stay under AniList's 30 req/min limit via a throttle that's self-contained to this job — independent of, and never competing with, users' client-side AniList traffic.

## Non-Goals

- **No admin/RBAC system.** The only caller of the new endpoint is a GitHub Actions workflow, not a human — a shared-secret header is the right-sized auth for a machine trigger. An `isAdmin` concept is only worth adding if a human-facing admin feature (e.g. Review moderation) needs it later; not bootstrapped here.
- **No change to `upsertAnime`'s write-once insert.** This adds a separate, explicit correction path — the first-swipe-wins insert behavior is untouched.
- **No cross-referencing sources other than AniList.** AniList is already the implicit source of truth everywhere else in the app; this job just makes that explicit for already-cached rows.
- **No retry/backoff tuning beyond the existing DLQ pattern.** A failed fetch nacks without requeue, same as avatar thumbnailing.

## Architecture

```
GitHub Actions cron (daily) ──POST /admin/anime-cache/refresh──▶ api
                                (X-Cron-Secret header)             │
                                                                    │ 1. select up to 25 Anime rows,
                                                                    │    ORDER BY "lastVerifiedAt" ASC NULLS FIRST
                                                                    │ 2. publish one message per id to
                                                                    │    anime-cache-refresh queue
                                                                    │ 3. respond { enqueued, animeIds } immediately
                                                                    ▼
                                                          anime-cache-refresh queue
                                                                    │
                                                                    ▼
                                                        consumer.ts (new handler)
                                                          prefetch 1, ~2.5s spacing
                                                                    │
                                                    fetch anime by id from AniList (server-side)
                                                                    │
                                                    UPDATE "Anime" SET title=, "posterUrl"=,
                                                      synopsis=, tags=, "tasteVector"=,
                                                      "isAdult"=, "lastVerifiedAt"=now()
                                                                    │
                                                          failure → anime-cache-refresh.dlq
```

The HTTP request from GitHub Actions returns as soon as the batch is enqueued — the throttled AniList fetching happens afterward, entirely inside `consumer.ts`, decoupled from the workflow run.

## Data Model Changes

```prisma
model Anime {
    id            Int       @id
    title         String
    posterUrl     String?
    synopsis      String
    tags          Json
    tasteVector   Unsupported("vector(335)")?
    isAdult       Boolean   @default(false)
    lastVerifiedAt DateTime?   // NEW — null means never verified since caching
    updatedAt     DateTime  @updatedAt

    swipes Swipe[]
}
```

One nullable column, one migration. Every existing row starts at `NULL`, so the first run's `ORDER BY "lastVerifiedAt" ASC NULLS FIRST` naturally processes the whole existing cache oldest-first before any row gets revisited.

## Backend Architecture

### `lib/queue.ts` — new queue declaration

Mirrors `setupAvatarQueue` exactly:

```ts
export const ANIME_REFRESH_QUEUE = 'anime-cache-refresh'
export const ANIME_REFRESH_DLX = 'anime-cache-refresh.dlx'
export const ANIME_REFRESH_DLQ = 'anime-cache-refresh.dlq'

export async function setupAnimeRefreshQueue(channel: amqplib.Channel): Promise<void> {
    await channel.assertExchange(ANIME_REFRESH_DLX, 'fanout', { durable: true })
    await channel.assertQueue(ANIME_REFRESH_DLQ, { durable: true })
    await channel.bindQueue(ANIME_REFRESH_DLQ, ANIME_REFRESH_DLX, '')
    await channel.assertQueue(ANIME_REFRESH_QUEUE, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': ANIME_REFRESH_DLX }
    })
}
```

A separate queue from `avatar-thumbnails` — different message shape, different consumer logic, independent DLQ for independent failure inspection.

### `lib/anilistServer.ts` (new) — server-side AniList client

The first server-side AniList caller in the codebase (today all AniList calls are client-side, per CLAUDE.md's Known Quirks — `src/services/anilist.ts` is frontend-only and not reusable here). A minimal GraphQL client: one function, `fetchAnimeById(id: number)`, returning the same shape `upsertAnime` already expects (`title`, `posterUrl`, `synopsis`, `tags`, `isAdult`) so the consumer can pass its result straight into the new `verifyAnime`.

### `lib/animeCache.ts` — new `verifyAnime`

A real overwrite, distinct from `upsertAnime`'s `ON CONFLICT (id) DO NOTHING`:

```ts
export async function verifyAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        UPDATE "Anime"
        SET title = ${input.title}, "posterUrl" = ${input.posterUrl}, synopsis = ${input.synopsis},
            tags = ${JSON.stringify(input.tags)}::jsonb, "tasteVector" = ${vectorLiteral}::vector,
            "isAdult" = ${input.isAdult}, "lastVerifiedAt" = now()
        WHERE id = ${input.id}
    `
}
```

Recomputing `tasteVector` via the same `tagsToVector()` used by `upsertAnime` matters here specifically: correcting `tags` without also correcting `tasteVector` would leave the embedding inconsistent with the anime's actual tags, quietly degrading `GET /recommendations/for-you`'s ordering for every user.

### `api/admin.ts` (new) — `POST /admin/anime-cache/refresh`

1. Compare the `X-Cron-Secret` header against `process.env.ADMIN_CRON_SECRET` with a constant-time check. Missing or mismatched → 401, nothing else runs.
2. `SELECT id FROM "Anime" ORDER BY "lastVerifiedAt" ASC NULLS FIRST LIMIT 25` (`REFRESH_BATCH_SIZE = 25`, a top-of-file constant — same style as `consumer.ts`'s existing `THUMBNAIL_SIZE`).
3. Publish one message (`{ animeId }`) per row to `ANIME_REFRESH_QUEUE`.
4. Respond `{ enqueued: number, animeIds: number[] }` — enough for the workflow's log to show what happened without needing a separate dashboard.

Mounted in `api/index.ts` alongside the other routers.

### `consumer.ts` — new handler

- Calls `setupAnimeRefreshQueue` on startup, alongside the existing `setupAvatarQueue`.
- Consumes `ANIME_REFRESH_QUEUE` on its own channel with `prefetch(1)`.
- Per message: `fetchAnimeById` → `verifyAnime` → `await sleep(2500)` before acking the next message. That spacing caps this job at ~24 req/min by construction — safely under AniList's 30/min — and it's a separate call path (this process's own IP) from users' browser-side AniList calls, so it never competes with Discover/Explore traffic for the same budget.
- A batch of 25 takes roughly a minute to fully drain; the triggering HTTP request has already returned long before that finishes.
- On fetch or DB failure: nack without requeue → `anime-cache-refresh.dlq`, same convention as avatar thumbnailing.

### `.github/workflows/refresh-anime-cache.yml` (new)

Same shape as `keep-alive.yml`:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf -X POST "$API_URL/admin/anime-cache/refresh" \
            -H "X-Cron-Secret: $ADMIN_CRON_SECRET"
        env:
          API_URL: ${{ secrets.API_URL }}
          ADMIN_CRON_SECRET: ${{ secrets.ADMIN_CRON_SECRET }}
```

This workflow depends on the backend already being deployed at a stable URL (`API_URL`) — it can't be wired up for real until that's settled, though the endpoint and consumer handler are independently buildable and testable against a local backend before then.

### New secret: `ADMIN_CRON_SECRET`

A new GitHub repo secret and a new `anime-verse-backend/.env.production` entry, documented in `.env.example` the same way `JWT_SECRET` already is. Scoped to this one endpoint — if a second cron-triggered admin endpoint gets added later, whether to share this secret or mint a new one is a decision for that point, not this one.

## Known limitation: a permanently-failing id

If AniList ever 404s for a cached id (e.g. the anime was removed from AniList), `lastVerifiedAt` never gets set for it, so `ORDER BY "lastVerifiedAt" ASC NULLS FIRST` keeps reselecting it first on every run — it dead-letters into `anime-cache-refresh.dlq` repeatedly instead of the job making forward progress on the rest of the backlog. Accepted for now: the DLQ makes the failure visible for manual inspection, and at this app's cache size that's a rare, low-cost edge case. If it becomes a real problem, the fix is small (e.g. set `lastVerifiedAt` on failure too, with a separate signal for "known bad") — not worth building preemptively.

## Testing Approach

- **Unit:** none needed beyond what `tagVector.test.ts` already covers — `verifyAnime` and the AniList client are thin enough that integration coverage is more valuable than mocking them apart.
- **Integration:** against real Postgres (existing CI service containers) — `verifyAnime` overwrites an existing row's metadata and recomputes `tasteVector` correctly from corrected tags. Producer endpoint: missing/wrong `X-Cron-Secret` → 401; correct secret → enqueues the expected row count and ids.
- **Consumer:** export the message handler as a standalone function (`processRefreshMessage`, mirroring `processThumbnailMessage`'s existing pattern) so a test can call it directly with a mocked AniList response and assert the resulting DB row, without needing a real RabbitMQ connection in the test.
- **No E2E.** This is a backend-only, cron-triggered internal job with no user-facing surface — nothing for Playwright to exercise.
