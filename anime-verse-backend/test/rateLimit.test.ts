import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/supabase.ts', async () => {
    const { supabaseMock } = await import('../test/supabaseMock.ts')
    return { default: supabaseMock }
})

import app from '../app.ts'
import redis from '../lib/redis.ts'
import { createTestUser } from './helpers.ts'
import { FAKE_PNG } from './supabaseMock.ts'

const AUTH_LIMIT = 10
const UPLOAD_LIMIT = 20

describe('authLimiter', () => {
    beforeAll(async () => {
        const keys = await redis.keys('rl:auth:*')
        if (keys.length > 0) await redis.del(keys)
    })

    it(
        'allows up to the limit then 429s, keyed by IP',
        async () => {
            for (let i = 0; i < AUTH_LIMIT; i++) {
                const res = await request(app)
                    .post('/users/login')
                    .send({ email: 'nobody@example.com', password: 'wrong-password' })
                expect(res.status).toBe(401)
            }

            const blocked = await request(app)
                .post('/users/login')
                .send({ email: 'nobody@example.com', password: 'wrong-password' })
            expect(blocked.status).toBe(429)
        },
        20_000
    )
})

describe('uploadLimiter', () => {
    it(
        'is keyed per authenticated user, not shared across users',
        async () => {
            const userA = await createTestUser(app)
            const userB = await createTestUser(app)

            for (let i = 0; i < UPLOAD_LIMIT; i++) {
                const res = await request(app)
                    .post('/avatar')
                    .set('Authorization', `Bearer ${userA.token}`)
                    .attach('file', FAKE_PNG, 'avatar.png')
                expect(res.status).not.toBe(429)
            }

            const blockedA = await request(app)
                .post('/avatar')
                .set('Authorization', `Bearer ${userA.token}`)
                .attach('file', FAKE_PNG, 'avatar.png')
            expect(blockedA.status).toBe(429)

            const okB = await request(app)
                .post('/avatar')
                .set('Authorization', `Bearer ${userB.token}`)
                .attach('file', FAKE_PNG, 'avatar.png')
            expect(okB.status).not.toBe(429)

            await userA.cleanup()
            await userB.cleanup()
        },
        30_000
    )
})
