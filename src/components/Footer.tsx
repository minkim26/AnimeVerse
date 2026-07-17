import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="text-center py-8 px-4 text-sm text-[var(--color-muted)]">
      <p>&copy; 2026 AnimeVerse. All rights reserved.</p>
      <p>
        <Link to="/privacy-policy" className="text-[var(--color-secondary)] hover:underline">
          Privacy Policy
        </Link>
      </p>
    </footer>
  )
}
