import type amqplib from 'amqplib'

export const AVATAR_QUEUE = 'avatar-thumbnails'
export const AVATAR_DLX = 'avatar-thumbnails.dlx'
export const AVATAR_DLQ = 'avatar-thumbnails.dlq'

/*
 * setupDeadLetterQueue — declares a queue with a dead-letter exchange, so a
 * message nack'd with requeue:false lands in <dlq> for inspection instead
 * of vanishing. Keeping each declaration behind one function matters
 * because RabbitMQ rejects assertQueue on an existing queue if the
 * arguments don't match exactly.
 */
async function setupDeadLetterQueue(channel: amqplib.Channel, queue: string, dlx: string, dlq: string): Promise<void> {
    await channel.assertExchange(dlx, 'fanout', { durable: true })
    await channel.assertQueue(dlq, { durable: true })
    await channel.bindQueue(dlq, dlx, '')
    await channel.assertQueue(queue, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': dlx }
    })
}

// Both api/avatar.ts (producer) and consumer.ts (consumer) call this on
// their own channel.
export const setupAvatarQueue = (channel: amqplib.Channel): Promise<void> =>
    setupDeadLetterQueue(channel, AVATAR_QUEUE, AVATAR_DLX, AVATAR_DLQ)

export const ANIME_REFRESH_QUEUE = 'anime-cache-refresh'
export const ANIME_REFRESH_DLX = 'anime-cache-refresh.dlx'
export const ANIME_REFRESH_DLQ = 'anime-cache-refresh.dlq'

// A separate queue from avatar-thumbnails: different message shape and
// consumer logic, so a failure here shouldn't dead-letter alongside
// avatar jobs.
export const setupAnimeRefreshQueue = (channel: amqplib.Channel): Promise<void> =>
    setupDeadLetterQueue(channel, ANIME_REFRESH_QUEUE, ANIME_REFRESH_DLX, ANIME_REFRESH_DLQ)
