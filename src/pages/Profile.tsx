import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { getCurrentUser, deleteAccount, type User } from '../services/auth.ts'
import { ApiError } from '../services/api.ts'
import { getPreferences } from '../services/preferences.ts'
import { getRandomQuote, type Quote } from '../services/quotes.ts'
import { getRandomTitle, type Title } from '../services/titles.ts'
import { fetchRandomAnime } from '../services/anilist.ts'
import { uploadAvatar, pollForThumbnail } from '../services/avatar.ts'
import usePageMeta from '../hooks/usePageMeta.ts'

interface AvatarUploadProps {
  user: User
  onUploaded: (avatarUrl: string) => void
  onThumbnailReady: (thumbnailUrl: string) => void
}

function AvatarUpload({ user, onUploaded, onThumbnailReady }: AvatarUploadProps) {
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

  const isGeneratingThumbnail = Boolean(user.avatarUrl && !user.avatarThumbnailUrl)

  useEffect(() => {
    if (!isGeneratingThumbnail) return
    return pollForThumbnail(getCurrentUser, onThumbnailReady)
  }, [isGeneratingThumbnail, onThumbnailReady])

  const displayImage = user.avatarThumbnailUrl ?? user.avatarUrl ?? user.providerAvatarUrl

  return (
    <section className="col-span-6 surface-card p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold tracking-tight mb-4 text-[var(--color-ink)]">
        Profile Picture
      </h2>
      <div className="flex flex-wrap items-center gap-5">
        {displayImage && (
          // key remounts the element when the src changes, replaying the fade.
          <img
            key={displayImage}
            src={displayImage}
            alt="Profile"
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover shrink-0 animate-fade-in"
          />
        )}
        <div>
          {isGeneratingThumbnail && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] mb-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              Generating thumbnail...
            </p>
          )}
          <label
            className={`btn btn-outline text-sm px-5 py-2.5 cursor-pointer${uploading ? ' opacity-60' : ''}`}
          >
            {uploading ? 'Uploading...' : 'Upload Profile Picture'}
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} className="hidden" />
          </label>
          {error && <p className="text-xs text-[var(--color-error)] mt-2">{error}</p>}
        </div>
      </div>
    </section>
  )
}

function PreferencesSummary() {
  const [genres, setGenres] = useState<string[] | null>(null)

  useEffect(() => {
    getPreferences().then((prefs) => setGenres(prefs.genres))
  }, [])

  return (
    // Was col-span-3, paired with a since-removed PasswordForm card (Auth0
    // owns password management now). Full width keeps the grid's column
    // math clean so Title/Quote/RandomAnime still form one complete row of
    // three below, instead of one of them getting bumped up next to this.
    <section className="col-span-6 surface-card p-6 sm:p-8 flex flex-col">
      <h2 className="font-display text-xl font-semibold tracking-tight mb-4 text-[var(--color-ink)]">
        Current Preferences
      </h2>
      {genres === null ? (
        <p className="text-[var(--color-muted)] text-sm mb-4">Loading...</p>
      ) : genres.length === 0 ? (
        <p className="text-[var(--color-muted)] text-sm mb-4">No preferences saved yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 mb-4">
          {genres.map((genre) => (
            <li key={genre} className="pill text-xs capitalize font-medium">
              {genre}
            </li>
          ))}
        </ul>
      )}
      <Link to="/preferences" className="btn btn-outline text-sm px-5 py-2.5 mt-auto w-fit no-underline">
        Update Preferences
      </Link>
    </section>
  )
}

function settle<T>(promise: Promise<T>, setValue: (value: T) => void, setError: (value: boolean) => void) {
  return promise.then((value) => {
    setValue(value)
    setError(false)
  }).catch(() => setError(true))
}

function TitleGenerator() {
  const [title, setTitle] = useState<Title | null>(null)
  const [error, setError] = useState(false)

  function fetchTitle() {
    return settle(getRandomTitle(), setTitle, setError)
  }

  useEffect(() => {
    fetchTitle()
  }, [])

  return (
    <section className="col-span-6 md:col-span-2 surface-card p-6 flex flex-col items-center text-center">
      <h2 className="font-display text-lg font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
        Random Anime Title Generator
      </h2>
      <p className="text-sm text-[var(--color-muted)] mb-4 flex-1">
        {error
          ? 'Could not load a title. Try again.'
          : title
            ? `${title.title} — ${title.episodes} episodes`
            : 'Fetching title...'}
      </p>
      <button onClick={fetchTitle} className="btn btn-outline text-sm px-5 py-2.5 w-fit">
        Random Anime Title
      </button>
    </section>
  )
}

function QuoteGenerator() {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState(false)

  function fetchQuote() {
    return settle(getRandomQuote(), setQuote, setError)
  }

  useEffect(() => {
    fetchQuote()
  }, [])

  return (
    <section className="col-span-6 md:col-span-2 surface-card p-6 flex flex-col items-center text-center">
      <h2 className="font-display text-lg font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
        Random Anime Quote
      </h2>
      <p className="text-sm text-[var(--color-muted)] mb-4 flex-1">
        {error ? (
          'Could not load a quote. Try again.'
        ) : quote ? (
          <>
            "{quote.quote}" — <strong className="text-[var(--color-text)]">{quote.character}</strong>,{' '}
            <em>{quote.anime}</em>
          </>
        ) : (
          'Fetching quote...'
        )}
      </p>
      <button onClick={fetchQuote} className="btn btn-outline text-sm px-5 py-2.5 w-fit">
        Random Anime Quote
      </button>
    </section>
  )
}

function RandomAnimeGenerator() {
  const [anime, setAnime] = useState<{ title: string; imageUrl: string; description: string } | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showAdultContent, setShowAdultContent] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    settle(
      getPreferences().then((prefs) => {
        setShowAdultContent(prefs.showAdultContent)
        return fetchRandomAnime(prefs.showAdultContent)
      }),
      setAnime,
      setError,
    )
  }, [])

  function handleRefresh() {
    setShowDetails(false)
    settle(fetchRandomAnime(showAdultContent), setAnime, setError)
  }

  return (
    <section className="col-span-6 md:col-span-2 surface-card p-6 flex flex-col items-center text-center">
      <h2 className="font-display text-lg font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
        Random Anime Picture Generator
      </h2>
      <p className="text-xs text-[var(--color-muted)] mb-3">
        {error ? 'Could not load an anime. Try again.' : '(Click on the image to see the description and title.)'}
      </p>
      {anime && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="block bg-transparent border-none p-0 cursor-pointer mb-3"
        >
          {anime.imageUrl && (
            <img src={anime.imageUrl} alt={anime.title} className="w-full max-w-48 rounded-xl object-cover" />
          )}
          {showDetails && (
            <div className="mt-2 max-w-xs text-left">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{anime.title}</p>
              <p className="text-xs text-[var(--color-muted)]">{anime.description}</p>
            </div>
          )}
        </button>
      )}
      <button onClick={handleRefresh} className="btn btn-outline text-sm px-5 py-2.5 w-fit">
        Random Anime Picture
      </button>
    </section>
  )
}

export default function Profile() {
  usePageMeta({
    title: 'Profile',
    description: "Manage your AnimeVerse account and avatar, and revisit anime you've swiped on.",
  })
  const [user, setUser] = useState<User | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const { logout } = useAuth0()

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        // Only a real 401 means the session is invalid — a network hiccup
        // or the fetch aborting on navigation shouldn't force a logout.
        if (err instanceof ApiError && err.status === 401) {
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
      })
  }, [logout])

  function handleLogout() {
    logout({ logoutParams: { returnTo: window.location.origin } })
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete your account? This removes your profile, preferences, watchlist, reviews, and swipe history. This cannot be undone.',
    )
    if (!confirmed) return

    setDeleteError('')
    try {
      await deleteAccount()
      logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete your account. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Your dashboard
            </span>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4">
              Profile
            </h1>
          </div>
          <button onClick={handleLogout} className="btn btn-accent text-sm px-5 py-2.5 shrink-0">
            Logout
          </button>
        </div>

        {user ? (
          <div className="dark-card flex items-center gap-5 p-6 sm:p-8 mb-8">
            {(user.avatarThumbnailUrl ?? user.avatarUrl ?? user.providerAvatarUrl) && (
              <img
                src={user.avatarThumbnailUrl ?? user.avatarUrl ?? user.providerAvatarUrl ?? undefined}
                alt="Your avatar"
                className="w-16 h-16 rounded-full object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide opacity-70 mb-1">Signed in as</p>
              <p className="font-display text-lg sm:text-xl font-semibold truncate">{user.email}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)] mb-8">Loading...</p>
        )}

        <div className="bento-grid">
          {user && (
            <AvatarUpload
              user={user}
              onUploaded={(avatarUrl) => setUser({ ...user, avatarUrl, avatarThumbnailUrl: null })}
              onThumbnailReady={(avatarThumbnailUrl) => setUser({ ...user, avatarThumbnailUrl })}
            />
          )}

          <PreferencesSummary />
          <TitleGenerator />
          <QuoteGenerator />
          <RandomAnimeGenerator />
        </div>

        <div className="mt-10">
          <button
            type="button"
            onClick={handleDeleteAccount}
            className="text-xs text-[var(--color-error)] underline bg-transparent border-none p-0 cursor-pointer"
          >
            Delete Account
          </button>
          {deleteError && <p className="text-xs text-[var(--color-error)] mt-2">{deleteError}</p>}
        </div>
      </main>

      <Footer />
    </div>
  )
}
