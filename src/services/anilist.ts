export interface AniListAnime {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { medium: string | null; large: string | null; extraLarge: string | null }
  description: string | null
  genres: string[]
  tags: { name: string; rank: number }[]
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
    $status: MediaStatus
  ) {
    Page(page: $page, perPage: $perPage) {
      media(
        genre_in: $genre_in
        genre_not_in: $genre_not_in
        isAdult: $isAdult
        sort: $sort
        status: $status
        type: ANIME
      ) {
        id
        title { english romaji }
        coverImage { medium large extraLarge }
        description(asHtml: false)
        genres
        tags { name rank }
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
  status?: string
}

// AniList marks explicit/hentai titles isAdult: true, but "Ecchi" (fanservice,
// non-explicit) is a separate genre tag it does not cover, so both filters
// are needed to fully hide adult content. Confirmed against AniList's live
// schema and against real New Releases results before wiring this up.
function adultContentFilter(showAdultContent: boolean): Pick<MediaListVariables, 'isAdult' | 'genre_not_in'> {
  if (showAdultContent) return {}
  return { isAdult: false, genre_not_in: ['Ecchi'] }
}

async function fetchMediaList(variables: MediaListVariables): Promise<AniListAnime[]> {
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
    data?: { Page?: { media?: AniListAnime[] } }
    errors?: { message: string }[]
  }
  if (json.errors?.length) {
    throw new Error(`AniList rejected the query: ${json.errors[0]!.message}`)
  }

  const media = json.data?.Page?.media
  if (!media) {
    throw new Error('AniList returned an unexpected response shape.')
  }
  return media
}

// ponytail: perPage: 40, page: random(1-20) covers a pool of ~800 popular
// titles in a single request, keeping us well under AniList's 30 req/min
// limit. Raise the page range if the pool ever feels repetitive.
function randomPage(): number {
  return Math.floor(Math.random() * 20) + 1
}

const CACHE_TTL_MS = 5 * 60 * 1000

// In-memory only — resets on a hard page reload, which is fine, it exists to
// absorb repeat SPA navigation (Recommendations -> Profile -> Recommendations),
// not to survive a refresh. Keyed by showAdultContent too, so flipping that
// preference naturally misses the cache instead of needing manual invalidation.
const mediaListCache = new Map<string, { data: AniListAnime[]; expiresAt: number }>()

async function cachedFetchMediaList(key: string, variables: MediaListVariables): Promise<AniListAnime[]> {
  const cached = mediaListCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  const data = await fetchMediaList(variables)
  mediaListCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

// Test-only: clears the Trending Now / New Releases cache between test cases.
export function clearMediaListCache(): void {
  mediaListCache.clear()
}

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

// Cached: this is the same data for every user at a given moment, unlike
// fetchAnimeByGenres (personalized) or fetchRandomRecommendations (meant to
// vary), so repeat navigation within CACHE_TTL_MS costs zero AniList requests.
export async function fetchTrendingNow(showAdultContent = false): Promise<AniListAnime[]> {
  return cachedFetchMediaList(`trending:${showAdultContent}`, {
    page: 1,
    perPage: 12,
    sort: ['TRENDING_DESC'],
    ...adultContentFilter(showAdultContent),
  })
}

export async function fetchNewReleases(showAdultContent = false): Promise<AniListAnime[]> {
  return cachedFetchMediaList(`newReleases:${showAdultContent}`, {
    page: 1,
    perPage: 12,
    status: 'RELEASING',
    sort: ['START_DATE_DESC'],
    ...adultContentFilter(showAdultContent),
  })
}

export async function fetchRandomRecommendations(showAdultContent = false): Promise<AniListAnime[]> {
  const pool = await fetchMediaList({
    page: randomPage(),
    perPage: 40,
    sort: ['POPULARITY_DESC'],
    ...adultContentFilter(showAdultContent),
  })
  const shuffled = [...pool].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, 12)
}

export async function fetchRandomAnime(
  showAdultContent = false,
): Promise<{ title: string; imageUrl: string; description: string }> {
  const pool = await fetchMediaList({
    page: randomPage(),
    perPage: 40,
    sort: ['POPULARITY_DESC'],
    ...adultContentFilter(showAdultContent),
  })
  const anime = pool[Math.floor(Math.random() * pool.length)]!
  return {
    title: animeTitle(anime),
    imageUrl: anime.coverImage.extraLarge ?? anime.coverImage.large ?? anime.coverImage.medium ?? '',
    description: animeSynopsis(anime),
  }
}

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
