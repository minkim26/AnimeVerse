import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { signUp } from '../services/auth.ts'
import { ApiError } from '../services/api.ts'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await signUp(email, password)
      navigate('/login')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An error occurred during signup. Please try again later.')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-[var(--radius-tile)] overflow-hidden shadow-lg">
          <div className="dark-card hidden md:flex flex-col justify-between p-10 rounded-none">
            <span
              className="pill w-fit text-xs font-medium uppercase tracking-wide"
              style={{ background: 'transparent', borderColor: 'color-mix(in oklch, var(--color-paper) 30%, transparent)', color: 'var(--color-paper)' }}
            >
              Join AnimeVerse
            </span>
            <div>
              <h2 className="font-display font-black tracking-tight text-3xl lg:text-4xl mb-4">
                Tell us what you love. We'll find your next binge.
              </h2>
              <p className="text-sm opacity-80 max-w-xs">
                Create an account to get recommendations tuned to your taste.
              </p>
            </div>
          </div>

          <div className="surface-card rounded-none p-8 sm:p-10">
            <h1 className="font-display text-3xl font-bold mb-2 text-[var(--color-ink)]">Create an Account</h1>
            <p className="text-sm text-[var(--color-muted)] mb-8">
              Registering allows you to access personalized anime recommendations.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="email" className="block text-xs uppercase tracking-wide mb-2 text-[var(--color-muted)]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-full px-5 py-3 text-sm bg-[var(--color-surface)] outline-none border border-[var(--color-line)] focus:border-[var(--color-accent)]"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-xs uppercase tracking-wide mb-2 text-[var(--color-muted)]">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-full px-5 py-3 text-sm bg-[var(--color-surface)] outline-none border border-[var(--color-line)] focus:border-[var(--color-accent)]"
                />
              </div>

              {error && <p className="text-xs text-[var(--color-error)] mb-4 px-2">{error}</p>}

              <button type="submit" className="btn btn-accent w-full mt-2 px-6 py-3 text-sm">
                Sign Up
              </button>
            </form>

            <p className="text-center text-xs text-[var(--color-muted)] mt-6">
              By creating an account, you agree to our{' '}
              <Link to="/privacy-policy" className="text-[var(--color-secondary)] underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
