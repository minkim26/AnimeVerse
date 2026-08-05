import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('../lib/supabase.ts', async () => {
    const { supabaseMock } = await import('../test/supabaseMock.ts')
    return { default: supabaseMock }
})

import app from '../app.ts'
import { createTestUser } from '../test/helpers.ts'
import { FAKE_PNG } from '../test/supabaseMock.ts'
import { mimeToExt } from './avatar.ts'

describe('mimeToExt', () => {
    it.each([
        ['image/jpeg', '.jpg'],
        ['image/jpg', '.jpg'],
        ['image/png', '.png'],
        ['image/gif', '.gif'],
        ['image/webp', '.webp']
    ])('maps %s to %s', (mimetype, expected) => {
        expect(mimeToExt(mimetype)).toBe(expected)
    })

    it('extracts an extension from a dotted subtype for an unlisted image type', () => {
        expect(mimeToExt('image/vnd.microsoft.icon')).toBe('.icon')
    })

    it('falls back to .bin when the subtype has no dot to extract', () => {
        expect(mimeToExt('image/bmp')).toBe('.bin')
    })

    it('falls back to .bin when the subtype is empty', () => {
        expect(mimeToExt('image/')).toBe('.bin')
    })
})

describe('POST /avatar validation', () => {
    it('accepts a real image', async () => {
        const user = await createTestUser(app)

        const res = await request(app)
            .post('/avatar')
            .set('Authorization', `Bearer ${user.token}`)
            .attach('file', FAKE_PNG, 'avatar.png')

        expect(res.status).toBe(201)

        await user.cleanup()
    })

    it(
        'rejects a file over the size limit with 413, before it reaches format validation',
        async () => {
            const user = await createTestUser(app)
            const oversized = Buffer.alloc(6 * 1024 * 1024)

            const res = await request(app)
                .post('/avatar')
                .set('Authorization', `Bearer ${user.token}`)
                .attach('file', oversized, { filename: 'big.png', contentType: 'image/png' })

            expect(res.status).toBe(413)

            await user.cleanup()
        },
        15_000
    )

    it('rejects a non-image file disguised with a spoofed image Content-Type', async () => {
        const user = await createTestUser(app)
        const notAnImage = Buffer.from('<script>alert(1)</script>')

        const res = await request(app)
            .post('/avatar')
            .set('Authorization', `Bearer ${user.token}`)
            .attach('file', notAnImage, { filename: 'fake.png', contentType: 'image/png' })

        expect(res.status).toBe(400)

        await user.cleanup()
    })

    it('rejects an SVG (a real image format sharp decodes, but one that can carry a <script>)', async () => {
        const user = await createTestUser(app)
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

        const res = await request(app)
            .post('/avatar')
            .set('Authorization', `Bearer ${user.token}`)
            .attach('file', svg, { filename: 'fake.svg', contentType: 'image/svg+xml' })

        expect(res.status).toBe(400)

        await user.cleanup()
    })
})
