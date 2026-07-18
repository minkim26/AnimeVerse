# AnimeVerse Resume Redesign

## Overview

AnimeVerse's current app is functionally complete but has no hook: a generic hero/feature-grid homepage and a Recommendations page that's just four fixed Kitsu-driven lists filtered by a checkbox-based genre preference. This redesign gives it a distinctive visual identity and three reinforcing technical features that make it a stronger CS resume piece: a real recommendation engine built on taste-vector embeddings and Postgres vector search, a hand-rolled dimensionality-reduction visualization, and a WebSocket-driven real-time layer — without inventing a MyAnimeList/Kitsu clone.

## Goals

- Replace the generic homepage/Recommendations UI with a distinctive **Bento Editorial** visual identity.
- Give users a fun, low-friction way to generate taste signal (swipe deck), and a serious way to track/rate anime (watchlist + reviews) — both feeding a real recommendation engine.
- Build recommendations from actual taste-vector similarity (pgvector cosine search) instead of a flat genre filter.
- Visualize a user's taste as an interactive 2D map via hand-rolled PCA.
- Add a real-time layer (WebSocket activity feed + presence) reusing the project's existing async-processing pattern (RabbitMQ consumer today; WS server here).
- Preserve traditional browse/search/filter (genre, rating, popularity, newest, random, title search) as a first-class, always-available surface — the ML recommendation is additive, not a replacement for manual discovery.
- Migrate the anime data source from Kitsu to AniList, since AniList's weighted tags (`rank: 0-100`) are what make taste vectors meaningful.

## Non-Goals

- No social graph (no followers/friends). The activity feed is global and public.
- No persisted activity-feed history beyond an in-memory ring buffer (last 50 events) — acceptable loss on server restart for a demo feature.
- No mobile app / responsive-only is sufficient (existing breakpoints apply).
- No changes to the auth system (self-issued JWT stays as-is).
- No changes to the avatar upload pipeline (RabbitMQ/Supabase), which stays as the existing async-processing example.
- No cold-start fallback logic for "For You" — swipe onboarding is mandatory at signup, so every user has taste signal before they can reach the Explore page.

## Visual Direction: Bento Editorial

Warm cream (`oklch` neutral, not pure white) background, bold serif/display magazine-style headline type, asymmetric bento-grid card layouts, saturated pastel accent colors (peach, mint, butter-yellow) against occasional high-contrast dark cards for hero moments. Replaces the current default-Tailwind look across all pages. Design tokens (colors, type scale, spacing, radii) get defined once in `src/styles/tokens.css` and consumed everywhere — no repeated hardcoded values.

## Feature Breakdown

### 1. Discover (swipe deck)

- Tinder-style card stack: swipe right = like, left = skip, up = love (or equivalent buttons for accessibility/non-touch).
- **Mandatory onboarding step** immediately after signup — ~15-20 cards — before a user can reach Explore. Replaces the current genre-checkbox Preferences page entirely.
- Also a **persistent nav tab** ("Discover") users can return to anytime for more signal or just for fun.
- Each swipe writes a `Swipe` row and feeds the user's taste vector; `love`/`like` swipes also publish an activity-feed event.

### 2. Explore (For You + Browse & Search)

Replaces `Recommendations.tsx`. Two independent sections on one page:

- **For You** (top row): purely vector-based recommendations from `GET /recommendations/for-you`. Unfiltered by genre or any other manual control — driven only by the user's computed taste vector. This is the ML showcase section.
- **Browse & Search** (below): genre multi-select filter chips, sort control (Popularity / Highest Rated / Newest / Shuffle-random), and a text search box. Backed live by AniList's GraphQL filter/sort/search params — no caching needed since it's read-only catalog browsing, not personalization. Defaults to Popularity sort so it shows trending content with zero clicks (replacing the old fixed Trending Now / New Releases / Random rows with one flexible, user-controlled grid).

### 3. Taste Map

- Interactive 2D scatter plot: each point is an anime (from the user's swiped/watchlisted/rated set plus a representative sample of cached anime), positioned by hand-rolled PCA projecting the tag-weight vectors to (x, y).
- The user's own taste vector is projected and plotted too, so they can see where their taste sits relative to clusters.
- `GET /taste-map/me` returns `{ points: [{ animeId, title, x, y }], user: { x, y } }`.

### 4. My List (watchlist + reviews)

- First frontend surface for the existing (currently unused) `WatchlistItem`/`Review` backend models.
- Add-to-watchlist action with a status (`PLAN_TO_WATCH` / `WATCHING` / `COMPLETED` / `DROPPED`), plus an optional 1-5 star rating + written review once status is `COMPLETED`.
- This is the explicit-signal half of the taste vector (swipes are implicit).

### 5. Live Activity Feed + Presence

- Global, public feed: "142 people just added Frieren to their watchlist," "X just rated Attack on Titan 5 stars." Fed by swipe (like/love only — skips aren't broadcast), watchlist, and review writes.
- Presence counter: number of currently-connected WebSocket clients ("87 users online now"). Simplest possible presence — connection count, not unique-user tracking.
- No history persistence: server keeps an in-memory ring buffer of the last 50 events, sent to a client on connect so the feed isn't empty on load. Lost on server restart.
<!-- ponytail: in-memory ring buffer, not persisted — add a DB-backed feed table if activity history needs to survive restarts -->

## Data Model Changes

```prisma
// REMOVED entirely
model Preference { ... }

// NEW — cache-aside populated whenever a user's swipe/watchlist/review
// references an anime not yet cached. No separate sync job.
model Anime {
    id          Int             @id // AniList media id
    title       String
    posterUrl   String?
    synopsis    String?
    tags        Json            // [{ name, rank }] from AniList, as fetched
    tasteVector Unsupported("vector(150)")
    updatedAt   DateTime        @updatedAt

    watchlist   WatchlistItem[]
    reviews     Review[]
    swipes      Swipe[]
}

// NEW
enum SwipeAction {
    SKIP
    LIKE
    LOVE
}

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

// CHANGED — animeId becomes Int + FK to Anime; status field added
enum WatchStatus {
    PLAN_TO_WATCH
    WATCHING
    COMPLETED
    DROPPED
}

model WatchlistItem {
    id      Int         @id @default(autoincrement())
    userId  Int
    user    User        @relation(fields: [userId], references: [id], onDelete: Cascade)
    animeId Int
    anime   Anime       @relation(fields: [animeId], references: [id])
    status  WatchStatus @default(PLAN_TO_WATCH)
    addedAt DateTime    @default(now())

    @@unique([userId, animeId])
}

// CHANGED — animeId becomes Int + FK to Anime
model Review {
    id         Int    @id @default(autoincrement())
    userId     Int
    user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
    animeId    Int
    anime      Anime  @relation(fields: [animeId], references: [id])
    rating     Int
    reviewText String
    createdAt  DateTime @default(now())

    @@unique([userId, animeId])
}
```

`Quote` and `Title` models are untouched. The vector dimension (150) is provisional — finalized during implementation based on how many distinct AniList tags appear across the cached catalog; the design is a fixed-size vector over the N most-used tags, weighted by `rank / 100`.

Since `WatchlistItem`/`Review` have zero real user data today (no frontend ever wrote to them), changing `animeId` from `String` to `Int` + FK is a clean cutover, not a data migration.

## Backend Architecture

- **`lib/anilist.ts`** — GraphQL client (media search/filter/sort, tag data). Replaces the role of `src/services/kitsu.ts` project-wide.
- **`lib/animeCache.ts`** — `upsertAnime(anilistId)`: fetch from AniList if not already cached (or stale), compute its tag vector, upsert into `Anime`. Called by the swipe/watchlist/review write paths before they reference an `animeId`.
- **`lib/tasteVector.ts`** — computes a user's taste vector as a weighted average of their swiped/watchlisted/rated anime vectors (e.g. `LOVE > LIKE > COMPLETED+5★ > COMPLETED+3★(~neutral) > SKIP/COMPLETED+1★` as negative weight). Pure function, easily unit-testable.
- **`lib/pca.ts`** — hand-rolled PCA: center vectors, compute covariance matrix, power-iteration for the top-2 eigenvectors, project. No new dependency.
- **`api/recommendations.ts`** — `GET /recommendations/for-you`: computes the caller's taste vector, runs `ORDER BY "tasteVector" <=> $1 LIMIT 12` against `Anime` (via Prisma's raw query support, since `pgvector` distance operators aren't part of Prisma's query builder), excluding anime the user already swiped/watchlisted.
- **`api/taste-map.ts`** — `GET /taste-map/me`: PCA-projects the user's vector plus a sample of cached `Anime` vectors.
- **`api/swipes.ts`** — `POST /swipes` (upsert on `[userId, animeId]`), calls `animeCache.upsertAnime` first, then triggers taste-vector recompute (or computes on-demand at read time — see Open Questions) and an activity-feed broadcast for like/love.
- **`lib/activityFeed.ts`** — `ws` server attached to the existing HTTP server (`server.ts`), no new port/service. Broadcasts JSON events, tracks connection count for presence, keeps the 50-event ring buffer.
- **`api/watchlist.ts`, `api/reviews.ts`** — extended (status field, FK to `Anime`) rather than rewritten; existing ownership/auth checks are reused.

## Frontend Architecture

- **`src/services/anilist.ts`** replaces `src/services/kitsu.ts` — GraphQL client for browse/search/trending-as-default-sort and poster/synopsis display.
- **`src/pages/Discover.tsx`** — swipe deck (new).
- **`src/pages/Explore.tsx`** — replaces `Recommendations.tsx`; For You + Browse & Search.
- **`src/pages/TasteMap.tsx`** — new, renders the PCA scatter plot (likely a lightweight canvas/SVG render, no new charting dependency needed for a scatter plot).
- **`src/pages/MyList.tsx`** — new, watchlist + review management UI.
- **`src/hooks/useActivityFeed.ts`** — wraps the WebSocket connection, exposes recent events + presence count.
- **Removed:** `src/pages/Preferences.tsx`, `src/services/preferences.ts`, `src/services/kitsu.ts`.
- **Nav update:** Home | Discover | Explore | My List | Taste Map | Profile.

## Testing Approach

Per project convention (TDD, meaningful coverage over 100%-for-its-own-sake): the logic-heavy new pieces get real test coverage since they're exactly the kind of code that fails silently if wrong —

- **Unit:** `lib/tasteVector.ts` (weighting math), `lib/pca.ts` (known-input → known-output projection), cosine-distance query construction.
- **Integration:** `POST /swipes` → `GET /recommendations/for-you` round-trip (swipe an anime, assert it influences the returned order); `api/watchlist.ts`/`api/reviews.ts` status + rating flows.
- **E2E (Playwright):** signup → swipe onboarding → Explore page shows For You results; Browse & Search filter/sort/search interactions; watchlist add → My List shows it.
- Visual regression screenshots (per web testing rules) for the new Bento Editorial screens at 320/768/1024/1440.

## Open Questions (deferred to implementation planning)

- Exact taste-vector recompute trigger: on every write (simplest, always-fresh) vs. lazily at read-time in `/recommendations/for-you` (avoids recomputing on every single swipe if a user swipes rapidly). Leaning lazy-at-read since it's simpler and the "For You" endpoint is the only consumer.
- Exact tag-vocabulary size (the "150" in `vector(150)`) — determined once real AniList tag-frequency data is seen during implementation.
