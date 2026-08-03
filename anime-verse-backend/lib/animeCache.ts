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
 * upsertAnime — cache-aside write into the Anime table, called before any
 * Swipe references an animeId. Tags/tasteVector come from the caller
 * (already fetched client-side from AniList when the deck loaded) rather
 * than a fresh server-side fetch — see the plan's "Deviations" section for
 * why. Skips overwriting an already-fresh row so one user's swipe can't
 * rewrite another anime's shared cached metadata on every call.
 */
export async function upsertAnime(input: AnimeCacheInput): Promise<void> {
    const vectorLiteral = `[${tagsToVector(input.tags).join(',')}]`

    await prisma.$executeRaw`
        INSERT INTO "Anime" (id, title, "posterUrl", synopsis, tags, "tasteVector", "updatedAt")
        VALUES (${input.id}, ${input.title}, ${input.posterUrl}, ${input.synopsis}, ${JSON.stringify(input.tags)}::jsonb, ${vectorLiteral}::vector, now())
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            "posterUrl" = EXCLUDED."posterUrl",
            synopsis = EXCLUDED.synopsis,
            tags = EXCLUDED.tags,
            "tasteVector" = EXCLUDED."tasteVector",
            "updatedAt" = EXCLUDED."updatedAt"
        WHERE "Anime"."updatedAt" < now() - interval '7 days'
    `
}
