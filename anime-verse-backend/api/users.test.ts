import { describe, it, expect } from 'vitest'
import request from 'supertest'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { createTestUser } from '../test/helpers.ts'

function uniqueEmail(): string {
    return `test-${Math.random().toString(36).slice(2)}@example.com`
}

describe('POST /users', () => {
    it('creates a user with a valid email and password', async () => {
        const email = uniqueEmail()

        const res = await request(app).post('/users').send({ email, password: 'a-real-password' })

        expect(res.status).toBe(201)
        await prisma.user.delete({ where: { email } })
    })

    /*
     * Signup, unlike login, benefits from telling the user exactly what's
     * wrong with their input — there's no credential-enumeration risk in
     * validation-format feedback here. This also proves app.ts's error
     * handler no longer leaks Zod's CLI-style prettified format (bullet
     * points, "at <path>" arrows) — just the plain custom message.
     */
    it('rejects a password under 8 characters with a plain, human-readable message', async () => {
        const res = await request(app).post('/users').send({ email: uniqueEmail(), password: 'short' })

        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Password must be at least 8 characters.')
    })

    it('rejects a malformed email with a plain, human-readable message', async () => {
        const res = await request(app).post('/users').send({ email: 'not-an-email', password: 'a-real-password' })

        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Please enter a valid email address.')
    })
})

describe('POST /users/login', () => {
    it('logs in with correct credentials', async () => {
        const user = await createTestUser(app)

        const res = await request(app).post('/users/login').send({ email: user.email, password: 'test-password-123' })

        expect(res.status).toBe(200)
        expect(res.body.token).toBeDefined()
        await user.cleanup()
    })

    it('rejects a wrong password with a generic message', async () => {
        const user = await createTestUser(app)

        const res = await request(app).post('/users/login').send({ email: user.email, password: 'wrong-password' })

        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Invalid credentials')
        await user.cleanup()
    })

    it('rejects a non-existent email with the same generic message', async () => {
        const res = await request(app).post('/users/login').send({ email: uniqueEmail(), password: 'whatever-password' })

        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Invalid credentials')
    })

    /*
     * The security-relevant case: a malformed request body (password too
     * short to ever be a real account's password) must produce the exact
     * same response as any other login failure — same status, same
     * message. Never the format-specific Zod message signup shows, which
     * would let an attacker distinguish "your input failed validation"
     * from "your credentials are simply wrong".
     */
    it('rejects a password under 8 characters with the same generic message as wrong credentials, not a validation-specific one', async () => {
        const res = await request(app).post('/users/login').send({ email: uniqueEmail(), password: 'short' })

        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Invalid credentials')
    })

    it('rejects a malformed email the same way', async () => {
        const res = await request(app).post('/users/login').send({ email: 'not-an-email', password: 'whatever-password' })

        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Invalid credentials')
    })
})
