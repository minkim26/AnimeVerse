import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Preferences } from '../lib/zod.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { getJSON, setJSON, invalidate, preferencesCacheKey } from '../lib/cache.ts'

const router = Router()

const PREFERENCES_CACHE_TTL_SECONDS = 5 * 60

/*
 * GET /preferences/me — Return the authenticated user's saved genre list and
 * adult-content setting. Defaults to an empty genre list and adult content
 * hidden if the user has never saved preferences. Cached in Redis; PUT
 * /preferences/me invalidates this on every write.
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const cacheKey = preferencesCacheKey(req.user!.id)
    const cached = await getJSON(cacheKey)
    if (cached) {
        return res.status(200).send(cached)
    }

    const preference = await prisma.preference.findUnique({ where: { userId: req.user!.id } })
    const result = {
        genres: preference?.genres ?? [],
        showAdultContent: preference?.showAdultContent ?? false
    }
    await setJSON(cacheKey, result, PREFERENCES_CACHE_TTL_SECONDS)
    res.status(200).send(result)
})

/*
 * PUT /preferences/me — Full-replace the authenticated user's genre list and
 * adult-content setting.
 *
 * Upsert because a user may not have a Preference row yet (first save).
 */
router.put('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = Preferences.parse(req.body)

    const preference = await prisma.preference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, genres: data.genres, showAdultContent: data.showAdultContent },
        update: { genres: data.genres, showAdultContent: data.showAdultContent }
    })
    await invalidate(preferencesCacheKey(req.user!.id))

    res.status(200).send({ genres: preference.genres, showAdultContent: preference.showAdultContent })
})

export default router
