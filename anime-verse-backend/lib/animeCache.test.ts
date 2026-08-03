import { describe, it, expect, afterEach } from 'vitest'

import prisma from './prisma.ts'
import { upsertAnime } from './animeCache.ts'
import { tagsToVector, VECTOR_DIMENSION } from './tagVector.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

async function readAnime(id: number) {
    const rows = await prisma.$queryRaw<{ title: string; tags: unknown; vector: string }[]>`
        SELECT title, tags, "tasteVector"::text AS vector FROM "Anime" WHERE id = ${id}
    `
    return rows[0] ?? null
}

describe('upsertAnime', () => {
    let createdId: number | null = null

    // Canary: Task 1's migration hardcodes the "tasteVector" column as
    // vector(335) as a literal, since Postgres has no way to read
    // VECTOR_DIMENSION from tagVector.ts. Nothing else ties them together —
    // if data/anilistTags.json is ever regenerated with a different tag
    // count, this fails loudly here instead of surfacing as a Postgres
    // "different vector dimensions" error deep inside a swipe request.
    it('keeps VECTOR_DIMENSION in sync with the migration\'s hardcoded vector(335)', () => {
        expect(VECTOR_DIMENSION).toBe(335)
    })

    afterEach(async () => {
        if (createdId !== null) {
            await prisma.anime.delete({ where: { id: createdId } }).catch(() => {})
            createdId = null
        }
    })

    it('creates a new Anime row with a tasteVector derived from the given tags', async () => {
        const id = randomAnimeId()
        createdId = id
        const tags = [{ name: 'Isekai', rank: 92 }]

        await upsertAnime({ id, title: 'Test Anime', posterUrl: 'poster.jpg', synopsis: 'A synopsis.', tags })

        const row = await readAnime(id)
        expect(row?.title).toBe('Test Anime')
        const expectedVector = `[${tagsToVector(tags).join(',')}]`
        expect(row?.vector).toBe(expectedVector)
    })

    it('does not overwrite a fresh row on a second call with different tags', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }] })
        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }] })

        const row = await readAnime(id)
        expect(row?.title).toBe('First')
    })

    it('refreshes a stale row (older than 7 days)', async () => {
        const id = randomAnimeId()
        createdId = id

        await upsertAnime({ id, title: 'First', posterUrl: null, synopsis: '', tags: [{ name: 'Isekai', rank: 92 }] })
        await prisma.$executeRaw`UPDATE "Anime" SET "updatedAt" = now() - interval '8 days' WHERE id = ${id}`

        await upsertAnime({ id, title: 'Second', posterUrl: null, synopsis: '', tags: [{ name: 'Tragedy', rank: 60 }] })

        const row = await readAnime(id)
        expect(row?.title).toBe('Second')
    })
})
