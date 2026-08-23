import { describe, it, expect, vi, afterEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../lib/anilistServer.ts', () => ({
    fetchAnimeById: vi.fn()
}))

import { processRefreshMessage, handleRefreshMessage } from '../consumer.ts'
import { fetchAnimeById } from '../lib/anilistServer.ts'
import { upsertAnime } from '../lib/animeCache.ts'
import * as animeCache from '../lib/animeCache.ts'
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

describe('handleRefreshMessage', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        // fetchAnimeById is a plain vi.fn(), not a spy on a real
        // implementation, so restoreAllMocks() doesn't reset its call
        // history — clear it explicitly so each test starts clean.
        vi.clearAllMocks()
    })

    function fakeChannel(): amqplib.Channel {
        return { ack: vi.fn(), nack: vi.fn() } as unknown as amqplib.Channel
    }

    function fakeMessage(animeId: number): amqplib.ConsumeMessage {
        return { content: Buffer.from(JSON.stringify({ animeId })) } as amqplib.ConsumeMessage
    }

    it('does not ack until the throttle delay has elapsed, so prefetch(1) cannot free the next message early', async () => {
        vi.useFakeTimers()
        vi.mocked(fetchAnimeById).mockResolvedValueOnce({ title: 'X', posterUrl: null, synopsis: '', tags: [], isAdult: false })
        vi.spyOn(animeCache, 'verifyAnime').mockResolvedValueOnce(undefined)

        const channel = fakeChannel()
        const done = handleRefreshMessage(channel, fakeMessage(1))

        // The AniList fetch and DB write have resolved, but the throttle
        // delay has not — ack must not have fired yet.
        await vi.advanceTimersByTimeAsync(0)
        expect(channel.ack).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2500)
        await done
        expect(channel.ack).toHaveBeenCalledOnce()
        expect(channel.nack).not.toHaveBeenCalled()
    })

    it('does not nack until the throttle delay has elapsed on failure either', async () => {
        vi.useFakeTimers()
        vi.mocked(fetchAnimeById).mockRejectedValueOnce(new Error('AniList has no Media for id 2'))

        const channel = fakeChannel()
        const done = handleRefreshMessage(channel, fakeMessage(2))

        await vi.advanceTimersByTimeAsync(0)
        expect(channel.nack).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2500)
        await done
        expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
        expect(channel.ack).not.toHaveBeenCalled()
    })

    it('nacks immediately on an invalid message body, without throttling — no AniList call was made', async () => {
        const channel = fakeChannel()
        const badMsg = { content: Buffer.from('not json') } as amqplib.ConsumeMessage

        await handleRefreshMessage(channel, badMsg)

        expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false)
        expect(fetchAnimeById).not.toHaveBeenCalled()
    })
})
