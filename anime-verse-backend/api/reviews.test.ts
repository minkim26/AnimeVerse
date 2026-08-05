import { describe, it, expect } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): string {
    return `anime-${Math.floor(Math.random() * 1_000_000_000)}`
}

function reviewBody(animeId: string, rating = 5) {
    return { animeId, rating, reviewText: 'Great show.' }
}

describe('POST /reviews', () => {
    it('requires authentication', async () => {
        const res = await request(app).post('/reviews').send(reviewBody(randomAnimeId()))
        expect(res.status).toBe(401)
    })

    it('creates a review and upserts on repeat writes for the same anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/reviews').set('Authorization', `Bearer ${user.token}`).send(reviewBody(animeId, 3)).expect(201)
        await request(app).post('/reviews').set('Authorization', `Bearer ${user.token}`).send(reviewBody(animeId, 5)).expect(201)

        const mine = await request(app).get('/reviews').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.reviews).toHaveLength(1)
        expect(mine.body.reviews[0].rating).toBe(5)

        await user.cleanup()
    })

    it('rejects a rating outside 1-5', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/reviews')
            .set('Authorization', `Bearer ${user.token}`)
            .send(reviewBody(randomAnimeId(), 6))
        expect(res.status).toBe(400)
        await user.cleanup()
    })

    it('rejects reviewText over the length bound', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/reviews')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ ...reviewBody(randomAnimeId()), reviewText: 'x'.repeat(5001) })
        expect(res.status).toBe(400)
        await user.cleanup()
    })
})

describe('GET /reviews', () => {
    it("returns only the caller's reviews", async () => {
        const userA = await createTestUser(app)
        const userB = await createTestUser(app)

        await request(app)
            .post('/reviews')
            .set('Authorization', `Bearer ${userA.token}`)
            .send(reviewBody(randomAnimeId()))
            .expect(201)

        const resB = await request(app).get('/reviews').set('Authorization', `Bearer ${userB.token}`).expect(200)
        expect(resB.body.reviews).toEqual([])

        await userA.cleanup()
        await userB.cleanup()
    })
})

describe('DELETE /reviews/:animeId', () => {
    it('removes only the caller\'s own review', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app).post('/reviews').set('Authorization', `Bearer ${user.token}`).send(reviewBody(animeId)).expect(201)
        await request(app).delete(`/reviews/${animeId}`).set('Authorization', `Bearer ${user.token}`).expect(204)

        const mine = await request(app).get('/reviews').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.reviews).toEqual([])

        await user.cleanup()
    })
})
