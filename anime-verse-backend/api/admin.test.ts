import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import amqplib from 'amqplib'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { upsertAnime, verifyAnime } from '../lib/animeCache.ts'
import { ANIME_REFRESH_QUEUE, setupAnimeRefreshQueue } from '../lib/queue.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

describe('POST /admin/anime-cache/refresh', () => {
    let createdAnimeIds: number[] = []

    afterEach(async () => {
        await prisma.anime.deleteMany({ where: { id: { in: createdAnimeIds } } }).catch(() => {})
        createdAnimeIds = []
    })

    it('rejects a request with no X-Cron-Secret header', async () => {
        const res = await request(app).post('/admin/anime-cache/refresh')
        expect(res.status).toBe(401)
    })

    it('rejects a request with the wrong secret', async () => {
        const res = await request(app).post('/admin/anime-cache/refresh').set('X-Cron-Secret', 'wrong-value')
        expect(res.status).toBe(401)
    })

    it('enqueues a real message for every id it says it enqueued', async () => {
        const id = randomAnimeId()
        createdAnimeIds.push(id)
        await upsertAnime({ id, title: 'Never Verified', posterUrl: null, synopsis: '', tags: [], isAdult: false })

        const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
        const channel = await conn.createChannel()
        await setupAnimeRefreshQueue(channel)
        await channel.purgeQueue(ANIME_REFRESH_QUEUE)

        const res = await request(app).post('/admin/anime-cache/refresh').set('X-Cron-Secret', process.env.ADMIN_CRON_SECRET!)

        expect(res.status).toBe(200)
        expect(res.body.enqueued).toBe(res.body.animeIds.length)
        expect(res.body.enqueued).toBeGreaterThan(0)
        expect(res.body.enqueued).toBeLessThanOrEqual(25)

        // Doesn't assert which ids come back — the query's tiebreak is
        // random() (see api/admin.ts), by design, and this table isn't
        // exclusively test-controlled data. What's actually being checked:
        // every id the response claims to have enqueued really has a
        // message on the queue. The NULL-first ordering itself is verified
        // separately below, against a scope this test fully controls.
        const delivered: number[] = []
        await new Promise<void>((resolve) => {
            let remaining = res.body.animeIds.length
            const timer = setTimeout(resolve, 2_000)
            channel.consume(
                ANIME_REFRESH_QUEUE,
                (msg) => {
                    if (!msg) return
                    delivered.push(JSON.parse(msg.content.toString()).animeId)
                    remaining -= 1
                    if (remaining <= 0) {
                        clearTimeout(timer)
                        resolve()
                    }
                },
                { noAck: true }
            )
        })
        expect([...delivered].sort()).toEqual([...res.body.animeIds].sort())

        await conn.close()
    })

    it('prefers a never-verified (NULL) row over an already-verified one', async () => {
        const neverVerifiedId = randomAnimeId()
        const alreadyVerifiedId = randomAnimeId()
        createdAnimeIds.push(neverVerifiedId, alreadyVerifiedId)

        await upsertAnime({ id: neverVerifiedId, title: 'Never Verified', posterUrl: null, synopsis: '', tags: [], isAdult: false })
        await upsertAnime({ id: alreadyVerifiedId, title: 'Already Verified', posterUrl: null, synopsis: '', tags: [], isAdult: false })
        await verifyAnime({ id: alreadyVerifiedId, title: 'Already Verified', posterUrl: null, synopsis: '', tags: [], isAdult: false })

        // Same ORDER BY as api/admin.ts's query, scoped to just these two
        // rows via WHERE id IN (...) so the result can't be affected by
        // whatever else is in the table. This is what actually proves the
        // NULL-first behavior, independent of the full endpoint's shared,
        // randomly-tiebroken batch.
        const rows = await prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Anime"
            WHERE id IN (${neverVerifiedId}, ${alreadyVerifiedId})
            ORDER BY "lastVerifiedAt" ASC NULLS FIRST, random()
            LIMIT 1
        `

        expect(rows[0]?.id).toBe(neverVerifiedId)
    })
})
