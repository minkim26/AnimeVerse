import prisma from './prisma.ts'
import { tagsToVector, type AniListTag } from './tagVector.ts'

export interface AnimeCacheInput {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
    tags: AniListTag[]
    isAdult: boolean
}

/*
 * upsertAnime is a cache-aside write into the Anime table, called before any
 * Swipe references an animeId. Tags/tasteVector/isAdult come from the caller
 * (already fetched client-side from AniList when the deck loaded) rather
 * than a fresh server-side fetch: see the plan's "Deviations" section for
 * why. Because that metadata is unverified and the Anime row is shared
 * across all users, only the first swipe on a given animeId gets to set it —
 * later calls are no-ops, so no authenticated user can overwrite another
 * anime's already-cached title/synopsis/poster/tags/isAdult with fabricated
 * data.
 */
export async function upsertAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        INSERT INTO "Anime" (id, title, "posterUrl", synopsis, tags, "tasteVector", "isAdult", "updatedAt")
        VALUES (${input.id}, ${input.title}, ${input.posterUrl}, ${input.synopsis}, ${JSON.stringify(input.tags)}::jsonb, ${vectorLiteral}::vector, ${input.isAdult}, now())
        ON CONFLICT (id) DO NOTHING
    `
}

/*
 * verifyAnime — a real overwrite, unlike upsertAnime's ON CONFLICT (id) DO
 * NOTHING. Called by the cache verification worker (consumer.ts) after a
 * fresh server-side AniList fetch, so — unlike the client-supplied data
 * upsertAnime writes once and trusts — this data has already been
 * verified against AniList before it reaches this function.
 *
 * Recomputes tasteVector from the corrected tags via the same
 * tagsToVector() upsertAnime uses: leaving the old vector in place after
 * correcting tags would make it inconsistent with the anime's actual
 * tags, silently degrading GET /recommendations/for-you's ordering.
 */
export async function verifyAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        UPDATE "Anime"
        SET title = ${input.title}, "posterUrl" = ${input.posterUrl}, synopsis = ${input.synopsis},
            tags = ${JSON.stringify(input.tags)}::jsonb, "tasteVector" = ${vectorLiteral}::vector,
            "isAdult" = ${input.isAdult}, "lastVerifiedAt" = now()
        WHERE id = ${input.id}
    `
}
