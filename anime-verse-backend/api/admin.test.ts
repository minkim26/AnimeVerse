import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import amqplib from 'amqplib'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { upsertAnime } from '../lib/animeCache.ts'
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

    it('enqueues the least-recently-verified rows and returns their ids', async () => {
        const id = randomAnimeId()
        createdAnimeIds.push(id)
        await upsertAnime({ id, title: 'Never Verified', posterUrl: null, synopsis: '', tags: [], isAdult: false })

        const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
        const channel = await conn.createChannel()
        await setupAnimeRefreshQueue(channel)
        await channel.purgeQueue(ANIME_REFRESH_QUEUE)

        const res = await request(app).post('/admin/anime-cache/refresh').set('X-Cron-Secret', process.env.ADMIN_CRON_SECRET!)

        expect(res.status).toBe(200)
        expect(res.body.animeIds).toContain(id)
        expect(res.body.enqueued).toBe(res.body.animeIds.length)

        const delivered = await new Promise<amqplib.ConsumeMessage | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), 2_000)
            channel.consume(
                ANIME_REFRESH_QUEUE,
                (msg) => {
                    if (msg && JSON.parse(msg.content.toString()).animeId === id) {
                        clearTimeout(timer)
                        resolve(msg)
                    }
                },
                { noAck: true }
            )
        })
        expect(delivered).not.toBeNull()

        await conn.close()
    })
})
