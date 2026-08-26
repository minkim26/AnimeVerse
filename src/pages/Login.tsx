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
