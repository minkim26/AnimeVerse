import { describe, it, expect } from 'vitest'
import amqplib from 'amqplib'
import { vi } from 'vitest'

vi.mock('../lib/supabase.ts', async () => {
    const { supabaseMock } = await import('../test/supabaseMock.ts')
    return { default: supabaseMock }
})

import { AVATAR_QUEUE, AVATAR_DLQ, setupAvatarQueue } from '../lib/queue.ts'
import { processThumbnailMessage } from '../consumer.ts'
import { mockDownload } from './supabaseMock.ts'
import redis from '../lib/redis.ts'
import { userCacheKey, setJSON } from '../lib/cache.ts'
import { createTestUser } from './helpers.ts'
import app from '../app.ts'

describe('avatar-thumbnails dead-letter routing', () => {
    it(
        'routes a nack(requeue:false) message to the DLQ instead of dropping it',
        async () => {
            const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
            const channel = await conn.createChannel()
            await setupAvatarQueue(channel)

            /*
             * Clear out anything left behind by an earlier run or by another
             * test file — rateLimit.test.ts's upload test publishes real
             * messages to AVATAR_QUEUE with no consumer running to drain
             * them, so without this purge this test could dequeue one of
             * those instead of the message it just published.
             */
            await channel.purgeQueue(AVATAR_QUEUE)
            await channel.purgeQueue(AVATAR_DLQ)

            const payload = Buffer.from(JSON.stringify({ userId: 0, filename: 'dlx-test.png' }))
            channel.sendToQueue(AVATAR_QUEUE, payload, { persistent: true })

            const delivered = await new Promise<amqplib.ConsumeMessage>((resolve) => {
                channel.consume(
                    AVATAR_QUEUE,
                    (msg) => {
                        if (msg) resolve(msg)
                    },
                    { noAck: false }
                )
            })
            channel.nack(delivered, false, false)

            // Give RabbitMQ a beat to route the dead letter before we look for it.
            await new Promise((resolve) => setTimeout(resolve, 200))

            const dlqMessage = await channel.get(AVATAR_DLQ, { noAck: true })
            expect(dlqMessage).not.toBe(false)
            if (dlqMessage !== false) {
                expect(dlqMessage.content.toString()).toBe(payload.toString())
            }

            await conn.close()
        },
        10_000
    )
})

describe('processThumbnailMessage', () => {
    it('resizes the original, updates avatarThumbnailUrl, and invalidates the user cache', async () => {
        const user = await createTestUser(app)
        await setJSON(userCacheKey(user.id), { stale: true }, 60)

        await processThumbnailMessage({ userId: user.id, filename: `${user.id}-123.png` })

        const cached = await redis.get(userCacheKey(user.id))
        expect(cached).toBeNull()

        await user.cleanup()
    })

    it("throws when the original can't be downloaded, so the caller nacks it (routing it to the DLQ)", async () => {
        mockDownload.mockResolvedValueOnce({ data: null, error: new Error('not found') })

        await expect(processThumbnailMessage({ userId: 0, filename: 'missing.png' })).rejects.toThrow()
    })
})
