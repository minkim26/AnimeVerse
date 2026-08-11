# For You Recommendation Engine

## Overview

Roadmap plan #3 of the resume redesign (see `docs/superpowers/plans/2026-08-02-swipe-discover.md`). Plan #2 (merged) gave every user `Swipe` rows and a shared `Anime` cache table with a pgvector(335) `tasteVector` column. This plan consumes that: a `GET /recommendations/for-you` endpoint that computes a user's taste vector from their swipe history and returns the nearest cached anime by cosine distance, wired into the existing `Recommendations.tsx` page's "For You" section in place of its current genre-filtered AniList fetch.

## Goals

- Real taste-vector recommendations, replacing the flat genre filter in `Recommendations.tsx`'s "For You" section.
- No caching or recompute-trigger complexity: the taste vector is computed fresh on every request from `Swipe` rows.
- Close a content-safety gap found while building this: `Anime` has no `isAdult` flag, so a user with adult content disabled could otherwise be recommended adult anime by vector similarity.

## Non-Goals

- **Browse & Search** (plan #4) — the other half of the eventual Explore page. Out of scope here.
- **Renaming `Recommendations.tsx` to `Explore.tsx` / nav update** — deferred to plan #8 per the roadmap. This plan swaps the "For You" section's data source in place; Trending Now / New Releases / Random stay untouched.
- **Watchlist/review signal** — `WatchlistItem.animeId` is still a disconnected `String`, not yet FK'd to `Anime` (that migration is plan #5). Only `Swipe` rows feed the taste vector in this plan.
- **Recency decay** — not requested anywhere in the locked design; a straight weighted average is enough for a demo project.
- **Caching or rate-limiting the new endpoint** — its result changes with every swipe, so caching it would reintroduce the staleness problem the lazy-at-read design deliberately avoids. It's a read with no comparable write-amplification risk to `POST /swipes`, so no dedicated rate limiter either.

## Architecture

```
Discover swipes (LOVE/LIKE/SKIP) → Swipe table (per user, per anime)
                                          │
GET /recommendations/for-you ────────────┤
  1. Load caller's Swipe rows joined to each anime's cached tasteVector
  2. computeTasteVector(...) — weighted average, pure function
  3. pgvector cosine-distance query against Anime, excluding already-
     swiped ids and (unless the caller allows it) isAdult rows,
     ordered by distance, LIMIT 12
  4. Return flat anime rows (id, title, posterUrl, synopsis)
                                          │
Recommendations.tsx "For You" section ───┘ (swaps fetchAnimeByGenres → this)
```

The taste vector is never persisted — no `User.tasteVector` column, no recompute-on-write trigger. A swipe takes effect on the very next "For You" load with nothing to invalidate.

## The `isAdult` gap

`Anime` currently has no `isAdult` column, and `POST /swipes` never captures it even though `AniListAnime.isAdult` is already available client-side when a swipe is submitted (`services/swipes.ts` just doesn't forward it). Without it, the recommendation candidate pool can't be filtered, so a user with `Preference.showAdultContent = false` could still receive an adult anime recommendation if it happens to be vector-similar to their taste. Fixed as part of this plan by threading the flag through end to end (see Data Model Changes and Backend Architecture below).

## Data Model Changes

```prisma
model Anime {
    id          Int      @id
    title       String
    posterUrl   String?
    synopsis    String
    tags        Json
    tasteVector Unsupported("vector(335)")?
    isAdult     Boolean  @default(false)   // NEW
    updatedAt   DateTime @updatedAt

    swipes Swipe[]
}
```

`isAdult` is written once on insert (same write-once semantics as the rest of the cached row — `upsertAnime`'s `ON CONFLICT (id) DO NOTHING`) via `upsertAnime`'s existing raw-SQL insert, one more column and one more bound parameter.

`lib/zod.ts`'s `Swipe` schema gains `anime.isAdult: z.boolean()`. `src/services/swipes.ts`'s `postSwipe` gains `isAdult: anime.isAdult ?? false` in the request body (the field already exists on `AniListAnime`, just wasn't forwarded).

## Backend Architecture

### `lib/tasteVector.ts` (new)

```ts
const SWIPE_WEIGHT: Record<SwipeAction, number> = { LOVE: 2, LIKE: 1, SKIP: -1 }

export function computeTasteVector(swipes: { action: SwipeAction; tasteVector: number[] }[]): number[] | null {
  if (swipes.length === 0) return null
  const sum = new Array(VECTOR_DIMENSION).fill(0)
  for (const { action, tasteVector } of swipes) {
    const weight = SWIPE_WEIGHT[action]
    tasteVector.forEach((v, i) => { sum[i] += weight * v })
  }
  return sum.map(v => v / swipes.length)
}
```

Pure function, unit-tested with known swipe combinations. `null` on zero swipes is a defensive boundary check (mandatory onboarding means this shouldn't happen in practice) — the endpoint treats it as "no recommendations yet" rather than risking a NaN vector. No normalization: pgvector's `<=>` cosine distance is scale-invariant, so the aggregate's magnitude doesn't affect result ordering.

### `GET /recommendations/for-you` (new `api/recommendations.ts`)

1. `requireAuth`.
2. Raw SQL to load the caller's swipes joined to their anime's cached vector, reusing the existing `"tasteVector"::text` read pattern from `animeCache.test.ts` (`JSON.parse` turns the pgvector text literal back into `number[]`):
   ```sql
   SELECT s.action, a."tasteVector"::text AS vector
   FROM "Swipe" s JOIN "Anime" a ON a.id = s."animeId"
   WHERE s."userId" = $1
   ```
3. `computeTasteVector(...)`. If `null`, respond `{ recommendations: [] }` immediately.
4. Look up the caller's `showAdultContent` via `prisma.preference.findUnique` (plain PK lookup, no new caching layer).
5. Recommendation query, excluding already-swiped ids and adult rows unless allowed:
   ```sql
   SELECT id, title, "posterUrl", synopsis
   FROM "Anime"
   WHERE id NOT IN (SELECT "animeId" FROM "Swipe" WHERE "userId" = $1)
     AND ("isAdult" = false OR $2 = true)
   ORDER BY "tasteVector" <=> $3::vector
   LIMIT 12
   ```
6. Respond `{ recommendations: [{ id, title, posterUrl, synopsis }] }`.

Mounted in `api/index.ts` alongside the other routers, same pattern as `swipes.ts`.

## Frontend Architecture

**`src/services/recommendations.ts`** (new):

```ts
interface CachedAnime {
  id: number
  title: string
  posterUrl: string | null
  synopsis: string
}

export async function getForYouRecommendations(): Promise<AniListAnime[]> {
  const { recommendations } = await apiRequest<{ recommendations: CachedAnime[] }>('/recommendations/for-you', { auth: true })
  return recommendations.map(toAniListAnime)
}
```

The cached `Anime` row is flatter than `AniListAnime` (one `title` string and one `posterUrl`, vs. `AnimeCard`'s expected nested `title.{english,romaji}` / `coverImage.{medium,large,extraLarge}` shape). Rather than touching `AnimeCard` — a shared component used across the app, where a shape change risks a visual-regression re-baseline for zero visual difference — a small adapter fills in the shape:

```ts
function toAniListAnime(a: CachedAnime): AniListAnime {
  return {
    id: a.id,
    title: { english: a.title, romaji: null },
    coverImage: { medium: a.posterUrl, large: a.posterUrl, extraLarge: a.posterUrl },
    description: a.synopsis,
    genres: [],
    tags: [],
  }
}
```

**`Recommendations.tsx`:** the `byGenre` section's fetcher changes from `fetchAnimeByGenres(prefs.genres, prefs.showAdultContent)` to `getForYouRecommendations()`. The other three sections (Trending Now, New Releases, Random) are untouched and keep using `getPreferences()` for their own adult-content filtering. The existing "Nothing to show here yet." empty state already covers the zero-swipes case with no new UI.

## Testing Approach

- **Unit:** `lib/tasteVector.ts` — known swipe combinations → known weighted-average output; zero swipes → `null`.
- **Integration:** `POST /swipes` → `GET /recommendations/for-you` round-trip against real Postgres — swipe LOVE on an anime, confirm it's excluded from results and influences ordering of the rest; confirm an `isAdult` anime is excluded by default and included when `showAdultContent` is true.
- **E2E:** extend the existing swipe/onboarding Playwright coverage to assert the For You section renders results after swiping instead of erroring.
- **Visual regression:** `Recommendations.tsx`'s markup doesn't change, only its data source, so this shouldn't move any snapshot pixels — still run the `ui-change-workflow` skill's check step to confirm rather than assume, per its own guidance.
