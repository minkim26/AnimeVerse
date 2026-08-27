import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

import prisma from './prisma.ts'

export const EMAIL_CLAIM = 'https://animeverse.app/email'
export const EMAIL_VERIFIED_CLAIM = 'https://animeverse.app/email_verified'
export const PICTURE_CLAIM = 'https://animeverse.app/picture'

/*
 * AUTH0_TEST_SIGNING_SECRET switches JWT verification from real Auth0
 * RS256-via-JWKS to a locally-verifiable HS256 shared secret, so tests
 * (test/helpers.ts) can mint real, validly-signed tokens with no network
 * call to a real Auth0 tenant. Guarded so it can never accidentally take
 * over outside the test runner — anyone holding this value could forge a
 * token for any user if it did. Checked against NODE_ENV === 'test'
 * (Vitest's own default, never set explicitly anywhere in this repo)
 * rather than NODE_ENV === 'production', since neither Dockerfile nor
 * compose.prod.yml ever sets NODE_ENV — a production-only check would
 * silently never fire.
 */
const testSigningSecret = process.env.AUTH0_TEST_SIGNING_SECRET
if (testSigningSecret && process.env.NODE_ENV !== 'test') {
    throw new Error('AUTH0_TEST_SIGNING_SECRET may only be set when NODE_ENV=test')
}

/*
 * The two branches must not share a code path here: express-oauth2-jwt-bearer's
 * own jwtVerifier destructures its options as
 * `{ issuerBaseURL = process.env.ISSUER_BASE_URL, ... }` — that default
 * fires whenever the `issuerBaseURL` key is *absent* from the options
 * object, regardless of what you pass for `issuer`. Since ISSUER_BASE_URL
 * is set in the environment (needed for both branches, and for production's
 * own auto-detection below), simply not mentioning `issuerBaseURL` here
 * still lets the library's default pull it back in and run OIDC discovery
 * (a real network fetch to <issuerBaseURL>/.well-known/openid-configuration)
 * — confirmed empirically: the HS256 branch below failed every test with
 * "Failed to fetch authorization server metadata" after a ~10s timeout
 * until `issuerBaseURL` was explicitly forced falsy. Passing `issuerBaseURL:
 * ''` (not `undefined` — that's what the destructuring default guards
 * against, so it wouldn't override anything) makes `if (issuerBaseURL)`
 * false in the library's source, skipping discovery and going straight to
 * local verification with `issuer`/`secret`/`tokenSigningAlg`.
 */
export const checkJwt = testSigningSecret
    ? auth({
          issuerBaseURL: '',
          issuer: process.env.ISSUER_BASE_URL,
          audience: process.env.AUDIENCE,
          secret: testSigningSecret,
          tokenSigningAlg: 'HS256',
      })
    : auth() // production: reads ISSUER_BASE_URL/AUDIENCE and does real JWKS discovery

// express-oauth2-jwt-bearer already declares `req.auth` globally (typed as
// AuthResult, payload: JWTPayload) in its own .d.ts — redeclaring it here
// with an incompatible type would fail to compile (TS2430: interface
// incorrectly extends Request). Only `user` is new.
export interface AuthenticatedRequest extends Request {
    user?: { id: number }
}

async function resolveUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const sub = req.auth!.payload.sub as string
    const user = await prisma.user.findUnique({ where: { auth0Id: sub } })
    if (!user) {
        res.status(404).send({ error: 'Account not provisioned. Call POST /users/sync first.' })
        return
    }
    req.user = { id: user.id }
    next()
}

/*
 * requireAuth composes checkJwt + resolveUser into ONE RequestHandler
 * rather than exporting `[checkJwt, resolveUser]` as an array. Every
 * existing route calls this as a single middleware argument
 * (`router.get('/me', requireAuth, handler)`), and passing an *array* as
 * that argument — instead of one function — pushes Express's route-handler
 * overload resolution onto a generic-inference path it can't fully solve,
 * which silently drops contextual typing for every handler after it in
 * every file that imports requireAuth (surfaces as "res implicitly has an
 * any type" scattered across unrelated route files, not here). Composing
 * into one function keeps every call site — and the plan's own stated
 * interface — unchanged.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
    checkJwt(req, res, (err?: unknown) => {
        if (err) {
            next(err)
            return
        }
        resolveUser(req as AuthenticatedRequest, res, next).catch(next)
    })
}
