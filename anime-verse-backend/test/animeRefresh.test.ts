import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../lib/anilistServer.ts', () => ({
    fetchAnimeById: vi.fn()
}))

import { processRefreshMessage } from '../consumer.ts'
import { fetchAnimeById } from '../lib/anilistServer.ts'
import { upsertAnime } from '../lib/animeCache.ts'
import prisma from '../lib/prisma.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

describe('processRefreshMessage', () => {
    let createdId: number | null = null

    afterEach(async () => {
        vi.restoreAllMocks()
        if (createdId !== null) {
            await prisma.anime.delete({ where: { id: createdId } }).catch(() => {})
            createdId = null
        }
    })

    it('overwrites the cached row with the freshly fetched AniList data', async () => {
        const id = randomAnimeId()
        createdId = id
        await upsertAnime({ id, title: 'Stale Title', posterUrl: null, synopsis: '', tags: [], isAdult: false })

        vi.mocked(fetchAnimeById).mockResolvedValueOnce({
            title: 'Corrected Title',
            posterUrl: 'corrected.jpg',
            synopsis: 'Corrected synopsis.',
            tags: [{ name: 'Tragedy', rank: 60 }],
            isAdult: true
        })

        await processRefreshMessage({ animeId: id })

        const row = await prisma.anime.findUnique({ where: { id } })
        expect(row?.title).toBe('Corrected Title')
        expect(row?.isAdult).toBe(true)
    })

    it('throws when the AniList fetch fails, so the caller nacks it', async () => {
        vi.mocked(fetchAnimeById).mockRejectedValueOnce(new Error('AniList has no Media for id 999'))

        await expect(processRefreshMessage({ animeId: 999 })).rejects.toThrow('no Media')
    })
})
