import { Router } from 'express'

import prisma from '../lib/prisma.ts'

const router = Router()

/*
 * GET /titles/random — Return a random anime title with its episode count.
 */
router.get('/random', async (req, res) => {
    const count = await prisma.title.count()
    const skip = Math.floor(Math.random() * count)
    const [title] = await prisma.title.findMany({ take: 1, skip })
    res.status(200).send(title)
})

export default router
