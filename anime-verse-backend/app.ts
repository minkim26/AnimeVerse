import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import multer from 'multer'
import * as z from 'zod'
import { Prisma } from './generated/prisma/client.ts'

import api from './api/index.ts'

if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL must be set — cors() falls back to allowing all origins otherwise')
}

const app = express()

app.use(morgan('dev'))
app.use(cors({ origin: process.env.FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean) }))
app.use(express.json())
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('X-Frame-Options', 'DENY')
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    next()
})

app.get('/health', (req, res) => {
    res.status(200).send({ status: 'ok' })
})

/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.ts.  That's what we include here, and
 * it provides all of the routes.
 */
app.use('/', api)

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
        // z.prettifyError() is meant for CLI/log output (bullet points, "at
        // <path>" arrows) — not a sentence a user should see on a form. Each
        // issue's own .message is already prose; join them plainly instead.
        res.status(400).send({ error: err.issues.map((issue) => issue.message).join(' ') })
    } else if (
        err instanceof Prisma.PrismaClientValidationError ||
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003')
    ) {
        // Validation errors and invalid-foreign-key (P2003) messages both
        // include internal details (argument shapes, field names) — log
        // server-side, don't hand them to the caller.
        console.error(err)
        res.status(400).send({ error: 'Invalid request' })
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation (e.g. duplicate email on signup). Generic
        // message so this can't be used to enumerate which emails are registered.
        res.status(400).send({ error: 'Unable to complete this request' })
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        // Record not found — fall through to the 404 handler.
        next()
    } else if (err instanceof multer.MulterError) {
        res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).send({ error: err.message })
    } else if (typeof err === 'object' && err !== null && 'status' in err && 'message' in err) {
        const status = Number((err as { status: unknown }).status)
        res.status(status >= 400 && status < 600 ? status : 500).send({ error: (err as { message: unknown }).message })
    } else {
        console.error(err)
        res.status(500).send({ error: 'Internal server error' })
    }
})

app.use('*splat', (req, res) => {
    res.status(404).send({
        error: `Requested resource ${req.originalUrl} does not exist`
    })
})

export default app
