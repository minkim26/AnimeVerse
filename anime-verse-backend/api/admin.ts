import { Router } from 'express'
import amqplib from 'amqplib'

import prisma from '../lib/prisma.ts'
import { requireCronSecret } from '../lib/adminAuth.ts'
import { ANIME_REFRESH_QUEUE, setupAnimeRefreshQueue } from '../lib/queue.ts'

const router = Router()

const REFRESH_BATCH_SIZE = 25

let channel: amqplib.Channel | null = null
async function getChannel(): Promise<amqplib.Channel> {
    if (!channel) {
        const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
        channel = await conn.createChannel()
        await setupAnimeRefreshQueue(channel)
    }
    return channel
}

/*
 * POST /admin/anime-cache/refresh — called by .github/workflows/
 * refresh-anime-cache.yml on a daily cron. Picks the REFRESH_BATCH_SIZE
 * least-recently-verified Anime rows (oldest/never-verified first) and
 * enqueues one message per id; consumer.ts does the actual AniList fetch
 * and correction asynchronously, throttled well under AniList's 30
 * req/min limit. This handler itself does no AniList calls, so it
 * returns immediately regardless of batch size.
 */
router.post('/anime-cache/refresh', requireCronSecret, async (req, res) => {
    // id DESC as a tiebreak makes the batch deterministic across ties on
    // lastVerifiedAt (e.g. the large pool of never-verified rows) — plain
    // NULLS FIRST alone leaves Postgres free to return a different subset
    // on every call among equal values, which isn't wrong but is
    // needlessly nondeterministic.
    const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Anime" ORDER BY "lastVerifiedAt" ASC NULLS FIRST, id DESC LIMIT ${REFRESH_BATCH_SIZE}
    `

    const ch = await getChannel()
    for (const { id } of rows) {
        ch.sendToQueue(ANIME_REFRESH_QUEUE, Buffer.from(JSON.stringify({ animeId: id })), { persistent: true })
    }

    res.status(200).send({ enqueued: rows.length, animeIds: rows.map((r) => r.id) })
})

export default router
