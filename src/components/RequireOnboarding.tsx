import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { getMySwipes } from '../services/swipes.ts'

interface RequireOnboardingProps {
  children: ReactNode
}

/*
 * RequireOnboarding — redirects to /discover if the caller has zero swipes.
 * Fails open (renders children) on a network error, matching this app's
 * existing pattern of defaulting rather than blocking when a personalization
 * fetch fails (see Recommendations.tsx's getPreferences().catch(...)).
 */
export default function RequireOnboarding({ children }: RequireOnboardingProps) {
  const [status, setStatus] = useState<'checking' | 'onboarded' | 'needs-onboarding'>('checking')

  useEffect(() => {
    getMySwipes()
      .then((swipes) => setStatus(swipes.length > 0 ? 'onboarded' : 'needs-onboarding'))
      .catch(() => setStatus('onboarded'))
  }, [])

  if (status === 'checking') return null
  if (status === 'needs-onboarding') return <Navigate to="/discover" replace />
  return children
}
