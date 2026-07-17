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

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-3xl shadow-lg px-8 py-10">
          <h1 className="font-display text-3xl font-bold text-center mb-8 text-[var(--color-primary)]">
            Sign In
          </h1>

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
                className="w-full rounded-full px-5 py-3 text-sm bg-[var(--color-bg)] outline-none border border-transparent focus:border-[var(--color-primary)]"
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
                className="w-full rounded-full px-5 py-3 text-sm bg-[var(--color-bg)] outline-none border border-transparent focus:border-[var(--color-primary)]"
              />
            </div>

            {error && <p className="text-xs text-[var(--color-error)] mb-4 px-2">{error}</p>}

            <button
              type="submit"
              className="w-full mt-2 px-6 py-3 rounded-full text-white bg-[var(--color-primary)] font-medium transition-opacity hover:opacity-90"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-sm text-[var(--color-muted)] mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[var(--color-primary)] font-medium underline">
              Sign Up
            </Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
