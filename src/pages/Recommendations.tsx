import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
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

const COLLAPSED_COUNT = 4

type SectionState =
  | { status: 'loading' }
  | { status: 'ok'; anime: AniListAnime[] }
  | { status: 'error'; message: string }

interface AnimeSectionProps {
  title: string
  state: SectionState
  tint: string
  expanded: boolean
  onToggleExpanded: () => void
}

// Tinted to match this category's icon on the homepage (ThumbsUp/peach,
// Star/mint, Clock/butter, Shuffle/sky) so the two pages read as one system.
function AnimeSection({ title, state, tint, expanded, onToggleExpanded }: AnimeSectionProps) {
  const anime = state.status === 'ok' ? state.anime : []
  const visible = expanded ? anime : anime.slice(0, COLLAPSED_COUNT)
  const canToggle = anime.length > COLLAPSED_COUNT

  return (
    <section className="tile-accent p-6 sm:p-8 my-10" style={{ background: tint }}>
      <div
        className="flex items-center justify-between gap-3 mb-6 pb-3 border-b"
        style={{ borderColor: 'color-mix(in oklch, var(--color-ink) 15%, transparent)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-6 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-ink)' }} />
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] truncate">
            {title}
          </h2>
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="btn btn-outline text-xs px-4 py-2 shrink-0"
          >
            {expanded ? (
              <>
                <ChevronUp size={14} /> Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} /> Show all ({anime.length})
              </>
            )}
          </button>
        )}
      </div>
      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]">Loading...</p>
      ) : state.status === 'error' ? (
        <p className="text-xs text-[var(--color-error)]">{state.message}</p>
      ) : anime.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nothing to show here yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
          {visible.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}
    </section>
  )
}

const SECTION_KEYS = ['byGenre', 'trending', 'newReleases', 'random'] as const
type SectionKey = (typeof SECTION_KEYS)[number]

export default function Recommendations() {
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
  const [trending, setTrending] = useState<SectionState>({ status: 'loading' })
  const [newReleases, setNewReleases] = useState<SectionState>({ status: 'loading' })
  const [random, setRandom] = useState<SectionState>({ status: 'loading' })

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    byGenre: false,
    trending: false,
    newReleases: false,
    random: false,
  })

  function toggleSection(key: SectionKey) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const allExpanded = SECTION_KEYS.every((key) => expanded[key])

  function toggleAll() {
    const next = !allExpanded
    setExpanded({ byGenre: next, trending: next, newReleases: next, random: next })
  }

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

    // Preferences are fetched once and fanned out to all four sections so the
    // adult-content setting applies everywhere, not just the genre-based one.
    // A failed preferences fetch falls back to the safe (hidden) default
    // rather than leaving the whole page stuck loading.
    getPreferences()
      .catch((err: unknown) => {
        console.error('[Recommendations] Failed to load preferences, defaulting to adult content hidden:', err)
        return { genres: [], showAdultContent: false }
      })
      .then((prefs) => {
        load('For You', () => fetchAnimeByGenres(prefs.genres, prefs.showAdultContent), setByGenre)
        load('Trending Now', () => fetchTrendingNow(prefs.showAdultContent), setTrending)
        load('New Releases', () => fetchNewReleases(prefs.showAdultContent), setNewReleases)
        load('Random Recommendations', () => fetchRandomRecommendations(prefs.showAdultContent), setRandom)
      })
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Personalized picks
        </span>
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-2">
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)]">
            Your Top Recommendations
          </h1>
          <button type="button" onClick={toggleAll} className="btn btn-outline text-sm px-5 py-2.5 shrink-0">
            {allExpanded ? (
              <>
                <Minimize2 size={16} /> Collapse All
              </>
            ) : (
              <>
                <Maximize2 size={16} /> Expand All
              </>
            )}
          </button>
        </div>
        <p className="text-[var(--color-muted)] max-w-xl">
          Click on any anime title or its image to toggle more information about it.
        </p>

        <AnimeSection
          title="For You"
          state={byGenre}
          tint="var(--color-peach)"
          expanded={expanded.byGenre}
          onToggleExpanded={() => toggleSection('byGenre')}
        />
        <AnimeSection
          title="Trending Now"
          state={trending}
          tint="var(--color-mint)"
          expanded={expanded.trending}
          onToggleExpanded={() => toggleSection('trending')}
        />
        <AnimeSection
          title="New Releases"
          state={newReleases}
          tint="var(--color-butter)"
          expanded={expanded.newReleases}
          onToggleExpanded={() => toggleSection('newReleases')}
        />
        <AnimeSection
          title="Random Recommendations"
          state={random}
          tint="var(--color-sky)"
          expanded={expanded.random}
          onToggleExpanded={() => toggleSection('random')}
        />
      </main>

      <Footer />
    </div>
  )
}
