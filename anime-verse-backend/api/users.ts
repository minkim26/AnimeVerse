import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { Prisma } from '../generated/prisma/client.ts'
import { checkJwt, requireAuth, EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM, type AuthenticatedRequest } from '../lib/auth.ts'
import {
    getJSON,
    setJSON,
    invalidate,
    userCacheKey,
    preferencesCacheKey,
    withoutAuth0Id,
    USER_CACHE_TTL_SECONDS
} from '../lib/cache.ts'

const router = Router()

/*
 * Auth0's `sub` claim is always `<connection>|<external-id>` for every
 * connection type this tenant has enabled — the prefix alone tells us which
 * provider an existing row is signed in with, no Auth0 API call needed.
 */
function signInMethodLabel(auth0Id: string): string {
    const provider = auth0Id.split('|')[0]
    switch (provider) {
        case 'auth0':
            return 'your email and password'
        case 'google-oauth2':
            return 'Google'
        case 'github':
            return 'GitHub'
        default:
            return 'a different sign-in method'
    }
}

/*
 * POST /users/sync — called once by the frontend right after Auth0 login.
 * Resolves the caller's Auth0 identity to a local User row: reuses one
 * already linked to this auth0Id, links a pre-migration row with the same
 * email (see docs/superpowers/plans/2026-08-26-auth0-migration.md's
 * Migration Sequencing), or creates a fresh one.
 */
/**
 * @openapi
 * /users/sync:
 *   post:
 *     tags: [Users]
 *     summary: Provision or resolve the local User row for the authenticated Auth0 identity
 *     description: Idempotent. Must be called once after every login before any other authenticated route, since those 404 for an identity that hasn't synced yet.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Existing or newly-linked user
 *       201:
 *         description: Newly created user
 *       400:
 *         description: The Auth0 token is missing the email claim (see the Post-Login Action in Auth0's dashboard)
 *       401:
 *         description: Missing or invalid token
 *       409:
 *         description: This email already belongs to a different Auth0 identity (no cross-provider account linking)
 */
router.post('/sync', checkJwt, async (req: AuthenticatedRequest, res) => {
    const sub = req.auth!.payload.sub as string
    const email = req.auth!.payload[EMAIL_CLAIM] as string | undefined
    const emailVerified = req.auth!.payload[EMAIL_VERIFIED_CLAIM]

    if (!email) {
        return res.status(400).send({ error: 'Auth0 token is missing the email claim' })
    }

    const existing = await prisma.user.findUnique({ where: { auth0Id: sub } })
    if (existing) {
        return res.status(200).send(withoutAuth0Id(existing))
    }

    // Bridges a pre-migration row imported from the old system: such a row
    // has this email and auth0Id still NULL. Only a row created by the
    // bulk import can match here — every row created after cutover always
    // has auth0Id set at creation (see the create() call below) — so this
    // can only ever link an imported account, never hijack a normal
    // signup. Gated on emailVerified so an attacker can't race the real
    // owner by registering an unverified Auth0 identity with the owner's
    // email.
    if (emailVerified === true) {
        const linked = await prisma.user.updateMany({ where: { email, auth0Id: null }, data: { auth0Id: sub } })
        if (linked.count > 0) {
            const user = await prisma.user.findUniqueOrThrow({ where: { auth0Id: sub } })
            return res.status(200).send(withoutAuth0Id(user))
        }
    }

    try {
        const user = await prisma.user.create({ data: { auth0Id: sub, email } })
        res.status(201).send(withoutAuth0Id(user))
    } catch (err) {
        // Two concurrent first-syncs for the same identity (e.g. two tabs)
        // both pass the findUnique check above, then race here — one
        // create() wins, the other hits auth0Id's unique constraint. That's
        // not a real failure, just a late arrival: return the row the
        // other request already created instead of surfacing a 400 that
        // would send the frontend into an unwarranted logout.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const raced = await prisma.user.findUnique({ where: { auth0Id: sub } })
            if (raced) {
                return res.status(200).send(withoutAuth0Id(raced))
            }
            // create() only sets auth0Id and email, so if the constraint that
            // fired wasn't auth0Id (checked above), it was email: some other
            // identity already owns this address — a different sign-in
            // provider, or a pre-migration row this claimant's unverified
            // email wasn't allowed to link above. email stays @unique on User
            // (Global Constraints) — no cross-provider account linking — but
            // that should be a clear, specific rejection, not a generic error
            // that falls through to app.ts's catch-all P2002 handler.
            //
            // Naming the actual provider is only safe once emailVerified is
            // true: the caller has then proven they own this mailbox, so
            // telling them which provider it's registered under just saves a
            // guess. An unverified claimant hasn't proven that, so revealing
            // which provider a given email uses would let them probe
            // arbitrary addresses to see which ones are registered here.
            if (emailVerified === true) {
                const conflicting = await prisma.user.findUnique({ where: { email } })
                const method = conflicting?.auth0Id ? signInMethodLabel(conflicting.auth0Id) : 'a different sign-in method'
                return res.status(409).send({ error: `An account with this email already exists. Sign in with ${method} instead.` })
            }
            return res
                .status(409)
                .send({ error: 'An account with this email already exists. Sign in with the method you used before.' })
        }
        throw err
    }
})

/*
 * GET /users/me — Fetch the authenticated user's profile. Cached in
 * Redis — invalidated by any endpoint that changes a field this response
 * includes (avatar upload).
 */
/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the authenticated user's profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 email: { type: string }
 *                 avatarUrl: { type: string, nullable: true }
 *                 avatarThumbnailUrl: { type: string, nullable: true, description: 'Populated once consumer.ts finishes generating it; null right after upload' }
 *                 createdAt: { type: string, format: date-time }
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const cacheKey = userCacheKey(req.user!.id)
    const cached = await getJSON(cacheKey)
    if (cached) {
        return res.status(200).send(cached)
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
        return res.status(404).send({ error: 'User not found' })
    }

    const sanitized = withoutAuth0Id(user)
    await setJSON(cacheKey, sanitized, USER_CACHE_TTL_SECONDS)
    res.status(200).send(sanitized)
})

/*
 * DELETE /users/me — permanently deletes the caller's account. Preference,
 * WatchlistItem, Review, and Swipe all cascade via the schema's own
 * onDelete: Cascade, so this one delete is enough to remove everything.
 * Only removes the local row — the underlying Auth0 identity isn't touched
 * (that needs Auth0's Management API, not set up here), so logging in again
 * with the same provider just provisions a fresh account. That's also the
 * escape hatch for the email-already-exists 409 above: deleting the old
 * account frees its email for a different provider to sync with.
 */
/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Users]
 *     summary: Permanently delete the authenticated user's account
 *     description: Deletes the User row and everything that references it. Does not revoke the underlying Auth0 identity — logging in again with the same provider provisions a fresh account.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Missing or invalid token
 */
router.delete('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    await prisma.user.delete({ where: { id: req.user!.id } })
    await invalidate(userCacheKey(req.user!.id))
    await invalidate(preferencesCacheKey(req.user!.id))
    res.status(204).send()
})

export default router
