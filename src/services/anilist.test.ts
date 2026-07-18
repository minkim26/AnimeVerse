import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  animeTitle,
  animeSynopsis,
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  fetchRandomAnime,
  type AniListAnime,
} from './anilist.ts'

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

describe('fetchAnimeByGenres', () => {
  it('sends the requested genres and returns the media list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAnimeByGenres(['Action', 'Comedy'])

    expect(result).toEqual([{ id: 1 }])
    expect(lastRequestVariables(fetchMock).genre_in).toEqual(['Action', 'Comedy'])
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
