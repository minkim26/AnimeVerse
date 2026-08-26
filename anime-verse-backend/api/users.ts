import { Router } from 'express'
import bcrypt from 'bcryptjs'

import prisma from '../lib/prisma.ts'
import { User, UpdatePassword } from '../lib/zod.ts'
import { generateToken, requireAuth, revokeTokensIssuedBefore, type AuthenticatedRequest } from '../lib/auth.ts'
import { getJSON, setJSON, invalidate, userCacheKey, withoutPassword, USER_CACHE_TTL_SECONDS } from '../lib/cache.ts'
import { authLimiter } from '../lib/rateLimit.ts'

const router = Router()

const BCRYPT_COST_FACTOR = 10

/*
 * POST /users — Register a new user.
 *
 * Password storage: bcrypt.hash() generates a random salt, mixes it with
 * the password, and runs a slow hashing algorithm. The salt is embedded in
 * the resulting hash string, so bcrypt.compare() can verify a password
 * later without storing the salt separately.
 *
 * Returns: 201 { id } on success
 */
/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Register a new user
 *     description: Rate limited to 10 requests / 15 min / IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *       400:
 *         description: Invalid body, or the email is already registered (same generic message either way)
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', authLimiter, async (req, res) => {
    const data = User.parse(req.body)

    // No pre-check for an existing email: that would return a distinct
    // response for "already registered" vs. any other failure, letting an
    // attacker enumerate which emails have accounts. The @unique constraint
    // on User.email does the work instead; app.ts's error handler turns the
    // resulting P2002 into the same generic 400 as any other failure here.
    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR)

    const user = await prisma.user.create({
        data: { email: data.email, password: hashedPassword }
    })

    res.status(201).send({ id: user.id })
})

/*
 * POST /users/login — Authenticate a user and return a JWT.
 *
 * We return the same 401 whether the email doesn't exist, the password is
 * wrong, or the request body fails validation (e.g. a password under 8
 * characters) — this avoids leaking which emails are registered, and also
 * avoids leaking *why* a login attempt failed. Unlike signup, where format
 * feedback ("password must be at least 8 characters") is helpful and safe
 * to show, on login it's a distinguishing signal an attacker could use to
 * tell malformed input apart from a merely-wrong password. safeParse (not
 * User.parse) is deliberate: a thrown ZodError would bubble to app.ts's
 * error handler as a 400 with format-specific detail, defeating this.
 *
 * Returns: 200 { token } on success, 401 on any other outcome
 */
/**
 * @openapi
 * /users/login:
 *   post:
 *     tags: [Users]
 *     summary: Log in and receive a JWT
 *     description: Rate limited to 10 requests / 15 min / IP. Returns 401 for a bad password, an unknown email, or a malformed body alike, so a failure never reveals which case it was.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string, description: 'JWT, valid 24h' }
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/login', authLimiter, async (req, res) => {
    const result = User.safeParse(req.body)
    if (!result.success) {
        return res.status(401).send({ error: 'Invalid credentials' })
    }
    const { email, password } = result.data

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).send({ error: 'Invalid credentials' })
    }

    res.status(200).send({ token: generateToken(user.id) })
})

/*
 * GET /users/me — Fetch the authenticated user's profile (excluding
 * their password hash). Cached in Redis — invalidated by any endpoint that
 * changes a field this response includes (avatar upload, password change).
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

    const sanitized = withoutPassword(user)
    await setJSON(cacheKey, sanitized, USER_CACHE_TTL_SECONDS)
    res.status(200).send(sanitized)
})

/*
 * PATCH /users/me/password — Update the authenticated user's password.
 *
 * The caller must supply their current password; we re-verify it with
 * bcrypt.compare() before allowing the change (same behavior the old
 * server.js already had for /api/updatePassword).
 */
/**
 * @openapi
 * /users/me/password:
 *   patch:
 *     tags: [Users]
 *     summary: Change the authenticated user's password
 *     description: Revokes every JWT issued before this change, so other logged-in sessions are signed out.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       204:
 *         description: Password updated
 *       400:
 *         description: oldPassword is incorrect
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 */
router.patch('/me/password', requireAuth, async (req: AuthenticatedRequest, res) => {
    const data = UpdatePassword.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
        return res.status(404).send({ error: 'User not found' })
    }

    if (!(await bcrypt.compare(data.oldPassword, user.password))) {
        return res.status(400).send({ error: 'Old password is incorrect' })
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashedNewPassword } })
    await invalidate(userCacheKey(user.id))
    await revokeTokensIssuedBefore(user.id)

    res.status(204).send()
})

export default router
