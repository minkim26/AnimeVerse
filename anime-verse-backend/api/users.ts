import { Router } from 'express'
import bcrypt from 'bcryptjs'

import prisma from '../lib/prisma.ts'
import { User, UpdatePassword } from '../lib/zod.ts'
import { generateToken, requireAuth, type AuthenticatedRequest } from '../lib/auth.ts'

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
router.post('/', async (req, res) => {
    const data = User.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
        return res.status(400).send({ error: 'A user with that email already exists' })
    }

    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR)

    const user = await prisma.user.create({
        data: { email: data.email, password: hashedPassword }
    })

    res.status(201).send({ id: user.id })
})

/*
 * POST /users/login — Authenticate a user and return a JWT.
 *
 * We return the same 401 whether the email doesn't exist or the password
 * is wrong — this avoids leaking which emails are registered.
 *
 * Returns: 200 { token } on success, 401 on invalid credentials
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).send({ error: 'Email and password are required' })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).send({ error: 'Invalid credentials' })
    }

    res.status(200).send({ token: generateToken(user.id) })
})

/*
 * GET /users/me — Fetch the authenticated user's profile (excluding
 * their password hash).
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
        return res.status(404).send({ error: 'User not found' })
    }

    const { password, ...userWithoutPassword } = user
    res.status(200).send(userWithoutPassword)
})

/*
 * PATCH /users/me/password — Update the authenticated user's password.
 *
 * The caller must supply their current password; we re-verify it with
 * bcrypt.compare() before allowing the change (same behavior the old
 * server.js already had for /api/updatePassword).
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

    res.status(204).send()
})

export default router
