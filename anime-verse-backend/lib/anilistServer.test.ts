import { describe, it, expect, vi, afterEach } from 'vitest'

import { fetchAnimeById } from './anilistServer.ts'

function mockAniListResponse(body: unknown, status = 200): void {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    } as Response)
}

describe('fetchAnimeById', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('strips HTML from the description and prefers the English title', async () => {
        mockAniListResponse({
            data: {
                Media: {
                    id: 1,
                    title: { english: 'Test Anime', romaji: 'Tesuto Anime' },
                    coverImage: { medium: 'med.jpg', large: 'large.jpg', extraLarge: 'xl.jpg' },
                    description: 'A story about <b>friendship</b>.<br>Really.',
                    genres: ['Adventure'],
                    tags: [{ name: 'Isekai', rank: 92 }],
                    isAdult: false
                }
            }
        })

        const result = await fetchAnimeById(1)

        expect(result.title).toBe('Test Anime')
        expect(result.posterUrl).toBe('large.jpg')
        expect(result.synopsis).toBe('A story about friendship. Really.')
        expect(result.tags).toEqual([{ name: 'Isekai', rank: 92 }])
        expect(result.isAdult).toBe(false)
    })

    it('falls back to the romaji title when no English title exists', async () => {
        mockAniListResponse({
            data: {
                Media: {
                    id: 2,
                    title: { english: null, romaji: 'Tesuto Anime' },
                    coverImage: { medium: 'med.jpg', large: null, extraLarge: null },
                    description: null,
                    genres: [],
                    tags: [],
                    isAdult: false
                }
            }
        })

        const result = await fetchAnimeById(2)

        expect(result.title).toBe('Tesuto Anime')
        expect(result.posterUrl).toBe('med.jpg')
        expect(result.synopsis).toBe('')
    })

    it('treats Ecchi-tagged anime as adult even when AniList\'s own isAdult flag is false', async () => {
        mockAniListResponse({
            data: {
                Media: {
                    id: 3,
                    title: { english: 'Fanservice Anime', romaji: null },
                    coverImage: { medium: null, large: null, extraLarge: null },
                    description: '',
                    genres: ['Ecchi'],
                    tags: [],
                    isAdult: false
                }
            }
        })

        const result = await fetchAnimeById(3)

        expect(result.isAdult).toBe(true)
    })

    it('throws when AniList responds with a non-2xx status', async () => {
        mockAniListResponse({}, 500)

        await expect(fetchAnimeById(4)).rejects.toThrow('HTTP 500')
    })

    it('throws when AniList reports a GraphQL error', async () => {
        mockAniListResponse({ errors: [{ message: 'Invalid id' }] })

        await expect(fetchAnimeById(5)).rejects.toThrow('Invalid id')
    })

    it('throws when AniList has no Media for the given id', async () => {
        mockAniListResponse({ data: { Media: null } })

        await expect(fetchAnimeById(6)).rejects.toThrow('no Media')
    })
})
