# Auth0 Migration

## Overview

AnimeVerse currently authenticates users itself: `POST /users` and `POST /users/login` hash/verify passwords with bcrypt and hand back a self-issued HS256 JWT (`lib/auth.ts`), stored in `localStorage` and checked by `ProtectedRoute`. This plan replaces that entirely with Auth0: Universal Login (email/password plus Google and GitHub) on the frontend via `@auth0/auth0-react`, and RS256 JWT validation against Auth0's JWKS on the backend via `express-oauth2-jwt-bearer`. Existing users' bcrypt password hashes get imported directly into Auth0's database connection, so nobody re-registers or resets a password because of this change.

Locked-in decisions (from the brainstorming conversation):
- **Full cutover.** No dual auth system. `/users`, `/users/login`, `/users/me/password` are deleted, not deprecated.
- **Existing users import into Auth0**, keeping their current password.
- **Social login added**: Google and GitHub alongside email/password.

## Goals

- Every route currently gated by `requireAuth` keeps working against the same integer `User.id` foreign key, with zero changes to `preferences`, `watchlist`, `reviews`, `swipes`, `recommendations`, or `avatar` route logic.
- Existing accounts log in with their current email and password on day one, with their existing `Preference`/`WatchlistItem`/`Review`/`Swipe` rows intact.
- No secrets or password hashes pass through anywhere except the one-time, human-run bulk import.

## Non-Goals

- **No account linking across providers.** If the same email signs up via Google and later via email/password (or vice versa), the second attempt hits Postgres's existing unique-email constraint and fails the same generic way `POST /users` already fails today on a duplicate email. Auth0's own cross-connection account linking is a real feature but adds real complexity; not worth it for this app's scale.
- **No MFA, DPoP, Organizations, or Universal Portals.** None of those were part of the approved scope; Universal Login by itself covers everything the app needs.
- **No change to the avatar pipeline, recommendation engine, or any AniList-facing code.** Nothing here touches them.
- **No password-change UI in the app.** Auth0's hosted flows (forgot-password link on Universal Login) own that now; `Profile.tsx`'s change-password section is deleted, not reimplemented against Auth0's Management API.

## Architecture

```
Browser                                    Auth0                          Express API
  |                                           |                                |
  |--loginWithRedirect()------------------->  |                                |
  |                        (Universal Login: email/password, Google, GitHub)   |
  |<--redirect back with code----------------  |                                |
  |                                           |                                |
  |--exchanges code for tokens (SDK)-------->  |                                |
  |<--ID token + access token-----------------  |                                |
  |                                           |                                |
  |--POST /users/sync  (Authorization: Bearer <access token>)----------------->|
  |                                           |     checkJwt validates via JWKS |
  |                                           |     reads email/email_verified  |
  |                                           |     custom claims (Action, see  |
  |                                           |     "External Auth0 Setup")     |
  |                                           |     links or creates User row   |
  |<-------------------------------------------------------------------------  |
  |                                                                            |
  |--GET /preferences/me  (Authorization: Bearer <access token>)------------->|
  |                                           |     checkJwt validates          |
  |                                           |     look up User by auth0Id     |
  |                                           |     req.user.id = <int>, as     |
  |                                           |     today                       |
  |<-------------------------------------------------------------------------  |
```

`checkJwt` never talks to Postgres. Resolving `auth0Id` → integer `User.id` is a separate, second step every protected route already needs (same as today's flow decodes a JWT then trusts `req.user.id`).

## Data Model Changes

```prisma
model User {
    id                 Int             @id @default(autoincrement())
    auth0Id            String?         @unique   // NEW — null only for rows not yet linked (see Migration Sequencing)
    email              String          @unique    // unchanged; still enforces one account per email
    avatarUrl          String?
    avatarThumbnailUrl String?
    createdAt          DateTime        @default(now())
    preferences        Preference?
    watchlist          WatchlistItem[]
    reviews            Review[]
    swipes             Swipe[]
    // password column REMOVED — Auth0 owns credentials now
}
```

One migration: add nullable-but-unique `auth0Id`, drop `password`. `email` keeps its existing `@unique` — see "Non-Goals" on why cross-provider linking isn't attempted.

## Backend Architecture

### `lib/auth.ts` — rewritten

```ts
import { auth } from 'express-oauth2-jwt-bearer'
import type { Request, Response, NextFunction } from 'express'
import prisma from './prisma.ts'

// Reads AUTH0_ISSUER_BASE_URL and AUDIENCE from the environment.
export const checkJwt = auth()

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
// way, so no route file changes.
export const requireAuth = [checkJwt, resolveUser]
```

Deleted from this file: `generateToken`, `verifyToken`, `revokeTokensIssuedBefore`, the Redis revocation-key logic, `MIN_JWT_SECRET_LENGTH`/`requireJwtSecret`.

### `api/users.ts`

Deleted: `POST /users` (signup), `POST /users/login`, `PATCH /users/me/password`.

Added — `POST /users/sync`, called once by the frontend right after login:

```ts
const EMAIL_CLAIM = 'https://animeverse.app/email'
const EMAIL_VERIFIED_CLAIM = 'https://animeverse.app/email_verified'

router.post('/sync', checkJwt, async (req: AuthenticatedRequest, res) => {
    const sub = req.auth!.payload.sub as string
    const email = req.auth!.payload[EMAIL_CLAIM] as string | undefined
    const emailVerified = req.auth!.payload[EMAIL_VERIFIED_CLAIM] as boolean | undefined

    if (!email) {
        res.status(400).send({ error: 'Auth0 token is missing the email claim' })
        return
    }

    const existing = await prisma.user.findUnique({ where: { auth0Id: sub } })
    if (existing) {
        res.status(200).send(existing)
        return
    }

    // Bridges a pre-migration row imported from the old system: such a row
    // has this email and auth0Id still NULL. Only a row created by the bulk
    // import can match here — every row created after cutover always has
    // auth0Id set at creation (see the create() call below) — so this can
    // only ever link an imported account, never hijack a normal signup.
    // Gated on emailVerified so an attacker can't race the real owner by
    // registering an unverified Auth0 identity with the owner's email.
    if (emailVerified) {
        const linked = await prisma.user.updateMany({ where: { email, auth0Id: null }, data: { auth0Id: sub } })
        if (linked.count > 0) {
            const user = await prisma.user.findUniqueOrThrow({ where: { auth0Id: sub } })
            res.status(200).send(user)
            return
        }
    }

    const user = await prisma.user.create({ data: { auth0Id: sub, email } })
    res.status(201).send(user)
})
```

`GET /users/me` stays, minus the `withoutPassword` step (nothing sensitive left on the row to strip).

### `lib/rateLimit.ts`

`authLimiter` deleted — it only ever guarded `/users` and `/users/login`. `POST /users/sync` is intentionally left unlimited: it's idempotent, only callable with a valid Auth0 access token (not anonymous), and does at most one indexed lookup plus one conditional update.

### `lib/cache.ts`

`withoutPassword` deleted (no password field left to strip).

### `package.json`

Removed: `jsonwebtoken`, `bcryptjs`, `@types/jsonwebtoken`, `@types/bcryptjs`.
Added: `express-oauth2-jwt-bearer`.

### `.env.example`

Removed: `JWT_SECRET`. Added: `AUTH0_ISSUER_BASE_URL` (e.g. `https://animeverse.us.auth0.com`), `AUDIENCE` (the API identifier registered in Auth0).

### OpenAPI docs (`lib/swagger.ts`, route JSDoc blocks)

`bearerAuth` security scheme's description updates to note the bearer token is now an Auth0-issued access token, not a self-issued one. `/users` and `/users/login`'s `@openapi` blocks are deleted along with the routes; a new block documents `POST /users/sync`.

## Frontend Architecture

### `src/main.tsx`

Wraps `<App />` in `<Auth0Provider>`:

```tsx
<Auth0Provider
  domain={import.meta.env.VITE_AUTH0_DOMAIN}
  clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
  authorizationParams={{
    redirect_uri: window.location.origin,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
  }}
  cacheLocation="localstorage"
>
  <App />
</Auth0Provider>
```

`cacheLocation="localstorage"` keeps the existing UX of staying logged in across a page refresh (the current app already does this via its own `localStorage` token).

### `src/services/api.ts` — the token bridge

`apiRequest`'s `auth: true` path currently reads `localStorage.getItem('token')` synchronously. Auth0's `getAccessTokenSilently()` is async and only reachable via `useAuth0()`. Fix: a module-level holder that a single component registers once, so every existing call site in `services/preferences.ts`, `services/watchlist.ts`, `services/swipes.ts`, etc. stays unchanged.

```ts
// api.ts
let tokenGetter: (() => Promise<string>) | null = null
export function setAccessTokenGetter(fn: () => Promise<string>): void {
  tokenGetter = fn
}
// inside apiRequest, replacing the old getToken() call:
if (auth) {
  if (!tokenGetter) throw new Error('Auth0 not initialized yet')
  headers.Authorization = `Bearer ${await tokenGetter()}`
}
```

### `src/components/Auth0SyncGate.tsx` (new)

Mounted once, inside `Auth0Provider`, above `<App />`. Registers `setAccessTokenGetter(getAccessTokenSilently)` on every render (cheap, needed regardless of auth state). Only blocks rendering with a loading state when `isAuthenticated` is true and the sync call hasn't resolved yet for this session; for an anonymous visitor it renders `children` immediately, so public pages (Home, Privacy Policy) never wait on Auth0 at all. This guarantees no protected route ever hits the 404-because-not-synced-yet race from `resolveUser` — the only cost is a brief loading flash for an already-logged-in user loading any page fresh, the same class of unavoidable flash `Auth0Provider`'s own `isLoading` already introduces.

### `src/components/ProtectedRoute.tsx` / `RedirectIfAuthenticated.tsx`

Swap the `isAuthenticated()`/`localStorage` check for `useAuth0()`'s `isAuthenticated` and `isLoading`.

### `src/pages/Login.tsx` / `Signup.tsx`

Custom email/password forms replaced with a single button each: `loginWithRedirect()` for Login, `loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })` for Signup. Both routes stay (so nothing else in the app that links to `/login` or `/signup` needs to change), they just become thin redirect triggers.

### `src/pages/Profile.tsx`

Change-password section removed entirely (Auth0's Universal Login owns password resets via its own "forgot password" link).

### `src/services/auth.ts`

`signUp`, `signIn`, `updatePassword`, `isAuthenticated` deleted — call sites use `useAuth0()` directly. `getCurrentUser()` stays, still calling `GET /users/me`.

### `.env.example` (root)

Added: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.

## External Auth0 Setup (manual, one-time)

1. **Create the tenant**, a **Single Page Application** (React) → gives the frontend's `domain`/`clientId`.
2. **Create an API** (Resource Server) with an identifier (e.g. `https://api.animeverse.minkim26.tech`) → becomes `AUDIENCE`.
3. **Callback/Logout/Web-Origin URLs**: `http://localhost:5173` and `https://animeverse.minkim26.tech` in all three URL lists.
4. **Enable Google and GitHub social connections** on the SPA application. Google works out of the box with Auth0's shared dev keys for local testing; GitHub needs a GitHub OAuth App registered with its client ID/secret entered into Auth0's connection settings.
5. **Add a Post-Login Action** that puts `email`/`email_verified` into the access token (access tokens don't carry profile claims by default — only ID tokens do, and the backend only ever sees the access token):
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://animeverse.app/'
     api.accessToken.setCustomClaim(`${namespace}email`, event.user.email)
     api.accessToken.setCustomClaim(`${namespace}email_verified`, event.user.email_verified)
   }
   ```
6. **Bulk-import existing users** into Auth0's database connection before flipping the frontend/backend over — see Migration Sequencing below.

## Migration Sequencing

Order matters here specifically to avoid locking anyone out:

1. Do steps 1-5 above in Auth0 (no app code affected yet).
2. Export current `User` rows (`email`, `password` bcrypt hash) from Postgres.
3. Bulk-import them into Auth0's database connection via `custom_password_hash: { algorithm: "bcrypt", hash: { value: "<existing hash>", encoding: "utf8" } }`. Auth0 accepts bcrypt directly, so nobody's password changes. Set `"email_verified": true` on every imported row: these are real, already-established accounts, and step 6 below requires that flag before linking an imported row to its Auth0 identity. Without it, the unique constraint on `email` blocks the replacement row `/users/sync` would otherwise create, so the returning user's sync fails instead of silently duplicating their account.
4. Run the Postgres migration (add `auth0Id`, drop `password`) — every existing row now has `auth0Id: null`.
5. Deploy the new backend and frontend together (they have to move as one unit — the old JWT format and the new one aren't compatible, so there's no partial-rollout state that works).
6. First login per existing user: Auth0 issues a token for their (newly imported) identity; `POST /users/sync` finds their pre-migration row by email (`auth0Id: null`) and links it, preserving their integer `id` and everything hanging off it.

Step 5 is a hard cutover: anyone with an old self-issued JWT still in `localStorage` gets a 401 on their next API call (that route no longer exists / the token format is no longer accepted) and is redirected to `/login`, which now means Auth0 Universal Login. Expected and fine — nobody has to do anything except log in again, once, with the same email and password they already had.

## New Secrets

- `AUTH0_ISSUER_BASE_URL`, `AUDIENCE` — backend (`.env.production`, and `ci.yml`'s backend/e2e jobs, replacing `JWT_SECRET`).
- `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` — frontend build-time (Cloudflare Workers build env, and `ci.yml`'s frontend/e2e jobs).
- `E2E_AUTH0_TEST_EMAIL`, `E2E_AUTH0_TEST_PASSWORD` — a dedicated Auth0 test user's credentials, for E2E (see Testing Approach).

## Known Limitations

- **Cross-provider email collisions fail, not merge.** Documented under Non-Goals; a real limitation if it ever matters, cheap to leave as-is at this app's scale.
- **The email-claim Action is a single point of failure for sync.** If the Action is ever removed or misconfigured in the Auth0 dashboard, `/users/sync` starts 400ing for every new login. Nothing in this repo can detect that automatically; it would show up as a very visible bug (nobody can log in), not a silent one.
- **E2E gets measurably slower and flakier.** Driving a real hosted login page over the network on every E2E run is inherently less reliable than the old direct `POST /users/login`. Accepted (see Testing Approach).

## Testing Approach

- **Backend unit/integration**: the auth0Id-lookup and link-or-create logic in `resolveUser` and `POST /users/sync` are plain Prisma calls, testable against the existing real-Postgres CI service container without any real Auth0 token. `checkJwt` itself (actual JWT/JWKS verification) is Auth0's own tested code, not re-tested here.
- **Route tests that need an authenticated request** (the existing `api/*.test.ts` files, e.g. `preferences.test.ts`, `watchlist.test.ts`) currently build a real self-issued JWT via `generateToken()`. Post-migration they instead mock `express-oauth2-jwt-bearer`'s `auth()` at the module level to inject a fixed `req.auth.payload.sub`, matching the pattern Auth0's own SDK docs recommend for this exact package — the implementation plan spells out the exact mock helper (likely a `test/helpers.ts` addition, seeding a `User` row with a known `auth0Id` and mocking `checkJwt` to attach that `sub`).
- **E2E** (`e2e/explore.spec.ts`): currently signs up and logs in by POSTing to `/users`/`/users/login` directly. Those routes are gone. Replaced with Playwright driving Auth0's hosted Universal Login form directly (cross-origin navigation, fill the username/password fields, submit) against one dedicated, already-provisioned Auth0 test user whose credentials live in a new CI secret — this is Auth0's own documented pattern for E2E testing a Universal-Login-based app, since there's no API endpoint that accepts raw credentials anymore.
