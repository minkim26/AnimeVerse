import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM } from '../lib/auth.ts'
import { createTestUser } from '../test/helpers.ts'

function uniqueEmail(): string {
    return `test-${Math.random().toString(36).slice(2)}@example.com`
}

function signToken(payload: Record<string, unknown>, options: jwt.SignOptions = {}): string {
    return jwt.sign(payload, process.env.AUTH0_TEST_SIGNING_SECRET!, {
        algorithm: 'HS256',
        issuer: process.env.ISSUER_BASE_URL,
        audience: process.env.AUDIENCE,
        expiresIn: '1h',
        ...options
    })
}

describe('POST /users/sync', () => {
    it('creates a new user on first sync', async () => {
        const email = uniqueEmail()
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: `test|${email}` })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.email).toBe(email)
        await prisma.user.delete({ where: { email } })
    })

    it('is idempotent: syncing the same identity twice returns the same user', async () => {
        const user = await createTestUser(app)

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.id).toBe(user.id)
        await user.cleanup()
    })

    it('links a pre-migration row (auth0Id null) by verified email instead of creating a duplicate', async () => {
        const email = uniqueEmail()
        const preMigrationUser = await prisma.user.create({ data: { email, auth0Id: null } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: 'test|new-auth0-identity' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.id).toBe(preMigrationUser.id)
        await prisma.user.delete({ where: { id: preMigrationUser.id } })
    })

    /*
     * email stays @unique on User (Global Constraints), so an unverified
     * claimant sharing a pre-migration row's email can't link (security
     * requirement) and also can't fall back to creating a second row with
     * that same email — the create() collides on the unique constraint and
     * 400s. The attacker's sync attempt simply fails; the pre-migration row
     * stays unlinked (auth0Id still null) either way.
     */
    it('does not link a pre-migration row when the email is not verified', async () => {
        const email = uniqueEmail()
        const preMigrationUser = await prisma.user.create({ data: { email, auth0Id: null } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: false }, { subject: 'test|attacker-identity' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
        const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: preMigrationUser.id } })
        expect(unchanged.auth0Id).toBeNull()
        await prisma.user.delete({ where: { id: preMigrationUser.id } })
    })

    it('rejects a token with no email claim', async () => {
        const token = signToken({}, { subject: 'test|no-email' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('requires authentication', async () => {
        const res = await request(app).post('/users/sync')
        expect(res.status).toBe(401)
    })

    it('rejects a token signed with the wrong secret', async () => {
        const token = jwt.sign(
            { [EMAIL_CLAIM]: uniqueEmail(), [EMAIL_VERIFIED_CLAIM]: true },
            'a-completely-different-secret',
            {
                subject: 'test|wrong-signature',
                algorithm: 'HS256',
                issuer: process.env.ISSUER_BASE_URL,
                audience: process.env.AUDIENCE,
                expiresIn: '1h'
            }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(401)
    })

    it('rejects a token with the wrong audience', async () => {
        const token = signToken(
            { [EMAIL_CLAIM]: uniqueEmail(), [EMAIL_VERIFIED_CLAIM]: true },
            { subject: 'test|wrong-audience', audience: 'https://not-the-right-audience' }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(401)
    })

    it('rejects a token with the wrong issuer', async () => {
        const token = signToken(
            { [EMAIL_CLAIM]: uniqueEmail(), [EMAIL_VERIFIED_CLAIM]: true },
            { subject: 'test|wrong-issuer', issuer: 'https://not-the-right-issuer.example.com/' }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(401)
    })

    it('rejects an expired token', async () => {
        // A negative expiresIn produces an exp already in the past, without
        // setting payload.exp directly alongside it — jsonwebtoken's sign()
        // throws if both options.expiresIn and payload.exp are present
        // (confirmed empirically), and signToken's default options always
        // carry an expiresIn key, so overriding it here (rather than adding
        // a separate exp claim) is what actually keeps this a single,
        // unambiguous expiration source.
        const token = signToken(
            { [EMAIL_CLAIM]: uniqueEmail(), [EMAIL_VERIFIED_CLAIM]: true },
            { subject: 'test|expired', expiresIn: -3600 }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(401)
    })
})

describe('GET /users/me', () => {
    it("returns the caller's profile without leaking auth0Id", async () => {
        const user = await createTestUser(app)

        const res = await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.email).toBe(user.email)
        expect(res.body.auth0Id).toBeUndefined()
        await user.cleanup()
    })

    it('requires authentication', async () => {
        const res = await request(app).get('/users/me')
        expect(res.status).toBe(401)
    })

    it('returns 404 for a validly-signed token whose subject never called /users/sync', async () => {
        const token = signToken({ [EMAIL_CLAIM]: uniqueEmail(), [EMAIL_VERIFIED_CLAIM]: true }, { subject: 'test|never-synced' })

        const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(404)
    })
})
