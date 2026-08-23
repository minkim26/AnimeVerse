import amqplib from 'amqplib'
import sharp from 'sharp'
import path from 'path'
import http from 'http'

import prisma from './lib/prisma.ts'
import supabase from './lib/supabase.ts'
import { setJSON, userCacheKey, withoutPassword, USER_CACHE_TTL_SECONDS } from './lib/cache.ts'
import { AVATAR_QUEUE, setupAvatarQueue, ANIME_REFRESH_QUEUE, setupAnimeRefreshQueue } from './lib/queue.ts'
import { fetchAnimeById } from './lib/anilistServer.ts'
import { verifyAnime } from './lib/animeCache.ts'

const THUMBNAIL_SIZE = 128
const HEALTH_PORT = 8001
const REFRESH_THROTTLE_MS = 2500

export interface ThumbnailMessage {
    userId: number
    filename: string
}

/*
 * processThumbnailMessage — downloads the original, resizes it, uploads the
 * thumbnail, and updates Postgres + the Redis cache. Throws on any failure;
 * the caller (the RabbitMQ consume callback below, or a test) decides how
 * to ack/nack based on that.
 */
export async function processThumbnailMessage({ userId, filename }: ThumbnailMessage): Promise<void> {
    const { data: blob, error: downloadError } = await supabase.storage.from('avatars').download(filename)
    if (downloadError) throw downloadError

    const buffer = Buffer.from(await blob.arrayBuffer())

    const thumbBuffer = await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
        .jpeg()
        .toBuffer()

    const ext = path.extname(filename)
    const thumbFilename = filename.slice(0, -ext.length) + '.jpg'

    const { error: uploadError } = await supabase.storage
        .from('avatar-thumbnails')
        .upload(thumbFilename, thumbBuffer, { contentType: 'image/jpeg', upsert: true })
    if (uploadError) throw uploadError

    const {
        data: { publicUrl: thumbnailUrl }
    } = supabase.storage.from('avatar-thumbnails').getPublicUrl(thumbFilename)

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { avatarThumbnailUrl: thumbnailUrl }
    })
    // Write-through, not invalidate: an in-flight GET /users/me poll (the
    // frontend polls this exact route while showing "Generating
    // thumbnail...") can otherwise read-and-cache the pre-thumbnail row
    // after this invalidation fires, serving stale data for the full TTL.
    await setJSON(userCacheKey(userId), withoutPassword(updatedUser), USER_CACHE_TTL_SECONDS)

    console.log(`Thumbnail generated for user ${userId}`)
}

export interface RefreshMessage {
    animeId: number
}

/*
 * processRefreshMessage — fetches an anime fresh from AniList and
 * overwrites its cached row. Throws on failure (a missing AniList Media,
 * a network error) so the caller nacks it to the anime-cache-refresh.dlq
 * instead of silently skipping it.
 */
export async function processRefreshMessage({ animeId }: RefreshMessage): Promise<void> {
    const verified = await fetchAnimeById(animeId)
    await verifyAnime({ id: animeId, ...verified })
    console.log(`Verified cached metadata for anime ${animeId}`)
}

/*
 * handleRefreshMessage — the anime-cache-refresh queue's full message
 * handler: parse, process, throttle, then ack/nack. Exported so a test can
 * assert the throttle actually gates message acknowledgement, not just
 * that processRefreshMessage itself works.
 *
 * The delay runs BEFORE ack/nack, not after: channel.prefetch(1) frees the
 * next message for delivery as soon as this one is acked, so sleeping
 * after ack would let the next AniList call fire immediately and defeat
 * the throttle entirely.
 */
export async function handleRefreshMessage(channel: amqplib.Channel, msg: amqplib.ConsumeMessage): Promise<void> {
    let payload: RefreshMessage
    try {
        const parsed: unknown = JSON.parse(msg.content.toString())
        const animeId = (parsed as { animeId?: unknown } | null)?.animeId
        if (typeof animeId !== 'number' || !Number.isInteger(animeId) || animeId <= 0) {
            throw new Error('Invalid animeId')
        }
        payload = { animeId }
    } catch {
        console.error('Invalid message format, discarding')
        channel.nack(msg, false, false)
        return
    }

    let succeeded = true
    try {
        await processRefreshMessage(payload)
    } catch (err) {
        console.error(`Failed to verify anime ${payload.animeId}:`, err)
        succeeded = false
    }

    // Throttles this queue to well under AniList's 30 req/min limit — see
    // the ordering note above for why this runs before ack/nack.
    await new Promise((resolve) => setTimeout(resolve, REFRESH_THROTTLE_MS))

    if (succeeded) {
        channel.ack(msg)
    } else {
        channel.nack(msg, false, false)
    }
}

/*
 * isReady reflects whether the RabbitMQ channel is actually open, not just
 * whether this process is alive — that's what makes the /health endpoint
 * below a meaningful Compose healthcheck target instead of a liveness-only
 * check.
 */
let isReady = false

const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' && isReady) {
        res.writeHead(200)
        res.end('ok')
    } else {
        res.writeHead(503)
        res.end('not ready')
    }
})

async function main() {
    healthServer.listen(HEALTH_PORT)

    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
    conn.on('close', () => {
        isReady = false
    })
    conn.on('error', () => {
        isReady = false
    })

    const channel = await conn.createChannel()
    await setupAvatarQueue(channel)
    await setupAnimeRefreshQueue(channel)
    channel.prefetch(1)
    isReady = true

    console.log('Consumer waiting for messages...')

    channel.consume(AVATAR_QUEUE, async (msg) => {
        if (!msg) return

        let payload: ThumbnailMessage
        try {
            payload = JSON.parse(msg.content.toString())
        } catch {
            console.error('Invalid message format, discarding')
            channel.nack(msg, false, false)
            return
        }

        try {
            await processThumbnailMessage(payload)
            channel.ack(msg)
        } catch (err) {
            console.error(`Failed to process avatar for user ${payload.userId}:`, err)
            channel.nack(msg, false, false)
        }
    })

    channel.consume(ANIME_REFRESH_QUEUE, (msg) => {
        if (!msg) return
        handleRefreshMessage(channel, msg)
    })
}

/*
 * Only start the RabbitMQ consumer + health server when this module is run
 * directly (tsx consumer.ts). Tests import processThumbnailMessage without
 * wanting a real AMQP connection or a port bound.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error('Consumer startup error:', err)
        process.exit(1)
    })
}
