import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setAccessTokenGetter, apiRequest, ApiError } from '../services/api.ts'

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
 * wait on Auth0 at all. A permanent sync failure (a 4xx rejection, or
 * anything that isn't an ApiError at all — see below) logs the user out
 * rather than rendering as signed in with nothing provisioned; only a 5xx
 * is tolerated as transient.
 */
export default function Auth0SyncGate({ children }: Auth0SyncGateProps) {
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0()
  const [synced, setSynced] = useState(false)
  const syncedForRef = useRef<boolean | null>(null)

  useEffect(() => {
    setAccessTokenGetter(getAccessTokenSilently)
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!isAuthenticated) {
      syncedForRef.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets the gate on logout so the next login re-blocks until /users/sync completes again.
      setSynced(false)
      return
    }
    if (syncedForRef.current === isAuthenticated) return

    syncedForRef.current = isAuthenticated
    apiRequest('/users/sync', { method: 'POST', auth: true })
      .then(() => setSynced(true))
      .catch((err) => {
        console.error('[Auth0SyncGate] Failed to sync user:', err)
        // Only a 5xx from the backend is genuinely worth tolerating as
        // transient (infra hiccup, retry-worthy on the next call). A 4xx
        // is a permanent rejection (e.g. a cross-provider email collision
        // — see docs/superpowers/specs/2026-08-26-auth0-migration-design.md's
        // Known Limitations), and anything that ISN'T an ApiError at all
        // means apiRequest never reached the backend — almost always
        // getAccessTokenSilently() itself failing (revoked/expired
        // refresh token), which is just as unrecoverable. Rendering the
        // app as "signed in" in either case leaves every protected route
        // 404ing with no explanation, so log out instead of pretending
        // sync worked.
        if (err instanceof ApiError && err.status >= 500) {
          setSynced(true)
          return
        }
        logout({ logoutParams: { returnTo: window.location.origin } })
      })
  }, [isAuthenticated, logout])

  if (isAuthenticated && !synced) {
    return null
  }

  return children
}
