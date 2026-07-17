import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import * as z from 'zod'
import { Prisma } from './generated/prisma/client.ts'

import api from './api/index.ts'

const app = express()
const port = process.env.PORT || 8000

app.use(morgan('dev'))
app.use(cors())
app.use(express.json())

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
        res.status(400).send({ error: z.prettifyError(err) })
    } else if (err instanceof Prisma.PrismaClientValidationError) {
        res.status(400).send({ error: err.message })
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        // Invalid foreign key on create/update.
        res.status(400).send({ error: err.message })
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        // Record not found — fall through to the 404 handler.
        next()
    } else if (typeof err === 'object' && err !== null && 'status' in err && 'message' in err) {
        res.status(Number((err as { status: unknown }).status)).send({ error: (err as { message: unknown }).message })
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

app.listen(port, () => {
    console.log('== Server is running on port', port)
})
