import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import type { Request } from 'express'

import redis from './redis.ts'
import type { AuthenticatedRequest } from './auth.ts'

const MINUTE = 60_000

function makeStore(prefix: string): RedisStore {
    return new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => redis.sendCommand(args)
    })
}

/*
 * perUserKey keys a limiter by authenticated user, falling back to IP if
 * req.user isn't set yet. Shared by every limiter that should cap per-user
 * rather than per-IP.
 */
function perUserKey(req: Request): string {
    const userId = (req as AuthenticatedRequest).user?.id
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip!)
}

/*
 * authLimiter — caps signup/login attempts per IP. Directly targets
 * credential-stuffing/brute-force attempts against POST /users and
 * POST /users/login.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * MINUTE,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:auth:')
})

/*
 * uploadLimiter — caps avatar uploads per authenticated user (falls back to
 * IP if, somehow, req.user isn't set yet). Runs after requireAuth in the
 * route chain.
 */
export const uploadLimiter = rateLimit({
    windowMs: 60 * MINUTE,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:upload:'),
    keyGenerator: perUserKey
})

/*
 * swipesLimiter caps Discover-deck swipes per authenticated user (falls
 * back to IP if req.user isn't set yet). Runs after requireAuth, same
 * pattern as uploadLimiter.
 */
export const swipesLimiter = rateLimit({
    windowMs: 60 * MINUTE,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore('rl:swipes:'),
    keyGenerator: perUserKey
})

/*
 * watchlistLimiter and reviewsLimiter cap writes to each collection per
 * authenticated user. Unlike swipes (a rapid-fire onboarding action),
 * adding to a watchlist or writing a review is a deliberate, low-frequency
 * action, so the limit is lower — this exists to bound abuse, not to be
 * felt by a real user. Same shape for both, differing only in the Redis
 * key prefix that keeps their counters separate.
 */
function makeCollectionLimiter(prefix: string): ReturnType<typeof rateLimit> {
    return rateLimit({
        windowMs: 60 * MINUTE,
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
        store: makeStore(prefix),
        keyGenerator: perUserKey
    })
}

export const watchlistLimiter = makeCollectionLimiter('rl:watchlist:')
export const reviewsLimiter = makeCollectionLimiter('rl:reviews:')
