import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { signIn } from '../services/auth.ts'
import { ApiError } from '../services/api.ts'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await signIn(email, password)
      navigate('/profile')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An error occurred during login. Please try again later.')
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
              Welcome back
            </span>
            <div>
              <h2 className="font-display font-black tracking-tight text-3xl lg:text-4xl mb-4">
                Pick up right where your queue left off.
              </h2>
              <p className="text-sm opacity-80 max-w-xs">
                Sign in to see fresh recommendations tuned to your taste.
              </p>
            </div>
          </div>

          <div className="surface-card rounded-none p-8 sm:p-10">
            <h1 className="font-display text-3xl font-bold mb-8 text-[var(--color-ink)]">Sign In</h1>

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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-full px-5 py-3 text-sm bg-[var(--color-surface)] outline-none border border-[var(--color-line)] focus:border-[var(--color-accent)]"
                />
              </div>

              {error && <p className="text-xs text-[var(--color-error)] mb-4 px-2">{error}</p>}

              <button type="submit" className="btn btn-accent w-full mt-2 px-6 py-3 text-sm">
                Sign In
              </button>
            </form>

            <p className="text-center text-sm text-[var(--color-muted)] mt-6">
              Don't have an account?{' '}
              <Link to="/signup" className="text-[var(--color-accent)] font-medium underline">
                Sign Up
              </Link>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
