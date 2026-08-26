# Auth0 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AnimeVerse's self-issued JWT auth (bcrypt + `jsonwebtoken`) with Auth0 (Universal Login: email/password, Google, GitHub) end to end — backend token validation, frontend login/session, existing-user migration, and CI/E2E.

**Architecture:** Frontend gets `@auth0/auth0-react` + Universal Login redirects; backend swaps `lib/auth.ts` from HS256 self-signing to `express-oauth2-jwt-bearer` (RS256-via-JWKS in production, HS256-shared-secret in tests). A new `POST /users/sync` route resolves an Auth0 identity to the existing integer `User.id` every other route already depends on, either creating a new row or linking a pre-migration one by email.

**Tech Stack:** `@auth0/auth0-react` (frontend), `express-oauth2-jwt-bearer` (backend), Prisma migration on the existing `User` model, Playwright for E2E.

**Spec:** [docs/superpowers/specs/2026-08-26-auth0-migration-design.md](../specs/2026-08-26-auth0-migration-design.md) — read it first. This plan implements it with four deliberate deviations, called out where they happen:
1. **Env var names**: the spec says `AUTH0_ISSUER_BASE_URL`; this plan uses `ISSUER_BASE_URL` (no prefix) because that's the literal name `express-oauth2-jwt-bearer` auto-reads from the environment — `AUTH0_ISSUER_BASE_URL` would silently never be read.
2. **`jsonwebtoken` stays as a devDependency**, not fully removed — it mints test-only HS256 tokens (see Task 2's testing strategy). No production code imports it.
3. **A stripped-response helper survives**, renamed from `withoutPassword` to `withoutAuth0Id` — `auth0Id` isn't secret, but it's an internal identity detail the API's response shape shouldn't leak, matching the spec's own instinct even though the spec said to delete the helper outright.
4. **Route tests use an HS256 shared-secret bypass, not module-mocking.** The spec's Testing Approach suggested mocking `express-oauth2-jwt-bearer`'s `auth()` at the module level. This plan instead makes `checkJwt`'s signing algorithm swap to HS256 when `AUTH0_TEST_SIGNING_SECRET` is set (a first-class config option the library already supports), so tests exercise the exact same verification code path production does — just with a different key — instead of a hand-rolled mock standing in for it. See Task 2, Step 5.

## Global Constraints

- No dual auth system — this is a hard cutover, not a gradual rollout (spec's Non-Goals).
- Every existing protected route keeps using `req.user!.id` as an integer, unchanged.
- `email` stays `@unique` on `User` — no cross-provider account linking (spec's Non-Goals).
- The `POST /users/sync` link-to-a-pre-migration-row path only ever fires when the Auth0 token's `email_verified` custom claim is `true` (security requirement from the spec — an unverified email must never link to someone else's existing account).
- This worktree needs its own Docker Compose identity before running anything: create `anime-verse-backend/.env` (gitignored, Compose's own auto-loaded file — distinct from `.env.local`/`.env.production`) containing `COMPOSE_PROJECT_NAME=anime-verse-backend-auth0-migration`, then `docker compose up -d postgres redis rabbitmq` from `anime-verse-backend/`. Also run `cp .env.example .env.local` at the repo root before any frontend work (fresh worktrees don't carry `.env.local`, and `VITE_API_URL` has no fallback).
- Backend commands in this plan assume these env vars exported inline (this sandbox scrubs `.env*` files between tool calls, so export them in the same shell command that runs the test/build, same pattern used throughout this project's session history):
  ```bash
  POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/animeverse" \
  ISSUER_BASE_URL=https://test.auth0.local/ \
  AUDIENCE=https://test-audience \
  AUTH0_TEST_SIGNING_SECRET=test-signing-secret-not-for-production-use-000000 \
  PORT=8000 SUPABASE_URL=https://fake.supabase.co SUPABASE_KEY=fake-key \
  RABBITMQ_URL=amqp://localhost REDIS_URL=redis://localhost:6379 \
  FRONTEND_URL=http://localhost:5173,http://localhost:5174 \
  ADMIN_CRON_SECRET=test-admin-cron-secret-000000000000000000000000 \
  <command>
  ```

---

### Task 1: Auth0 tenant setup (MANUAL — human only, not agent-executable)

**Files:** none — this is dashboard configuration. No commit.

**Interfaces:**
- Produces: real values for `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUDIENCE` (the API identifier), plus a working Post-Login Action — every later task's real (non-test) configuration depends on these.

This can't be done by an agent — it requires clicking through the Auth0 dashboard (or the `auth0` CLI, if you have it installed and are logged in). Do this whenever convenient; Tasks 2-5 don't need it (they run against the `AUTH0_TEST_SIGNING_SECRET` bypass). Tasks 6 and 7 do need it.

- [ ] **Step 1: Create the tenant and SPA application**

Sign up / log in at https://manage.auth0.com. Create an application: **Applications → Create Application → Single Page Web Applications**. Note its **Domain** and **Client ID** — these become `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID`.

- [ ] **Step 2: Create the API (Resource Server)**

**Applications → APIs → Create API**. Name it (e.g. "AnimeVerse API"), set an **Identifier** (e.g. `https://api.animeverse.minkim26.tech` — doesn't have to resolve to anything real, it's just a stable string). This identifier becomes `AUDIENCE` on the backend **and** `VITE_AUTH0_AUDIENCE` on the frontend — they must match exactly.

- [ ] **Step 3: Set callback/logout/origin URLs on the SPA application**

Back in the SPA application's settings, add to **all four** of Allowed Callback URLs, Allowed Logout URLs, Allowed Web Origins, and Allowed Origins (CORS):
```
http://localhost:5173,https://animeverse.minkim26.tech
```

- [ ] **Step 4: Enable Google and GitHub social connections**

**Authentication → Social**. Enable **Google** (works immediately with Auth0's shared dev keys for testing — fine for now, swap to your own Google OAuth client before this matters for real users). Enable **GitHub**: register an OAuth App at https://github.com/settings/developers (Authorization callback URL: `https://<your-tenant>.auth0.com/login/callback`), then paste its Client ID/Secret into Auth0's GitHub connection settings. Under both connections' **Applications** tab, make sure the SPA application from Step 1 is enabled.

- [ ] **Step 5: Add the Post-Login Action that exposes email on the access token**

**Actions → Library → Build Custom**, name it "Add email to access token", trigger **Login / Post Login**:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://animeverse.app/'
  api.accessToken.setCustomClaim(`${namespace}email`, event.user.email)
  api.accessToken.setCustomClaim(`${namespace}email_verified`, event.user.email_verified)
}
```

Deploy it, then **Actions → Flows → Login**, drag it into the flow, and hit Apply. Without this, `POST /users/sync` (Task 2) 400s on every login — the access token the backend sees carries no profile claims otherwise.

- [ ] **Step 6: Record the values**

Write down `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUDIENCE` somewhere you can paste from later (Tasks 6 and 7 need them; don't commit them anywhere).

---

### Task 2: Backend auth rewrite

**Files:**
- Modify: `anime-verse-backend/package.json`
- Modify: `anime-verse-backend/prisma/schema.prisma`
- Create: a new migration under `anime-verse-backend/prisma/migrations/` (generated, not hand-written)
- Modify: `anime-verse-backend/.env.example`
- Modify: `anime-verse-backend/lib/auth.ts` (full rewrite)
- Modify: `anime-verse-backend/lib/cache.ts` (rename `withoutPassword` → `withoutAuth0Id`)
- Modify: `anime-verse-backend/lib/rateLimit.ts` (remove `authLimiter`)
- Modify: `anime-verse-backend/api/users.ts` (full rewrite)
- Modify: `anime-verse-backend/api/avatar.ts` (swap `withoutPassword` → `withoutAuth0Id`)
- Modify: `anime-verse-backend/test/helpers.ts` (full rewrite)
- Modify: `anime-verse-backend/api/users.test.ts` (full rewrite)
- Modify: `anime-verse-backend/test/rateLimit.test.ts` (remove the `authLimiter` describe block)
- Modify: `anime-verse-backend/lib/swagger.ts` (update the `bearerAuth` security scheme's description)

**Interfaces:**
- Produces: `checkJwt` (Express middleware, exported from `lib/auth.ts`), `requireAuth` (array of middleware, same import path and usage every other route file already has: `router.get('/me', requireAuth, handler)`), `EMAIL_CLAIM` / `EMAIL_VERIFIED_CLAIM` (string constants, exported from `lib/auth.ts`), `AuthenticatedRequest` (interface, same shape as today plus an `auth?: { payload: Record<string, unknown> }` field), `withoutAuth0Id` (exported from `lib/cache.ts`, same shape as the old `withoutPassword`), `createTestUser(app): Promise<TestUser>` (unchanged signature and return shape — `{ id, email, token, cleanup }` — so every other `api/*.test.ts` file needs zero changes).
- Consumes: nothing from earlier tasks.

This is one atomic task: the schema change removes the `password` column, so the old bcrypt-based routes and the new Auth0-based ones cannot coexist even transiently in one working tree.

- [ ] **Step 1: Update dependencies**

```bash
cd anime-verse-backend
npm install express-oauth2-jwt-bearer
npm uninstall bcryptjs @types/bcryptjs
npm install --save-dev jsonwebtoken@^9.0.3 @types/jsonwebtoken@^9.0.7
```

`jsonwebtoken` was already a runtime dependency (used to self-issue tokens); this moves it to devDependencies at the same version, since only `test/helpers.ts` needs it from here on.

- [ ] **Step 2: Update the schema**

Edit `anime-verse-backend/prisma/schema.prisma`'s `User` model:

```prisma
model User {
    id                 Int             @id @default(autoincrement())
    auth0Id            String?         @unique
    email              String          @unique
    avatarUrl          String?
    avatarThumbnailUrl String?
    createdAt          DateTime        @default(now())
    preferences        Preference?
    watchlist          WatchlistItem[]
    reviews            Review[]
    swipes             Swipe[]
}
```

(`password` field deleted; `auth0Id` added, nullable-but-unique — nullable because a pre-migration row hasn't linked to an Auth0 identity yet, see Task 7's Migration Sequencing.)

- [ ] **Step 3: Generate and apply the migration**

```bash
docker compose up -d postgres
npx prisma migrate dev --name add_auth0_id_drop_password
```

Confirm any data-loss prompt (this worktree's dev database has only disposable test data). This both writes the migration SQL under `prisma/migrations/` and applies it to your local dev database. Commit the generated migration folder along with the schema.

- [ ] **Step 4: Update `.env.example`**

Replace `JWT_SECRET=change-me` with:

```
# express-oauth2-jwt-bearer reads these two exact names from the
# environment automatically. ISSUER_BASE_URL is the Auth0 tenant's full
# URL including https://; AUDIENCE is the API identifier from Auth0's
# Applications > APIs (must match VITE_AUTH0_AUDIENCE on the frontend
# exactly).
ISSUER_BASE_URL=https://your-tenant.us.auth0.com/
AUDIENCE=https://your-api-identifier

# Test-only. When set, lib/auth.ts verifies tokens with this shared HS256
# secret instead of RS256-via-JWKS against a real Auth0 tenant, so tests
# don't need network access to Auth0. MUST NEVER be set in production —
# lib/auth.ts throws at startup if it is and NODE_ENV=production.
AUTH0_TEST_SIGNING_SECRET=
```

- [ ] **Step 5: Rewrite `lib/auth.ts`**

```ts
import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, Response, NextFunction } from 'express'

import prisma from './prisma.ts'

export const EMAIL_CLAIM = 'https://animeverse.app/email'
export const EMAIL_VERIFIED_CLAIM = 'https://animeverse.app/email_verified'

/*
 * AUTH0_TEST_SIGNING_SECRET switches JWT verification from real Auth0
 * RS256-via-JWKS to a locally-verifiable HS256 shared secret, so tests
 * (test/helpers.ts) can mint real, validly-signed tokens with no network
 * call to a real Auth0 tenant. Guarded so it can never accidentally take
 * over in production — anyone holding this value could forge a token for
 * any user if it did.
 */
const testSigningSecret = process.env.AUTH0_TEST_SIGNING_SECRET
if (testSigningSecret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH0_TEST_SIGNING_SECRET must not be set in production')
}

// ISSUER_BASE_URL and AUDIENCE are read automatically from the
// environment either way — only the signing algorithm/secret differs.
export const checkJwt = testSigningSecret
    ? auth({ secret: testSigningSecret, tokenSigningAlg: 'HS256' })
    : auth()

export interface AuthenticatedRequest extends Request {
    user?: { id: number }
    auth?: { payload: Record<string, unknown> }
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

// Every existing route imports `requireAuth` and uses it as a single
// middleware argument — Express accepts an array of middleware the same
// way, so no route file needs to change.
export const requireAuth = [checkJwt, resolveUser]
```

- [ ] **Step 6: Rename the cache helper**

In `anime-verse-backend/lib/cache.ts`, replace:

```ts
export function withoutPassword<T extends { password: unknown }>(user: T): Omit<T, 'password'> {
    const { password, ...rest } = user
    return rest
}
```

with:

```ts
/*
 * withoutAuth0Id — the one place that decides what a "user" object looks
 * like once it leaves this app, whether headed for an HTTP response or a
 * Redis cache entry. auth0Id isn't secret, but it's an internal identity
 * detail this API's response shape shouldn't expose.
 */
export function withoutAuth0Id<T extends { auth0Id: unknown }>(user: T): Omit<T, 'auth0Id'> {
    const { auth0Id, ...rest } = user
    return rest
}
```

- [ ] **Step 7: Fix `api/avatar.ts`'s now-broken import**

Change the import line:

```ts
import { setJSON, userCacheKey, withoutPassword, USER_CACHE_TTL_SECONDS } from '../lib/cache.ts'
```

to:

```ts
import { setJSON, userCacheKey, withoutAuth0Id, USER_CACHE_TTL_SECONDS } from '../lib/cache.ts'
```

and the call site:

```ts
await setJSON(userCacheKey(req.user!.id), withoutPassword(updatedUser), USER_CACHE_TTL_SECONDS)
```

to:

```ts
await setJSON(userCacheKey(req.user!.id), withoutAuth0Id(updatedUser), USER_CACHE_TTL_SECONDS)
```

- [ ] **Step 8: Remove `authLimiter`**

In `anime-verse-backend/lib/rateLimit.ts`, delete the whole `authLimiter` block (its export and the comment above it) — it only ever guarded the two routes this task deletes.

- [ ] **Step 9: Rewrite `api/users.ts`**

Full file:

```ts
import { Router } from 'express'

import prisma from '../lib/prisma.ts'
import { checkJwt, requireAuth, EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM, type AuthenticatedRequest } from '../lib/auth.ts'
import { getJSON, setJSON, invalidate, userCacheKey, withoutAuth0Id, USER_CACHE_TTL_SECONDS } from '../lib/cache.ts'

const router = Router()

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
 */
router.post('/sync', checkJwt, async (req: AuthenticatedRequest, res) => {
    const sub = req.auth!.payload.sub as string
    const email = req.auth!.payload[EMAIL_CLAIM] as string | undefined
    const emailVerified = req.auth!.payload[EMAIL_VERIFIED_CLAIM] as boolean | undefined

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
    if (emailVerified) {
        const linked = await prisma.user.updateMany({ where: { email, auth0Id: null }, data: { auth0Id: sub } })
        if (linked.count > 0) {
            const user = await prisma.user.findUniqueOrThrow({ where: { auth0Id: sub } })
            return res.status(200).send(withoutAuth0Id(user))
        }
    }

    const user = await prisma.user.create({ data: { auth0Id: sub, email } })
    res.status(201).send(withoutAuth0Id(user))
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

export default router
```

(`POST /users`, `POST /users/login`, and `PATCH /users/me/password` are gone. `invalidate` stays imported since `POST /avatar` still uses `userCacheKey` from this same cache module elsewhere — no change needed there.)

- [ ] **Step 10: Rewrite `test/helpers.ts`**

```ts
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Express } from 'express'

import prisma from '../lib/prisma.ts'
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM } from '../lib/auth.ts'

export interface TestUser {
    id: number
    email: string
    token: string
    cleanup: () => Promise<void>
}

function requireTestSigningSecret(): string {
    const secret = process.env.AUTH0_TEST_SIGNING_SECRET
    if (!secret) {
        throw new Error('AUTH0_TEST_SIGNING_SECRET must be set to run tests (see .env.example)')
    }
    return secret
}

/*
 * createTestUser — mints a real, validly-signed HS256 access token
 * (lib/auth.ts switches checkJwt to HS256 verification whenever
 * AUTH0_TEST_SIGNING_SECRET is set, instead of RS256-via-JWKS against a
 * real Auth0 tenant) and calls the real POST /users/sync route to
 * provision the User row — same "exercise the real route, not a Prisma
 * shortcut" philosophy the old version used for signup/login. Each call
 * uses a unique fake Auth0 subject and email, so tests never collide with
 * each other or with leftover rows from a previous run.
 */
export async function createTestUser(app: Express): Promise<TestUser> {
    const sub = `test|${randomUUID()}`
    const email = `test-${randomUUID()}@example.com`

    const token = jwt.sign(
        { [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true },
        requireTestSigningSecret(),
        {
            subject: sub,
            algorithm: 'HS256',
            issuer: process.env.ISSUER_BASE_URL,
            audience: process.env.AUDIENCE,
            expiresIn: '1h'
        }
    )

    const syncRes = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`).expect(201)

    return {
        id: syncRes.body.id,
        email,
        token,
        cleanup: async () => {
            await prisma.user.delete({ where: { id: syncRes.body.id } }).catch(() => {})
        }
    }
}
```

- [ ] **Step 11: Rewrite `api/users.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

import app from '../app.ts'
import prisma from '../lib/prisma.ts'
import { EMAIL_CLAIM, EMAIL_VERIFIED_CLAIM } from '../lib/auth.ts'
import { createTestUser } from '../test/helpers.ts'

function uniqueEmail(): string {
    return `test-${Math.random().toString(36).slice(2)}@example.com`
}

function signToken(payload: Record<string, unknown>, options: jwt.SignOptions = {}): string {
    return jwt.sign(payload, process.env.AUTH0_TEST_SIGNING_SECRET!, {
        algorithm: 'HS256',
        issuer: process.env.ISSUER_BASE_URL,
        audience: process.env.AUDIENCE,
        expiresIn: '1h',
        ...options
    })
}

describe('POST /users/sync', () => {
    it('creates a new user on first sync', async () => {
        const email = uniqueEmail()
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: `test|${email}` })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.email).toBe(email)
        await prisma.user.delete({ where: { email } })
    })

    it('is idempotent: syncing the same identity twice returns the same user', async () => {
        const user = await createTestUser(app)

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.id).toBe(user.id)
        await user.cleanup()
    })

    it('links a pre-migration row (auth0Id null) by verified email instead of creating a duplicate', async () => {
        const email = uniqueEmail()
        const preMigrationUser = await prisma.user.create({ data: { email, auth0Id: null } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: true }, { subject: 'test|new-auth0-identity' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.id).toBe(preMigrationUser.id)
        await prisma.user.delete({ where: { id: preMigrationUser.id } })
    })

    it('does not link a pre-migration row when the email is not verified', async () => {
        const email = uniqueEmail()
        const preMigrationUser = await prisma.user.create({ data: { email, auth0Id: null } })
        const token = signToken({ [EMAIL_CLAIM]: email, [EMAIL_VERIFIED_CLAIM]: false }, { subject: 'test|attacker-identity' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.id).not.toBe(preMigrationUser.id)
        await prisma.user.delete({ where: { id: preMigrationUser.id } })
        await prisma.user.delete({ where: { id: res.body.id } })
    })

    it('rejects a token with no email claim', async () => {
        const token = signToken({}, { subject: 'test|no-email' })

        const res = await request(app).post('/users/sync').set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('requires authentication', async () => {
        const res = await request(app).post('/users/sync')
        expect(res.status).toBe(401)
    })
})

describe('GET /users/me', () => {
    it("returns the caller's profile without leaking auth0Id", async () => {
        const user = await createTestUser(app)

        const res = await request(app).get('/users/me').set('Authorization', `Bearer ${user.token}`)

        expect(res.status).toBe(200)
        expect(res.body.email).toBe(user.email)
        expect(res.body.auth0Id).toBeUndefined()
        await user.cleanup()
    })

    it('requires authentication', async () => {
        const res = await request(app).get('/users/me')
        expect(res.status).toBe(401)
    })
})
```

- [ ] **Step 12: Remove the `authLimiter` describe block from `test/rateLimit.test.ts`**

Delete the entire `describe('authLimiter', ...)` block (it exercises `POST /users/login`, which no longer exists). Leave `uploadLimiter`, `swipesLimiter`, `watchlistLimiter`, and `reviewsLimiter`'s blocks untouched — they only depend on `createTestUser`, which Step 10 already fixed.

- [ ] **Step 13: Update the OpenAPI security scheme description**

In `anime-verse-backend/lib/swagger.ts`, the bearer scheme currently has no `description`. Add one so the live `/api-docs` UI reflects the new token source:

```ts
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'An Auth0-issued access token (see POST /users/sync), not a self-issued one.'
                },
```

- [ ] **Step 14: Run the full backend suite**

```bash
npx prisma generate
POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/animeverse" \
ISSUER_BASE_URL=https://test.auth0.local/ AUDIENCE=https://test-audience \
AUTH0_TEST_SIGNING_SECRET=test-signing-secret-not-for-production-use-000000 \
PORT=8000 SUPABASE_URL=https://fake.supabase.co SUPABASE_KEY=fake-key \
RABBITMQ_URL=amqp://localhost REDIS_URL=redis://localhost:6379 \
FRONTEND_URL=http://localhost:5173,http://localhost:5174 \
ADMIN_CRON_SECRET=test-admin-cron-secret-000000000000000000000000 \
npm test
```

Expected: every test file passes, including `preferences.test.ts`, `watchlist.test.ts`, `reviews.test.ts`, `swipes.test.ts`, `avatar.test.ts`, `recommendations.test.ts`, and `admin.test.ts` — none of them needed any changes, since they all go through `createTestUser`. Also run `npm run build` (typecheck) to confirm nothing else references the deleted `password` field, `generateToken`, `verifyToken`, `revokeTokensIssuedBefore`, or `withoutPassword`.

- [ ] **Step 15: Commit**

```bash
git add anime-verse-backend/package.json anime-verse-backend/package-lock.json \
  anime-verse-backend/prisma/schema.prisma anime-verse-backend/prisma/migrations \
  anime-verse-backend/.env.example anime-verse-backend/lib/auth.ts \
  anime-verse-backend/lib/cache.ts anime-verse-backend/lib/rateLimit.ts \
  anime-verse-backend/lib/swagger.ts anime-verse-backend/api/users.ts \
  anime-verse-backend/api/avatar.ts anime-verse-backend/test/helpers.ts \
  anime-verse-backend/api/users.test.ts anime-verse-backend/test/rateLimit.test.ts
git commit -m "Replace self-issued JWT auth with Auth0 token validation"
```

---

### Task 3: Frontend Auth0 bootstrap

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/main.tsx`
- Modify: `src/services/api.ts`
- Create: `src/components/Auth0SyncGate.tsx`

**Interfaces:**
- Consumes: nothing from Task 2 directly (frontend and backend are independent until Task 4 wires real requests through).
- Produces: `setAccessTokenGetter(fn)` (exported from `src/services/api.ts`) — every existing `services/*.ts` file's `apiRequest(path, { auth: true })` calls stay unchanged and start working once this is wired up.

- [ ] **Step 1: Install the SDK**

```bash
npm install @auth0/auth0-react
```

- [ ] **Step 2: Update root `.env.example`**

Add below the existing two variables:

```
# Auth0 SPA application (Applications > Applications) and API (Applications
# > APIs) identifiers — see anime-verse-backend/.env.example's AUDIENCE
# comment. Must match the backend's AUDIENCE exactly.
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://your-api-identifier
```

- [ ] **Step 3: Add the token bridge to `src/services/api.ts`**

Add near the top (after `ApiError`, before `getToken`/`setToken`/`clearToken` — which Task 4 deletes):

```ts
let tokenGetter: (() => Promise<string>) | null = null

// Registered once by Auth0SyncGate, since getAccessTokenSilently is only
// reachable via the useAuth0() hook, but apiRequest is a plain function
// called from services/*.ts files with no component tree of their own.
export function setAccessTokenGetter(fn: () => Promise<string>): void {
  tokenGetter = fn
}
```

Then in `apiRequest`, replace:

```ts
  if (auth) {
    const token = getToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }
```

with:

```ts
  if (auth) {
    if (!tokenGetter) {
      throw new Error('Auth0 is not initialized yet')
    }
    headers.Authorization = `Bearer ${await tokenGetter()}`
  }
```

- [ ] **Step 4: Create `src/components/Auth0SyncGate.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setAccessTokenGetter, apiRequest } from '../services/api.ts'

interface Auth0SyncGateProps {
  children: ReactNode
}

/*
 * Bridges Auth0's React hooks to services/api.ts's plain-function
 * apiRequest, and calls POST /users/sync once per login before anything
 * else can hit a route that needs req.user.id resolved. Only blocks
 * rendering while isAuthenticated is true and sync hasn't finished yet —
 * an anonymous visitor (or a page load before Auth0 has decided whether a
 * session exists) renders children immediately, so public pages never
 * wait on Auth0 at all.
 */
export default function Auth0SyncGate({ children }: Auth0SyncGateProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [synced, setSynced] = useState(false)
  const syncedForRef = useRef<boolean | null>(null)

  useEffect(() => {
    setAccessTokenGetter(getAccessTokenSilently)
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!isAuthenticated) {
      syncedForRef.current = false
      setSynced(false)
      return
    }
    if (syncedForRef.current === isAuthenticated) return

    syncedForRef.current = isAuthenticated
    apiRequest('/users/sync', { method: 'POST', auth: true })
      .then(() => setSynced(true))
      .catch((err) => {
        console.error('[Auth0SyncGate] Failed to sync user:', err)
        setSynced(true) // don't block forever on a transient failure; the next authenticated call will surface the real error
      })
  }, [isAuthenticated])

  if (isAuthenticated && !synced) {
    return null
  }

  return children
}
```

- [ ] **Step 5: Wrap `src/main.tsx` in `Auth0Provider` and `Auth0SyncGate`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import Auth0SyncGate from './components/Auth0SyncGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <Auth0SyncGate>
        <App />
      </Auth0SyncGate>
    </Auth0Provider>
  </StrictMode>,
)
```

`useRefreshTokens` is a plan-level addition beyond what the spec specified: without it, a silently-expired access token falls back to an iframe-based renewal against Auth0's session cookie, which modern browsers' third-party-cookie blocking makes unreliable. Refresh tokens avoid the iframe entirely.

- [ ] **Step 6: Verify the build**

```bash
npm run build
npm run lint
```

Expected: both pass. There's no automated test for this task (no component test renders `Auth0Provider` today — confirmed by searching `src/**/*.test.*`, all four existing frontend test files are service/hook-level, not component-level). Real functional verification happens in Task 4 once `ProtectedRoute` actually depends on `useAuth0()`, and needs Task 1's real tenant to click through in a browser.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example src/main.tsx src/services/api.ts src/components/Auth0SyncGate.tsx
git commit -m "Add Auth0Provider, token bridge, and post-login sync gate"
```

---

### Task 4: Frontend UI updates

**Files:**
- Modify: `src/components/ProtectedRoute.tsx`
- Modify: `src/components/RedirectIfAuthenticated.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/Signup.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `src/services/auth.ts`

**Interfaces:**
- Consumes: `Auth0SyncGate`/`Auth0Provider` from Task 3 (must be in the tree for `useAuth0()` to work at all).
- Produces: nothing new — this is the last frontend task.

- [ ] **Step 1: Rewrite `src/components/ProtectedRoute.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth0 } from '@auth0/auth0-react'

interface ProtectedRouteProps {
  children: ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth0()

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
```

- [ ] **Step 2: Rewrite `src/components/RedirectIfAuthenticated.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth0 } from '@auth0/auth0-react'

interface RedirectIfAuthenticatedProps {
  children: ReactNode
}

// Inverse of ProtectedRoute: keeps an already-logged-in user off the
// login/signup triggers instead of gating a page behind a session.
export default function RedirectIfAuthenticated({ children }: RedirectIfAuthenticatedProps) {
  const { isAuthenticated, isLoading } = useAuth0()

  if (isLoading) {
    return null
  }

  if (isAuthenticated) {
    return <Navigate to="/profile" replace />
  }

  return children
}
```

- [ ] **Step 3: Simplify `src/pages/Login.tsx`**

Replace the whole file:

```tsx
import { useAuth0 } from '@auth0/auth0-react'
import { useLocation } from 'react-router'
import { Link } from 'react-router'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import usePageMeta from '../hooks/usePageMeta.ts'

export default function Login() {
  usePageMeta({
    title: 'Log In',
    description: 'Log in to AnimeVerse to pick up your personalized anime recommendations and continue where you left off.',
  })
  const { loginWithRedirect } = useAuth0()
  const location = useLocation()

  function handleLogin() {
    const from = (location.state as { from?: Location } | null)?.from
    loginWithRedirect({ appState: { returnTo: from?.pathname ?? '/profile' } })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md surface-card p-8 sm:p-10 text-center">
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-4 text-[var(--color-ink)]">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--color-muted)] mb-8">
            Log in to see fresh recommendations tuned to your taste.
          </p>

          <button onClick={handleLogin} className="btn btn-accent w-full px-6 py-3 text-sm">
            Log In
          </button>

          <p className="text-center text-sm text-[var(--color-muted)] mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[var(--color-accent)] font-medium underline">
              Sign Up
            </Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
```

`appState.returnTo` is read back in Step 4's `onRedirectCallback`.

- [ ] **Step 4: Simplify `src/pages/Signup.tsx`**

Replace the whole file:

```tsx
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import usePageMeta from '../hooks/usePageMeta.ts'

export default function Signup() {
  usePageMeta({
    title: 'Sign Up',
    description: 'Create a free AnimeVerse account to start building your taste profile and get anime recommendations made for you.',
  })
  const { loginWithRedirect } = useAuth0()

  function handleSignup() {
    loginWithRedirect({
      authorizationParams: { screen_hint: 'signup' },
      appState: { returnTo: '/profile' },
    })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md surface-card p-8 sm:p-10 text-center">
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2 text-[var(--color-ink)]">
            Create an Account
          </h1>
          <p className="text-sm text-[var(--color-muted)] mb-8">
            Registering allows you to access personalized anime recommendations.
          </p>

          <button onClick={handleSignup} className="btn btn-accent w-full px-6 py-3 text-sm">
            Sign Up
          </button>

          <p className="text-center text-xs text-[var(--color-muted)] mt-6">
            By creating an account, you agree to our{' '}
            <Link to="/privacy-policy" className="text-[var(--color-secondary)] underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
```

- [ ] **Step 5: Handle the redirect callback in `src/main.tsx`**

Add an `onRedirectCallback` to `Auth0Provider` (added in Task 3) so Login's `appState.returnTo` actually navigates there instead of Auth0's default (stripping the URL and staying put):

```tsx
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={(appState) => {
        window.history.replaceState({}, '', appState?.returnTo ?? '/profile')
      }}
    >
```

- [ ] **Step 6: Trim `src/services/auth.ts`**

Replace the whole file:

```ts
import { apiRequest } from './api.ts'

export interface User {
  id: number
  email: string
  avatarUrl: string | null
  avatarThumbnailUrl: string | null
  createdAt: string
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/users/me', { auth: true })
}
```

(`signUp`, `signIn`, `signOut`, `isAuthenticated`, `updatePassword` deleted — every call site below uses `useAuth0()` directly or `ProtectedRoute`'s own check.)

- [ ] **Step 7: Update `src/pages/Profile.tsx`**

Delete the `PasswordForm` function entirely and its render in the `bento-grid` (`<PasswordForm />`).

Change the imports:

```ts
import { getCurrentUser, type User } from '../services/auth.ts'
```

(drop `signOut`, `updatePassword`), and add:

```ts
import { useAuth0 } from '@auth0/auth0-react'
```

Inside the `Profile` component, add near the top:

```ts
  const { logout } = useAuth0()
```

Replace the `useEffect`'s 401 handling and `handleLogout`:

```tsx
  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        // Only a real 401 means the session is invalid — a network hiccup
        // or the fetch aborting on navigation shouldn't force a logout.
        if (err instanceof ApiError && err.status === 401) {
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
      })
  }, [logout])

  function handleLogout() {
    logout({ logoutParams: { returnTo: window.location.origin } })
  }
```

- [ ] **Step 8: Verify**

```bash
npm run build
npm run lint
```

Manual verification (needs Task 1's real tenant): `npm run dev`, click Login/Signup, confirm the Auth0 Universal Login page loads with email/password, Google, and GitHub options, log in, land back on `/profile`, confirm the page loads (this exercises the whole chain: `Auth0SyncGate` → `POST /users/sync` → `GET /users/me` — needs the backend running with real `ISSUER_BASE_URL`/`AUDIENCE` matching Task 1's tenant, not the test bypass).

- [ ] **Step 9: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/components/RedirectIfAuthenticated.tsx \
  src/pages/Login.tsx src/pages/Signup.tsx src/pages/Profile.tsx src/services/auth.ts src/main.tsx
git commit -m "Switch login, signup, and session state to Auth0"
```

---

### Task 5: CI workflow updates

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:** none — this only affects CI environment configuration.

- [ ] **Step 1: Replace `JWT_SECRET` in the `backend` job's `env` block**

```yaml
      ISSUER_BASE_URL: https://test.auth0.local/
      AUDIENCE: https://test-audience
      AUTH0_TEST_SIGNING_SECRET: ci-test-signing-secret-not-for-production-use-0000
```

- [ ] **Step 2: Replace `JWT_SECRET` in the `e2e` job's `env` block** with the same three lines.

- [ ] **Step 3: Verify locally**

There's no way to fully verify a GitHub Actions workflow file outside GitHub, but confirm the YAML is well-formed:

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid YAML"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Point CI at the Auth0 test-signing bypass instead of JWT_SECRET"
```

---

### Task 6: E2E test rewrite (needs Task 1's real tenant to verify)

**Files:**
- Modify: `e2e/explore.spec.ts`

**Interfaces:** none.

`POST /users` and `POST /users/login` are gone, so the old direct-signup approach doesn't exist anymore. This test now drives Auth0's hosted Universal Login form directly — Auth0's own documented E2E pattern, since a Universal-Login-based app has no API endpoint left that accepts raw credentials. This needs one dedicated, already-created Auth0 test user (create one manually: **User Management → Users → Create User** in the dashboard, or `auth0 users create` via the CLI) whose email/password go into new secrets, `E2E_AUTH0_TEST_EMAIL` and `E2E_AUTH0_TEST_PASSWORD` — set them as GitHub repo secrets and, for local runs, as local env vars.

- [ ] **Step 1: Update the test**

```ts
import { test, expect } from '@playwright/test'

test('login then Explore page renders For You and Browse & Search', async ({ page }) => {
  const email = process.env.E2E_AUTH0_TEST_EMAIL
  const password = process.env.E2E_AUTH0_TEST_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_AUTH0_TEST_EMAIL and E2E_AUTH0_TEST_PASSWORD must be set')
  }

  await page.goto('/login')
  await page.getByRole('button', { name: 'Log In' }).click()

  // Cross-origin navigation to Auth0's hosted Universal Login page.
  // These are Auth0's documented New Universal Login field names; if this
  // step fails, inspect the actual rendered page (Auth0 occasionally
  // changes markup between login-experience versions) and adjust the
  // selectors below.
  await page.waitForURL(/\.auth0\.com\/u\/login/)
  await page.locator('input[name="username"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/profile')
  await page.goto('/explore')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/explore')

  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'For You' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse & Search' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  const forYouSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'For You' }) })
  await expect(forYouSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const browseSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Browse & Search' }) })

  await browseSection.getByRole('button', { name: 'Action', exact: true }).click()
  await browseSection.getByRole('button', { name: 'Newest', exact: true }).click()
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const loadMoreButton = browseSection.getByRole('button', { name: 'Load More' })
  if (await loadMoreButton.isVisible()) {
    const countBefore = await browseSection.locator('img').count()
    await loadMoreButton.click()
    await expect(browseSection.getByRole('button', { name: 'Loading...' })).toHaveCount(0, { timeout: 15000 })
    const countAfter = await browseSection.locator('img').count()
    expect(countAfter).toBeGreaterThan(countBefore)
  }

  await browseSection.getByLabel('Search titles').fill('Frieren')
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)
})
```

Note: the test user needs an existing swipe history reset (or a fresh test user per real run) if it's reused repeatedly — same consideration the old version handled implicitly by always signing up a brand-new random email. Since this test now needs a stable, pre-provisioned identity, running it repeatedly against the same tenant user will accumulate swipes; if that becomes a problem, the fix is a scheduled cleanup of that one test user's `Swipe` rows, not part of this task.

- [ ] **Step 2: Add the new secrets to `.github/workflows/ci.yml`'s `e2e` job**

```yaml
      E2E_AUTH0_TEST_EMAIL: ${{ secrets.E2E_AUTH0_TEST_EMAIL }}
      E2E_AUTH0_TEST_PASSWORD: ${{ secrets.E2E_AUTH0_TEST_PASSWORD }}
```

(Also add the frontend's real `VITE_AUTH0_DOMAIN`/`VITE_AUTH0_CLIENT_ID`/`VITE_AUTH0_AUDIENCE` and the backend's real `ISSUER_BASE_URL`/`AUDIENCE` as secrets here too — the `e2e` job needs to talk to the real Auth0 tenant from Task 1, not the HS256 bypass, since it's driving the real Universal Login page.)

- [ ] **Step 3: Verify (requires Task 1 complete and the two new secrets set)**

```bash
E2E_AUTH0_TEST_EMAIL=<your test user's email> E2E_AUTH0_TEST_PASSWORD=<its password> npm run test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add e2e/explore.spec.ts .github/workflows/ci.yml
git commit -m "Drive Auth0 Universal Login directly in the E2E signup/login test"
```

---

### Task 7: Production migration script and runbook (MANUAL execution — do not run against real data without explicit sign-off)

**Files:**
- Create: `anime-verse-backend/scripts/export-users-for-auth0-import.ts`

**Interfaces:** none — standalone script, run once, by hand.

This produces the file Task 1... no — this produces the file used in the spec's Migration Sequencing step 2-3 (export existing users, bulk-import into Auth0). Writing the script is safe; running it against production data, and the subsequent production deploy, are exactly the kind of hard-to-reverse, shared-state actions that need your explicit go-ahead before they run — this task stops at "script exists and works against a local dev database," not "ran it for real."

- [ ] **Step 1: Write the export script**

```ts
// anime-verse-backend/scripts/export-users-for-auth0-import.ts
//
// Run once, before Task 2's migration is applied to production Postgres
// (it reads the password column, which that migration drops). Writes an
// Auth0 bulk-user-import-formatted JSON file. See Auth0's docs for the
// import job itself: https://auth0.com/docs/manage-users/user-migration/bulk-user-imports
//
// Usage: npx tsx scripts/export-users-for-auth0-import.ts > users-import.json

import prisma from '../lib/prisma.ts'

async function main() {
    const users = await prisma.$queryRaw<{ email: string; password: string }[]>`
        SELECT email, password FROM "User"
    `

    const importFormat = users.map((user) => ({
        email: user.email,
        email_verified: true,
        custom_password_hash: { algorithm: 'bcrypt', hash: user.password }
    }))

    console.log(JSON.stringify(importFormat, null, 2))
}

main()
    .catch((err) => {
        console.error(err)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
```

`$queryRaw` instead of `prisma.user.findMany()` deliberately: this script needs to run against the *pre-migration* schema (before Task 2's migration drops `password`), and Prisma's generated client type by then won't have a `password` field to select at all.

- [ ] **Step 2: Verify against local dev data**

```bash
POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/animeverse" npx tsx scripts/export-users-for-auth0-import.ts | head -20
```

Confirm valid JSON with `email`, `email_verified: true`, and `custom_password_hash` on each row.

- [ ] **Step 3: Commit**

```bash
git add anime-verse-backend/scripts/export-users-for-auth0-import.ts
git commit -m "Add a script to export existing users for Auth0 bulk import"
```

- [ ] **Step 4 (MANUAL, production, only with explicit sign-off — not part of this coding session's automated work):**

Follow the spec's Migration Sequencing section in order:
1. Run this script against production Postgres, before Task 2's migration touches production.
2. Import the resulting JSON via the Auth0 Dashboard (Authentication → Database → your connection → Users → Import Users) or `auth0 api post "jobs/users-imports" --data "connection_id=<id>" --data "users=@users-import.json"`.
3. Delete the local export file — it contains bcrypt hashes.
4. Only then run `npx prisma migrate deploy` against production.
5. Deploy the new backend and frontend together (this plan's Tasks 2-6, merged to `main`).
6. Update production secrets: backend gets real `ISSUER_BASE_URL`/`AUDIENCE` (no `AUTH0_TEST_SIGNING_SECRET`); frontend's Cloudflare Workers build env gets real `VITE_AUTH0_DOMAIN`/`VITE_AUTH0_CLIENT_ID`/`VITE_AUTH0_AUDIENCE`.
