import { timingSafeEqual } from 'crypto'
import type { Request, Response, NextFunction } from 'express'

/*
 * The only caller of admin endpoints gated by this is a GitHub Actions
 * cron workflow, not a logged-in user — see docs/superpowers/specs/
 * 2026-08-23-anime-cache-verification-worker-design.md for why a shared
 * secret is the right-sized auth here instead of a user role. Fails loud
 * at import time, same convention as lib/auth.ts's JWT_SECRET check.
 */
function requireCronSecretEnv(): string {
    const secret = process.env.ADMIN_CRON_SECRET
    if (!secret) {
        throw new Error('ADMIN_CRON_SECRET must be set')
    }
    return secret
}
const ADMIN_CRON_SECRET = requireCronSecretEnv()

/*
 * requireCronSecret — gates machine-triggered admin endpoints behind a
 * shared secret sent as X-Cron-Secret. Compared with timingSafeEqual so a
 * mismatched value can't be distinguished by response timing; the length
 * check first avoids timingSafeEqual throwing on differing buffer lengths.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
    const provided = Buffer.from(req.header('X-Cron-Secret') ?? '')
    const expected = Buffer.from(ADMIN_CRON_SECRET)

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        res.status(401).send({ error: 'Invalid or missing cron secret' })
        return
    }
    next()
}
