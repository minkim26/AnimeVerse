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
        <h1 className="font-display text-3xl font-bold mb-2 text-[var(--color-primary)]">
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
              className="mt-6 px-6 py-3 rounded-full text-white bg-[var(--color-primary)] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
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
