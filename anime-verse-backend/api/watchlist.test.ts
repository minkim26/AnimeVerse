import { describe, it, expect } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import { createTestUser } from '../test/helpers.ts'

function randomAnimeId(): string {
    return `anime-${Math.floor(Math.random() * 1_000_000_000)}`
}

describe('POST /watchlist', () => {
    it('requires authentication', async () => {
        const res = await request(app).post('/watchlist').send({ animeId: randomAnimeId() })
        expect(res.status).toBe(401)
    })

    it('creates an item and upserts on repeat writes for the same anime', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ animeId, title: 'Test Anime' })
            .expect(201)
        await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ animeId, title: 'Renamed' })
            .expect(201)

        const mine = await request(app).get('/watchlist').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.watchlist).toHaveLength(1)
        expect(mine.body.watchlist[0].title).toBe('Renamed')

        await user.cleanup()
    })

    it('rejects a title over the length bound', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ animeId: randomAnimeId(), title: 'x'.repeat(501) })
        expect(res.status).toBe(400)
        await user.cleanup()
    })

    it('rejects a posterUrl that is not a valid URL', async () => {
        const user = await createTestUser(app)
        const res = await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ animeId: randomAnimeId(), posterUrl: 'not-a-url' })
        expect(res.status).toBe(400)
        await user.cleanup()
    })
})

describe('GET /watchlist', () => {
    it("returns only the caller's items", async () => {
        const userA = await createTestUser(app)
        const userB = await createTestUser(app)

        await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${userA.token}`)
            .send({ animeId: randomAnimeId() })
            .expect(201)

        const resB = await request(app).get('/watchlist').set('Authorization', `Bearer ${userB.token}`).expect(200)
        expect(resB.body.watchlist).toEqual([])

        await userA.cleanup()
        await userB.cleanup()
    })
})

describe('DELETE /watchlist/:animeId', () => {
    it('removes only the caller\'s own item', async () => {
        const user = await createTestUser(app)
        const animeId = randomAnimeId()

        await request(app)
            .post('/watchlist')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ animeId })
            .expect(201)

        await request(app).delete(`/watchlist/${animeId}`).set('Authorization', `Bearer ${user.token}`).expect(204)

        const mine = await request(app).get('/watchlist').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(mine.body.watchlist).toEqual([])

        await user.cleanup()
    })
})
