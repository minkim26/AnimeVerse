import { describe, it, expect } from 'vitest'

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
