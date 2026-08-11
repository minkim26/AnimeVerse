import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import GenreCheckboxGroup from '../components/GenreCheckboxGroup.tsx'
import { getPreferences, savePreferences } from '../services/preferences.ts'
import usePageMeta from '../hooks/usePageMeta.ts'

export default function Preferences() {
  usePageMeta({
    title: 'Preferences',
    description: 'Update your favorite genres and adult-content setting for your AnimeVerse profile.',
  })
  const [genres, setGenres] = useState<string[]>([])
  const [showAdultContent, setShowAdultContent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setGenres(prefs.genres)
        setShowAdultContent(prefs.showAdultContent)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const confirmed = window.confirm(
      'Are you sure you want to update your preferences? This action will change the recommendations you receive.',
    )
    if (!confirmed) return

    setSaving(true)
    try {
      await savePreferences({ genres, showAdultContent })
      navigate('/recommendations')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Your taste profile
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Update Your Preferences
        </h1>
        <p className="text-[var(--color-muted)] mb-8">
          Select the genres you enjoy for your profile, and choose whether adult content shows up in your
          recommendations.
        </p>

        {loading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <GenreCheckboxGroup selected={genres} onChange={setGenres} />

            <label className="surface-card flex items-start gap-3 p-4 mt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={showAdultContent}
                onChange={(e) => setShowAdultContent(e.target.checked)}
                className="accent-[var(--color-accent)] mt-1 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--color-ink)]">Show adult content</span>
                <span className="block text-xs text-[var(--color-muted)] mt-1">
                  Off by default. Filters explicit (Hentai) titles and the Ecchi genre out of every
                  recommendation and random-pick section.
                </span>
              </span>
            </label>

            <p className="text-xs text-[var(--color-muted)] mt-6">
              Genres are saved to your profile. Your adult-content setting applies across Discover and your
              recommendations.
            </p>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-accent mt-6 px-8 py-3 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Preferences'}
            </button>
          </form>
        )}
      </main>

      <Footer />
    </div>
  )
}
