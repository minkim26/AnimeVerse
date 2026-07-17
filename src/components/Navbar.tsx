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
    `text-sm no-underline transition-opacity hover:opacity-70 ${
      pathname === path ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]'
    }`

  const mobileLinkClass = (path: string) =>
    `block py-2 text-sm no-underline transition-opacity hover:opacity-70 ${
      pathname === path ? 'font-semibold text-[var(--color-primary)]' : 'text-[var(--color-text)]'
    }`

  return (
    <nav className="relative px-6 sm:px-8 py-5">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 no-underline font-display text-xl text-[var(--color-primary)]"
        >
          <Sparkles size={22} strokeWidth={2} />
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
              <button
                onClick={handleLogout}
                className="px-5 py-2 rounded-full text-sm text-white bg-[var(--color-primary)] border-none cursor-pointer transition-opacity hover:opacity-90"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={linkClass('/login')}>
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2 rounded-full text-sm text-white no-underline bg-[var(--color-primary)] transition-opacity hover:opacity-90"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden bg-transparent border-none cursor-pointer p-0 text-[var(--color-text)]"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[var(--color-surface)] shadow-lg px-6 py-4 flex flex-col z-10">
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
              <button
                onClick={handleLogout}
                className="mt-2 px-5 py-2 rounded-full text-sm text-white bg-[var(--color-primary)] border-none cursor-pointer text-center"
              >
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
                className="mt-2 px-5 py-2 rounded-full text-sm text-white no-underline bg-[var(--color-primary)] text-center"
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
