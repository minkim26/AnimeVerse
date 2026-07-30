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

type SectionState =
  | { status: 'loading' }
  | { status: 'ok'; anime: AniListAnime[] }
  | { status: 'error'; message: string }

interface AnimeSectionProps {
  title: string
  state: SectionState
  dark?: boolean
}

function AnimeSection({ title, state, dark }: AnimeSectionProps) {
  // Dynamic per-state value (muted 70% variant on the dark card) kept inline;
  // .dark-card lives in @layer components, so a plain Tailwind opacity utility
  // would compose fine here too — this is just a style choice, not a workaround.
  const mutedStyle = dark ? { color: 'color-mix(in oklch, var(--color-paper) 70%, transparent)' } : undefined
  const mutedClass = dark ? 'text-sm' : 'text-sm text-[var(--color-muted)]'

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
      {state.status === 'loading' ? (
        <p className={mutedClass} style={mutedStyle}>Loading...</p>
      ) : state.status === 'error' ? (
        <p className="text-xs text-[var(--color-error)]">{state.message}</p>
      ) : state.anime.length === 0 ? (
        <p className={mutedClass} style={mutedStyle}>Nothing to show here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
          {state.anime.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Recommendations() {
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
  const [trending, setTrending] = useState<SectionState>({ status: 'loading' })
  const [newReleases, setNewReleases] = useState<SectionState>({ status: 'loading' })
  const [random, setRandom] = useState<SectionState>({ status: 'loading' })

  useEffect(() => {
    function load(
      label: string,
      fetcher: () => Promise<AniListAnime[]>,
      set: (state: SectionState) => void,
    ) {
      fetcher()
        .then((anime) => set({ status: 'ok', anime }))
        .catch((err: unknown) => {
          // Logged as well as rendered: the message tells the user what to do,
          // the console keeps the stack/status for diagnosing it.
          console.error(`[Recommendations] "${label}" failed to load:`, err)
          set({
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load this section.',
          })
        })
    }

    load('For You', () => getPreferences().then(fetchAnimeByGenres), setByGenre)
    load('Trending Now', fetchTrendingNow, setTrending)
    load('New Releases', fetchNewReleases, setNewReleases)
    load('Random Recommendations', fetchRandomRecommendations, setRandom)
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

        <AnimeSection title="For You" state={byGenre} dark />
        <AnimeSection title="Trending Now" state={trending} />
        <AnimeSection title="New Releases" state={newReleases} />
        <AnimeSection title="Random Recommendations" state={random} />
      </main>

      <Footer />
    </div>
  )
}
