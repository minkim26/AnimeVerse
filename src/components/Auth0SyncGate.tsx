import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setAccessTokenGetter, apiRequest } from '../services/api.ts'
import { syncErrorMessage } from '../lib/authSync.ts'

interface Auth0SyncGateProps {
  children: ReactNode
}

// Survives the full-page redirect through Auth0's /logout endpoint (any
// in-memory React state is lost across that navigation) so the message can
// still be shown once the user lands back on the site.
const SYNC_ERROR_KEY = 'auth0SyncError'

/*
 * Bridges Auth0's React hooks to services/api.ts's plain-function
 * apiRequest, and calls POST /users/sync once per login before anything
 * else can hit a route that needs req.user.id resolved. Only blocks
 * rendering while isAuthenticated is true and sync hasn't finished yet —
 * an anonymous visitor (or a page load before Auth0 has decided whether a
 * session exists) renders children immediately, so public pages never
 * wait on Auth0 at all. Any sync failure logs the user out rather than
 * opening the gate: a 5xx used to be tolerated as "probably transient,"
 * but that left `synced` permanently true with no local User row ever
 * created, so every protected route 404'd until a manual reload. Logging
 * out and letting them log back in is a smaller failure than that — but
 * unlike before, the reason is stashed in sessionStorage first so it can
 * be shown once the logout redirect completes, instead of silently
 * bouncing the user back to the homepage with no explanation.
 */
export default function Auth0SyncGate({ children }: Auth0SyncGateProps) {
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0()
  const [synced, setSynced] = useState(false)
  const syncedForRef = useRef<boolean | null>(null)
  // Lazy initializer: reads the message left by a previous tab's failed
  // sync (see the catch handler below) exactly once, at mount, without an
  // extra render — a useEffect here would set state after the first paint.
  const [syncError, setSyncError] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(SYNC_ERROR_KEY)
    if (stored) sessionStorage.removeItem(SYNC_ERROR_KEY)
    return stored
  })

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
        sessionStorage.setItem(SYNC_ERROR_KEY, syncErrorMessage(err))
        logout({ logoutParams: { returnTo: window.location.origin } })
      })
  }, [isAuthenticated, logout])

  return (
    <>
      {syncError && (
        <p role="alert" className="text-center text-xs text-[var(--color-error)] py-2 px-4">
          {syncError}{' '}
          <button type="button" onClick={() => setSyncError(null)} className="underline">
            Dismiss
          </button>
        </p>
      )}
      {isAuthenticated && !synced ? null : children}
    </>
  )
}
