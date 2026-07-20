import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] mb-6">
          Lost episode
        </span>
        <h1
          className="font-display font-black tracking-tight text-[var(--color-ink)] mb-4"
          style={{ fontSize: 'var(--text-hero)', lineHeight: 1 }}
        >
          404
        </h1>
        <p className="text-[var(--color-muted)] mb-8 max-w-sm">This page doesn't exist.</p>
        <Link to="/" className="btn btn-accent px-6 py-3 text-sm no-underline">
          Back to Home
        </Link>
      </main>

      <Footer />
    </div>
  )
}
