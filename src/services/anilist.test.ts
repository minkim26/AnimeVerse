import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  animeTitle,
  animeSynopsis,
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  fetchRandomAnime,
  clearMediaListCache,
  type AniListAnime,
} from './anilist.ts'

// fetchTrendingNow/fetchNewReleases are cached; without this, whichever test
// runs first would populate the cache and every later test would silently
// get its result back instead of hitting the mocked fetch.
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

function mockAniListResponse(media: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { Page: { media } } }),
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

    await expect(fetchTrendingNow()).rejects.toThrow(
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

    await expect(fetchTrendingNow()).rejects.toThrow('AniList rejected the query: Invalid sort value')
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

    await expect(fetchTrendingNow()).rejects.toThrow('AniList request failed: HTTP 503')
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

    await expect(fetchTrendingNow()).rejects.toThrow('AniList returned an unexpected response shape.')
  })
})

describe('fetchAnimeByGenres', () => {
  it('sends the requested genres and returns the media list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAnimeByGenres(['Action', 'Comedy'])

    expect(result).toEqual([{ id: 1 }])
    expect(lastRequestVariables(fetchMock).genre_in).toEqual(['Action', 'Comedy'])
  })
})

describe('adult content filtering', () => {
  it('filters isAdult and the Ecchi genre by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow()

    const variables = lastRequestVariables(fetchMock)
    expect(variables.isAdult).toBe(false)
    expect(variables.genre_not_in).toEqual(['Ecchi'])
  })

  it('applies no adult-content filter when showAdultContent is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow(true)

    const variables = lastRequestVariables(fetchMock)
    expect(variables.isAdult).toBeUndefined()
    expect(variables.genre_not_in).toBeUndefined()
  })
})

describe('fetchTrendingNow', () => {
  it('sorts by TRENDING_DESC', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow()

    expect(lastRequestVariables(fetchMock).sort).toEqual(['TRENDING_DESC'])
  })
})

describe('fetchNewReleases', () => {
  it('filters to currently releasing anime sorted by newest start date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchNewReleases()

    const variables = lastRequestVariables(fetchMock)
    expect(variables.status).toBe('RELEASING')
    expect(variables.sort).toEqual(['START_DATE_DESC'])
  })
})

describe('fetchTrendingNow / fetchNewReleases caching', () => {
  it('serves a second call from cache instead of refetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchTrendingNow()
    const second = await fetchTrendingNow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('does not share a cache entry between showAdultContent values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow(false)
    await fetchTrendingNow(true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not share a cache entry between Trending Now and New Releases', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow()
    await fetchNewReleases()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refetches once the cache entry expires', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await fetchTrendingNow()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('fetchRandomRecommendations', () => {
  it('makes exactly one request and returns 12 results', async () => {
    const pool = Array.from({ length: 40 }, (_, i) => ({ id: i }))
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRandomRecommendations()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(12)
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
