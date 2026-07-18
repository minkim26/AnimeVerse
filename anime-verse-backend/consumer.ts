import amqplib from 'amqplib'
import sharp from 'sharp'
import path from 'path'
import http from 'http'

import prisma from './lib/prisma.ts'
import supabase from './lib/supabase.ts'
import { invalidate, userCacheKey } from './lib/cache.ts'
import { AVATAR_QUEUE, setupAvatarQueue } from './lib/queue.ts'

const THUMBNAIL_SIZE = 128
const HEALTH_PORT = 8001

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

    await prisma.user.update({
        where: { id: userId },
        data: { avatarThumbnailUrl: thumbnailUrl }
    })
    await invalidate(userCacheKey(userId))

    console.log(`Thumbnail generated for user ${userId}`)
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
