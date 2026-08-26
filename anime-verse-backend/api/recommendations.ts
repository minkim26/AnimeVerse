import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'
import { computeTasteVector, type SwipedAnime } from '../lib/tasteVector.ts'

const router = Router()

const RECOMMENDATION_LIMIT = 12

interface SwipedVectorRow {
    action: SwipedAnime['action']
    vector: string
}

interface RecommendationRow {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
}

/*
 * GET /recommendations/for-you computes the caller's taste vector fresh on
 * every request from their Swipe history — no stored per-user vector, no
 * recompute-on-write trigger. A swipe takes effect on the very next call
 * with nothing to invalidate. See
 * docs/superpowers/specs/2026-08-10-recommendation-engine-design.md.
 */
/**
 * @openapi
 * /recommendations/for-you:
 *   get:
 *     tags: [Recommendations]
 *     summary: Get personalized anime recommendations
 *     description: Excludes every anime the caller has already swiped. Adult titles are excluded unless the caller's saved preferences set showAdultContent. Returns an empty list if the caller hasn't swiped anything yet.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK, up to 12 results ordered by taste-vector similarity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string }
 *                       posterUrl: { type: string, nullable: true }
 *                       synopsis: { type: string }
 *       401:
 *         description: Missing or invalid token
 */
router.get('/for-you', requireAuth, async (req: AuthenticatedRequest, res) => {
    const swiped = await prisma.$queryRaw<SwipedVectorRow[]>`
        SELECT s.action, a."tasteVector"::text AS vector
        FROM "Swipe" s
        JOIN "Anime" a ON a.id = s."animeId"
        WHERE s."userId" = ${req.user!.id}
    `

    const tasteVector = computeTasteVector(
        swiped.map((row) => ({ action: row.action, tasteVector: JSON.parse(row.vector) as number[] }))
    )

    if (tasteVector === null) {
        return res.status(200).send({ recommendations: [] })
    }

    const preference = await prisma.preference.findUnique({ where: { userId: req.user!.id } })
    const showAdultContent = preference?.showAdultContent ?? false
    const vectorLiteral = `[${tasteVector.join(',')}]`

    const recommendations = await prisma.$queryRaw<RecommendationRow[]>`
        SELECT id, title, "posterUrl", synopsis
        FROM "Anime"
        WHERE id NOT IN (SELECT "animeId" FROM "Swipe" WHERE "userId" = ${req.user!.id})
          AND ("isAdult" = false OR ${showAdultContent})
        ORDER BY "tasteVector" <=> ${vectorLiteral}::vector
        LIMIT ${RECOMMENDATION_LIMIT}
    `

    res.status(200).send({ recommendations })
})

export default router
