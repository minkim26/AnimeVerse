import redis from './redis.ts'

export const QUOTES_CACHE_KEY = 'cache:quotes'
export const TITLES_CACHE_KEY = 'cache:titles'

export function userCacheKey(userId: number): string {
    return `cache:user:${userId}`
}

export function preferencesCacheKey(userId: number): string {
    return `cache:preferences:${userId}`
}

export async function getJSON<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key)
    return cached ? (JSON.parse(cached) as T) : null
}

export async function setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds })
}

export async function invalidate(key: string): Promise<void> {
    await redis.del(key)
}

/*
 * getOrSetJSON — read-through cache for data with no write path of its own
 * (e.g. the seeded Quote/Title tables). On a miss, calls `fn`, caches the
 * result, and returns it.
 */
export async function getOrSetJSON<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await getJSON<T>(key)
    if (cached !== null) {
        return cached
    }

    const value = await fn()
    await setJSON(key, value, ttlSeconds)
    return value
}
