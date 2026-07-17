import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Preferences } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'

const router = Router()

/*
 * GET /preferences/me — Return the authenticated user's saved genre list.
 * Returns an empty array if the user has never saved preferences.
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const preference = await prisma.preference.findUnique({ where: { userId: req.user!.id } })
    res.status(200).send({ genres: preference?.genres ?? [] })
})

/*
 * PUT /preferences/me — Full-replace the authenticated user's genre list.
 *
 * Upsert because a user may not have a Preference row yet (first save).
 */
router.put('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = Preferences.parse(req.body)

    const preference = await prisma.preference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, genres: data.genres },
        update: { genres: data.genres }
    })

    res.status(200).send({ genres: preference.genres })
})

export default router
