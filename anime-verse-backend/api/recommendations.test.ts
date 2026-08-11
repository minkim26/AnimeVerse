import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { upsertAnime } from '../lib/animeCache.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

async function seedAnime(tags: { name: string; rank: number }[], isAdult = false): Promise<number> {
    const id = randomAnimeId()
    await upsertAnime({ id, title: `Anime ${id}`, posterUrl: null, synopsis: '', tags, isAdult })
    return id
}

describe('GET /recommendations/for-you', () => {
    let createdAnimeIds: number[] = []

    afterEach(async () => {
        await prisma.anime.deleteMany({ where: { id: { in: createdAnimeIds } } }).catch(() => {})
        createdAnimeIds = []
    })

    it('requires authentication', async () => {
        const res = await request(app).get('/recommendations/for-you')
        expect(res.status).toBe(401)
    })

    it('returns an empty list for a user with no swipes', async () => {
        const user = await createTestUser(app)

        const res = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.recommendations).toEqual([])
        await user.cleanup()
    })

    it('recommends anime similar to what the caller loved and excludes what they already swiped', async () => {
        const user = await createTestUser(app)
        const lovedId = await seedAnime([{ name: 'Isekai', rank: 100 }])
        const similarId = await seedAnime([{ name: 'Isekai', rank: 95 }])
        const unrelatedId = await seedAnime([{ name: 'Sports', rank: 100 }])
        createdAnimeIds.push(lovedId, similarId, unrelatedId)

        await prisma.swipe.create({ data: { userId: user.id, animeId: lovedId, action: 'LOVE' } })

        const res = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)

        const ids: number[] = res.body.recommendations.map((a: { id: number }) => a.id)
        expect(ids).not.toContain(lovedId)
        expect(ids).toContain(similarId)
        expect(ids.indexOf(similarId)).toBeLessThan(ids.indexOf(unrelatedId))

        await user.cleanup()
    })

    it('excludes adult anime unless the caller has adult content enabled', async () => {
        const user = await createTestUser(app)
        const seenId = await seedAnime([{ name: 'Isekai', rank: 100 }])
        const adultId = await seedAnime([{ name: 'Isekai', rank: 100 }], true)
        createdAnimeIds.push(seenId, adultId)

        await prisma.swipe.create({ data: { userId: user.id, animeId: seenId, action: 'LIKE' } })

        const before = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)
        const idsBefore: number[] = before.body.recommendations.map((a: { id: number }) => a.id)
        expect(idsBefore).not.toContain(adultId)

        await request(app)
            .put('/preferences/me')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ genres: [], showAdultContent: true })
            .expect(200)

        const after = await request(app).get('/recommendations/for-you').set('Authorization', `Bearer ${user.token}`).expect(200)
        const idsAfter: number[] = after.body.recommendations.map((a: { id: number }) => a.id)
        expect(idsAfter).toContain(adultId)

        await user.cleanup()
    })
})
