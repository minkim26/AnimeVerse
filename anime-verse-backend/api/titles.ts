import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { getOrSetJSON, TITLES_CACHE_KEY } from '../lib/cache.ts'

const router = Router()

const CACHE_TTL_SECONDS = 60 * 60

/*
 * GET /titles/random — Return a random anime title with its episode count.
 *
 * The full (small, seeded-once) title list is cached in Redis so this
 * doesn't round-trip Postgres on every call; the random pick still happens
 * per-request against the cached list.
 */
router.get('/random', async (req, res) => {
    const titles = await getOrSetJSON(TITLES_CACHE_KEY, CACHE_TTL_SECONDS, () => prisma.title.findMany())
    const title = titles[Math.floor(Math.random() * titles.length)]
    res.status(200).send(title)
})

export default router
