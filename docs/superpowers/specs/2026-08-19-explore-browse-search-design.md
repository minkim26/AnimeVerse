# Explore Browse & Search

## Overview

Roadmap plan #4 of the resume redesign (see `docs/superpowers/plans/2026-07-17-anilist-foundation.md` and the locked design at `docs/superpowers/specs/2026-07-17-resume-redesign-design.md`). Plan #3 (merged) gave `Recommendations.tsx` a real "For You" section driven by taste-vector similarity. This plan builds the other half the locked spec calls for: a manual discovery surface (genre filter, sort, and title search against AniList directly), and finishes the page's rename to Explore that plan #3 deferred.

## Goals

- `Recommendations.tsx` renames to `Explore.tsx`; route moves from `/recommendations` to `/explore`.
- New Browse & Search section replaces the old fixed Trending Now / New Releases / Random rows with one filterable, user-controlled grid: genre chips, a sort control (Popularity / Highest Rated / Newest / Shuffle), and a text search box.
- For You stays exactly as plan #3 left it: unfiltered, vector-only, untouched by this plan's filters.

## Non-Goals

- **My List, Taste Map, activity feed** (plans #5-7): unrelated surfaces, out of scope.
- **Removing `Preference`/`Preferences.tsx`** (plan #8): `showAdultContent` still gates this page's AniList queries the same way it does today; the saved `Preference.genres` field stays inert and untouched. Browse & Search's genre chips are transient UI state, not a write path to `Preference`.
- **Backend changes:** this plan is entirely frontend. AniList is queried client-side exactly as `Recommendations.tsx` already does for its non-For-You rows.
- **URL-synced filter state:** genre/sort/search live in component state only, not the query string. No existing page in the app persists filter state to the URL, so adding it here would be new surface area the design never asked for.

## Architecture

```
Explore.tsx
  ├─ For You section (unchanged from plan #3: getForYouRecommendations())
  └─ Browse & Search section (new)
        │ user picks genres / sort / search text
        ▼
     debounce 400ms ─→ fetchBrowseAnime({ page: 1, genres, sort, search, showAdultContent })
        │                     │
        │              anilist.ts: extended MEDIA_LIST_QUERY (+ $search, + pageInfo.hasNextPage)
        │                     │
        │              mediaListCache, keyed on serialized browse variables
        ▼
     results grid (AnimeCard) + Load More (dedupe-by-id, appends next page)
```

## Frontend Architecture

### `src/services/anilist.ts`

- `MEDIA_LIST_QUERY` gains `$search: String` (passed through to `media(search: $search, ...)`) and requests `pageInfo { hasNextPage }` on the `Page` block.
- `fetchMediaList` returns `{ media: AniListAnime[], hasNextPage: boolean }` instead of a bare array. Its two existing internal callers (`fetchRandomPool`, feeding `fetchRandomAnime` for `Profile.tsx` and `fetchDiscoverPool` for `Discover.tsx`) destructure `.media` and ignore `hasNextPage`, since neither paginates.
- New:
  ```ts
  export const BROWSE_SORTS = {
    Popularity: 'POPULARITY_DESC',
    'Highest Rated': 'SCORE_DESC',
    Newest: 'START_DATE_DESC',
    Shuffle: 'SHUFFLE',
  } as const

  export const BROWSE_GENRES = [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror',
    'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
  ] as const

  export async function fetchBrowseAnime(opts: {
    page: number
    genres: string[]
    sort: string
    search: string
    showAdultContent: boolean
  }): Promise<{ anime: AniListAnime[]; hasNextPage: boolean }>
  ```
  `SHUFFLE` isn't a real `MediaSort` value. `fetchBrowseAnime` maps it to `sort: ['POPULARITY_DESC'], page: randomPage()` (reusing the existing `randomPage()` helper) instead of the caller's `page`, so every Shuffle fetch (including "Load More") samples a fresh random page rather than paginating sequentially.
  For non-Shuffle sorts, results are cached via `cachedFetchMediaList`, keyed on `browse:${JSON.stringify({ page, genres, sort, search, showAdultContent })}`. This is the same 5-minute TTL cache the old Trending Now/New Releases rows used, repointed rather than removed. AniList's 30 req/min cap is tighter here than it ever was for the old fixed rows, since toggling a genre chip or flipping sort re-issues a request. Shuffle bypasses the cache, since each call wants a fresh sample, not a repeat.
  Genre filtering reuses the AniList `genre_in` variable already wired into `MEDIA_LIST_QUERY`. `showAdultContent = false` layers in `adultContentFilter`'s existing `isAdult: false, genre_not_in: ['Ecchi']`, so Explore.tsx additionally excludes `'Ecchi'` from the chip list it renders in that state. Otherwise a user could select a genre that the adult filter silently cancels out into an empty grid.
- Removed: `fetchTrendingNow`, `fetchNewReleases`, `fetchRandomRecommendations`, and their tests, dead once the fixed rows they powered are gone. `fetchRandomAnime` and `fetchDiscoverPool` stay (used by `Profile.tsx` and `Discover.tsx` respectively).

### `src/pages/Explore.tsx` (renamed from `Recommendations.tsx`)

- For You section: unchanged markup and data source from plan #3.
- Browse & Search section, new local state: `selectedGenres: string[]`, `sort` (defaults to Popularity), `searchText`, accumulated `results: AniListAnime[]`, `page`, `hasNextPage`.
- A single `useEffect` debounces on `[selectedGenres, sort, searchText, showAdultContent]` (400ms `setTimeout`, cleared on re-trigger). Any filter change resets `page` to 1, clears `results`, and re-fetches. No dedicated debounce hook: this is the only caller in the codebase, and the repo has no existing debounce utility to reuse.
- "Load More" fetches `page + 1` (or a fresh random page for Shuffle), appends results with duplicate ids filtered out. Shuffle re-rolling a page can repeat a title already on screen, and a duplicate id as a React `key` would trip `e2e/console-errors.spec.ts`'s console-error assertion.
- Button is hidden once `!hasNextPage` (always visible under Shuffle, which has no concept of running out of pages) and disabled mid-fetch.
- Empty state ("No anime matched your filters") renders only after a completed fetch with zero results, not during the initial load.
- Genre chips: multi-select toggle buttons over `BROWSE_GENRES` (minus `'Ecchi'` when `showAdultContent` is false), OR semantics via AniList's own `genre_in`.

### Rename blast radius

Confirmed via a full-repo grep for `/recommendations`, not assumed from the page name alone:

- `src/App.tsx`: route path
- `src/components/Navbar.tsx`: desktop and mobile nav links, label "Recommendations" changes to "Explore"
- `src/pages/Home.tsx`: two links
- `src/pages/Discover.tsx`: one link ("See your recommendations")
- `src/pages/Preferences.tsx:40`: `navigate('/recommendations')` after saving, changes to `/explore`
- `e2e/console-errors.spec.ts`, `e2e/discover.spec.ts`: update the two `page.goto('/recommendations')` calls each
- `e2e/recommendations.spec.ts`: renames to `e2e/explore.spec.ts`, its two `page.goto` calls update

No redirect shim from the old path: no production deployment exists yet, so there are no external bookmarks or indexed links to protect. `public/sitemap.xml` doesn't list authed routes today and needs no change. `src/services/recommendations.ts` (the `/recommendations/for-you` API client from plan #3) is untouched. It names a backend route, not this frontend page, and that backend route isn't part of this rename.

## Testing Approach

- **Unit (`anilist.test.ts`):** `fetchBrowseAnime`'s variable construction per sort (including the Shuffle → `POPULARITY_DESC` + `randomPage()` mapping), the Ecchi-exclusion-when-`showAdultContent`-false chip list, `fetchMediaList`'s new `{ media, hasNextPage }` return shape. Delete tests for the three removed fetchers.
- **E2E:** extend or replace `e2e/explore.spec.ts` (renamed from `recommendations.spec.ts`) to cover a genre-chip filter, a sort change, a search query, and Load More appending results without a duplicate-key console error. `discover.spec.ts` and `console-errors.spec.ts` updates are route-path-only, no new assertions needed.
- **Visual regression:** `Explore.tsx` itself isn't in `e2e/visual.spec.ts`'s baselined set (only the four public pages are). `Home.tsx` and `Navbar.tsx` are touched but only for link hrefs and a label string, with no structural change. Still run the `ui-change-workflow` skill's check step at the end per `CLAUDE.md`, to confirm rather than assume, matching plan #3's precedent for the same kind of low-risk copy change.
