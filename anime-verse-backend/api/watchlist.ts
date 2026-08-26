import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { WatchlistItem } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { watchlistLimiter } from '../lib/rateLimit.ts'

const router = Router()

const MAX_LIST_SIZE = 100

/*
 * Provisioned for API completeness (schema + Zod validation match the rest
 * of the app's pattern) — no frontend page consumes this yet, matching the
 * old app's behavior where /api/watchlist was never called either.
 */

/**
 * @openapi
 * /watchlist:
 *   get:
 *     tags: [Watchlist]
 *     summary: List the authenticated user's watchlist
 *     description: Not consumed by any frontend page yet — provisioned for API completeness.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK, newest first, capped at 100 items
 *       401:
 *         description: Missing or invalid token
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const items = await prisma.watchlistItem.findMany({
        where: { userId: req.user!.id },
        orderBy: { addedAt: 'desc' },
        take: MAX_LIST_SIZE
    })
    res.status(200).send({ watchlist: items })
})

/**
 * @openapi
 * /watchlist:
 *   post:
 *     tags: [Watchlist]
 *     summary: Add or update a watchlist entry
 *     description: Upsert on (userId, animeId).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [animeId]
 *             properties:
 *               animeId: { type: string, maxLength: 100 }
 *               title: { type: string, maxLength: 500 }
 *               posterUrl: { type: string, format: uri, maxLength: 2000 }
 *     responses:
 *       201:
 *         description: Created or updated
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing or invalid token
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', requireAuth, watchlistLimiter, async (req: AuthenticatedRequest, res) => {
    const data = WatchlistItem.parse(req.body)

    const item = await prisma.watchlistItem.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { ...data, userId: req.user!.id },
        update: data
    })

    res.status(201).send(item)
})

/**
 * @openapi
 * /watchlist/{animeId}:
 *   delete:
 *     tags: [Watchlist]
 *     summary: Remove a watchlist entry
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: animeId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Removed (or was never there — this endpoint is idempotent)
 *       401:
 *         description: Missing or invalid token
 */
router.delete('/:animeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    await prisma.watchlistItem.deleteMany({
        where: { userId: req.user!.id, animeId: String(req.params.animeId) }
    })
    res.status(204).send()
})

export default router
