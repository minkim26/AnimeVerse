import type amqplib from 'amqplib'

export const AVATAR_QUEUE = 'avatar-thumbnails'
export const AVATAR_DLX = 'avatar-thumbnails.dlx'
export const AVATAR_DLQ = 'avatar-thumbnails.dlq'

/*
 * setupAvatarQueue — declares the avatar-thumbnails queue with a
 * dead-letter exchange, so a message nack'd with requeue:false lands in
 * avatar-thumbnails.dlq for inspection instead of vanishing.
 *
 * Both api/avatar.ts (producer) and consumer.ts (consumer) call this on
 * their own channel. Keeping the declaration in one place matters because
 * RabbitMQ rejects assertQueue on an existing queue if the arguments don't
 * match exactly.
 */
export async function setupAvatarQueue(channel: amqplib.Channel): Promise<void> {
    await channel.assertExchange(AVATAR_DLX, 'fanout', { durable: true })
    await channel.assertQueue(AVATAR_DLQ, { durable: true })
    await channel.bindQueue(AVATAR_DLQ, AVATAR_DLX, '')
    await channel.assertQueue(AVATAR_QUEUE, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': AVATAR_DLX }
    })
}

export const ANIME_REFRESH_QUEUE = 'anime-cache-refresh'
export const ANIME_REFRESH_DLX = 'anime-cache-refresh.dlx'
export const ANIME_REFRESH_DLQ = 'anime-cache-refresh.dlq'

/*
 * setupAnimeRefreshQueue — same dead-letter pattern as setupAvatarQueue,
 * for the anime-cache verification worker's queue. A separate queue (not
 * shared with avatar-thumbnails) because the message shape and consumer
 * logic are unrelated — a failure here shouldn't dead-letter alongside
 * avatar jobs.
 */
export async function setupAnimeRefreshQueue(channel: amqplib.Channel): Promise<void> {
    await channel.assertExchange(ANIME_REFRESH_DLX, 'fanout', { durable: true })
    await channel.assertQueue(ANIME_REFRESH_DLQ, { durable: true })
    await channel.bindQueue(ANIME_REFRESH_DLQ, ANIME_REFRESH_DLX, '')
    await channel.assertQueue(ANIME_REFRESH_QUEUE, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': ANIME_REFRESH_DLX }
    })
}
