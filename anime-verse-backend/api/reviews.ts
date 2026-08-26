import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Review } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { reviewsLimiter } from '../lib/rateLimit.ts'

const router = Router()

const MAX_LIST_SIZE = 100

/*
 * Provisioned for API completeness — no frontend page consumes this yet,
 * matching the old app's behavior where /api/reviews was never called
 * from any page either.
 */

/**
 * @openapi
 * /reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List the authenticated user's reviews
 *     description: Not consumed by any frontend page yet — provisioned for API completeness.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK, newest first, capped at 100 items
 *       401:
 *         description: Missing or invalid token
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const reviews = await prisma.review.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_LIST_SIZE
    })
    res.status(200).send({ reviews })
})

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Add or update a review
 *     description: Upsert on (userId, animeId).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [animeId, rating, reviewText]
 *             properties:
 *               animeId: { type: string, maxLength: 100 }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               reviewText: { type: string, minLength: 1, maxLength: 5000 }
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
router.post('/', requireAuth, reviewsLimiter, async (req: AuthenticatedRequest, res) => {
    const data = Review.parse(req.body)

    const review = await prisma.review.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { ...data, userId: req.user!.id },
        update: data
    })

    res.status(201).send(review)
})

/**
 * @openapi
 * /reviews/{animeId}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Remove a review
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
    await prisma.review.deleteMany({
        where: { userId: req.user!.id, animeId: String(req.params.animeId) }
    })
    res.status(204).send()
})

export default router
