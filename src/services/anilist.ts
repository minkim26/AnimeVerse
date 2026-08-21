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

interface BrowseAnimeOptions {
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
    // Sorted so click order (Action-then-Comedy vs. Comedy-then-Action) maps
    // to the same cache key. genre_in is an unordered set filter to AniList,
    // so this doesn't change what's requested, only the cache key's stability.
    ...(opts.genres.length > 0 ? { genre_in: [...opts.genres].sort() } : {}),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...adultContentFilter(opts.showAdultContent),
  }

  const { media, hasNextPage } = isShuffle
    ? await fetchMediaList(variables)
    : await cachedFetchMediaList(`browse:${JSON.stringify(variables)}`, variables)

  return { anime: media, hasNextPage }
}
