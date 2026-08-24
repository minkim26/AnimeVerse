import { describe, it, expect } from 'vitest'
import request from 'supertest'

import app from '../app.ts'

describe('CORS', () => {
    // FRONTEND_URL is a comma-separated list (e.g. local dev needs both the
    // normal :5173 origin and Playwright's :5174 one). cors() with an array
    // origin reflects back whichever configured origin actually matched the
    // request, not the raw env var string, and sets no ACAO header at all
    // when nothing matched.
    //
    // CI sets FRONTEND_URL with a space after the comma, and these expected
    // origins are hardcoded rather than re-derived by splitting FRONTEND_URL
    // here: deriving them the same way app.ts does would make this test
    // pass even if app.ts stopped trimming whitespace, since both sides
    // would carry the same untrimmed value.
    const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174']

    it('does not reflect an origin outside the configured list', async () => {
        const res = await request(app).get('/health').set('Origin', 'http://evil.example')

        expect(res.status).toBe(200)
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('allows each configured frontend origin, trimming whitespace after commas', async () => {
        for (const origin of allowedOrigins) {
            const res = await request(app).get('/health').set('Origin', origin)
            expect(res.headers['access-control-allow-origin']).toBe(origin)
        }
    })
})

describe('GET /health', () => {
    it('returns 200 ok', async () => {
        const res = await request(app).get('/health')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })
    })
})

describe('security headers', () => {
    it('sets nosniff, frame-deny, and a referrer policy on every response', async () => {
        const res = await request(app).get('/health')

        expect(res.headers['x-content-type-options']).toBe('nosniff')
        expect(res.headers['x-frame-options']).toBe('DENY')
        expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    })
})
