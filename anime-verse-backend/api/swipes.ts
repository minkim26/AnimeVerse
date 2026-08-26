import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Swipe } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { swipesLimiter } from '../lib/rateLimit.ts'
import { upsertAnime } from '../lib/animeCache.ts'

const router = Router()

/*
 * POST /swipes records a Discover-deck swipe decision. The request body
 * carries the anime's AniList metadata (title/poster/synopsis/tags) because
 * the deck already fetched it client-side; this endpoint never calls AniList
 * itself (see the plan's "Deviations" section: a per-swipe server fetch
 * would blow AniList's 30 req/min limit under concurrent onboarding).
 */
/**
 * @openapi
 * /swipes:
 *   post:
 *     tags: [Swipes]
 *     summary: Record a Discover-deck swipe decision
 *     description: Upsert on (userId, animeId). The anime's AniList metadata is cached from `anime` on the *first* swipe of that animeId ever recorded (by any user) and never refreshed by this endpoint afterward — see lib/animeCache.ts.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [animeId, action, anime]
 *             properties:
 *               animeId: { type: integer, description: 'AniList media id' }
 *               action: { type: string, enum: [SKIP, LIKE, LOVE] }
 *               anime:
 *                 type: object
 *                 required: [title, posterUrl, synopsis, tags, isAdult]
 *                 properties:
 *                   title: { type: string, maxLength: 500 }
 *                   posterUrl: { type: string, format: uri, nullable: true }
 *                   synopsis: { type: string, maxLength: 5000 }
 *                   tags:
 *                     type: array
 *                     maxItems: 100
 *                     items:
 *                       type: object
 *                       required: [name, rank]
 *                       properties:
 *                         name: { type: string, minLength: 1, maxLength: 100 }
 *                         rank: { type: number, minimum: 0, maximum: 100 }
 *                   isAdult: { type: boolean }
 *     responses:
 *       201:
 *         description: Created or updated
 *       401:
 *         description: Missing or invalid token
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', requireAuth, swipesLimiter, async (req: AuthenticatedRequest, res) => {
    const data = Swipe.parse(req.body)

    await upsertAnime({
        id: data.animeId,
        title: data.anime.title,
        posterUrl: data.anime.posterUrl,
        synopsis: data.anime.synopsis,
        tags: data.anime.tags,
        isAdult: data.anime.isAdult
    })

    const swipe = await prisma.swipe.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { userId: req.user!.id, animeId: data.animeId, action: data.action },
        update: { action: data.action }
    })

    res.status(201).send(swipe)
})

/*
 * GET /swipes/me returns the caller's swipe history. Powers both the Discover
 * page's already-swiped-exclusion and the onboarding gate (redirects to
 * Discover when this list is empty).
 */
/**
 * @openapi
 * /swipes/me:
 *   get:
 *     tags: [Swipes]
 *     summary: List the authenticated user's swipe history
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 swipes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       animeId: { type: integer }
 *                       action: { type: string, enum: [SKIP, LIKE, LOVE] }
 *       401:
 *         description: Missing or invalid token
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swipes = await prisma.swipe.findMany({
        where: { userId: req.user!.id },
        select: { animeId: true, action: true }
    })
    res.status(200).send({ swipes })
})

export default router
