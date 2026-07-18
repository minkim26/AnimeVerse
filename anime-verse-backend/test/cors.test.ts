import { describe, it, expect } from 'vitest'
import request from 'supertest'

import app from '../app.ts'

describe('CORS', () => {
    it('pins Access-Control-Allow-Origin to FRONTEND_URL rather than reflecting the request Origin', async () => {
        const res = await request(app).get('/health').set('Origin', 'http://evil.example')

        expect(res.status).toBe(200)
        expect(res.headers['access-control-allow-origin']).toBe(process.env.FRONTEND_URL)
        expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.example')
    })

    it('allows the configured frontend origin', async () => {
        const res = await request(app).get('/health').set('Origin', process.env.FRONTEND_URL as string)

        expect(res.headers['access-control-allow-origin']).toBe(process.env.FRONTEND_URL)
    })
})

describe('GET /health', () => {
    it('returns 200 ok', async () => {
        const res = await request(app).get('/health')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })
    })
})
