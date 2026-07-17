import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Preferences } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { getJSON, setJSON, invalidate, preferencesCacheKey } from '../lib/cache.ts'

const router = Router()

const PREFERENCES_CACHE_TTL_SECONDS = 5 * 60

/*
 * GET /preferences/me — Return the authenticated user's saved genre list.
 * Returns an empty array if the user has never saved preferences. Cached
 * in Redis; PUT /preferences/me invalidates this on every write.
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const cacheKey = preferencesCacheKey(req.user!.id)
    const cached = await getJSON(cacheKey)
    if (cached) {
        return res.status(200).send(cached)
    }

    const preference = await prisma.preference.findUnique({ where: { userId: req.user!.id } })
    const result = { genres: preference?.genres ?? [] }
    await setJSON(cacheKey, result, PREFERENCES_CACHE_TTL_SECONDS)
    res.status(200).send(result)
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
    await invalidate(preferencesCacheKey(req.user!.id))

    res.status(200).send({ genres: preference.genres })
})

export default router
