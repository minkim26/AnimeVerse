import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { getCurrentUser, signOut, updatePassword, type User } from '../services/auth.ts'
import { ApiError } from '../services/api.ts'
import { getPreferences } from '../services/preferences.ts'
import { getRandomQuote, type Quote } from '../services/quotes.ts'
import { getRandomTitle, type Title } from '../services/titles.ts'
import { fetchRandomAnime } from '../services/anilist.ts'
import { uploadAvatar } from '../services/avatar.ts'

interface AvatarUploadProps {
  user: User
  onUploaded: (avatarUrl: string) => void
}

function AvatarUpload({ user, onUploaded }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploading(true)
    try {
      const { avatarUrl } = await uploadAvatar(file)
      onUploaded(avatarUrl)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload profile picture.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const displayImage = user.avatarThumbnailUrl ?? user.avatarUrl

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-4">Profile Picture</h2>
      {displayImage && (
        <img
          src={displayImage}
          alt="Profile"
          className="w-32 h-32 rounded-full object-cover mb-3"
        />
      )}
      {user.avatarUrl && !user.avatarThumbnailUrl && (
        <p className="text-xs text-[var(--color-muted)] mb-3">Generating thumbnail...</p>
      )}
      <label className="inline-block px-5 py-2 rounded-full text-sm bg-[var(--color-surface)] font-medium cursor-pointer transition-opacity hover:opacity-80">
        {uploading ? 'Uploading...' : 'Upload Profile Picture'}
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="text-xs text-[var(--color-error)] mt-2">{error}</p>}
    </section>
  )
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.')
      return
    }

    try {
      await updatePassword(oldPassword, newPassword)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated successfully!')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An error occurred while updating the password.')
    }
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-4">Update Your Password</h2>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
        <input
          type="password"
          required
          placeholder="Old Password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          className="w-full rounded-full px-5 py-2.5 text-sm bg-[var(--color-surface)] outline-none border border-transparent focus:border-[var(--color-primary)]"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-full px-5 py-2.5 text-sm bg-[var(--color-surface)] outline-none border border-transparent focus:border-[var(--color-primary)]"
        />
        <input
          type="password"
          required
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-full px-5 py-2.5 text-sm bg-[var(--color-surface)] outline-none border border-transparent focus:border-[var(--color-primary)]"
        />

        {message && <p className="text-xs text-[var(--color-success)]">{message}</p>}
        {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

        <button
          type="submit"
          className="px-6 py-2.5 rounded-full text-white bg-[var(--color-primary)] text-sm font-medium transition-opacity hover:opacity-90"
        >
          Update Password
        </button>
      </form>
    </section>
  )
}

function PreferencesSummary() {
  const [genres, setGenres] = useState<string[] | null>(null)

  useEffect(() => {
    getPreferences().then(setGenres)
  }, [])

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-4">Current Preferences</h2>
      {genres === null ? (
        <p className="text-[var(--color-muted)] text-sm">Loading...</p>
      ) : genres.length === 0 ? (
        <p className="text-[var(--color-muted)] text-sm">No preferences saved yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 mb-3">
          {genres.map((genre) => (
            <li key={genre} className="px-3 py-1 rounded-full bg-[var(--color-surface)] text-xs capitalize font-medium">
              {genre}
            </li>
          ))}
        </ul>
      )}
      <Link to="/preferences" className="text-sm text-[var(--color-secondary)] underline">
        Update Preferences
      </Link>
    </section>
  )
}

function TitleGenerator() {
  const [title, setTitle] = useState<Title | null>(null)

  async function fetchTitle() {
    setTitle(await getRandomTitle())
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-2">Random Anime Title Generator</h2>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        {title ? `${title.title} — ${title.episodes} episodes` : 'Click the button to get a title.'}
      </p>
      <button
        onClick={fetchTitle}
        className="px-5 py-2 rounded-full text-sm bg-[var(--color-surface)] font-medium transition-opacity hover:opacity-80"
      >
        Random Anime Title
      </button>
    </section>
  )
}

function QuoteGenerator() {
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    getRandomQuote().then(setQuote)
  }, [])

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-2">Random Anime Quote</h2>
      {quote ? (
        <p className="text-sm text-[var(--color-muted)]">
          "{quote.quote}" — <strong className="text-[var(--color-text)]">{quote.character}</strong>,{' '}
          <em>{quote.anime}</em>
        </p>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">Fetching quote...</p>
      )}
    </section>
  )
}

function RandomAnimeGenerator() {
  const [anime, setAnime] = useState<{ title: string; imageUrl: string; description: string } | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    fetchRandomAnime().then(setAnime)
  }, [])

  function handleRefresh() {
    setShowDetails(false)
    fetchRandomAnime().then(setAnime)
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-semibold mb-2">Random Anime Picture Generator</h2>
      <p className="text-xs text-[var(--color-muted)] mb-3">
        (Click on the image to see the description and title.)
      </p>
      {anime && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="block bg-transparent border-none p-0 cursor-pointer mb-3"
        >
          {anime.imageUrl && (
            <img src={anime.imageUrl} alt={anime.title} className="w-48 rounded-xl object-cover" />
          )}
          {showDetails && (
            <div className="mt-2 max-w-xs text-left">
              <p className="text-sm font-semibold">{anime.title}</p>
              <p className="text-xs text-[var(--color-muted)]">{anime.description}</p>
            </div>
          )}
        </button>
      )}
      <button
        onClick={handleRefresh}
        className="px-5 py-2 rounded-full text-sm bg-[var(--color-surface)] font-medium transition-opacity hover:opacity-80"
      >
        Random Anime Picture
      </button>
    </section>
  )
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        signOut()
        navigate('/login')
      })
  }, [navigate])

  function handleLogout() {
    signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold text-[var(--color-primary)]">Profile</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-full text-sm bg-[var(--color-surface)] font-medium transition-opacity hover:opacity-80"
          >
            Logout
          </button>
        </div>

        {user ? (
          <p className="text-sm text-[var(--color-muted)] mb-8">
            Signed in as <strong className="text-[var(--color-text)]">{user.email}</strong>
          </p>
        ) : (
          <p className="text-sm text-[var(--color-muted)] mb-8">Loading...</p>
        )}

        {user && (
          <AvatarUpload
            user={user}
            onUploaded={(avatarUrl) => setUser({ ...user, avatarUrl, avatarThumbnailUrl: null })}
          />
        )}

        <PasswordForm />
        <TitleGenerator />
        <QuoteGenerator />
        <RandomAnimeGenerator />
        <PreferencesSummary />
      </main>

      <Footer />
    </div>
  )
}
