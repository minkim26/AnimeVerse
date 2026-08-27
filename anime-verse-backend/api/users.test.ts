import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM, PICTURE_CLAIM } from '../lib/auth.ts'
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

    it("sets providerAvatarUrl from the token's picture claim on creation", async () => {
        const email = uniqueEmail()
        const picture = 'https://lh3.googleusercontent.com/a/some-google-photo'
        const token = signToken(
            { [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true, [PICTURE_CLAIM]: picture },
            { subject: `test|${email}` }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.providerAvatarUrl).toBe(picture)
        await prisma.user.delete({ where: { email } })
    })

    it('leaves providerAvatarUrl null when the token has no picture claim', async () => {
        const email = uniqueEmail()
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: `test|${email}` })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.providerAvatarUrl).toBeNull()
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
     * gets the same 409 as any other email conflict. The attacker's sync
     * attempt simply fails; the pre-migration row stays unlinked (auth0Id
     * still null) either way.
     */
    it('does not link a pre-migration row when the email is not verified', async () => {
        const email = uniqueEmail()
        const preMigrationUser = await prisma.user.create({ data: { email, auth0Id: null } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: false }, { subject: 'test|attacker-identity' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(409)
        const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: preMigrationUser.id } })
        expect(unchanged.auth0Id).toBeNull()
        await prisma.user.delete({ where: { id: preMigrationUser.id } })
    })

    /*
     * The scenario that actually surfaced this: the same person signs in
     * with one provider (creating a User row linked to that auth0Id), then
     * later tries a different provider using the same, verified email.
     * There's no pre-migration row here (auth0Id is already set, not null),
     * so the linking branch above never even runs — this exercises the
     * create()-collides-on-email path directly, with the row already fully
     * owned by another identity rather than sitting unlinked.
     */
    it('returns 409 instead of creating a duplicate when the email already belongs to a different linked identity', async () => {
        const firstUser = await createTestUser(app)
        const token = signToken(
            { [EMAIL_CLAIM]: firstUser.email, [EMAIL_VERIFIED_CLAIM]: true },
            { subject: 'test|a-different-provider' }
        )

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(409)
        // createTestUser signs subjects as `test|<uuid>` — an unrecognized
        // provider prefix, so this exercises the generic-label fallback.
        // The named-provider cases are covered below.
        expect(res.body.error).toBe('An account with this email already exists. Sign in with a different sign-in method instead.')
        const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: firstUser.id } })
        expect(unchanged.email).toBe(firstUser.email)
        await firstUser.cleanup()
    })

    it.each([
        ['google-oauth2|1234', 'Google'],
        ['github|1234', 'GitHub'],
        ['auth0|1234', 'your email and password']
    ])('names the existing account\'s sign-in method (%s -> %s) when the claimant\'s email is verified', async (existingSub, expectedMethod) => {
        const email = uniqueEmail()
        const existingUser = await prisma.user.create({ data: { email, auth0Id: existingSub } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: 'test|a-second-provider' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(409)
        expect(res.body.error).toBe(`An account with this email already exists. Sign in with ${expectedMethod} instead.`)
        await prisma.user.delete({ where: { id: existingUser.id } })
    })

    it('does not name the existing account\'s sign-in method when the claimant\'s email is unverified', async () => {
        const email = uniqueEmail()
        const existingUser = await prisma.user.create({ data: { email, auth0Id: 'google-oauth2|1234' } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: false }, { subject: 'test|an-unverified-claimant' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(409)
        expect(res.body.error).toBe('An account with this email already exists. Sign in with the method you used before.')
        await prisma.user.delete({ where: { id: existingUser.id } })
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

describe('DELETE /users/me', () => {
    it("deletes the caller's account", async () => {
        const user = await createTestUser(app)

        const res = await request(app).delete('/users/me').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(204)
        const deleted = await prisma.user.findUnique({ where: { id: user.id } })
        expect(deleted).toBeNull()
    })

    it('requires authentication', async () => {
        const res = await request(app).delete('/users/me')
        expect(res.status).toBe(401)
    })

    // The actual motivation for this route: deleting the old account frees
    // its email so a different provider can sync with it afterward, instead
    // of hitting the 409 above forever.
    it('frees the email for a different identity to sync with afterward', async () => {
        const user = await createTestUser(app)
        await request(app).delete('/users/me').set('Authorization', `Bearer ${user.token}`)

        const newToken = signToken(
            { [EMAIL_CLAIM]: user.email, [EMAIL_VERIFIED_CLAIM]: true },
            { subject: 'test|a-fresh-identity' }
        )
        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${newToken}`)

        expect(res.status).toBe(201)
        await prisma.user.delete({ where: { email: user.email } })
    })
})
