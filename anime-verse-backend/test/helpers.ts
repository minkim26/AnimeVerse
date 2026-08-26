import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Express } from 'express'

import prisma from '../lib/prisma.ts'
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM } from '../lib/auth.ts'

export interface TestUser {
    id: number
    email: string
    token: string
    cleanup: () => Promise<void>
}

function requireTestSigningSecret(): string {
    const secret = process.env.AUTH0_TEST_SIGNING_SECRET
    if (!secret) {
        throw new Error('AUTH0_TEST_SIGNING_SECRET must be set to run tests (see .env.example)')
    }
    return secret
}

/*
 * createTestUser — mints a real, validly-signed HS256 access token
 * (lib/auth.ts switches checkJwt to HS256 verification whenever
 * AUTH0_TEST_SIGNING_SECRET is set, instead of RS256-via-JWKS against a
 * real Auth0 tenant) and calls the real POST /users/sync route to
 * provision the User row — same "exercise the real route, not a Prisma
 * shortcut" philosophy the old version used for signup/login. Each call
 * uses a unique fake Auth0 subject and email, so tests never collide with
 * each other or with leftover rows from a previous run.
 */
export async function createTestUser(app: Express): Promise<TestUser> {
    const sub = `test|${randomUUID()}`
    const email = `test-${randomUUID()}@example.com`

    const token = jwt.sign(
        { [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true },
        requireTestSigningSecret(),
        {
            subject: sub,
            algorithm: 'HS256',
            issuer: process.env.ISSUER_BASE_URL,
            audience: process.env.AUDIENCE,
            expiresIn: '1h'
        }
    )

    const syncRes = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`).expect(201)

    return {
        id: syncRes.body.id,
        email,
        token,
        cleanup: async () => {
            await prisma.user.delete({ where: { id: syncRes.body.id } }).catch(() => {})
        }
    }
}
