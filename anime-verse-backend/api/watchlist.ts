import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { WatchlistItem } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'

const router = Router()

/*
 * Provisioned for API completeness (schema + Zod validation match the rest
 * of the app's pattern) — no frontend page consumes this yet, matching the
 * old app's behavior where /api/watchlist was never called either.
 */

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const items = await prisma.watchlistItem.findMany({
        where: { userId: req.user!.id },
        orderBy: { addedAt: 'desc' }
    })
    res.status(200).send({ watchlist: items })
})

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = WatchlistItem.parse(req.body)

    const item = await prisma.watchlistItem.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { ...data, userId: req.user!.id },
        update: data
    })

    res.status(201).send(item)
})

router.delete('/:animeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    await prisma.watchlistItem.deleteMany({
        where: { userId: req.user!.id, animeId: String(req.params.animeId) }
    })
    res.status(204).send()
})

export default router
