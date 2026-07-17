import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import type { Request, Response, NextFunction } from 'express'

// Load .env.local so JWT_SECRET is available when running outside Docker
dotenv.config({ path: '.env.local' })

export interface AuthenticatedRequest extends Request {
    user?: { id: number }
}

/*
 * generateToken — creates a signed JWT for a logged-in user.
 *
 * The payload stores `sub` ("subject"), the standard JWT claim for the
 * user's ID — per JWT convention this is a string. Expiry is 24 hours —
 * after that the token is invalid and the user must log in again.
 */
export function generateToken(userId: number): string {
    return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET as string, {
        expiresIn: '24h'
    })
}

/*
 * verifyToken — decodes and verifies a JWT string, returning the user ID
 * encoded in its `sub` claim. Throws if the token is expired, malformed,
 * or the signature doesn't match.
 */
export function verifyToken(token: string): number {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string)
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
        throw new Error('Invalid token payload')
    }
    return Number(payload.sub)
}

/*
 * requireAuth — Express middleware that protects routes.
 *
 * Clients send their JWT in the Authorization header:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 * Attaches the decoded user info to req.user so route handlers can read
 * req.user.id. Returns 401 if the token is missing, malformed, or expired.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).send({ error: 'Authentication required' })
        return
    }

    try {
        const userId = verifyToken(authHeader.slice(7))
        req.user = { id: userId }
        next()
    } catch {
        res.status(401).send({ error: 'Invalid or expired token' })
    }
}
