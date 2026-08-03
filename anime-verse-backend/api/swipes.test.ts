import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000
}

function swipeBody(animeId: number, action: 'SKIP' | 'LIKE' | 'LOVE') {
    return {
        animeId,
        action,
        anime: { title: 'Test Anime', posterUrl: 'https://example.com/poster.jpg', synopsis: 'A synopsis.', tags: [{ name: 'Isekai', rank: 80 }] }
    }
}

describe('POST /swipes', () => {
    let createdAnimeIds: number[] = []

    afterEach(async () => {
        await prisma.anime.deleteMany({ where: { id: { in: createdAnimeIds } } }).catch(() => {})
        createdAnimeIds = []
    })

    it('requires authentication', async () => {
        const res = await request(app).post('/swipes').send(swipeBody(randomAnimeId(), 'LIKE'))
        expect(res.status).toBe(401)
    })

    it('rejects an invalid action', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/swipes')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ ...swipeBody(randomAnimeId(), 'LIKE' as never), action: 'MAYBE' })
        expect(res.status).toBe(400)
        await user.cleanup()
    })

    it('creates a swipe and caches the anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()
        createdAnimeIds.push(animeId)

        const res = await request(app)
            .post('/swipes')
            .set('Authorization', `Bearer ${user.token}`)
            .send(swipeBody(animeId, 'LOVE'))

        expect(res.status).toBe(201)
        const cached = await prisma.anime.findUnique({ where: { id: animeId } })
        expect(cached?.title).toBe('Test Anime')

        await user.cleanup()
    })

    it('upserts on repeat swipes for the same user and anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()
        createdAnimeIds.push(animeId)

        await request(app).post('/swipes').set('Authorization', `Bearer ${user.token}`).send(swipeBody(animeId, 'SKIP')).expect(201)
        await request(app).post('/swipes').set('Authorization', `Bearer ${user.token}`).send(swipeBody(animeId, 'LOVE')).expect(201)

        const mine = await request(app).get('/swipes/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.swipes).toEqual([{ animeId, action: 'LOVE' }])

        await user.cleanup()
    })
})

describe('GET /swipes/me', () => {
    it('returns only the caller\'s swipes', async () => {
        const userA = await createTestUser(app)
        const userB = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/swipes').set('Authorization', `Bearer ${userA.token}`).send(swipeBody(animeId, 'LIKE')).expect(201)

        const resB = await request(app).get('/swipes/me').set('Authorization', `Bearer ${userB.token}`).expect(200)
        expect(resB.body.swipes).toEqual([])

        await userA.cleanup()
        await userB.cleanup()
        await prisma.anime.delete({ where: { id: animeId } }).catch(() => {})
    })
})

describe('DELETE /swipes/:animeId', () => {
    it('requires authentication', async () => {
        const res = await request(app).delete(`/swipes/${randomAnimeId()}`)
        expect(res.status).toBe(401)
    })

    it("removes the caller's swipe, undoing it", async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/swipes').set('Authorization', `Bearer ${user.token}`).send(swipeBody(animeId, 'LOVE')).expect(201)

        await request(app).delete(`/swipes/${animeId}`).set('Authorization', `Bearer ${user.token}`).expect(204)

        const mine = await request(app).get('/swipes/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.swipes).toEqual([])

        await user.cleanup()
        await prisma.anime.delete({ where: { id: animeId } }).catch(() => {})
    })

    it("cannot delete another user's swipe", async () => {
        const userA = await createTestUser(app)
        const userB = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/swipes').set('Authorization', `Bearer ${userA.token}`).send(swipeBody(animeId, 'LIKE')).expect(201)

        await request(app).delete(`/swipes/${animeId}`).set('Authorization', `Bearer ${userB.token}`).expect(404)

        const mine = await request(app).get('/swipes/me').set('Authorization', `Bearer ${userA.token}`).expect(200)
        expect(mine.body.swipes).toEqual([{ animeId, action: 'LIKE' }])

        await userA.cleanup()
        await userB.cleanup()
        await prisma.anime.delete({ where: { id: animeId } }).catch(() => {})
    })

    it('returns 404 for a swipe that does not exist', async () => {
        const user = await createTestUser(app)

        await request(app).delete(`/swipes/${randomAnimeId()}`).set('Authorization', `Bearer ${user.token}`).expect(404)

        await user.cleanup()
    })
})
