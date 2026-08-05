import { Router } from 'express'
import multer from 'multer'
import amqplib from 'amqplib'
import path from 'path'
import sharp from 'sharp'

import prisma from '../lib/prisma.ts'
import supabase from '../lib/supabase.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { setJSON, userCacheKey, withoutPassword, USER_CACHE_TTL_SECONDS } from '../lib/cache.ts'
import { uploadLimiter } from '../lib/rateLimit.ts'
import { AVATAR_QUEUE, setupAvatarQueue } from '../lib/queue.ts'

const router = Router()

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true)
        } else {
            cb(Object.assign(new Error('Only image files are accepted'), { status: 400 }))
        }
    }
})

/*
 * ALLOWED_IMAGE_FORMATS gates on the format sharp actually decodes from the
 * file's bytes, not the client-supplied mimetype the fileFilter above checks
 * (trivially spoofable). This is what rejects a non-image file uploaded
 * with a fake "image/*" Content-Type, and specifically excludes SVG — a
 * real image format sharp can decode, but one that can carry an embedded
 * <script>, unlike the raster formats below.
 */
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp'])

let channel: amqplib.Channel | null = null
async function getChannel(): Promise<amqplib.Channel> {
    if (!channel) {
        const conn = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost')
        channel = await conn.createChannel()
        await setupAvatarQueue(channel)
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

export function mimeToExt(mimetype: string): string {
    return MIME_TO_EXT[mimetype] || path.extname(mimetype.split('/')[1] ?? '') || '.bin'
}

/*
 * POST /avatar — Upload a new profile picture (multipart/form-data, field
 * name "file"). Stores the original in the "avatars" bucket, immediately
 * saves that URL on the user, then publishes a RabbitMQ message so
 * consumer.ts can generate a thumbnail asynchronously.
 */
router.post('/', requireAuth, uploadLimiter, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
        return res.status(400).send({ error: 'A file field containing an image is required' })
    }

    let detectedFormat: string | undefined
    try {
        detectedFormat = (await sharp(req.file.buffer).metadata()).format
    } catch {
        return res.status(400).send({ error: 'The uploaded file is not a valid image' })
    }
    if (!detectedFormat || !ALLOWED_IMAGE_FORMATS.has(detectedFormat)) {
        return res.status(400).send({ error: 'Unsupported image format' })
    }

    const ext = mimeToExt(req.file.mimetype)
    const filename = `${req.user!.id}-${Date.now()}${ext}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: true })

    if (uploadError) {
        console.error('Supabase upload error:', uploadError)
        // No status = network-level failure; 5xx = paused/unreachable project. Both mean storage is down.
        if ((uploadError.status ?? 500) >= 500) {
            return res.status(503).send({ error: 'Image storage is temporarily unavailable. Please try again in a few minutes.' })
        }
        return res.status(500).send({ error: 'Failed to store image file' })
    }

    const {
        data: { publicUrl }
    } = supabase.storage.from('avatars').getPublicUrl(filename)

    const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl: publicUrl }
    })
    // Write-through, not invalidate — see consumer.ts's processThumbnailMessage
    // for why an invalidate-only write races a concurrent GET /users/me poll.
    await setJSON(userCacheKey(req.user!.id), withoutPassword(updatedUser), USER_CACHE_TTL_SECONDS)

    try {
        const ch = await getChannel()
        ch.sendToQueue(
            AVATAR_QUEUE,
            Buffer.from(JSON.stringify({ userId: req.user!.id, filename })),
            { persistent: true }
        )
    } catch (mqErr) {
        console.error('RabbitMQ publish error:', mqErr)
    }

    res.status(201).send({ avatarUrl: publicUrl })
})

export default router
