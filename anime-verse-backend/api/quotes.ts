import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { getOrSetJSON, QUOTES_CACHE_KEY } from '../lib/cache.ts'

const router = Router()

const CACHE_TTL_SECONDS = 60 * 60

/*
 * GET /quotes/random — Return a random anime quote.
 *
 * The full (small, seeded-once) quote list is cached in Redis so this
 * doesn't round-trip Postgres on every call; the random pick still happens
 * per-request against the cached list.
 */
router.get('/random', async (req, res) => {
    const quotes = await getOrSetJSON(QUOTES_CACHE_KEY, CACHE_TTL_SECONDS, () => prisma.quote.findMany())
    const quote = quotes[Math.floor(Math.random() * quotes.length)]
    res.status(200).send(quote)
})

export default router
