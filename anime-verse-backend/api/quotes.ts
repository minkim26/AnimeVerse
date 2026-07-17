import { Router } from 'express'

import prisma from '../lib/prisma.ts'

const router = Router()

/*
 * GET /quotes/random — Return a random anime quote.
 *
 * Uses Postgres's TABLESAMPLE-free random ordering (fine at this table's
 * size — a few dozen rows).
 */
router.get('/random', async (req, res) => {
    const count = await prisma.quote.count()
    const skip = Math.floor(Math.random() * count)
    const [quote] = await prisma.quote.findMany({ take: 1, skip })
    res.status(200).send(quote)
})

export default router
