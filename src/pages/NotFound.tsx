import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1 className="font-display text-6xl font-bold text-[var(--color-primary)] mb-4">404</h1>
        <p className="text-[var(--color-muted)] mb-8">This page doesn't exist.</p>
        <Link
          to="/"
          className="px-6 py-3 rounded-full text-white bg-[var(--color-primary)] no-underline font-medium transition-opacity hover:opacity-90"
        >
          Back to Home
        </Link>
      </main>

      <Footer />
    </div>
  )
}
