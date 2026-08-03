# Swipe Deck & Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user a `Swipe`-backed taste signal before recommendations exist to consume it: a pgvector-enabled `Anime` cache table keyed by AniList id, a `Swipe` model, `POST /swipes` + `GET /swipes/me`, and a `Discover` swipe-deck page that's both a mandatory post-signup step and a persistent nav tab. This plan does **not** build the taste-vector math or the recommendation query — those are roadmap #3, consuming the `Anime.tasteVector` column this plan populates.

**Architecture:** `lib/tagVector.ts` (from plan #1) already converts AniList's `{name, rank}` tags into a `vector(335)` array — this plan's only new backend math is none; `lib/animeCache.ts` just calls `tagsToVector` and writes the result into Postgres via raw SQL, since `Anime.tasteVector` is a Prisma `Unsupported` type invisible to the generated client. The swipe deck's candidate pool is fetched **client-side from AniList** (`src/services/anilist.ts`, extended with one more thin fetcher, same pattern as the existing four), never server-side — see "Deviations" below for why. `POST /swipes` therefore receives the anime's title/poster/synopsis/tags in the request body (already in hand from that one client-side fetch) and caches them via `animeCache.upsertAnime` before writing the `Swipe` row.

**Tech Stack:** Same as plan #1 (Vitest frontend + backend, Playwright E2E, Zod, Prisma raw SQL for the `Unsupported` vector column), plus `pgvector/pgvector` as the Postgres image (replacing plain `postgres`) — no new npm dependency on either side.

## Roadmap (this plan is #2 of several)

1. AniList migration — done (merged)
2. **This plan** — pgvector + `Anime` cache table + `Swipe` model/endpoint + Discover swipe-deck UI (mandatory onboarding + persistent tab)
3. Recommendation engine (`/recommendations/for-you`) + Explore page "For You" row
4. Explore page "Browse & Search" row (genre/sort/search against AniList directly)
5. Watchlist/Reviews frontend ("My List") — `WatchStatus` field, FK migration to `Anime`
6. Taste Map (hand-rolled PCA) page
7. Live activity feed + presence (WebSocket)
8. Remove `Preference` model/page, nav update, Bento Editorial restyle — **restyle half already done** (merged); removing `Preference`/`Preferences.tsx` and the nav update are still pending

## Scope & Deviations From The Design Spec

The design spec (`docs/superpowers/specs/2026-07-17-resume-redesign-design.md`) describes `lib/animeCache.ts`'s `upsertAnime` as fetching from AniList itself. This plan deviates from that:

- **No server-side AniList client is built.** Plan #1's Global Constraints confirmed AniList's live rate limit is **30 requests/minute**, and that no fetch function may loop multiple requests. A per-swipe server-side fetch is worse than a loop — it's one request *per user action*, and onboarding alone is ~15-20 swipes per new signup. Concurrent onboarding sessions would blow the budget in seconds. The frontend already has the full AniList payload (title, poster, synopsis, tags) in memory from the single request that loaded the swipe deck, so `POST /swipes` takes that data in its body (Zod-validated) instead. `lib/animeCache.ts` never calls AniList — it only ever receives data the client already fetched.
- **`Preferences.tsx` and `api/preferences.ts` are untouched.** The spec frames swipe onboarding as eventually replacing the genre-checkbox Preferences page, but that removal is roadmap #8. This plan adds Discover as a new, additional flow. The swipe deck's candidate query reads the existing `showAdultContent` flag via the existing `GET /preferences/me` (already Redis-cached — no new backend work) and applies `src/services/anilist.ts`'s existing `adultContentFilter`, exactly like `Recommendations.tsx` does today. **Forward note for #8:** when `Preference`/`Preferences.tsx` are removed, `showAdultContent` needs a new home (e.g. a field on `User`, or a small settings surface) — it can't simply disappear with the model, since Discover depends on it.
- **`Anime.tasteVector` is `vector(335)`, not the spec's provisional `vector(150)`.** Plan #1 confirmed AniList's real filtered tag vocabulary is 335 tags (`anime-verse-backend/data/anilistTags.json`, verified at plan-writing time via `node -e "console.log(JSON.parse(require('fs').readFileSync('anime-verse-backend/data/anilistTags.json')).length)"` → `335`). `Anime.tasteVector` must match `tagVector.ts`'s `VECTOR_DIMENSION` exactly, or `tagsToVector`'s output silently fails to insert.
- **`WatchlistItem`/`Review` are not touched.** Their FK migration to `Anime` (currently `animeId String`) is roadmap #5, independently shippable, out of scope here.
- **`POST /swipes` has a dedicated rate limiter (`swipesLimiter`, 200/hour per user).** Originally skipped in this plan on the reasoning that `POST /swipes` is "a cheap authenticated write with no comparable abuse surface" — that reasoning was sized against the `Swipe` row (user-scoped, cheap) and missed that `upsertAnime` does an unconditional `INSERT` into the shared, global `Anime` table with a client-chosen id and up to ~10KB of client-supplied data per row. The final whole-branch review caught this: one authenticated account could otherwise loop and write unbounded junk rows into that shared table. Added `swipesLimiter` in `lib/rateLimit.ts` (same per-user-keyed pattern as `uploadLimiter`), applied only to `POST /` in `api/swipes.ts` (not `GET /me`), at 200/hour — generous enough that the legitimate 15-20-swipe onboarding burst is completely unaffected.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **AniList's public API is rate-limited to 30 requests/minute** (per plan #1) — the swipe deck fetches its candidate pool in exactly one request per page load (mirrors `fetchRandomRecommendations`'s `perPage`/`randomPage` pattern), never per-card and never server-side.
- **`Anime.tasteVector Unsupported("vector(335)")?` is invisible to Prisma Client** — no `.create()`, no `.update()`, no `.findMany()` field selection. All reads and writes of that column go through `prisma.$queryRaw`/`$executeRaw` in `lib/animeCache.ts`. It's nullable in the schema (not required + no `@default`) purely to satisfy Prisma's migration requirement for `Unsupported` columns — the app always sets a real value on insert via raw SQL.
- **`CREATE EXTENSION vector` requires the `pgvector/pgvector` Postgres image**, not plain `postgres`. This must change in three places: `anime-verse-backend/compose.yml`'s `postgres` service, and the `postgres` service block in **both** the `backend` and `e2e` jobs of `.github/workflows/ci.yml` (each job defines its own inline service container — confirmed by reading the workflow, not assumed). Missing any of the three leaves that environment's migration failing on `CREATE EXTENSION vector`.
- **`Anime` is a shared, global cache table** — unlike `Swipe`/`WatchlistItem`/`Review`, it isn't scoped to one user. `upsertAnime` only overwrites an existing row's `title`/`tags`/`tasteVector` if the row is missing or older than a 7-day staleness window, so one user's swipe can't casually overwrite another anime's cached metadata that every other user's future recommendation math will read.
- **Client-submitted tag names outside the real 335-tag vocabulary are inert** — `tagsToVector` (plan #1) only writes a value at a tag's vocabulary index; unrecognized names contribute nothing to the vector. Combined with the staleness gate above, this bounds what a client can actually influence.
- **Changing `src/components/Navbar.tsx` may invalidate existing Playwright visual baselines** — Navbar renders on all four pages `e2e/visual.spec.ts` snapshots (`/`, `/login`, `/signup`, `/privacy-policy`), so this must be checked. Per `CLAUDE.md`'s UI Change Workflow, any task touching `src/pages/**` or `src/components/**` must run the `ui-change-workflow` skill before committing. In practice, `e2e/visual.spec.ts` only snapshots those four pages logged out (no auth fixture — confirmed in the file itself and in `playwright.config.ts`), so a change confined to Navbar's logged-in-only branch produces a correct no-op regeneration, not a baseline diff. A change that touches the logged-out branch, or any of these pages' own markup, would move pixels and need the full regenerate-and-commit sequence. Either way, running the workflow's step 1 (`npm run test:e2e:update`) is the way to find out which case applies — don't assume.
- **No new npm dependency.** The swipe deck is button-driven (Skip / Like / Love), not drag-gesture-based, per the spec's explicit "or equivalent buttons for accessibility/non-touch" — no gesture/animation library needed. Card-advance animation uses CSS `transform`/`opacity` only (compositor-friendly, per the web performance rules).
- **`docker compose down` (no `-v` needed)** before the image swap takes effect locally — `compose.yml`'s `postgres` service has no volume mount, so its data is already ephemeral to the container; there's nothing to preserve.
- **Commit messages:** plain, direct, no conventional-commit prefixes, no AI attribution — matches every prior commit in this repo.

---

### Task 1: Switch Postgres to `pgvector/pgvector` and add the `Anime`/`Swipe` schema

**Files:**
- Modify: `anime-verse-backend/compose.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `anime-verse-backend/prisma/schema.prisma`
- Create: `anime-verse-backend/prisma/migrations/<generated>_add_anime_and_swipe/migration.sql` (generated, then hand-edited)

**Interfaces:**
- Produces: `Anime` model (`id`, `title`, `posterUrl`, `synopsis`, `tags Json`, `tasteVector Unsupported("vector(335)")?`, `updatedAt`), `SwipeAction` enum (`SKIP`/`LIKE`/`LOVE`), `Swipe` model (`id`, `userId`, `animeId`, `action`, `createdAt`, unique on `[userId, animeId]`)

- [ ] **Step 1: Swap the Postgres image in `compose.yml`**

In `anime-verse-backend/compose.yml`, change the `postgres` service:

```yaml
  postgres:
    image: pgvector/pgvector:pg17
```

(only the `image` line changes — healthcheck, ports, env_file, restart policy all stay as-is)

- [ ] **Step 2: Swap the Postgres image in both CI jobs**

In `.github/workflows/ci.yml`, change `image: postgres` to `image: pgvector/pgvector:pg17` in **both** the `backend` job's `postgres` service and the `e2e` job's `postgres` service (two separate edits — each job declares its own service block).

- [ ] **Step 3: Add the `Anime`/`Swipe` models to the schema**

In `anime-verse-backend/prisma/schema.prisma`, add `swipes Swipe[]` to `User`:

```prisma
model User {
    id                 Int             @id @default(autoincrement())
    email              String          @unique
    password           String
    avatarUrl          String?
    avatarThumbnailUrl String?
    createdAt          DateTime        @default(now())
    preferences        Preference?
    watchlist          WatchlistItem[]
    reviews            Review[]
    swipes             Swipe[]
}
```

Append the new models at the end of the file:

```prisma
// Anime — cache-aside table populated whenever a Swipe references an AniList
// id not yet cached (or stale). tasteVector is a pgvector column: Prisma's
// generated client can't read or write Unsupported types, so lib/animeCache.ts
// reads/writes it via $queryRaw/$executeRaw. Nullable only to satisfy
// Prisma's migration requirement for Unsupported columns — always set via
// raw SQL on insert.
model Anime {
    id          Int      @id
    title       String
    posterUrl   String?
    synopsis    String
    tags        Json
    tasteVector Unsupported("vector(335)")?
    updatedAt   DateTime @updatedAt

    swipes Swipe[]
}

enum SwipeAction {
    SKIP
    LIKE
    LOVE
}

// Swipe — one row per (user, anime) swipe decision from the Discover deck.
// Re-swiping the same anime updates the row rather than duplicating it.
model Swipe {
    id        Int         @id @default(autoincrement())
    userId    Int
    user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
    animeId   Int
    anime     Anime       @relation(fields: [animeId], references: [id])
    action    SwipeAction
    createdAt DateTime    @default(now())

    @@unique([userId, animeId])
}
```

- [ ] **Step 4: Recreate the local Postgres container on the new image**

```bash
cd anime-verse-backend
docker compose down
docker compose up -d postgres
```

- [ ] **Step 5: Generate the migration (don't apply yet)**

```bash
npx prisma migrate dev --create-only --name add_anime_and_swipe
```

Expected: a new folder under `prisma/migrations/` containing `migration.sql` with the `CREATE TYPE "SwipeAction"`, `CREATE TABLE "Anime"` (including a literal `"tasteVector" vector(335)` column, since Prisma passes `Unsupported("...")` through verbatim), and `CREATE TABLE "Swipe"` statements.

- [ ] **Step 6: Hand-edit the generated migration to create the extension**

Open the generated `migration.sql` and add this as the very first line, before any other statement:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is the standard pattern for pgvector columns declared via Prisma's `Unsupported` type — Prisma has no `previewFeatures = ["postgresqlExtensions"]`-based awareness of this schema (that's a separate, newer, non-`Unsupported` mechanism this plan doesn't use, to stay consistent with the design spec's `Unsupported("vector(150)")` starting point), so nothing else will create the extension.

- [ ] **Step 7: Apply the migration**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: succeeds with no errors. If it fails with `type "vector" does not exist`, the extension line from Step 6 is missing or was placed after a statement that uses the type.

- [ ] **Step 8: Commit**

```bash
git add anime-verse-backend/compose.yml .github/workflows/ci.yml anime-verse-backend/prisma/schema.prisma anime-verse-backend/prisma/migrations
git commit -m "Switch Postgres to pgvector/pgvector and add the Anime and Swipe models"
```

(This task has no dedicated test of its own — Task 2's integration test round-trips a real vector value through the table this migration creates, which is the actual proof the extension and column work.)

---

### Task 2: `lib/animeCache.ts` — cache-aside upsert into `Anime`

**Files:**
- Create: `anime-verse-backend/lib/animeCache.ts`
- Create: `anime-verse-backend/lib/animeCache.test.ts`

**Interfaces:**
- Consumes: `tagsToVector`, `AniListTag` from `lib/tagVector.ts` (plan #1)
- Produces: `interface AnimeCacheInput { id: number; title: string; posterUrl: string | null; synopsis: string; tags: AniListTag[] }`, `async function upsertAnime(input: AnimeCacheInput): Promise<void>`

- [ ] **Step 1: Write the failing integration tests**

Create `anime-verse-backend/lib/animeCache.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'

import prisma from './prisma.ts'
import { upsertAnime } from './animeCache.ts'
import { tagsToVector, VECTOR_DIMENSION } from './tagVector.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

async function readAnime(id: number) {
    const rows = await prisma.$queryRaw<{ title: string; tags: unknown; vector: string }[]>`
        SELECT title, tags, "tasteVector"::text AS vector FROM "Anime" WHERE id = ${id}
    `
    return rows[0] ?? null
}

describe('upsertAnime', () => {
    let createdId: number | null = null

    // Canary: Task 1's migration hardcodes the "tasteVector" column as
    // vector(335) as a literal, since Postgres has no way to read
    // VECTOR_DIMENSION from tagVector.ts. Nothing else ties them together —
    // if data/anilistTags.json is ever regenerated with a different tag
    // count, this fails loudly here instead of surfacing as a Postgres
    // "different vector dimensions" error deep inside a swipe request.
    it('keeps VECTOR_DIMENSION in sync with the migration\'s hardcoded vector(335)', () => {
        expect(VECTOR_DIMENSION).toBe(335)
    })

    afterEach(async () => {
        if (createdId !== null) {
            await prisma.anime.delete({ where: { id: createdId } }).catch(() => {})
            createdId = null
        }
    })

    it('creates a new Anime row with a tasteVector derived from the given tags', async () => {
        const id = randomAnimeId()
        createdId = id
        const tags = [{ name: 'Isekai', rank: 92 }]

        await upsertAnime({ id, title: 'Test Anime', posterUrl: 'poster.jpg', synopsis: 'A synopsis.', tags })

        const row = await readAnime(id)
        expect(row?.title).toBe('Test Anime')
        const expectedVector = `[${tagsToVector(tags).join(',')}]`
        expect(row?.vector).toBe(expectedVector)
    })

    it('does not overwrite a fresh row on a second call with different tags', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }] })
        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }] })

        const row = await readAnime(id)
        expect(row?.title).toBe('First')
    })

    it('refreshes a stale row (older than 7 days)', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }] })
        await prisma.$executeRaw`UPDATE "Anime" SET "updatedAt" = now() - interval '8 days' WHERE id = ${id}`

        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }] })

        const row = await readAnime(id)
        expect(row?.title).toBe('Second')
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/animeCache.test.ts`
Expected: FAIL — `lib/animeCache.ts` does not exist yet.

- [ ] **Step 3: Implement `upsertAnime`**

Create `anime-verse-backend/lib/animeCache.ts`:

```ts
import prisma from './prisma.ts'
import { tagsToVector, type AniListTag } from './tagVector.ts'

export interface AnimeCacheInput {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
    tags: AniListTag[]
}

/*
 * upsertAnime — cache-aside write into the Anime table, called before any
 * Swipe references an animeId. Tags/tasteVector come from the caller
 * (already fetched client-side from AniList when the deck loaded) rather
 * than a fresh server-side fetch — see the plan's "Deviations" section for
 * why. Skips overwriting an already-fresh row so one user's swipe can't
 * rewrite another anime's shared cached metadata on every call.
 */
export async function upsertAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    // ponytail: fixed 7-day staleness window, no background refresh job —
    // good enough for a resume project. Add a scheduled refresh if the
    // catalog needs to stay fresher than that.
    await prisma.$executeRaw`
        INSERT INTO "Anime" (id, title, "posterUrl", synopsis, tags, "tasteVector", "updatedAt")
        VALUES (${input.id}, ${input.title}, ${input.posterUrl}, ${input.synopsis}, ${JSON.stringify(input.tags)}::jsonb, ${vectorLiteral}::vector, now())
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            "posterUrl" = EXCLUDED."posterUrl",
            synopsis = EXCLUDED.synopsis,
            tags = EXCLUDED.tags,
            "tasteVector" = EXCLUDED."tasteVector",
            "updatedAt" = EXCLUDED."updatedAt"
        WHERE "Anime"."updatedAt" < now() - interval '7 days'
    `
}
```

(This code block is copied verbatim from the current `anime-verse-backend/lib/animeCache.ts` as of the final fix wave. The original draft above used a separate `SELECT "updatedAt"` freshness check plus an unconditional `ON CONFLICT DO UPDATE`; the merged code replaced that with the single atomic statement shown here, gated by the `WHERE` clause instead of an app-level branch.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/animeCache.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add anime-verse-backend/lib/animeCache.ts anime-verse-backend/lib/animeCache.test.ts
git commit -m "Add upsertAnime, a cache-aside write into the pgvector-backed Anime table"
```

---

### Task 3: `POST /swipes` + `GET /swipes/me`

**Files:**
- Modify: `anime-verse-backend/lib/zod.ts`
- Create: `anime-verse-backend/api/swipes.ts`
- Create: `anime-verse-backend/api/swipes.test.ts`
- Modify: `anime-verse-backend/api/index.ts`

**Interfaces:**
- Consumes: `upsertAnime` from Task 2
- Produces: `POST /swipes` (201, body `{ animeId, action, anime: { title, posterUrl, synopsis, tags } }`), `GET /swipes/me` (200, `{ swipes: { animeId: number; action: SwipeAction }[] }`)

- [ ] **Step 1: Add the Zod schema**

In `anime-verse-backend/lib/zod.ts`, add:

```ts
export const SwipeActionValue = z.enum(['SKIP', 'LIKE', 'LOVE'])

export const Swipe = z.object({
    animeId: z.int().positive(),
    action: SwipeActionValue,
    anime: z.object({
        title: z.string().min(1).max(500),
        posterUrl: z.url().nullable(),
        synopsis: z.string().max(5000),
        tags: z
            .array(
                z.object({
                    name: z.string().min(1).max(100),
                    rank: z.number().min(0).max(100)
                })
            )
            .max(100)
    })
})
```

(Note: implementation found this needed to be `.max(100)`, not `.max(30)` as originally drafted here — live AniList data showed popular titles like One Piece carry 77 tags, so `.max(30)` would have 400'd on a meaningful fraction of the Discover deck's most popular cards. Fixed during Task 4's review; this plan text is corrected to match.)

- [ ] **Step 2: Write the failing integration tests**

Create `anime-verse-backend/api/swipes.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

function swipeBody(animeId: number, action: 'SKIP' | 'LIKE' | 'LOVE') {
    return {
        animeId,
        action,
        anime: { title: 'Test Anime', posterUrl: 'https://example.com/poster.jpg', synopsis: 'A synopsis.', tags: [{ name: 'Isekai', rank: 80 }] }
    }
}

describe('POST /swipes', () => {
    let createdAnimeIds: number[] = []

    afterEach(async () => {
        await prisma.anime.deleteMany({ where: { id: { in: createdAnimeIds } } }).catch(() => {})
        createdAnimeIds = []
    })

    it('requires authentication', async () => {
        const res = await request(app).post('/swipes').send(swipeBody(randomAnimeId(), 'LIKE'))
        expect(res.status).toBe(401)
    })

    it('rejects an invalid action', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/swipes')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ ...swipeBody(randomAnimeId(), 'LIKE' as never), action: 'MAYBE' })
        expect(res.status).toBe(400)
        await user.cleanup()
    })

    it('creates a swipe and caches the anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()
        createdAnimeIds.push(animeId)

        const res = await request(app)
            .post('/swipes')
            .set('Authorization', `Bearer ${user.token}`)
            .send(swipeBody(animeId, 'LOVE'))

        expect(res.status).toBe(201)
        const cached = await prisma.anime.findUnique({ where: { id: animeId } })
        expect(cached?.title).toBe('Test Anime')

        await user.cleanup()
    })

    it('upserts on repeat swipes for the same user and anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()
        createdAnimeIds.push(animeId)

        await request(app).post('/swipes').set('Authorization', `Bearer ${user.token}`).send(swipeBody(animeId, 'SKIP')).expect(201)
        await request(app).post('/swipes').set('Authorization', `Bearer ${user.token}`).send(swipeBody(animeId, 'LOVE')).expect(201)

        const mine = await request(app).get('/swipes/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.swipes).toEqual([{ animeId, action: 'LOVE' }])

        await user.cleanup()
    })
})

describe('GET /swipes/me', () => {
    it('returns only the caller\'s swipes', async () => {
        const userA = await createTestUser(app)
        const userB = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/swipes').set('Authorization', `Bearer ${userA.token}`).send(swipeBody(animeId, 'LIKE')).expect(201)

        const resB = await request(app).get('/swipes/me').set('Authorization', `Bearer ${userB.token}`).expect(200)
        expect(resB.body.swipes).toEqual([])

        await prisma.anime.delete({ where: { id: animeId } }).catch(() => {})
        await userA.cleanup()
        await userB.cleanup()
    })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run api/swipes.test.ts`
Expected: FAIL — `api/swipes.ts` does not exist yet and isn't mounted.

- [ ] **Step 4: Implement the router**

Create `anime-verse-backend/api/swipes.ts`:

```ts
import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Swipe } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { upsertAnime } from '../lib/animeCache.ts'

const router = Router()

/*
 * POST /swipes — records a Discover-deck swipe decision. The request body
 * carries the anime's AniList metadata (title/poster/synopsis/tags) because
 * the deck already fetched it client-side; this endpoint never calls AniList
 * itself (see the plan's "Deviations" section — a per-swipe server fetch
 * would blow AniList's 30 req/min limit under concurrent onboarding).
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = Swipe.parse(req.body)

    await upsertAnime({
        id: data.animeId,
        title: data.anime.title,
        posterUrl: data.anime.posterUrl,
        synopsis: data.anime.synopsis,
        tags: data.anime.tags
    })

    const swipe = await prisma.swipe.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { userId: req.user!.id, animeId: data.animeId, action: data.action },
        update: { action: data.action }
    })

    res.status(201).send(swipe)
})

/*
 * GET /swipes/me — the caller's swipe history. Powers both the Discover
 * page's already-swiped-exclusion and the onboarding gate (redirects to
 * Discover when this list is empty).
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swipes = await prisma.swipe.findMany({
        where: { userId: req.user!.id },
        select: { animeId: true, action: true }
    })
    res.status(200).send({ swipes })
})

export default router
```

- [ ] **Step 5: Mount the router**

In `anime-verse-backend/api/index.ts`, add the import and mount:

```ts
import swipesRouter from './swipes.ts'
// ...
router.use('/swipes', swipesRouter)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run api/swipes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add anime-verse-backend/lib/zod.ts anime-verse-backend/api/swipes.ts anime-verse-backend/api/swipes.test.ts anime-verse-backend/api/index.ts
git commit -m "Add POST /swipes and GET /swipes/me"
```

---

### Task 4: Frontend AniList discover-pool fetcher + swipes service

**Files:**
- Modify: `src/services/anilist.ts`
- Modify: `src/services/anilist.test.ts`
- Create: `src/services/swipes.ts`

**Interfaces:**
- Consumes: `AniListAnime`, `animeTitle`, `animeSynopsis` from `src/services/anilist.ts`
- Produces: `function fetchDiscoverPool(showAdultContent?: boolean): Promise<AniListAnime[]>`, `type SwipeAction = 'SKIP' | 'LIKE' | 'LOVE'`, `interface MySwipe { animeId: number; action: SwipeAction }`, `function postSwipe(anime: AniListAnime, action: SwipeAction): Promise<void>`, `function getMySwipes(): Promise<MySwipe[]>`

- [ ] **Step 1: Write the failing test for `fetchDiscoverPool`**

Append to `src/services/anilist.test.ts`:

```ts
import { fetchDiscoverPool } from './anilist.ts'

describe('fetchDiscoverPool', () => {
  it('makes exactly one request and returns up to 50 results', async () => {
    const pool = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchDiscoverPool()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(50)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: FAIL — `fetchDiscoverPool` doesn't exist yet.

- [ ] **Step 3: Implement `fetchDiscoverPool`**

Append to `src/services/anilist.ts`:

```ts
// Powers the Discover swipe deck: one request for a pool of popular titles,
// same randomPage/adultContentFilter pattern as fetchRandomRecommendations.
// Discover.tsx filters out already-swiped ids client-side.
export async function fetchDiscoverPool(showAdultContent = false): Promise<AniListAnime[]> {
  return fetchMediaList({
    page: randomPage(),
    perPage: 50,
    sort: ['POPULARITY_DESC'],
    ...adultContentFilter(showAdultContent),
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: PASS

- [ ] **Step 5: Add the swipes service (no dedicated test — thin passthrough, matching `auth.ts`/`preferences.ts`)**

Create `src/services/swipes.ts`:

```ts
import { apiRequest } from './api.ts'
import { animeTitle, animeSynopsis, type AniListAnime } from './anilist.ts'

export type SwipeAction = 'SKIP' | 'LIKE' | 'LOVE'

export interface MySwipe {
  animeId: number
  action: SwipeAction
}

export async function postSwipe(anime: AniListAnime, action: SwipeAction): Promise<void> {
  await apiRequest('/swipes', {
    method: 'POST',
    auth: true,
    body: {
      animeId: anime.id,
      action,
      anime: {
        title: animeTitle(anime),
        posterUrl: anime.coverImage.large ?? anime.coverImage.medium ?? null,
        synopsis: animeSynopsis(anime),
        tags: anime.tags,
      },
    },
  })
}

export async function getMySwipes(): Promise<MySwipe[]> {
  const { swipes } = await apiRequest<{ swipes: MySwipe[] }>('/swipes/me', { auth: true })
  return swipes
}
```

- [ ] **Step 6: Verify the frontend still typechecks and lints**

Run: `npm run build && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/services/anilist.ts src/services/anilist.test.ts src/services/swipes.ts
git commit -m "Add fetchDiscoverPool and the swipes service"
```

---

### Task 5: `Discover.tsx` swipe-deck page

**Files:**
- Create: `src/pages/Discover.tsx`

**Interfaces:**
- Consumes: `fetchDiscoverPool` (Task 4), `postSwipe`, `getMySwipes`, `MySwipe`, `SwipeAction` (Task 4), `getPreferences` (existing), `animeTitle`, `animeSynopsis`, `AniListAnime` (existing)

- [ ] **Step 1: Implement the page**

Create `src/pages/Discover.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Heart, ThumbsUp, X } from 'lucide-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { getPreferences } from '../services/preferences.ts'
import { fetchDiscoverPool, animeTitle, animeSynopsis, type AniListAnime } from '../services/anilist.ts'
import { postSwipe, getMySwipes, type SwipeAction } from '../services/swipes.ts'

const DECK_SIZE = 20

type DeckState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cards: AniListAnime[] }

export default function Discover() {
  const [deck, setDeck] = useState<DeckState>({ status: 'loading' })
  const [index, setIndex] = useState(0)
  const [swipeError, setSwipeError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const prefs = await getPreferences().catch(() => ({ genres: [], showAdultContent: false }))
        const [pool, mySwipes] = await Promise.all([
          fetchDiscoverPool(prefs.showAdultContent),
          getMySwipes().catch(() => []),
        ])
        const swipedIds = new Set(mySwipes.map((s) => s.animeId))
        const cards = pool.filter((anime) => !swipedIds.has(anime.id)).slice(0, DECK_SIZE)
        setDeck({ status: 'ready', cards })
      } catch (err) {
        console.error('[Discover] Failed to load the swipe deck:', err)
        setDeck({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load Discover.' })
      }
    }
    load()
  }, [])

  async function handleSwipe(anime: AniListAnime, action: SwipeAction) {
    setSwipeError('')
    try {
      await postSwipe(anime, action)
    } catch (err) {
      // A failed write only loses that one card's signal — not worth
      // blocking the deck over, but the user should know it happened.
      console.error('[Discover] Failed to record swipe:', err)
      setSwipeError('That swipe may not have been saved. Keep going, or refresh to try again.')
    }
    setIndex((i) => i + 1)
  }

  const cards = deck.status === 'ready' ? deck.cards : []
  const current = cards[index]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-xl mx-auto px-4 py-12 w-full flex flex-col items-center">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Discover
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Swipe to build your taste profile
        </h1>
        <p className="text-[var(--color-muted)] mb-8 text-center">
          Skip, like, or love each title. This is what your recommendations will be built from.
        </p>

        {deck.status === 'loading' && <p className="text-sm text-[var(--color-muted)]">Loading...</p>}
        {deck.status === 'error' && <p className="text-xs text-[var(--color-error)]">{deck.message}</p>}

        {deck.status === 'ready' && current && (
          <div className="surface-card w-full p-6 transition-transform duration-300">
            {current.coverImage.large && (
              <img
                src={current.coverImage.large}
                alt={animeTitle(current)}
                className="w-full rounded-xl object-cover mb-4"
              />
            )}
            <h2 className="font-display text-xl font-semibold mb-2">{animeTitle(current)}</h2>
            <p className="text-sm text-[var(--color-muted)] line-clamp-6 mb-6">{animeSynopsis(current)}</p>

            {swipeError && <p className="text-xs text-[var(--color-error)] mb-4">{swipeError}</p>}

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handleSwipe(current, 'SKIP')}
                aria-label="Skip"
                className="btn btn-outline p-4 rounded-full"
              >
                <X size={20} />
              </button>
              <button
                type="button"
                onClick={() => handleSwipe(current, 'LIKE')}
                aria-label="Like"
                className="btn btn-outline p-4 rounded-full"
              >
                <ThumbsUp size={20} />
              </button>
              <button
                type="button"
                onClick={() => handleSwipe(current, 'LOVE')}
                aria-label="Love"
                className="btn btn-accent p-4 rounded-full"
              >
                <Heart size={20} />
              </button>
            </div>
          </div>
        )}

        {deck.status === 'ready' && !current && (
          <div className="surface-card w-full p-8 text-center">
            <p className="text-[var(--color-ink)] font-medium mb-4">That's the deck for now.</p>
            <Link to="/recommendations" className="btn btn-accent px-6 py-3 text-sm no-underline">
              See your recommendations
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verify the frontend still typechecks, lints, and builds**

Run: `npm run build && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify in the browser**

Run `npm run dev` (frontend) and `docker compose up` (backend, from Task 1's rebuilt image), sign up, and confirm the deck loads real AniList cards and swiping advances through them.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Discover.tsx
git commit -m "Add the Discover swipe-deck page"
```

---

### Task 6: Onboarding gate, nav tab, routes, and visual baselines

**Files:**
- Create: `src/components/RequireOnboarding.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Navbar.tsx`

**Interfaces:**
- Consumes: `getMySwipes` (Task 4)

- [ ] **Step 1: Add the onboarding gate**

Create `src/components/RequireOnboarding.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { getMySwipes } from '../services/swipes.ts'

interface RequireOnboardingProps {
  children: ReactNode
}

/*
 * RequireOnboarding — redirects to /discover if the caller has zero swipes.
 * Fails open (renders children) on a network error, matching this app's
 * existing pattern of defaulting rather than blocking when a personalization
 * fetch fails (see Recommendations.tsx's getPreferences().catch(...)).
 */
export default function RequireOnboarding({ children }: RequireOnboardingProps) {
  const [status, setStatus] = useState<'checking' | 'onboarded' | 'needs-onboarding'>('checking')

  useEffect(() => {
    getMySwipes()
      .then((swipes) => setStatus(swipes.length > 0 ? 'onboarded' : 'needs-onboarding'))
      .catch(() => setStatus('onboarded'))
  }, [])

  if (status === 'checking') return null
  if (status === 'needs-onboarding') return <Navigate to="/discover" replace />
  return children
}
```

- [ ] **Step 2: Wire the route into `App.tsx`**

In `src/App.tsx`, add the import and the `/discover` route, and wrap `/recommendations`'s element:

```tsx
import Discover from './pages/Discover.tsx'
import RequireOnboarding from './components/RequireOnboarding.tsx'
```

```tsx
        <Route
          path="/discover"
          element={
            <ProtectedRoute>
              <Discover />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recommendations"
          element={
            <ProtectedRoute>
              <RequireOnboarding>
                <Recommendations />
              </RequireOnboarding>
            </ProtectedRoute>
          }
        />
```

- [ ] **Step 3: Add the nav link**

In `src/components/Navbar.tsx`, add a `Discover` link before `Preferences` in **both** the desktop (`hidden md:flex`) and mobile (`md:hidden absolute`) logged-in blocks:

```tsx
              <Link to="/discover" className={linkClass('/discover')}>
                Discover
              </Link>
```

(mobile block uses `mobileLinkClass('/discover')` and `onClick={closeMenu}`, matching the existing `Preferences`/`Recommendations`/`Profile` links)

- [ ] **Step 4: Regenerate visual baselines**

Run the `ui-change-workflow` skill — the Navbar change affects all four snapshotted pages (`/`, `/login`, `/signup`, `/privacy-policy`).

- [ ] **Step 5: Verify the frontend still typechecks, lints, and builds**

Run: `npm run build && npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/RequireOnboarding.tsx src/App.tsx src/components/Navbar.tsx e2e/visual.spec.ts-snapshots
git commit -m "Gate Recommendations behind swipe onboarding and add the Discover nav tab"
```

---

### Task 7: E2E coverage

**Files:**
- Create: `e2e/discover.spec.ts`
- Modify: `e2e/recommendations.spec.ts`

**Interfaces:**
- Consumes: the running app's `/signup`, `/login`, `/discover`, `/recommendations` routes (black-box browser test)

- [ ] **Step 1: Update the existing Recommendations test to swipe through onboarding first**

`e2e/recommendations.spec.ts`'s current test signs up, logs in, then goes straight to `/recommendations` and asserts its content — that will now redirect to `/discover` for a brand-new user. Update it to swipe at least once first:

```ts
  await page.waitForURL('**/profile')
  await page.goto('/recommendations')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/recommendations')

  await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()
```

(the rest of the existing assertions — Trending Now / New Releases / Random Recommendations headings, the image check — stay as they are)

- [ ] **Step 2: Write the Discover-specific test**

Create `e2e/discover.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('a new user is redirected to Discover before reaching Recommendations, and swiping unlocks it', async ({ page }) => {
  const email = uniqueEmail()
  const password = 'correct horse battery staple'

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign Up' }).click()

  await page.waitForURL('**/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()

  await page.waitForURL('**/profile')
  await page.goto('/recommendations')
  await expect(page).toHaveURL(/\/discover$/)

  await expect(page.getByRole('heading', { name: 'Swipe to build your taste profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Like' }).click({ timeout: 15000 })

  await page.goto('/recommendations')
  // Asserting on rendered content rather than the URL: RequireOnboarding
  // renders nothing while its GET /swipes/me check is in flight, so the URL
  // reads "/recommendations" for a beat even on a run where the gate is
  // about to redirect. The heading only appears once the gate has actually
  // let the page through.
  await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()
})
```

- [ ] **Step 3: Run the E2E suite**

Precondition: backend running (`docker compose up` from Task 1's rebuilt image, in `anime-verse-backend/`).

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/recommendations.spec.ts e2e/discover.spec.ts
git commit -m "Update E2E coverage for the swipe onboarding gate"
```

---

### Task 8: Update `CLAUDE.md`'s known quirks

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a quirk note**

In `CLAUDE.md`'s "Known quirks worth checking before assuming behavior" section, add:

```markdown
- Postgres runs the `pgvector/pgvector` image (not plain `postgres`), because `Anime.tasteVector` is a pgvector column (`Unsupported("vector(335)")` in `prisma/schema.prisma`) — reads/writes go through `lib/animeCache.ts`'s raw SQL, never Prisma Client directly. If you swap the compose/CI Postgres image back to plain `postgres`, `CREATE EXTENSION vector` in the migration will fail.
- `POST /swipes` takes the anime's AniList metadata (title/poster/synopsis/tags) in its request body rather than fetching it server-side — a per-swipe AniList fetch would blow the 30 req/min limit under concurrent onboarding. Don't add a backend AniList client for this without re-checking that constraint.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the pgvector image and client-supplied swipe metadata"
```

---

## Self-Review Notes

- **Spec coverage:** covers roadmap item #2 in full (pgvector, `Anime` cache, `Swipe` model/endpoint, Discover UI with mandatory onboarding + persistent tab). Deliberately excludes `lib/tasteVector.ts` (user-level vector) and `/recommendations/for-you` — those consume this plan's output but belong to roadmap #3.
- **Deviation from the design spec is explicit and justified:** `upsertAnime` takes client-supplied tags instead of fetching AniList server-side, driven by plan #1's confirmed 30 req/min limit — documented in "Scope & Deviations" and repeated as inline comments at both call sites (`lib/animeCache.ts`, `api/swipes.ts`) so a future reader doesn't "fix" it back toward the spec's original wording without re-checking the constraint that drove the change.
- **`Preferences.tsx`/`api/preferences.ts` untouched**, per the task's explicit scope boundary — Discover only *reads* `GET /preferences/me` through the existing `getPreferences()` service, never modifies either file.
- **`WatchlistItem`/`Review` untouched** — their FK migration to `Anime` is roadmap #5.
- **Type consistency:** `AnimeCacheInput`/`upsertAnime` defined once (Task 2), consumed only in Task 3. `fetchDiscoverPool`/`postSwipe`/`getMySwipes`/`MySwipe`/`SwipeAction` defined once (Task 4), consumed in Tasks 5-6.
- **No placeholders:** the tag vocabulary count (335) was re-confirmed against the actual `data/anilistTags.json` file on disk while writing this plan, not assumed from plan #1's text. The `pgvector/pgvector:pg17` and `:pg16` tags were both confirmed to exist on Docker Hub (`docker manifest inspect`) rather than assumed from the bare `postgres` tag they replace.
- **Edge case, not a bug:** if `Discover.tsx`'s AniList pool comes back with every id already in the user's swipe history (a returning user on the persistent tab, after enough sessions), `cards` is empty and the page shows the same "That's the deck for now" completion state as finishing a normal deck — there's no separate empty-pool error state, and none is needed.
