import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import redis from '../lib/redis.ts'
import { createTestUser } from './helpers.ts'
import { QUOTES_CACHE_KEY, TITLES_CACHE_KEY } from '../lib/cache.ts'

describe('quotes/titles read-through cache', () => {
    beforeAll(async () => {
        await redis.del(QUOTES_CACHE_KEY)
        await redis.del(TITLES_CACHE_KEY)
    })

    it('only hits Postgres once across repeated GET /quotes/random calls', async () => {
        const spy = vi.spyOn(prisma.quote, 'findMany')

        await request(app).get('/quotes/random').expect(200)
        await request(app).get('/quotes/random').expect(200)

        expect(spy).toHaveBeenCalledTimes(1)
        spy.mockRestore()
    })

    it('only hits Postgres once across repeated GET /titles/random calls', async () => {
        const spy = vi.spyOn(prisma.title, 'findMany')

        await request(app).get('/titles/random').expect(200)
        await request(app).get('/titles/random').expect(200)

        expect(spy).toHaveBeenCalledTimes(1)
        spy.mockRestore()
    })
})

describe('GET /users/me cache', () => {
    it('caches after the first call and is busted by a password change', async () => {
        const user = await createTestUser(app)
        const spy = vi.spyOn(prisma.user, 'findUnique')

        await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(spy).toHaveBeenCalledTimes(1)

        // PATCH /me/password also calls findUnique itself (to verify the old
        // password), so the count after this jumps by more than 1 — what
        // actually matters is that the *next* GET does a fresh read instead
        // of serving the now-stale cached entry.
        await request(app)
            .patch('/users/me/password')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ oldPassword: 'test-password-123', newPassword: 'new-password-456' })
            .expect(204)
        const callsAfterPatch = spy.mock.calls.length

        await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(spy.mock.calls.length).toBe(callsAfterPatch + 1)

        spy.mockRestore()
        await user.cleanup()
    })
})

describe('GET /preferences/me cache', () => {
    it('caches after the first call and is busted by a PUT', async () => {
        const user = await createTestUser(app)
        const spy = vi.spyOn(prisma.preference, 'findUnique')

        await request(app).get('/preferences/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        await request(app).get('/preferences/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(spy).toHaveBeenCalledTimes(1)

        await request(app)
            .put('/preferences/me')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ genres: ['action'] })
            .expect(200)

        await request(app).get('/preferences/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(spy).toHaveBeenCalledTimes(2)

        spy.mockRestore()
        await user.cleanup()
    })
})
