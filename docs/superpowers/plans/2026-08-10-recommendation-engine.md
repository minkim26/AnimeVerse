# For You Recommendation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user real taste-vector recommendations via a new `GET /recommendations/for-you` endpoint, wired into `Recommendations.tsx`'s existing "For You" section in place of its current genre-filtered AniList fetch.

**Architecture:** The endpoint computes a user's taste vector fresh on every request from their `Swipe` rows (no stored per-user vector, no recompute-on-write trigger) via a new pure `lib/tasteVector.ts`, then runs a pgvector cosine-distance (`<=>`) query against the `Anime` cache table, excluding already-swiped anime. Along the way this plan closes a content-safety gap: `Anime` has no `isAdult` column today, so a user with adult content disabled could otherwise be recommended one by vector similarity. `isAdult` gets threaded through the swipe payload end to end and filtered on in the new query.

**Tech Stack:** Same as plan #2 (Vitest frontend + backend, Prisma raw SQL for the `Unsupported` vector column). This is the first plan to actually use pgvector's `<=>` cosine-distance operator (plan #2 only ever wrote vectors, never queried by distance). No new npm dependency on either side.

## Roadmap (this plan is #3 of several)

1. AniList migration: done (merged)
2. Swipe deck & Discover: done (merged)
3. **This plan**: Recommendation engine (`GET /recommendations/for-you`) + swap `Recommendations.tsx`'s "For You" section onto it
4. Explore page "Browse & Search" row (genre/sort/search against AniList directly) — also where `Recommendations.tsx` gets renamed to `Explore.tsx` and the nav gets updated
5. Watchlist/Reviews frontend ("My List"): `WatchStatus` field, FK migration to `Anime`
6. Taste Map (hand-rolled PCA) page
7. Live activity feed + presence (WebSocket)
8. Remove `Preference` model/page, nav update, Bento Editorial restyle. **Restyle half already done** (merged); removing `Preference`/`Preferences.tsx` and the nav update are still pending

## Scope Notes

- **Not renaming `Recommendations.tsx` to `Explore.tsx`, no nav change.** Per the design spec's explicit scope decision: the roadmap defers that rename/nav-update to plan #8. This plan swaps the "For You" section's data source in place; `Trending Now`/`New Releases`/`Random Recommendations` are untouched.
- **No Browse & Search.** That's plan #4, out of scope here.
- **No watchlist/review signal in the taste vector.** `WatchlistItem.animeId` is still a disconnected `String`, not FK'd to `Anime` (plan #5). Only `Swipe` rows feed the taste vector in this plan, and only the caller's own `Swipe` rows are excluded from their own recommendation candidates — a title someone has only watchlisted (not swiped) can still be recommended to them.
- **`fetchAnimeByGenres` becomes dead code and is deleted.** It's currently called only by the `Recommendations.tsx` section this plan repoints (confirmed by grep — its only other reference is its own test). Left in place, it would be an orphaned, untested-by-use export; removing it is a small, contained cleanup directly caused by this change, not unrelated refactoring.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **`Anime.tasteVector Unsupported("vector(335)")?` is invisible to Prisma Client**: no `.create()`, no `.update()`, no `.findMany()` field selection. All reads/writes of that column go through `prisma.$queryRaw`/`$executeRaw`. `isAdult` (this plan's new column) is a plain `Boolean`, fully visible to Prisma Client — only `tasteVector` needs raw SQL.
- **`Anime` is a shared, global cache table** populated write-once (`ON CONFLICT (id) DO NOTHING` — no staleness refresh, changed by PR #8). `isAdult` follows the exact same write-once semantics as `title`/`synopsis`/`tags`: whatever the first swiper's client reports is permanent. This is not a new trust gap — `title`/`synopsis`/`tags` are already client-supplied and unverified under the same rule (documented in `CLAUDE.md`); `isAdult` just joins that existing, already-accepted set.
- **The taste vector is never persisted.** No `User.tasteVector` column, no cache, no recompute-on-write trigger. A swipe takes effect on the very next `GET /recommendations/for-you` call with nothing to invalidate.
- **Cosine distance (`<=>`) is scale-invariant.** The aggregated taste vector is never normalized to unit length — only its direction affects the ordering of results, per `docs/superpowers/specs/2026-08-10-recommendation-engine-design.md`.
- **No new npm dependency, no new rate limiter, no new Redis cache key** for the new endpoint — its result changes with every swipe, so caching it would reintroduce the staleness problem the lazy-at-read design deliberately avoids, and it's a read with no write-amplification risk comparable to `POST /swipes`.
- **Commit messages:** plain, direct, no conventional-commit prefixes, no AI attribution, matching every prior commit in this repo.

---

### Task 1: Add `isAdult` to the `Anime` cache and thread it through swipes

**Files:**
- Modify: `anime-verse-backend/prisma/schema.prisma`
- Create: `anime-verse-backend/prisma/migrations/<generated>_add_anime_is_adult/migration.sql` (generated)
- Modify: `anime-verse-backend/lib/zod.ts`
- Modify: `anime-verse-backend/lib/animeCache.ts`
- Modify: `anime-verse-backend/lib/animeCache.test.ts`
- Modify: `anime-verse-backend/api/swipes.ts`
- Modify: `anime-verse-backend/api/swipes.test.ts`
- Modify: `src/services/swipes.ts`

**Interfaces:**
- Produces: `Anime.isAdult: boolean` (DB column, visible to Prisma Client directly), `AnimeCacheInput.isAdult: boolean` (extends the existing interface from plan #2), `Swipe` zod schema's `anime.isAdult: boolean` (extends the existing schema from plan #2)

- [ ] **Step 1: Add the column to the schema**

In `anime-verse-backend/prisma/schema.prisma`, add `isAdult` to the `Anime` model (right after `tasteVector`):

```prisma
model Anime {
    id          Int      @id
    title       String
    posterUrl   String?
    synopsis    String
    tags        Json
    tasteVector Unsupported("vector(335)")?
    isAdult     Boolean  @default(false)
    updatedAt   DateTime @updatedAt

    swipes Swipe[]
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd anime-verse-backend
npx prisma migrate dev --name add_anime_is_adult
```

Expected: succeeds, generates a migration containing `ALTER TABLE "Anime" ADD COLUMN "isAdult" BOOLEAN NOT NULL DEFAULT false;`, and regenerates the Prisma Client. Unlike plan #2's Task 1, no hand-editing is needed — the `vector` extension this needs is already installed from that earlier migration, and a plain `Boolean` column needs no special handling.

- [ ] **Step 3: Write the failing test for `upsertAnime`'s `isAdult` handling**

Replace the full contents of `anime-verse-backend/lib/animeCache.test.ts` with:

```ts
import { describe, it, expect, afterEach } from 'vitest'

import prisma from './prisma.ts'
import { upsertAnime } from './animeCache.ts'
import { tagsToVector, VECTOR_DIMENSION } from './tagVector.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

async function readAnime(id: number) {
    const rows = await prisma.$queryRaw<{ title: string; tags: unknown; vector: string; isAdult: boolean }[]>`
        SELECT title, tags, "tasteVector"::text AS vector, "isAdult" FROM "Anime" WHERE id = ${id}
    `
    return rows[0] ?? null
}

describe('upsertAnime', () => {
    let createdId: number | null = null

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

        await upsertAnime({ id, title: 'Test Anime', posterUrl: 'poster.jpg', synopsis: 'A synopsis.', tags, isAdult: false })

        const row = await readAnime(id)
        expect(row?.title).toBe('Test Anime')
        const expectedVector = `[${tagsToVector(tags).join(',')}]`
        expect(row?.vector).toBe(expectedVector)
    })

    it('stores isAdult as given on creation', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'Adult Anime', posterUrl: null, synopsis: '', tags: [], isAdult: true })

        const row = await readAnime(id)
        expect(row?.isAdult).toBe(true)
    })

    it('does not overwrite a fresh row on a second call with different tags', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }], isAdult: false })
        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }], isAdult: true })

        const row = await readAnime(id)
        expect(row?.title).toBe('First')
        expect(row?.isAdult).toBe(false)
    })

    it('still does not overwrite an existing row once it is old (no staleness refresh)', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }], isAdult: false })
        await prisma.$executeRaw`UPDATE "Anime" SET "updatedAt" = now() - interval '8 days' WHERE id = ${id}`

        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }], isAdult: true })

        const row = await readAnime(id)
        expect(row?.title).toBe('First')
    })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd anime-verse-backend && npx vitest run lib/animeCache.test.ts`
Expected: FAIL (`isAdult` doesn't exist on `AnimeCacheInput` yet — a TypeScript error, since this project runs TS source directly via `tsx`).

- [ ] **Step 5: Implement the `isAdult` column in `upsertAnime`**

Replace the full contents of `anime-verse-backend/lib/animeCache.ts` with:

```ts
import prisma from './prisma.ts'
import { tagsToVector, type AniListTag } from './tagVector.ts'

export interface AnimeCacheInput {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
    tags: AniListTag[]
    isAdult: boolean
}

/*
 * upsertAnime is a cache-aside write into the Anime table, called before any
 * Swipe references an animeId. Tags/tasteVector/isAdult come from the caller
 * (already fetched client-side from AniList when the deck loaded) rather
 * than a fresh server-side fetch: see the plan's "Deviations" section for
 * why. Because that metadata is unverified and the Anime row is shared
 * across all users, only the first swipe on a given animeId gets to set it —
 * later calls are no-ops, so no authenticated user can overwrite another
 * anime's already-cached title/synopsis/poster/tags/isAdult with fabricated
 * data.
 */
export async function upsertAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        INSERT INTO "Anime" (id, title, "posterUrl", synopsis, tags, "tasteVector", "isAdult", "updatedAt")
        VALUES (${input.id}, ${input.title}, ${input.posterUrl}, ${input.synopsis}, ${JSON.stringify(input.tags)}::jsonb, ${vectorLiteral}::vector, ${input.isAdult}, now())
        ON CONFLICT (id) DO NOTHING
    `
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd anime-verse-backend && npx vitest run lib/animeCache.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Add `isAdult` to the `Swipe` zod schema**

In `anime-verse-backend/lib/zod.ts`, the `Swipe` schema's nested `anime` object gains one field:

```ts
export const Swipe = z.object({
    animeId: z.int().positive().max(2_147_483_647),
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
            .max(100),
        isAdult: z.boolean()
    })
})
```

- [ ] **Step 8: Write the failing test for `POST /swipes` caching `isAdult`**

In `anime-verse-backend/api/swipes.test.ts`, change the `swipeBody` helper to take and forward `isAdult`:

```ts
function swipeBody(animeId: number, action: 'SKIP' | 'LIKE' | 'LOVE', isAdult = false) {
    return {
        animeId,
        action,
        anime: { title: 'Test Anime', posterUrl: 'https://example.com/poster.jpg', synopsis: 'A synopsis.', tags: [{ name: 'Isekai', rank: 80 }], isAdult }
    }
}
```

Then add this test inside the existing `describe('POST /swipes', ...)` block, after the `'creates a swipe and caches the anime'` test:

```ts
    it('caches whether the anime is adult content', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()
        createdAnimeIds.push(animeId)

        await request(app)
            .post('/swipes')
            .set('Authorization', `Bearer ${user.token}`)
            .send(swipeBody(animeId, 'LIKE', true))
            .expect(201)

        const cached = await prisma.anime.findUnique({ where: { id: animeId } })
        expect(cached?.isAdult).toBe(true)

        await user.cleanup()
    })
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `cd anime-verse-backend && npx vitest run api/swipes.test.ts`
Expected: FAIL — `data.anime.isAdult` isn't passed to `upsertAnime` yet, so `cached?.isAdult` is `false` (the column default) instead of `true`.

- [ ] **Step 10: Pass `isAdult` through in the router**

In `anime-verse-backend/api/swipes.ts`, the `upsertAnime` call in the `POST /` handler gains one field:

```ts
    await upsertAnime({
        id: data.animeId,
        title: data.anime.title,
        posterUrl: data.anime.posterUrl,
        synopsis: data.anime.synopsis,
        tags: data.anime.tags,
        isAdult: data.anime.isAdult
    })
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `cd anime-verse-backend && npx vitest run api/swipes.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 12: Forward `isAdult` from the frontend**

In `src/services/swipes.ts`, `postSwipe`'s request body gains one field (`AniListAnime.isAdult` is already optional on the type — from plan #1 — it just wasn't forwarded until now):

```ts
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
        isAdult: anime.isAdult ?? false,
      },
    },
  })
}
```

- [ ] **Step 13: Verify the frontend still typechecks, lints, and builds**

Run: `npm run build && npm run lint`
Expected: no errors

- [ ] **Step 14: Commit**

```bash
git add anime-verse-backend/prisma/schema.prisma anime-verse-backend/prisma/migrations anime-verse-backend/lib/zod.ts anime-verse-backend/lib/animeCache.ts anime-verse-backend/lib/animeCache.test.ts anime-verse-backend/api/swipes.ts anime-verse-backend/api/swipes.test.ts src/services/swipes.ts
git commit -m "Cache whether a swiped anime is adult content"
```

---

### Task 2: `lib/tasteVector.ts` — aggregate a user's swipes into one vector

**Files:**
- Create: `anime-verse-backend/lib/tasteVector.ts`
- Create: `anime-verse-backend/lib/tasteVector.test.ts`

**Interfaces:**
- Consumes: `VECTOR_DIMENSION` from `lib/tagVector.ts` (plan #1)
- Produces: `interface SwipedAnime { action: 'SKIP' | 'LIKE' | 'LOVE'; tasteVector: number[] }`, `function computeTasteVector(swipes: SwipedAnime[]): number[] | null`

- [ ] **Step 1: Write the failing tests**

Create `anime-verse-backend/lib/tasteVector.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

import { computeTasteVector } from './tasteVector.ts'
import { VECTOR_DIMENSION } from './tagVector.ts'

function uniformVector(value: number): number[] {
    return new Array(VECTOR_DIMENSION).fill(value)
}

describe('computeTasteVector', () => {
    it('returns null for zero swipes', () => {
        expect(computeTasteVector([])).toBeNull()
    })

    it('produces a vector of the correct dimension', () => {
        const result = computeTasteVector([{ action: 'LIKE', tasteVector: uniformVector(1) }])
        expect(result).toHaveLength(VECTOR_DIMENSION)
    })

    it('weights LOVE more heavily than LIKE and averages across swipes', () => {
        const result = computeTasteVector([
            { action: 'LOVE', tasteVector: uniformVector(1) },
            { action: 'LIKE', tasteVector: uniformVector(1) },
        ])
        // (2*1 + 1*1) / 2 = 1.5 in every dimension
        expect(result?.[0]).toBeCloseTo(1.5)
    })

    it('weights SKIP as negative signal', () => {
        const result = computeTasteVector([{ action: 'SKIP', tasteVector: uniformVector(1) }])
        expect(result?.[0]).toBeCloseTo(-1)
    })

    it('aggregates each vector dimension independently', () => {
        const a = new Array(VECTOR_DIMENSION).fill(0)
        a[0] = 1
        const b = new Array(VECTOR_DIMENSION).fill(0)
        b[1] = 1
        const result = computeTasteVector([
            { action: 'LIKE', tasteVector: a },
            { action: 'LIKE', tasteVector: b },
        ])
        expect(result?.[0]).toBeCloseTo(0.5)
        expect(result?.[1]).toBeCloseTo(0.5)
        expect(result?.[2]).toBeCloseTo(0)
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd anime-verse-backend && npx vitest run lib/tasteVector.test.ts`
Expected: FAIL, since `lib/tasteVector.ts` does not exist yet.

- [ ] **Step 3: Implement `computeTasteVector`**

Create `anime-verse-backend/lib/tasteVector.ts`:

```ts
import { VECTOR_DIMENSION } from './tagVector.ts'

export interface SwipedAnime {
    action: 'SKIP' | 'LIKE' | 'LOVE'
    tasteVector: number[]
}

const SWIPE_WEIGHT: Record<SwipedAnime['action'], number> = { LOVE: 2, LIKE: 1, SKIP: -1 }

/*
 * computeTasteVector aggregates a user's swiped anime into one vector: a
 * weighted average, weighted by how strongly each swipe action signals
 * taste (LOVE > LIKE > SKIP as negative signal). Cosine distance is
 * scale-invariant, so the result is never normalized to unit length — only
 * its direction matters to the nearest-neighbor query that consumes it.
 * Returns null for zero swipes; mandatory onboarding means this shouldn't
 * happen in practice, but the endpoint that calls this treats it as "no
 * recommendations yet" rather than risking a divide-by-zero.
 */
export function computeTasteVector(swipes: SwipedAnime[]): number[] | null {
    if (swipes.length === 0) return null

    const sum = new Array<number>(VECTOR_DIMENSION).fill(0)
    for (const { action, tasteVector } of swipes) {
        const weight = SWIPE_WEIGHT[action]
        for (let i = 0; i < VECTOR_DIMENSION; i++) {
            sum[i] += weight * tasteVector[i]
        }
    }
    return sum.map((value) => value / swipes.length)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd anime-verse-backend && npx vitest run lib/tasteVector.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add anime-verse-backend/lib/tasteVector.ts anime-verse-backend/lib/tasteVector.test.ts
git commit -m "Add computeTasteVector, a weighted average of a user's swipes"
```

---

### Task 3: `GET /recommendations/for-you`

**Files:**
- Create: `anime-verse-backend/api/recommendations.ts`
- Create: `anime-verse-backend/api/recommendations.test.ts`
- Modify: `anime-verse-backend/api/index.ts`

**Interfaces:**
- Consumes: `computeTasteVector`, `SwipedAnime` (Task 2), `upsertAnime` (Task 1, used only by the test to seed data)
- Produces: `GET /recommendations/for-you` (200, `{ recommendations: { id: number; title: string; posterUrl: string | null; synopsis: string }[] }`)

- [ ] **Step 1: Write the failing integration tests**

Create `anime-verse-backend/api/recommendations.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { upsertAnime } from '../lib/animeCache.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

async function seedAnime(tags: { name: string; rank: number }[], isAdult = false): Promise<number> {
    const id = randomAnimeId()
    await upsertAnime({ id, title: `Anime ${id}`, posterUrl: null, synopsis: '', tags, isAdult })
    return id
}

describe('GET /recommendations/for-you', () => {
    let createdAnimeIds: number[] = []

    afterEach(async () => {
        await prisma.anime.deleteMany({ where: { id: { in: createdAnimeIds } } }).catch(() => {})
        createdAnimeIds = []
    })

    it('requires authentication', async () => {
        const res = await request(app).get('/recommendations/for-you')
        expect(res.status).toBe(401)
    })

    it('returns an empty list for a user with no swipes', async () => {
        const user = await createTestUser(app)

        const res = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.recommendations).toEqual([])
        await user.cleanup()
    })

    it('recommends anime similar to what the caller loved and excludes what they already swiped', async () => {
        const user = await createTestUser(app)
        const lovedId = await seedAnime([{ name: 'Isekai', rank: 100 }])
        const similarId = await seedAnime([{ name: 'Isekai', rank: 95 }])
        const unrelatedId = await seedAnime([{ name: 'Sports', rank: 100 }])
        createdAnimeIds.push(lovedId, similarId, unrelatedId)

        await prisma.swipe.create({ data: { userId: user.id, animeId: lovedId, action: 'LOVE' } })

        const res = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)

        const ids: number[] = res.body.recommendations.map((a: { id: number }) => a.id)
        expect(ids).not.toContain(lovedId)
        expect(ids).toContain(similarId)
        expect(ids.indexOf(similarId)).toBeLessThan(ids.indexOf(unrelatedId))

        await user.cleanup()
    })

    it('excludes adult anime unless the caller has adult content enabled', async () => {
        const user = await createTestUser(app)
        const seenId = await seedAnime([{ name: 'Isekai', rank: 100 }])
        const adultId = await seedAnime([{ name: 'Isekai', rank: 100 }], true)
        createdAnimeIds.push(seenId, adultId)

        await prisma.swipe.create({ data: { userId: user.id, animeId: seenId, action: 'LIKE' } })

        const before = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)
        const idsBefore: number[] = before.body.recommendations.map((a: { id: number }) => a.id)
        expect(idsBefore).not.toContain(adultId)

        await request(app)
            .put('/preferences/me')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ genres: [], showAdultContent: true })
            .expect(200)

        const after = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)
        const idsAfter: number[] = after.body.recommendations.map((a: { id: number }) => a.id)
        expect(idsAfter).toContain(adultId)

        await user.cleanup()
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd anime-verse-backend && npx vitest run api/recommendations.test.ts`
Expected: FAIL, since `api/recommendations.ts` does not exist yet and isn't mounted (404s, not the expected statuses).

- [ ] **Step 3: Implement the router**

Create `anime-verse-backend/api/recommendations.ts`:

```ts
import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { computeTasteVector, type SwipedAnime } from '../lib/tasteVector.ts'

const router = Router()

const RECOMMENDATION_LIMIT = 12

interface SwipedVectorRow {
    action: SwipedAnime['action']
    vector: string
}

interface RecommendationRow {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
}

/*
 * GET /recommendations/for-you computes the caller's taste vector fresh on
 * every request from their Swipe history — no stored per-user vector, no
 * recompute-on-write trigger. A swipe takes effect on the very next call
 * with nothing to invalidate. See
 * docs/superpowers/specs/2026-08-10-recommendation-engine-design.md.
 */
router.get('/for-you', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swiped = await prisma.$queryRaw<SwipedVectorRow[]>`
        SELECT s.action, a."tasteVector"::text AS vector
        FROM "Swipe" s
        JOIN "Anime" a ON a.id = s."animeId"
        WHERE s."userId" = ${req.user!.id}
    `

    const tasteVector = computeTasteVector(
        swiped.map((row) => ({ action: row.action, tasteVector: JSON.parse(row.vector) as number[] }))
    )

    if (tasteVector === null) {
        return res.status(200).send({ recommendations: [] })
    }

    const preference = await prisma.preference.findUnique({ where: { userId: req.user!.id } })
    const showAdultContent = preference?.showAdultContent ?? false
    const vectorLiteral = `[${tasteVector.join(',')}]`

    const recommendations = await prisma.$queryRaw<RecommendationRow[]>`
        SELECT id, title, "posterUrl", synopsis
        FROM "Anime"
        WHERE id NOT IN (SELECT "animeId" FROM "Swipe" WHERE "userId" = ${req.user!.id})
          AND ("isAdult" = false OR ${showAdultContent})
        ORDER BY "tasteVector" <=> ${vectorLiteral}::vector
        LIMIT ${RECOMMENDATION_LIMIT}
    `

    res.status(200).send({ recommendations })
})

export default router
```

- [ ] **Step 4: Mount the router**

In `anime-verse-backend/api/index.ts`, add the import and mount:

```ts
import recommendationsRouter from './recommendations.ts'
// ...
router.use('/recommendations', recommendationsRouter)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd anime-verse-backend && npx vitest run api/recommendations.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add anime-verse-backend/api/recommendations.ts anime-verse-backend/api/recommendations.test.ts anime-verse-backend/api/index.ts
git commit -m "Add GET /recommendations/for-you"
```

---

### Task 4: Swap `Recommendations.tsx`'s "For You" section onto the new endpoint

**Files:**
- Create: `src/services/recommendations.ts`
- Create: `src/services/recommendations.test.ts`
- Modify: `src/pages/Recommendations.tsx`
- Modify: `src/services/anilist.ts` (remove `fetchAnimeByGenres`, now dead)
- Modify: `src/services/anilist.test.ts` (remove its test)

**Interfaces:**
- Consumes: `AniListAnime` (existing), `apiRequest` (existing)
- Produces: `function getForYouRecommendations(): Promise<AniListAnime[]>`, `function toAniListAnime(anime: CachedAnime): AniListAnime`

- [ ] **Step 1: Write the failing test for the adapter**

Create `src/services/recommendations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toAniListAnime } from './recommendations.ts'

describe('toAniListAnime', () => {
  it('maps a cached anime row into the shape AnimeCard expects', () => {
    const result = toAniListAnime({ id: 1, title: 'Frieren', posterUrl: 'poster.jpg', synopsis: 'A synopsis.' })

    expect(result).toEqual({
      id: 1,
      title: { english: 'Frieren', romaji: null },
      coverImage: { medium: 'poster.jpg', large: 'poster.jpg', extraLarge: 'poster.jpg' },
      description: 'A synopsis.',
      genres: [],
      tags: [],
    })
  })

  it('passes through a null poster', () => {
    const result = toAniListAnime({ id: 2, title: 'No Poster', posterUrl: null, synopsis: '' })
    expect(result.coverImage).toEqual({ medium: null, large: null, extraLarge: null })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/recommendations.test.ts`
Expected: FAIL, since `src/services/recommendations.ts` does not exist yet.

- [ ] **Step 3: Implement the service**

Create `src/services/recommendations.ts`:

```ts
import { apiRequest } from './api.ts'
import type { AniListAnime } from './anilist.ts'

interface CachedAnime {
  id: number
  title: string
  posterUrl: string | null
  synopsis: string
}

// The cached Anime row is flatter than AniListAnime (one title string, one
// posterUrl) than AnimeCard's expected nested title.{english,romaji} /
// coverImage.{medium,large,extraLarge} shape. This fills in that shape so
// AnimeCard can render a recommended anime with no changes to itself.
export function toAniListAnime(anime: CachedAnime): AniListAnime {
  return {
    id: anime.id,
    title: { english: anime.title, romaji: null },
    coverImage: { medium: anime.posterUrl, large: anime.posterUrl, extraLarge: anime.posterUrl },
    description: anime.synopsis,
    genres: [],
    tags: [],
  }
}

export async function getForYouRecommendations(): Promise<AniListAnime[]> {
  const { recommendations } = await apiRequest<{ recommendations: CachedAnime[] }>('/recommendations/for-you', {
    auth: true,
  })
  return recommendations.map(toAniListAnime)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/recommendations.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Swap the "For You" section's data source**

In `src/pages/Recommendations.tsx`, remove `fetchAnimeByGenres` from the `anilist.ts` import and add the new service import:

```tsx
import { getPreferences } from '../services/preferences.ts'
import { getForYouRecommendations } from '../services/recommendations.ts'
import {
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  type AniListAnime,
} from '../services/anilist.ts'
```

Then change the `byGenre` line inside the `useEffect`'s `getPreferences().then((prefs) => { ... })` block:

```tsx
        load('For You', () => getForYouRecommendations(), setByGenre)
```

(replacing `load('For You', () => fetchAnimeByGenres(prefs.genres, prefs.showAdultContent), setByGenre)`. The other three `load(...)` calls, and everything else in the file, are unchanged.)

- [ ] **Step 6: Delete the now-dead `fetchAnimeByGenres`**

In `src/services/anilist.ts`, remove the `fetchAnimeByGenres` function entirely:

```ts
export async function fetchAnimeByGenres(
  genres: string[],
  showAdultContent = false,
): Promise<AniListAnime[]> {
  return fetchMediaList({
    page: 1,
    perPage: 12,
    genre_in: genres,
    sort: ['POPULARITY_DESC'],
    ...adultContentFilter(showAdultContent),
  })
}
```

The comment immediately above `fetchTrendingNow` references it — update that comment to drop the now-gone contrast point:

```ts
// Cached: this is the same data for every user at a given moment, unlike
// fetchRandomRecommendations (meant to vary), so repeat navigation within
// CACHE_TTL_MS costs zero AniList requests.
export async function fetchTrendingNow(showAdultContent = false): Promise<AniListAnime[]> {
```

- [ ] **Step 7: Delete its test**

In `src/services/anilist.test.ts`, remove `fetchAnimeByGenres` from the import list at the top of the file, and delete this whole block:

```ts
describe('fetchAnimeByGenres', () => {
  it('sends the requested genres and returns the media list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAnimeByGenres(['Action', 'Comedy'])

    expect(result).toEqual([{ id: 1 }])
    expect(lastRequestVariables(fetchMock).genre_in).toEqual(['Action', 'Comedy'])
  })
})
```

- [ ] **Step 8: Run the full frontend test suite, typecheck, lint, and build**

Run: `npx vitest run && npm run build && npm run lint`
Expected: no errors, no failing tests

- [ ] **Step 9: Confirm no visual regression**

Run `npm run test:e2e:update` (per `CLAUDE.md`'s UI Change Workflow — `Recommendations.tsx`'s markup itself is unchanged, only its data source, so this is expected to produce a no-op diff, but confirm rather than assume). If it reports no changes, nothing further is needed; if it does report a diff, use the `ui-change-workflow` skill's full sequence instead of committing an unexplained baseline change.

- [ ] **Step 10: Commit**

```bash
git add src/services/recommendations.ts src/services/recommendations.test.ts src/pages/Recommendations.tsx src/services/anilist.ts src/services/anilist.test.ts
git commit -m "Power the For You section from the new recommendation endpoint"
```

---

### Task 5: E2E coverage and CLAUDE.md documentation

**Files:**
- Modify: `e2e/recommendations.spec.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the running app's existing `/signup`, `/login`, `/discover`, `/recommendations` routes (black-box browser test)

- [ ] **Step 1: Strengthen the existing Recommendations E2E test**

In `e2e/recommendations.spec.ts`, add one assertion after the existing image check. `AnimeSection` (shared by all four sections on this page) renders the exact fallback text `'Failed to load this section.'` only when its fetch throws — asserting it's absent proves the For You section isn't erroring, without depending on unrelated specs' run order to guarantee it has specific recommended content (see the note below):

```ts
  await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trending Now' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'New Releases' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Random Recommendations' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Failed to load this section.')).toHaveCount(0)
```

Note on scope: a stronger assertion ("For You shows this specific recommended title") isn't attempted here, because `Anime` is a shared cache table across every spec in the suite — whether this test's single swipe produces a non-empty candidate pool depends on what other specs have already cached, which isn't a deterministic thing to assert on. That correctness question is already covered deterministically by Task 3's Vitest integration test, which seeds its own controlled data. This E2E addition's job is only to prove the wiring doesn't error in a real browser against the real backend.

- [ ] **Step 2: Run the E2E suite**

Precondition: backend running (`docker compose up`, in `anime-verse-backend/`).

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 3: Document the isAdult write-once trust model and the recommendation scope gap in CLAUDE.md**

In `CLAUDE.md`'s "Known quirks worth checking before assuming behavior" section, add:

```markdown
- `GET /recommendations/for-you` computes a user's taste vector fresh from their `Swipe` rows on every request — there's no stored per-user vector and no cache, so a swipe's effect on recommendations is immediate. It only excludes anime the caller has personally swiped; a title they've only watchlisted (not swiped) can still be recommended, since `WatchlistItem` isn't FK'd to `Anime` yet.
- `Anime.isAdult`, like the rest of the cached row, is client-supplied and write-once (set by whichever swipe first caches that anime, never corrected afterward). A client that misreports it stays wrong for that anime's lifetime in the cache — same accepted trust model as `title`/`synopsis`/`tags`.
```

- [ ] **Step 4: Commit**

```bash
git add e2e/recommendations.spec.ts CLAUDE.md
git commit -m "Add For You E2E coverage and document the recommendation engine's known gaps"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-10-recommendation-engine-design.md` maps to a task — the `isAdult` gap (Task 1), `lib/tasteVector.ts` (Task 2), the endpoint (Task 3), the frontend swap + adapter (Task 4), testing + docs (Task 5).
- **Deviation from the design spec, documented:** the design spec didn't mention deleting `fetchAnimeByGenres`; this plan does, in Task 4, because swapping its only caller makes it dead code (confirmed by grep before writing this plan) and leaving an orphaned, still-exported function around isn't something a future reader should have to rediscover is unused.
- **Type consistency:** `AnimeCacheInput` (Task 1) gains `isAdult` once and is used consistently in Task 1's own test and Task 3's test helper. `SwipedAnime`/`computeTasteVector` (Task 2) are defined once and consumed by name (`SwipedAnime['action']`) in Task 3's `SwipedVectorRow`. `CachedAnime`/`toAniListAnime`/`getForYouRecommendations` (Task 4) are defined once and not referenced elsewhere.
- **No placeholders:** every step has real, complete code — no "add error handling" or "similar to Task N" placeholders. `RECOMMENDATION_LIMIT = 12` matches the design spec's `LIMIT 12`.
- **Edge case, not a bug:** if a user reaches `GET /recommendations/for-you` with zero swipes (bypassing the frontend's mandatory onboarding gate via a direct API call), `computeTasteVector` returns `null` and the endpoint responds `{ recommendations: [] }` — the same "Nothing to show here yet." empty state `Recommendations.tsx` already renders for any empty section, with no new UI needed.
