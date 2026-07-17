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
    keyGenerator: (req: Request): string => {
        const userId = (req as AuthenticatedRequest).user?.id
        return userId ? `user:${userId}` : ipKeyGenerator(req.ip!)
    }
})
