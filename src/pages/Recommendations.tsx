import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import AnimeCard from '../components/AnimeCard.tsx'
import { getPreferences } from '../services/preferences.ts'
import {
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  type AniListAnime,
} from '../services/anilist.ts'

interface AnimeSectionProps {
  title: string
  anime: AniListAnime[] | null
  dark?: boolean
}

function AnimeSection({ title, anime, dark }: AnimeSectionProps) {
  // .dark-card sets `color: var(--color-paper)` unlayered (see tokens.css), which
  // always beats a layered Tailwind opacity utility like text-[...]/70 — so the
  // muted 70% variant is expressed as an inline color-mix instead, and the heading
  // simply inherits .dark-card's own color rather than fighting it with a
  // same-value (and therefore dead) text-[var(--color-paper)] utility.
  const mutedStyle = dark ? { color: 'color-mix(in oklch, var(--color-paper) 70%, transparent)' } : undefined
  const mutedClass = dark ? undefined : 'text-[var(--color-muted)]'

  return (
    <section className={dark ? 'dark-card p-6 sm:p-8 my-10' : 'py-8'}>
      <div
        className="flex items-center gap-3 mb-6 pb-3 border-b"
        style={{ borderColor: dark ? 'color-mix(in oklch, var(--color-paper) 20%, transparent)' : 'var(--color-line)' }}
      >
        <span className="h-6 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-accent)' }} />
        <h2
          className={`font-display text-2xl font-semibold tracking-tight ${dark ? '' : 'text-[var(--color-ink)]'}`}
        >
          {title}
        </h2>
      </div>
      {anime === null ? (
        <p className={mutedClass} style={mutedStyle}>Loading...</p>
      ) : anime.length === 0 ? (
        <p className={mutedClass} style={mutedStyle}>Nothing to show here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
          {anime.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Recommendations() {
  const [byGenre, setByGenre] = useState<AniListAnime[] | null>(null)
  const [trending, setTrending] = useState<AniListAnime[] | null>(null)
  const [newReleases, setNewReleases] = useState<AniListAnime[] | null>(null)
  const [random, setRandom] = useState<AniListAnime[] | null>(null)

  useEffect(() => {
    getPreferences().then((genres) => fetchAnimeByGenres(genres).then(setByGenre))
    fetchTrendingNow().then(setTrending)
    fetchNewReleases().then(setNewReleases)
    fetchRandomRecommendations().then(setRandom)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Personalized picks
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Your Top Recommendations
        </h1>
        <p className="text-[var(--color-muted)] max-w-xl">
          Click on any anime title or its image to toggle more information about it.
        </p>

        <AnimeSection title="For You" anime={byGenre} dark />
        <AnimeSection title="Trending Now" anime={trending} />
        <AnimeSection title="New Releases" anime={newReleases} />
        <AnimeSection title="Random Recommendations" anime={random} />
      </main>

      <Footer />
    </div>
  )
}
