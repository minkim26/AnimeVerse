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
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swipes = await prisma.swipe.findMany({
        where: { userId: req.user!.id },
        select: { animeId: true, action: true }
    })
    res.status(200).send({ swipes })
})

export default router
