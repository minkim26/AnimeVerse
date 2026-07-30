import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { isAuthenticated } from '../services/auth.ts'

interface RedirectIfAuthenticatedProps {
  children: ReactNode
}

// Inverse of ProtectedRoute: keeps an already-logged-in user off the
// login/signup forms instead of gating a page behind a session.
export default function RedirectIfAuthenticated({ children }: RedirectIfAuthenticatedProps) {
  if (isAuthenticated()) {
    return <Navigate to="/profile" replace />
  }

  return children
}
