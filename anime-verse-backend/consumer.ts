import amqplib from 'amqplib'
import sharp from 'sharp'
import path from 'path'

import prisma from './lib/prisma.ts'
import supabase from './lib/supabase.ts'

const QUEUE = 'avatar-thumbnails'
const THUMBNAIL_SIZE = 128

interface ThumbnailMessage {
    userId: number
    filename: string
}

async function main() {
    const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
    const channel = await conn.createChannel()
    await channel.assertQueue(QUEUE, { durable: true })
    channel.prefetch(1)

    console.log('Consumer waiting for messages...')

    channel.consume(QUEUE, async (msg) => {
        if (!msg) return

        let payload: ThumbnailMessage
        try {
            payload = JSON.parse(msg.content.toString())
        } catch {
            console.error('Invalid message format, discarding')
            channel.nack(msg, false, false)
            return
        }

        const { userId, filename } = payload

        try {
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

            console.log(`Thumbnail generated for user ${userId}`)
            channel.ack(msg)
        } catch (err) {
            console.error(`Failed to process avatar for user ${userId}:`, err)
            channel.nack(msg, false, false)
        }
    })
}

main().catch((err) => {
    console.error('Consumer startup error:', err)
    process.exit(1)
})
