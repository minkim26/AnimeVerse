import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Menu, X } from 'lucide-react'
import { isAuthenticated, signOut } from '../services/auth.ts'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const loggedIn = isAuthenticated()
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  function handleLogout() {
    closeMenu()
    signOut()
    navigate('/login')
  }

  const linkClass = (path: string) =>
    `text-sm font-medium no-underline pb-1 border-b-2 transition-colors ${
      pathname === path
        ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
        : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
    }`

  const mobileLinkClass = (path: string) =>
    `block py-2 pl-3 -ml-3 text-sm font-medium no-underline border-l-2 transition-colors ${
      pathname === path
        ? 'border-[var(--color-accent)] text-[var(--color-ink)] font-semibold'
        : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
    }`

  return (
    <nav className="sticky top-0 z-20 backdrop-blur bg-[var(--color-paper)]/80 border-b border-[var(--color-line)] px-6 sm:px-8 py-4">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 no-underline font-display text-xl sm:text-2xl tracking-tight text-[var(--color-ink)]"
        >
          <Sparkles size={22} strokeWidth={2} className="text-[var(--color-accent)]" />
          AnimeVerse
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {loggedIn ? (
            <>
              <Link to="/preferences" className={linkClass('/preferences')}>
                Preferences
              </Link>
              <Link to="/recommendations" className={linkClass('/recommendations')}>
                Recommendations
              </Link>
              <Link to="/profile" className={linkClass('/profile')}>
                Profile
              </Link>
              <button onClick={handleLogout} className="btn btn-accent px-5 py-2 text-sm">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={linkClass('/login')}>
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-accent px-5 py-2 text-sm no-underline">
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden bg-transparent border-none cursor-pointer p-0 text-[var(--color-ink)]"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[var(--color-surface)] border-b border-[var(--color-line)] shadow-lg px-6 py-4 flex flex-col z-10">
          {loggedIn ? (
            <>
              <Link to="/preferences" className={mobileLinkClass('/preferences')} onClick={closeMenu}>
                Preferences
              </Link>
              <Link to="/recommendations" className={mobileLinkClass('/recommendations')} onClick={closeMenu}>
                Recommendations
              </Link>
              <Link to="/profile" className={mobileLinkClass('/profile')} onClick={closeMenu}>
                Profile
              </Link>
              <button onClick={handleLogout} className="btn btn-accent mt-3 px-5 py-2 text-sm">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={mobileLinkClass('/login')} onClick={closeMenu}>
                Sign In
              </Link>
              <Link
                to="/signup"
                className="btn btn-accent mt-3 px-5 py-2 text-sm no-underline"
                onClick={closeMenu}
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
