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
        setSynced(true) // don't block forever on a transient failure; the next authenticated call will surface the real error
      })
  }, [isAuthenticated])

  if (isAuthenticated && !synced) {
    return null
  }

  return children
}
