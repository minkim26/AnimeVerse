import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import GenreCheckboxGroup from '../components/GenreCheckboxGroup.tsx'
import { getPreferences, savePreferences } from '../services/preferences.ts'

export default function Preferences() {
  const [genres, setGenres] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getPreferences()
      .then(setGenres)
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
      await savePreferences(genres)
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
          Select the genres you enjoy to better configure your recommendation settings.
        </p>

        {loading ? (
          <p className="text-[var(--color-muted)]">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <GenreCheckboxGroup selected={genres} onChange={setGenres} />

            <p className="text-xs text-[var(--color-muted)] mt-6">
              Updating your preferences will change the recommendations you receive. The more preferences you
              select, the broader your recommendations will be.
            </p>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-accent mt-6 px-8 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
