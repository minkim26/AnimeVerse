import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Swipe } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { swipesLimiter } from '../lib/rateLimit.ts'
import { upsertAnime } from '../lib/animeCache.ts'

const router = Router()

/*
 * POST /swipes — records a Discover-deck swipe decision. The request body
 * carries the anime's AniList metadata (title/poster/synopsis/tags) because
 * the deck already fetched it client-side; this endpoint never calls AniList
 * itself (see the plan's "Deviations" section — a per-swipe server fetch
 * would blow AniList's 30 req/min limit under concurrent onboarding).
 */
router.post('/', requireAuth, swipesLimiter, async (req: AuthenticatedRequest, res) => {
    const data = Swipe.parse(req.body)

    await upsertAnime({
        id: data.animeId,
        title: data.anime.title,
        posterUrl: data.anime.posterUrl,
        synopsis: data.anime.synopsis,
        tags: data.anime.tags
    })

    const swipe = await prisma.swipe.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { userId: req.user!.id, animeId: data.animeId, action: data.action },
        update: { action: data.action }
    })

    res.status(201).send(swipe)
})

/*
 * GET /swipes/me — the caller's swipe history. Powers both the Discover
 * page's already-swiped-exclusion and the onboarding gate (redirects to
 * Discover when this list is empty).
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swipes = await prisma.swipe.findMany({
        where: { userId: req.user!.id },
        select: { animeId: true, action: true }
    })
    res.status(200).send({ swipes })
})

/*
 * DELETE /swipes/:animeId — undoes a swipe. Scoped to the caller by
 * deleting on the [userId, animeId] compound key rather than animeId alone,
 * so a swipe can only ever be deleted by the user who made it — deleting
 * another user's swipe (or one that doesn't exist) misses the key and
 * surfaces as the same P2025 -> 404 the centralized error handler already
 * maps, with no bespoke ownership check needed.
 */
router.delete('/:animeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const animeId = Number(req.params.animeId)
    if (!Number.isInteger(animeId)) {
        res.status(400).send({ error: 'animeId must be an integer' })
        return
    }

    await prisma.swipe.delete({
        where: { userId_animeId: { userId: req.user!.id, animeId } }
    })

    res.status(204).send()
})

export default router
