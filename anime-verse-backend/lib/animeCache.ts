import prisma from './prisma.ts'
import { tagsToVector, type AniListTag } from './tagVector.ts'

export interface AnimeCacheInput {
    id: number
    title: string
    posterUrl: string | null
    synopsis: string
    tags: AniListTag[]
}

/*
 * upsertAnime is a cache-aside write into the Anime table, called before any
 * Swipe references an animeId. Tags/tasteVector come from the caller
 * (already fetched client-side from AniList when the deck loaded) rather
 * than a fresh server-side fetch: see the plan's "Deviations" section for
 * why. Because that metadata is unverified and the Anime row is shared
 * across all users, only the first swipe on a given animeId gets to set it —
 * later calls are no-ops, so no authenticated user can overwrite another
 * anime's already-cached title/synopsis/poster/tags with fabricated data.
 */
export async function upsertAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        INSERT INTO "Anime" (id, title, "posterUrl", synopsis, tags, "tasteVector", "updatedAt")
        VALUES (${input.id}, ${input.title}, ${input.posterUrl}, ${input.synopsis}, ${JSON.stringify(input.tags)}::jsonb, ${vectorLiteral}::vector, now())
        ON CONFLICT (id) DO NOTHING
    `
}
