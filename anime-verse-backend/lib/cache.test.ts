import { describe, it, expect } from 'vitest'

import { userCacheKey, preferencesCacheKey } from './cache.ts'

describe('userCacheKey', () => {
    it('namespaces the key by user id', () => {
        expect(userCacheKey(42)).toBe('cache:user:42')
    })

    it('produces different keys for different users', () => {
        expect(userCacheKey(1)).not.toBe(userCacheKey(2))
    })
})

describe('preferencesCacheKey', () => {
    it('namespaces the key by user id', () => {
        expect(preferencesCacheKey(42)).toBe('cache:preferences:42')
    })

    it('never collides with a user cache key for the same id', () => {
        expect(preferencesCacheKey(42)).not.toBe(userCacheKey(42))
    })
})
