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
}

function AnimeSection({ title, anime }: AnimeSectionProps) {
  return (
    <section className="py-8">
      <h2 className="font-display text-2xl font-bold mb-4">{title}</h2>
      {anime === null ? (
        <p className="text-[var(--color-muted)]">Loading...</p>
      ) : anime.length === 0 ? (
        <p className="text-[var(--color-muted)]">Nothing to show here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
        <h1 className="font-display text-3xl font-bold mb-2 text-[var(--color-primary)]">
          Your Top Recommendations
        </h1>
        <p className="text-[var(--color-muted)]">
          Click on any anime title or its image to toggle more information about it.
        </p>

        <AnimeSection title="For You" anime={byGenre} />
        <AnimeSection title="Trending Now" anime={trending} />
        <AnimeSection title="New Releases" anime={newReleases} />
        <AnimeSection title="Random Recommendations" anime={random} />
      </main>

      <Footer />
    </div>
  )
}
