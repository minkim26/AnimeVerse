import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import type { Request, Response, NextFunction } from 'express'

import redis from './redis.ts'

// Load .env.local so JWT_SECRET is available when running outside Docker
dotenv.config({ path: '.env.local' })

// HS256 is only as strong as the key. Below ~32 bytes it becomes
// offline-brute-forceable from a single captured token, so fail loud at
// startup rather than silently signing with a weak secret.
const MIN_JWT_SECRET_LENGTH = 32
function requireJwtSecret(): string {
    const secret = process.env.JWT_SECRET
    if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long`)
    }
    return secret
}
const JWT_SECRET = requireJwtSecret()

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60

export interface AuthenticatedRequest extends Request {
    user?: { id: number }
}

interface VerifiedToken {
    userId: number
    issuedAt: number
}

/*
 * generateToken — creates a signed JWT for a logged-in user.
 *
 * The payload stores `sub` ("subject"), the standard JWT claim for the
 * user's ID — per JWT convention this is a string. Expiry is 24 hours —
 * after that the token is invalid and the user must log in again.
 */
export function generateToken(userId: number): string {
    return jwt.sign({ sub: String(userId) }, JWT_SECRET, {
        expiresIn: TOKEN_LIFETIME_SECONDS,
        algorithm: 'HS256'
    })
}

/*
 * verifyToken — decodes and verifies a JWT string, returning the user ID
 * and issued-at time encoded in it. Throws if the token is expired,
 * malformed, the signature doesn't match, or the payload shape is wrong.
 */
export function verifyToken(token: string): VerifiedToken {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.iat !== 'number') {
        throw new Error('Invalid token payload')
    }
    const userId = Number(payload.sub)
    if (!Number.isInteger(userId)) {
        throw new Error('Invalid token payload')
    }
    return { userId, issuedAt: payload.iat }
}

function revocationKey(userId: number): string {
    return `revoke:user:${userId}`
}

/*
 * revokeTokensIssuedBefore — called after a password change so any token
 * issued before this moment is rejected by requireAuth even though it
 * hasn't expired yet. The revocation marker only needs to outlive the
 * longest-lived token that could still be in circulation, hence the same
 * TTL as TOKEN_LIFETIME_SECONDS.
 */
export async function revokeTokensIssuedBefore(userId: number): Promise<void> {
    await redis.set(revocationKey(userId), Math.floor(Date.now() / 1000), { EX: TOKEN_LIFETIME_SECONDS })
}

/*
 * requireAuth — Express middleware that protects routes.
 *
 * Clients send their JWT in the Authorization header:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 * Attaches the decoded user info to req.user so route handlers can read
 * req.user.id. Returns 401 if the token is missing, malformed, expired, or
 * was issued before the user's last password change.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).send({ error: 'Authentication required' })
        return
    }

    try {
        const { userId, issuedAt } = verifyToken(authHeader.slice(7))
        const revokedAt = await redis.get(revocationKey(userId))
        if (revokedAt && issuedAt <= Number(revokedAt)) {
            res.status(401).send({ error: 'Invalid or expired token' })
            return
        }
        req.user = { id: userId }
        next()
    } catch {
        res.status(401).send({ error: 'Invalid or expired token' })
    }
}
