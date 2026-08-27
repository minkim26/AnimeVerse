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
    /*
     * Every authenticated request resolves auth0Id -> id (requireAuth's
     * resolveUser), so that's one unavoidable findUnique per call — Auth0's
     * token doesn't carry our integer id. What this test actually checks is
     * that the route's OWN cache-populating read only happens once: a
     * repeated GET should add exactly one more findUnique call (the auth
     * resolution), not two (auth resolution + a fresh, uncached DB read).
     */
    it('serves from cache after the first call, not just the auth lookup', async () => {
        const user = await createTestUser(app)
        const spy = vi.spyOn(prisma.user, 'findUnique')

        await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        const callsAfterFirst = spy.mock.calls.length

        await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`).expect(200)
        expect(spy.mock.calls.length).toBe(callsAfterFirst + 1)

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
