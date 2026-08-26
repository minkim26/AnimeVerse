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
