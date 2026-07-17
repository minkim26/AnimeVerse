import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Review } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'

const router = Router()

/*
 * Provisioned for API completeness — no frontend page consumes this yet,
 * matching the old app's behavior where /api/reviews was never called
 * from any page either.
 */

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const reviews = await prisma.review.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' }
    })
    res.status(200).send({ reviews })
})

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = Review.parse(req.body)

    const review = await prisma.review.upsert({
        where: { userId_animeId: { userId: req.user!.id, animeId: data.animeId } },
        create: { ...data, userId: req.user!.id },
        update: data
    })

    res.status(201).send(review)
})

router.delete('/:animeId', requireAuth, async (req: AuthenticatedRequest, res) => {
    await prisma.review.deleteMany({
        where: { userId: req.user!.id, animeId: String(req.params.animeId) }
    })
    res.status(204).send()
})

export default router
