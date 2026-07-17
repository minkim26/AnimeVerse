import { Router } from 'express'
import multer from 'multer'
import amqplib from 'amqplib'
import path from 'path'

import prisma from '../lib/prisma.ts'
import supabase from '../lib/supabase.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'

const router = Router()

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        } else {
            cb(Object.assign(new Error('Only image files are accepted'), { status: 400 }))
        }
    }
})

let channel: amqplib.Channel | null = null
async function getChannel(): Promise<amqplib.Channel> {
    if (!channel) {
        const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
        channel = await conn.createChannel()
        await channel.assertQueue('avatar-thumbnails', { durable: true })
    }
    return channel
}

const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
}

function mimeToExt(mimetype: string): string {
    return MIME_TO_EXT[mimetype] || path.extname(mimetype.split('/')[1] ?? '') || '.bin'
}

/*
 * POST /avatar — Upload a new profile picture (multipart/form-data, field
 * name "file"). Stores the original in the "avatars" bucket, immediately
 * saves that URL on the user, then publishes a RabbitMQ message so
 * consumer.ts can generate a thumbnail asynchronously.
 */
router.post('/', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
        return res.status(400).send({ error: 'A file field containing an image is required' })
    }

    const ext = mimeToExt(req.file.mimetype)
    const filename = `${req.user!.id}-${Date.now()}${ext}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: true })

    if (uploadError) {
        console.error('Supabase upload error:', uploadError)
        return res.status(500).send({ error: 'Failed to store image file' })
    }

    const {
        data: { publicUrl }
    } = supabase.storage.from('avatars').getPublicUrl(filename)

    await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: publicUrl }
    })

    try {
        const ch = await getChannel()
        ch.sendToQueue(
            'avatar-thumbnails',
            Buffer.from(JSON.stringify({ userId: req.user!.id, filename })),
            { persistent: true }
        )
    } catch (mqErr) {
        console.error('RabbitMQ publish error:', mqErr)
    }

    res.status(201).send({ avatarUrl: publicUrl })
})

export default router
