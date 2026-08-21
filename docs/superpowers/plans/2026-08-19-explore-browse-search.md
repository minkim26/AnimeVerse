# Explore Browse & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `Recommendations.tsx` to `Explore.tsx` and add a "Browse & Search" section (genre chips, sort, text search against AniList directly) alongside the existing "For You" section, replacing the old fixed Trending Now / New Releases / Random rows.

**Architecture:** Entirely frontend. `src/services/anilist.ts` gains `fetchBrowseAnime`, a paginated AniList query builder with a debounce-friendly cache keyed on the full filter combination. `Explore.tsx` (renamed from `Recommendations.tsx`) keeps its unchanged "For You" section and adds a new `BrowseSearch` component managing its own genre/sort/search/pagination state. Every internal link pointing at `/recommendations` moves to `/explore`.

**Tech Stack:** Same as the rest of the app (React 19, Vite, TypeScript, Vitest, Playwright). No new npm dependency: no debounce library (a plain `useEffect` + `setTimeout` covers the one call site), no new icon beyond `lucide-react`'s existing `Search`, which the package already ships.

**Spec:** `docs/superpowers/specs/2026-08-19-explore-browse-search-design.md`

## Roadmap (this plan is #4 of several)

1. AniList migration: done (merged)
2. Swipe deck & Discover: done (merged)
3. Recommendation engine (`GET /recommendations/for-you`): done (merged)
4. **This plan**: Explore page "Browse & Search" (genre/sort/search against AniList directly), `Recommendations.tsx` renamed to `Explore.tsx`, nav updated
5. Watchlist/Reviews frontend ("My List"): `WatchStatus` field, FK migration to `Anime`
6. Taste Map (hand-rolled PCA) page
7. Live activity feed + presence (WebSocket)
8. Remove `Preference` model/page; `showAdultContent` needs a new home first

## Scope Notes

- **No backend changes.** AniList is queried client-side exactly as `Recommendations.tsx` already does for its non-For-You rows. `GET /recommendations/for-you` (plan #3) is untouched.
- **`fetchTrendingNow`, `fetchNewReleases`, `fetchRandomRecommendations` are deleted**, along with their tests. They're the only callers of the fixed rows this plan replaces (confirmed by grep before writing this plan); `fetchRandomAnime` (used by `Profile.tsx`) and `fetchDiscoverPool` (used by `Discover.tsx`) are untouched.
- **No URL-synced filter state.** Genre/sort/search live in component state only, matching the rest of the app (no existing page persists filter state to the URL).
- **No `Preference`/`Preferences.tsx` removal.** `showAdultContent` still gates this page's queries exactly as it does today; that model's removal is plan #8, unscheduled, and needs `showAdultContent` to get a new home first.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **AniList's 30 req/min cap governs the design.** Browse & Search's cache (repointed from the old `mediaListCache`, not a new mechanism) and its 400ms debounce on every filter change (genre, sort, or search, not just typing) both exist specifically so that toggling a chip or flipping sort doesn't burn requests faster than the fixed rows it replaces ever did.
- **`SHUFFLE` is not a real AniList `MediaSort` value.** It's this app's own sentinel, mapped to `POPULARITY_DESC` + a random page before any request reaches AniList, and it bypasses the cache entirely (a repeated call should sample again, not repeat).
- **The `Anime` cached rows are unrelated to this plan's AniList queries.** `Anime` (pgvector table, plan #2/#3) only holds anime a user has swiped on; Browse & Search never reads or writes it, and queries AniList's live catalog directly, same as the rows it replaces did.
- **No component tests.** This repo has zero `.test.tsx` files. All Vitest coverage is for services and hooks, not React components (confirmed by search before writing this plan). Follow that convention: `BrowseSearch`'s correctness is covered by `anilist.test.ts` (the data layer) and Playwright E2E (Task 3), not a new component-testing setup.
- **Commit messages:** plain, one line, no conventional-commit prefixes, no AI attribution. Prefer several small commits over one large one, since these get squashed on merge; commit after each step group rather than batching a whole task into one commit.

---

### Task 1: `anilist.ts`: `fetchBrowseAnime`, and retire the fixed-row fetchers

**Files:**
- Modify: `src/services/anilist.ts`
- Modify: `src/services/anilist.test.ts`

**Interfaces:**
- Produces: `export const BROWSE_SORTS: { Popularity: 'POPULARITY_DESC'; 'Highest Rated': 'SCORE_DESC'; Newest: 'START_DATE_DESC'; Shuffle: 'SHUFFLE' }`, `export type BrowseSortLabel = keyof typeof BROWSE_SORTS`, `export const BROWSE_GENRES: readonly string[]` (18 AniList genres, including `'Ecchi'`), `export interface BrowseAnimeOptions { page: number; genres: string[]; sort: BrowseSortLabel; search: string; showAdultContent: boolean }`, `export async function fetchBrowseAnime(opts: BrowseAnimeOptions): Promise<{ anime: AniListAnime[]; hasNextPage: boolean }>`
- Removes: `fetchTrendingNow`, `fetchNewReleases`, `fetchRandomRecommendations` (no longer exported)

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/services/anilist.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  animeTitle,
  animeSynopsis,
  fetchBrowseAnime,
  fetchRandomAnime,
  fetchDiscoverPool,
  clearMediaListCache,
  type AniListAnime,
} from './anilist.ts'

// fetchBrowseAnime's non-Shuffle results are cached; without this, whichever
// test runs first would populate the cache and every later test would
// silently get its result back instead of hitting the mocked fetch.
beforeEach(() => {
  clearMediaListCache()
})

function makeAnime(overrides: Partial<AniListAnime> = {}): AniListAnime {
  return {
    id: 1,
    title: { english: 'Test Anime', romaji: 'Tesuto Anime' },
    coverImage: { medium: null, large: null, extraLarge: null },
    description: null,
    genres: [],
    tags: [],
    ...overrides,
  }
}

describe('animeTitle', () => {
  it('prefers the English title when present', () => {
    expect(animeTitle(makeAnime())).toBe('Test Anime')
  })

  it('falls back to the romaji title when English is null', () => {
    expect(animeTitle(makeAnime({ title: { english: null, romaji: 'Tesuto Anime' } }))).toBe('Tesuto Anime')
  })

  it('falls back to "Untitled" when both titles are null', () => {
    expect(animeTitle(makeAnime({ title: { english: null, romaji: null } }))).toBe('Untitled')
  })
})

describe('animeSynopsis', () => {
  it('strips AniList HTML tags despite asHtml: false', () => {
    const html =
      'The fourth season of <i>Tensei Shitara Slime Datta Ken</i>.<br><br>\nDemon Lord Rimuru...'
    expect(animeSynopsis(makeAnime({ description: html }))).toBe(
      'The fourth season of Tensei Shitara Slime Datta Ken. Demon Lord Rimuru...',
    )
  })

  it('returns an empty string when description is null', () => {
    expect(animeSynopsis(makeAnime({ description: null }))).toBe('')
  })
})

function mockAniListResponse(media: unknown[], hasNextPage = false): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { Page: { pageInfo: { hasNextPage }, media } } }),
  } as Response
}

function lastRequestVariables(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, options] = fetchMock.mock.calls[0] as [string, { body: string }]
  return JSON.parse(options.body).variables
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchMediaList failure modes', () => {
  it('names the rate limit and retry delay on a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: (h: string) => (h === 'Retry-After' ? '47' : null) },
        json: async () => ({}),
      } as unknown as Response),
    )

    await expect(fetchDiscoverPool()).rejects.toThrow(
      'AniList rate limit reached (30 requests/minute) — retry in 47s.',
    )
  })

  it('surfaces a GraphQL error returned with HTTP 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: null, errors: [{ message: 'Invalid sort value' }] }),
      } as unknown as Response),
    )

    await expect(fetchDiscoverPool()).rejects.toThrow('AniList rejected the query: Invalid sort value')
  })

  it('reports the HTTP status for other non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: () => null },
        json: async () => ({}),
      } as unknown as Response),
    )

    await expect(fetchDiscoverPool()).rejects.toThrow('AniList request failed: HTTP 503')
  })

  it('rejects rather than throwing a TypeError on an unexpected shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as unknown as Response),
    )

    await expect(fetchDiscoverPool()).rejects.toThrow('AniList returned an unexpected response shape.')
  })
})

describe('fetchRandomAnime', () => {
  it('makes exactly one request and returns a single formatted anime', async () => {
    const pool = [
      {
        id: 1,
        title: { english: 'Test Anime', romaji: null },
        coverImage: { medium: 'med.jpg', large: 'large.jpg', extraLarge: 'xl.jpg' },
        description: 'A <b>test</b> synopsis.',
        genres: [],
        tags: [],
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRandomAnime()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      title: 'Test Anime',
      imageUrl: 'xl.jpg',
      description: 'A test synopsis.',
    })
  })

  it('falls back to a lower-resolution cover when extraLarge is missing', async () => {
    const pool = [
      {
        id: 2,
        title: { english: 'No XL Anime', romaji: null },
        coverImage: { medium: 'med.jpg', large: 'large.jpg', extraLarge: null },
        description: 'Synopsis.',
        genres: [],
        tags: [],
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRandomAnime()

    expect(result.imageUrl).toBe('large.jpg')
  })
})

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

describe('fetchBrowseAnime adult content filtering', () => {
  it('filters isAdult and the Ecchi genre by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: [], sort: 'Popularity', search: '', showAdultContent: false })

    const variables = lastRequestVariables(fetchMock)
    expect(variables.isAdult).toBe(false)
    expect(variables.genre_not_in).toEqual(['Ecchi'])
  })

  it('applies no adult-content filter when showAdultContent is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: [], sort: 'Popularity', search: '', showAdultContent: true })

    const variables = lastRequestVariables(fetchMock)
    expect(variables.isAdult).toBeUndefined()
    expect(variables.genre_not_in).toBeUndefined()
  })
})

describe('fetchBrowseAnime sorting', () => {
  it('maps each non-Shuffle sort label to its AniList MediaSort value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: [], sort: 'Highest Rated', search: '', showAdultContent: false })

    expect(lastRequestVariables(fetchMock).sort).toEqual(['SCORE_DESC'])
  })

  it('maps Shuffle to POPULARITY_DESC with a random page instead of the caller\'s page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: [], sort: 'Shuffle', search: '', showAdultContent: false })

    const variables = lastRequestVariables(fetchMock)
    expect(variables.sort).toEqual(['POPULARITY_DESC'])
    expect(variables.page).toBeGreaterThanOrEqual(1)
    expect(variables.page).toBeLessThanOrEqual(20)
  })
})

describe('fetchBrowseAnime genres and search', () => {
  it('forwards genres and trimmed search text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({
      page: 1,
      genres: ['Action', 'Comedy'],
      sort: 'Popularity',
      search: '  Frieren  ',
      showAdultContent: false,
    })

    const variables = lastRequestVariables(fetchMock)
    expect(variables.genre_in).toEqual(['Action', 'Comedy'])
    expect(variables.search).toBe('Frieren')
  })

  it('omits genre_in and search when neither is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: [], sort: 'Popularity', search: '   ', showAdultContent: false })

    const variables = lastRequestVariables(fetchMock)
    expect(variables.genre_in).toBeUndefined()
    expect(variables.search).toBeUndefined()
  })
})

describe('fetchBrowseAnime pagination', () => {
  it('returns hasNextPage and the page of results from the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }], true))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBrowseAnime({ page: 1, genres: [], sort: 'Popularity', search: '', showAdultContent: false })

    expect(result.hasNextPage).toBe(true)
    expect(result.anime).toHaveLength(1)
  })

  it('requests the given page for non-Shuffle sorts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 3, genres: [], sort: 'Newest', search: '', showAdultContent: false })

    expect(lastRequestVariables(fetchMock).page).toBe(3)
  })
})

describe('fetchBrowseAnime caching', () => {
  it('serves a repeated non-Shuffle query from cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)
    const opts = { page: 1, genres: ['Action'], sort: 'Popularity' as const, search: '', showAdultContent: false }

    await fetchBrowseAnime(opts)
    await fetchBrowseAnime(opts)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a changed genre selection as a new cache entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowseAnime({ page: 1, genres: ['Action'], sort: 'Popularity', search: '', showAdultContent: false })
    await fetchBrowseAnime({ page: 1, genres: ['Comedy'], sort: 'Popularity', search: '', showAdultContent: false })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never caches Shuffle results, even with identical options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const opts = { page: 1, genres: [], sort: 'Shuffle' as const, search: '', showAdultContent: false }

    await fetchBrowseAnime(opts)
    await fetchBrowseAnime(opts)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: FAIL (`fetchBrowseAnime` doesn't exist yet, a TypeScript error, and `mockAniListResponse`'s new `pageInfo` shape doesn't match the current `fetchMediaList` return type).

- [ ] **Step 3: Replace the full contents of `src/services/anilist.ts`**

```ts
export interface AniListAnime {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { medium: string | null; large: string | null; extraLarge: string | null }
  description: string | null
  genres: string[]
  tags: { name: string; rank: number }[]
  isAdult?: boolean
}

export function animeTitle(anime: AniListAnime): string {
  return anime.title.english ?? anime.title.romaji ?? 'Untitled'
}

export function animeSynopsis(anime: AniListAnime): string {
  if (!anime.description) return ''
  return anime.description
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ANILIST_API_URL = 'https://graphql.anilist.co'

const MEDIA_LIST_QUERY = `
  query (
    $page: Int
    $perPage: Int
    $genre_in: [String]
    $genre_not_in: [String]
    $isAdult: Boolean
    $sort: [MediaSort]
    $search: String
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      media(
        genre_in: $genre_in
        genre_not_in: $genre_not_in
        isAdult: $isAdult
        sort: $sort
        search: $search
        type: ANIME
      ) {
        id
        title { english romaji }
        coverImage { medium large extraLarge }
        description(asHtml: false)
        genres
        tags { name rank }
        isAdult
      }
    }
  }
`

interface MediaListVariables {
  page: number
  perPage: number
  genre_in?: string[]
  genre_not_in?: string[]
  isAdult?: boolean
  sort?: string[]
  search?: string
}

// AniList marks explicit/hentai titles isAdult: true, but "Ecchi" (fanservice,
// non-explicit) is a separate genre tag it does not cover, so both filters
// are needed to fully hide adult content. Confirmed against AniList's live
// schema and against real New Releases results before wiring this up.
function adultContentFilter(showAdultContent: boolean): Pick<MediaListVariables, 'isAdult' | 'genre_not_in'> {
  if (showAdultContent) return {}
  return { isAdult: false, genre_not_in: ['Ecchi'] }
}

interface MediaListResult {
  media: AniListAnime[]
  hasNextPage: boolean
}

async function fetchMediaList(variables: MediaListVariables): Promise<MediaListResult> {
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: MEDIA_LIST_QUERY, variables }),
  })

  // Called out separately from other non-2xx codes because it's the one
  // failure the user can act on (wait).
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new Error(
      `AniList rate limit reached (30 requests/minute)${retryAfter ? ` — retry in ${retryAfter}s` : ''}.`,
    )
  }
  if (!response.ok) {
    throw new Error(`AniList request failed: HTTP ${response.status}`)
  }

  // GraphQL reports query-level failures as a 200 with an `errors` array and
  // a null `data`, so this has to be checked separately from response.ok.
  const json = (await response.json()) as {
    data?: { Page?: { media?: AniListAnime[]; pageInfo?: { hasNextPage?: boolean } } }
    errors?: { message: string }[]
  }
  if (json.errors?.length) {
    throw new Error(`AniList rejected the query: ${json.errors[0]!.message}`)
  }

  const media = json.data?.Page?.media
  if (!media) {
    throw new Error('AniList returned an unexpected response shape.')
  }
  return { media, hasNextPage: json.data?.Page?.pageInfo?.hasNextPage ?? false }
}

// ponytail: perPage: 40, page: random(1-20) covers a pool of ~800 popular
// titles in a single request, keeping us well under AniList's 30 req/min
// limit. Raise the page range if the pool ever feels repetitive.
function randomPage(): number {
  return Math.floor(Math.random() * 20) + 1
}

// Shared by fetchRandomAnime/fetchDiscoverPool: same random-page,
// popularity-sorted pool, just a different perPage.
async function fetchRandomPool(perPage: number, showAdultContent: boolean): Promise<AniListAnime[]> {
  const { media } = await fetchMediaList({
    page: randomPage(),
    perPage,
    sort: ['POPULARITY_DESC'],
    ...adultContentFilter(showAdultContent),
  })
  return media
}

const CACHE_TTL_MS = 5 * 60 * 1000

// In-memory only — resets on a hard page reload, which is fine, it exists to
// absorb repeat SPA navigation and filter thrash within Browse & Search
// (toggling a genre chip back and forth, flipping sort, re-running a prior
// search), not to survive a refresh. Keyed by the full variable set, so a
// different filter combination naturally misses the cache instead of
// needing manual invalidation.
const mediaListCache = new Map<string, { data: MediaListResult; expiresAt: number }>()

async function cachedFetchMediaList(key: string, variables: MediaListVariables): Promise<MediaListResult> {
  const cached = mediaListCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  const data = await fetchMediaList(variables)
  mediaListCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

// Test-only: clears the Browse & Search cache between test cases.
export function clearMediaListCache(): void {
  mediaListCache.clear()
}

export async function fetchRandomAnime(
  showAdultContent = false,
): Promise<{ title: string; imageUrl: string; description: string }> {
  const pool = await fetchRandomPool(40, showAdultContent)
  const anime = pool[Math.floor(Math.random() * pool.length)]!
  return {
    title: animeTitle(anime),
    imageUrl: anime.coverImage.extraLarge ?? anime.coverImage.large ?? anime.coverImage.medium ?? '',
    description: animeSynopsis(anime),
  }
}

// Powers the Discover swipe deck: one request for a pool of popular titles.
// Discover.tsx filters out already-swiped ids client-side.
export async function fetchDiscoverPool(showAdultContent = false): Promise<AniListAnime[]> {
  return fetchRandomPool(50, showAdultContent)
}

export const BROWSE_SORTS = {
  Popularity: 'POPULARITY_DESC',
  'Highest Rated': 'SCORE_DESC',
  Newest: 'START_DATE_DESC',
  Shuffle: 'SHUFFLE',
} as const

export type BrowseSortLabel = keyof typeof BROWSE_SORTS

export const BROWSE_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const

const BROWSE_PER_PAGE = 24

export interface BrowseAnimeOptions {
  page: number
  genres: string[]
  sort: BrowseSortLabel
  search: string
  showAdultContent: boolean
}

// Explore's Browse & Search: genre/sort/search against AniList directly.
// Shuffle isn't a real MediaSort. It samples a fresh random page every
// call, bypassing the cache (a repeat sample should vary, not repeat, so
// caching it would defeat the point) instead of paginating sequentially
// like the other three sorts.
export async function fetchBrowseAnime(
  opts: BrowseAnimeOptions,
): Promise<{ anime: AniListAnime[]; hasNextPage: boolean }> {
  const isShuffle = opts.sort === 'Shuffle'
  const trimmedSearch = opts.search.trim()

  const variables: MediaListVariables = {
    page: isShuffle ? randomPage() : opts.page,
    perPage: BROWSE_PER_PAGE,
    sort: [isShuffle ? 'POPULARITY_DESC' : BROWSE_SORTS[opts.sort]],
    ...(opts.genres.length > 0 ? { genre_in: opts.genres } : {}),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...adultContentFilter(opts.showAdultContent),
  }

  const { media, hasNextPage } = isShuffle
    ? await fetchMediaList(variables)
    : await cachedFetchMediaList(`browse:${JSON.stringify(variables)}`, variables)

  return { anime: media, hasNextPage }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: Verify the frontend still typechecks, lints, and builds**

Run: `npm run build && npm run lint`
Expected: no errors. (Expect this step to fail until Task 2 also removes every remaining import of `fetchTrendingNow`/`fetchNewReleases`/`fetchRandomRecommendations` from `Recommendations.tsx`. If `npm run build` fails only on that file, that's expected at this point in the plan; re-run this check at the end of Task 2 instead of chasing it now.)

- [ ] **Step 6: Commit**

```bash
git add src/services/anilist.ts src/services/anilist.test.ts
git commit -m "Add fetchBrowseAnime and retire the fixed-row AniList fetchers"
```

---

### Task 2: Rename `Recommendations.tsx` to `Explore.tsx`, add Browse & Search, update every internal link

**Files:**
- Create: `src/pages/Explore.tsx`
- Delete: `src/pages/Recommendations.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Discover.tsx`
- Modify: `src/pages/Preferences.tsx`

**Interfaces:**
- Consumes: `fetchBrowseAnime`, `BROWSE_SORTS`, `BROWSE_GENRES`, `BrowseSortLabel`, `AniListAnime` (Task 1), `getForYouRecommendations` (plan #3, unchanged), `getPreferences` (unchanged), `AnimeCard`, `Navbar`, `Footer`, `usePageMeta` (all unchanged)
- Produces: route `/explore` (replacing `/recommendations`), default export `Explore` from `src/pages/Explore.tsx`

- [ ] **Step 1: Create `src/pages/Explore.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import AnimeCard from '../components/AnimeCard.tsx'
import { getPreferences } from '../services/preferences.ts'
import { getForYouRecommendations } from '../services/recommendations.ts'
import { fetchBrowseAnime, BROWSE_SORTS, BROWSE_GENRES, type AniListAnime, type BrowseSortLabel } from '../services/anilist.ts'
import usePageMeta from '../hooks/usePageMeta.ts'

const COLLAPSED_COUNT = 4

type SectionState =
  | { status: 'loading' }
  | { status: 'ok'; anime: AniListAnime[] }
  | { status: 'error'; message: string }

interface AnimeSectionProps {
  title: string
  state: SectionState
  tint: string
  expanded: boolean
  onToggleExpanded: () => void
}

function AnimeSection({ title, state, tint, expanded, onToggleExpanded }: AnimeSectionProps) {
  const anime = state.status === 'ok' ? state.anime : []
  const visible = expanded ? anime : anime.slice(0, COLLAPSED_COUNT)
  const canToggle = anime.length > COLLAPSED_COUNT

  return (
    <section className="tile-accent p-6 sm:p-8 my-10" style={{ background: tint }}>
      <div
        className="flex items-center justify-between gap-3 mb-6 pb-3 border-b"
        style={{ borderColor: 'color-mix(in oklch, var(--color-ink) 15%, transparent)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-6 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-ink)' }} />
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] truncate">
            {title}
          </h2>
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="btn btn-outline text-xs px-4 py-2 shrink-0"
          >
            {expanded ? (
              <>
                <ChevronUp size={14} /> Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} /> Show all ({anime.length})
              </>
            )}
          </button>
        )}
      </div>
      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]">Loading...</p>
      ) : state.status === 'error' ? (
        <p className="text-xs text-[var(--color-error)]">{state.message}</p>
      ) : anime.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nothing to show here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
          {visible.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}
    </section>
  )
}

const SORT_LABELS = Object.keys(BROWSE_SORTS) as BrowseSortLabel[]

interface BrowseSearchProps {
  showAdultContent: boolean
}

function BrowseSearch({ showAdultContent }: BrowseSearchProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [sort, setSort] = useState<BrowseSortLabel>('Popularity')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<AniListAnime[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const visibleGenres = showAdultContent ? BROWSE_GENRES : BROWSE_GENRES.filter((g) => g !== 'Ecchi')

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]))
  }

  // Any filter change starts over: reset to page 1, clear accumulated
  // results, and debounce so rapid chip/sort/search changes don't fire a
  // request per click or keystroke against AniList's 30 req/min limit.
  //
  // ponytail: no request-id guard against out-of-order responses. A very
  // rapid filter change could in theory show a stale result if two fetches
  // race. Add an AbortController per fetch if this becomes visible in
  // practice; the 400ms debounce already makes it unlikely.
  useEffect(() => {
    setStatus('loading')
    const timer = setTimeout(() => {
      setPage(1)
      fetchBrowseAnime({ page: 1, genres: selectedGenres, sort, search: searchText, showAdultContent })
        .then(({ anime, hasNextPage: next }) => {
          setResults(anime)
          setHasNextPage(next)
          setStatus('ok')
        })
        .catch((err: unknown) => {
          console.error('[Explore] Browse & Search failed to load:', err)
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load results.')
          setStatus('error')
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [selectedGenres, sort, searchText, showAdultContent])

  function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    fetchBrowseAnime({ page: nextPage, genres: selectedGenres, sort, search: searchText, showAdultContent })
      .then(({ anime, hasNextPage: next }) => {
        setResults((prev) => {
          const seen = new Set(prev.map((a) => a.id))
          return [...prev, ...anime.filter((a) => !seen.has(a.id))]
        })
        setHasNextPage(next)
        setPage(nextPage)
      })
      .catch((err: unknown) => {
        console.error('[Explore] Browse & Search failed to load more:', err)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load more results.')
        setStatus('error')
      })
      .finally(() => setLoadingMore(false))
  }

  return (
    <section className="tile-accent p-6 sm:p-8 my-10" style={{ background: 'var(--color-lilac)' }}>
      <div
        className="flex items-center gap-3 mb-6 pb-3 border-b"
        style={{ borderColor: 'color-mix(in oklch, var(--color-ink) 15%, transparent)' }}
      >
        <span className="h-6 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-ink)' }} />
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Browse &amp; Search
        </h2>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search titles..."
            aria-label="Search titles"
            className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleGenres.map((genre) => {
            const selected = selectedGenres.includes(genre)
            return (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                aria-pressed={selected}
                className="pill text-sm font-medium transition-colors"
                style={selected ? { background: 'var(--color-mint)', borderColor: 'var(--color-accent)' } : undefined}
              >
                {genre}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort by">
          {SORT_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setSort(label)}
              aria-pressed={sort === label}
              className="pill text-sm font-medium transition-colors"
              style={sort === label ? { background: 'var(--color-butter)', borderColor: 'var(--color-accent)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]">Loading...</p>
      ) : status === 'error' ? (
        <p className="text-xs text-[var(--color-error)]">{errorMessage}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No anime matched your filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
            {results.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
          {(hasNextPage || sort === 'Shuffle') && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-outline text-sm px-6 py-2.5 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function Explore() {
  usePageMeta({
    title: 'Explore',
    description: "Browse anime recommendations picked for your taste, or filter, sort, and search AniList's full catalog.",
  })
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
  const [byGenreExpanded, setByGenreExpanded] = useState(false)
  const [showAdultContent, setShowAdultContent] = useState(false)

  useEffect(() => {
    getForYouRecommendations()
      .then((anime) => setByGenre({ status: 'ok', anime }))
      .catch((err: unknown) => {
        // Logged as well as rendered: the message tells the user what to do,
        // the console keeps the stack/status for diagnosing it.
        console.error('[Explore] "For You" failed to load:', err)
        setByGenre({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load this section.',
        })
      })

    getPreferences()
      .catch((err: unknown) => {
        console.error('[Explore] Failed to load preferences, defaulting to adult content hidden:', err)
        return { genres: [], showAdultContent: false }
      })
      .then((prefs) => setShowAdultContent(prefs.showAdultContent))
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Find your next watch
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Explore
        </h1>
        <p className="text-[var(--color-muted)] max-w-xl">
          For You is tuned to your taste. Browse &amp; Search filters, sorts, and searches AniList's full catalog.
          Click on any anime title or its image to toggle more information about it.
        </p>

        <AnimeSection
          title="For You"
          state={byGenre}
          tint="var(--color-peach)"
          expanded={byGenreExpanded}
          onToggleExpanded={() => setByGenreExpanded((prev) => !prev)}
        />

        <BrowseSearch showAdultContent={showAdultContent} />
      </main>

      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Delete the old page**

```bash
git rm src/pages/Recommendations.tsx
```

- [ ] **Step 3: Update the route in `src/App.tsx`**

Change the import:

```tsx
import Explore from './pages/Explore.tsx'
```

(replacing `import Recommendations from './pages/Recommendations.tsx'`.)

Change the route (path and element only; the `ProtectedRoute`/`RequireOnboarding` wrapping stays exactly as it is today):

```tsx
        <Route
          path="/explore"
          element={
            <ProtectedRoute>
              <RequireOnboarding>
                <Explore />
              </RequireOnboarding>
            </ProtectedRoute>
          }
        />
```

- [ ] **Step 4: Update `src/components/Navbar.tsx`**

Both the desktop and mobile nav blocks have a `/recommendations` link. In the desktop block:

```tsx
              <Link to="/explore" className={linkClass('/explore')}>
                Explore
              </Link>
```

(replacing the `to="/recommendations"` / `linkClass('/recommendations')` / `Recommendations` link.) In the mobile block:

```tsx
              <Link to="/explore" className={mobileLinkClass('/explore')} onClick={closeMenu}>
                Explore
              </Link>
```

(replacing the equivalent `to="/recommendations"` link.)

- [ ] **Step 5: Update `src/pages/Home.tsx`**

Two links change `to={loggedIn ? '/recommendations' : '/signup'}` and `to="/recommendations"` to `/explore`. Copy is unchanged, only the `to` prop:

```tsx
                to={loggedIn ? '/explore' : '/signup'}
```

and

```tsx
              <Link to="/explore" className="btn btn-accent px-8 py-3 text-base no-underline">
                View Recommendations
              </Link>
```

- [ ] **Step 6: Update `src/pages/Discover.tsx`**

The "that's the deck for now" link:

```tsx
            <Link to="/explore" className="btn btn-accent px-6 py-3 text-sm no-underline">
              See your recommendations
            </Link>
```

(replacing `to="/recommendations"`; copy unchanged.)

- [ ] **Step 7: Update `src/pages/Preferences.tsx`**

The post-save redirect:

```tsx
      navigate('/explore')
```

(replacing `navigate('/recommendations')`.)

- [ ] **Step 8: Run the full frontend test suite, typecheck, lint, and build**

Run: `npx vitest run && npm run build && npm run lint`
Expected: no errors, no failing tests. This is also where Task 1's Step 5 deferred check gets resolved: `fetchTrendingNow`/`fetchNewReleases`/`fetchRandomRecommendations` have no remaining callers now that `Recommendations.tsx` is gone.

- [ ] **Step 9: Manually verify in a browser**

Start the app (`npm run dev`, with the backend running via `docker compose up` in `anime-verse-backend/` so `/recommendations/for-you` and `/preferences/me` resolve). Log in as a user who has completed swipe onboarding, navigate to `/explore`, and confirm: the nav shows "Explore" instead of "Recommendations"; "For You" renders as before; "Browse & Search" renders below it with genre chips, a sort row, and a search box; toggling a genre chip or changing sort visibly re-fetches; typing in search debounces rather than firing per keystroke; "Load More" appends more cards without duplicating any.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Rename Recommendations to Explore and add Browse & Search"
```

---

### Task 3: E2E coverage, visual-regression check, and CLAUDE.md documentation

**Files:**
- Rename: `e2e/recommendations.spec.ts` → `e2e/explore.spec.ts`
- Modify: `e2e/discover.spec.ts`
- Modify: `e2e/console-errors.spec.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the running app's `/signup`, `/login`, `/discover`, `/explore` routes (black-box browser tests)

- [ ] **Step 1: Rename and rewrite the Explore E2E spec**

```bash
git mv e2e/recommendations.spec.ts e2e/explore.spec.ts
```

Replace the full contents of `e2e/explore.spec.ts` with:

```ts
import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('signup then Explore page renders For You and Browse & Search', async ({ page }) => {
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
  await page.goto('/explore')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/explore')

  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'For You' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse & Search' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
  // Gate on the section actually leaving its loading state. Otherwise a slow
  // request could still be "loading" when the assertion below runs, passing
  // even if the section is broken. Same pattern as console-errors.spec.ts.
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  const forYouSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'For You' }) })
  await expect(forYouSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const browseSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Browse & Search' }) })

  // A genre chip, then a sort change, each re-issue the debounced search
  // without erroring or leaving the section stuck loading.
  await browseSection.getByRole('button', { name: 'Action', exact: true }).click()
  await browseSection.getByRole('button', { name: 'Newest', exact: true }).click()
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)

  // Load More appends results without a duplicate React key. A duplicate
  // would surface as a console error, asserted separately in
  // console-errors.spec.ts.
  const loadMoreButton = browseSection.getByRole('button', { name: 'Load More' })
  if (await loadMoreButton.isVisible()) {
    const countBefore = await browseSection.locator('img').count()
    await loadMoreButton.click()
    await expect(browseSection.getByRole('button', { name: 'Loading...' })).toHaveCount(0, { timeout: 15000 })
    const countAfter = await browseSection.locator('img').count()
    expect(countAfter).toBeGreaterThan(countBefore)
  }
})
```

- [ ] **Step 2: Update `e2e/discover.spec.ts`**

Change both `page.goto('/recommendations')` calls to `page.goto('/explore')`, and the final heading assertion:

```ts
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
```

(replacing `await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()`.) Also update the comment above that assertion, which currently reads `the URL reads "/recommendations" for a beat`, to `the URL reads "/explore" for a beat` to match.

- [ ] **Step 3: Update `e2e/console-errors.spec.ts`**

The console-error filter's prefix check changes:

```ts
    if (text.startsWith('[Discover]') || text.startsWith('[Explore]')) {
```

(replacing `text.startsWith('[Recommendations]')`; update the comment two lines above it, which references `Discover.tsx and Recommendations.tsx`, to `Discover.tsx and Explore.tsx`.) Both `page.goto('/recommendations')` calls change to `page.goto('/explore')`. The heading assertion changes:

```ts
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
```

(replacing `await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()`.)

- [ ] **Step 4: Run the E2E suite**

Precondition: backend running (`docker compose up`, in `anime-verse-backend/`).

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 5: Confirm no unexpected visual-regression baseline changes**

Per `CLAUDE.md`'s UI Change Workflow, this plan touched `src/pages/` (`Explore.tsx`, new) and `src/components/` (`Navbar.tsx`, label/href only). `Explore.tsx` itself isn't in `e2e/visual.spec.ts`'s baselined set (only `/`, `/login`, `/signup`, `/privacy-policy` are). Run `npm run test:e2e:update`. Expected: no changes, since the pages it does baseline (`Home.tsx` via `/`) only had a link's `to` prop change, not its rendered markup. If it does report a diff, use the `ui-change-workflow` skill's full sequence instead of committing an unexplained baseline change.

- [ ] **Step 6: Document the rename and the new Browse & Search behavior in CLAUDE.md**

In `CLAUDE.md`'s "Known quirks worth checking before assuming behavior" section, add:

```markdown
- `Recommendations.tsx` was renamed to `Explore.tsx` (route `/recommendations` → `/explore`) once its "Browse & Search" section shipped; there's no redirect from the old path since no production deployment exists to have indexed or bookmarked it.
- Explore's "Browse & Search" section queries AniList directly, same as Discover's swipe pool and Profile's random-anime widget. There's still no backend endpoint for browsing. Its results are cached client-side (`src/services/anilist.ts`'s `mediaListCache`, 5-minute TTL, keyed on the full filter combination) and its filter changes are debounced 400ms, both specifically to stay under AniList's 30 req/min limit when a user toggles genre chips or flips sort repeatedly. The "Shuffle" sort is this app's own sentinel (not a real AniList `MediaSort`) and deliberately bypasses that cache, since a repeat call should sample a new random page, not repeat the last one.
```

- [ ] **Step 7: Commit**

```bash
git add e2e/explore.spec.ts e2e/discover.spec.ts e2e/console-errors.spec.ts CLAUDE.md
git commit -m "Add Explore E2E coverage and document the Browse & Search rename"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-19-explore-browse-search-design.md` maps to a task: the `anilist.ts` service layer and dead-fetcher removal (Task 1), the page rename plus Browse & Search UI plus the full rename blast radius (Task 2), E2E coverage plus visual-regression check plus documentation (Task 3).
- **Type consistency:** `BROWSE_SORTS`/`BrowseSortLabel`/`BROWSE_GENRES`/`BrowseAnimeOptions`/`fetchBrowseAnime` (Task 1) are defined once and consumed by the same names in Task 2's `Explore.tsx` (`SORT_LABELS = Object.keys(BROWSE_SORTS) as BrowseSortLabel[]`, `BROWSE_GENRES.filter(...)`). `MediaListResult`'s `{ media, hasNextPage }` shape (Task 1, internal) is only ever read through `fetchBrowseAnime`'s public `{ anime, hasNextPage }` return, which Task 2 consumes consistently in both the debounced-search effect and `loadMore`.
- **No placeholders:** every step has real, complete code, no "add error handling" or "similar to Task N" shortcuts. The one deliberate simplification (no out-of-order-response guard on rapid filter changes) is called out inline with a `ponytail:` comment naming the ceiling and the upgrade path, matching this session's convention, rather than silently omitted.
- **Deviation from the design spec, documented:** the design spec didn't specify page copy (the pill/h1/intro text) or exact Tailwind class choices for the genre chips and sort control. Those were filled in during planning, reusing the existing `.pill`/`.btn`/`.tile-accent` classes and the previously-unused `--color-lilac` token rather than introducing new styling primitives.
- **Edge case, not a bug:** `Explore.tsx`'s two independent `useEffect`s (For You's fetch-once-on-mount, Browse & Search's debounced filter-reactive fetch) can both fire before `getPreferences()` resolves, so Browse & Search may fetch once with the default `showAdultContent: false` and again once the real value arrives if it differs. This is the same pattern the file already had (each section fetched independently against a shared `getPreferences()` call), and the 400ms debounce collapses it to one request whenever the preference resolves within that window.
