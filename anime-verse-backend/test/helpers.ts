import { randomUUID } from 'crypto'
import request from 'supertest'
import type { Express } from 'express'

import prisma from '../lib/prisma.ts'
import redis from '../lib/redis.ts'

export interface TestUser {
    id: number
    email: string
    token: string
    cleanup: () => Promise<void>
}

async function flushAuthRateLimit(): Promise<void> {
    const keys = await redis.keys('rl:auth:*')
    if (keys.length > 0) {
        await redis.del(keys)
    }
}

/*
 * createTestUser — signs up and logs in through the real HTTP routes (not
 * a Prisma shortcut), so tests exercise the real auth flow end to end.
 * Each call uses a unique email so tests never collide with each other or
 * with leftover rows from a previous run.
 *
 * Both POST /users and POST /users/login sit behind authLimiter, keyed by
 * IP — and every test in this suite shares one IP (127.0.0.1). A test that
 * deliberately trips that limiter (see rateLimit.test.ts) would otherwise
 * permanently block every later call to this helper for the rest of the
 * 15-minute window, so it's flushed here before every call rather than
 * relying on other files to clean up after themselves.
 */
export async function createTestUser(app: Express): Promise<TestUser> {
    await flushAuthRateLimit()

    const email = `test-${randomUUID()}@example.com`
    const password = 'test-password-123'

    await request(app).post('/users').send({ email, password }).expect(201)
    const loginRes = await request(app).post('/users/login').send({ email, password }).expect(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { email } })

    return {
        id: user.id,
        email,
        token: loginRes.body.token,
        cleanup: async () => {
            await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
        }
    }
}
