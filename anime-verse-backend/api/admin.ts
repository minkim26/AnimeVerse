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
        // Mirrors consumer.ts's connection handling: without these listeners,
        // an unhandled 'error' event on the connection/channel EventEmitter
        // crashes the whole API process, and a stale channel after a
        // RabbitMQ restart would otherwise get reused forever.
        const invalidate = () => {
            channel = null
        }
        conn.on('error', invalidate)
        conn.on('close', invalidate)
        const ch = await conn.createChannel()
        ch.on('error', invalidate)
        ch.on('close', invalidate)
        await setupAnimeRefreshQueue(ch)
        channel = ch
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
/**
 * @openapi
 * /admin/anime-cache/refresh:
 *   post:
 *     tags: [Admin]
 *     summary: Enqueue a batch of Anime rows for AniList re-verification
 *     description: Called daily by .github/workflows/refresh-anime-cache.yml, not intended for interactive use. Enqueues the 25 least-recently-verified rows; consumer.ts does the actual AniList re-fetch asynchronously.
 *     security: [{ cronSecret: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enqueued: { type: integer }
 *                 animeIds: { type: array, items: { type: integer } }
 *       401:
 *         description: Missing or invalid X-Cron-Secret header
 */
router.post('/anime-cache/refresh', requireCronSecret, async (req, res) => {
    // random() as the tiebreak on lastVerifiedAt ties rotates which rows
    // win across calls. A fixed tiebreak (id, insertion order, anything
    // deterministic) would let a permanently-unverifiable id monopolize
    // every single batch forever: POST /swipes accepts any animeId a
    // client sends with no AniList existence check (see api/swipes.ts and
    // lib/zod.ts's Swipe schema), so a bogus id caches with
    // lastVerifiedAt = NULL, fails verification every time (fetchAnimeById
    // throws, consumer.ts nacks to the DLQ without ever calling
    // verifyAnime), and — under a fixed tiebreak — would keep winning the
    // same NULL-vs-NULL comparison against every other never-verified row
    // for as long as it exists. random() means it only occupies a slot
    // sometimes, not always.
    const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Anime" ORDER BY "lastVerifiedAt" ASC NULLS FIRST, random() LIMIT ${REFRESH_BATCH_SIZE}
    `

    const ch = await getChannel()
    for (const { id } of rows) {
        ch.sendToQueue(ANIME_REFRESH_QUEUE, Buffer.from(JSON.stringify({ animeId: id })), { persistent: true })
    }

    res.status(200).send({ enqueued: rows.length, animeIds: rows.map((r) => r.id) })
})

export default router
