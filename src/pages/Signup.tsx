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
