import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import AnimeCard from '../components/AnimeCard.tsx'
import { getPreferences } from '../services/preferences.ts'
import { getForYouRecommendations } from '../services/recommendations.ts'
import { fetchBrowseAnime, BROWSE_SORTS, BROWSE_GENRES, type AniListAnime, type BrowseSortLabel } from '../services/anilist.ts'
import usePageMeta from '../hooks/usePageMeta.ts'

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

const SORT_LABELS = Object.keys(BROWSE_SORTS) as BrowseSortLabel[]

interface BrowseSearchProps {
  showAdultContent: boolean
}

function BrowseSearch({ showAdultContent }: BrowseSearchProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [sort, setSort] = useState<BrowseSortLabel>('Popularity')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<AniListAnime[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  const visibleGenres = showAdultContent ? BROWSE_GENRES : BROWSE_GENRES.filter((g) => g !== 'Ecchi')

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]))
  }

  // Any filter change starts over: reset to page 1, clear accumulated
  // results, and debounce so rapid chip/sort/search changes don't fire a
  // request per click or keystroke against AniList's 30 req/min limit.
  //
  // ponytail: no request-id guard against out-of-order responses — a very
  // rapid filter change could in theory show a stale result if two fetches
  // race. Add an AbortController per fetch if this becomes visible in
  // practice; the 400ms debounce already makes it unlikely.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: shows the loading state immediately on any filter change, while only the fetchBrowseAnime call itself is debounced 400ms below.
    setStatus('loading')
    const timer = setTimeout(() => {
      setPage(1)
      fetchBrowseAnime({ page: 1, genres: selectedGenres, sort, search: searchText, showAdultContent })
        .then(({ anime, hasNextPage: next }) => {
          setResults(anime)
          setHasNextPage(next)
          setStatus('ok')
        })
        .catch((err: unknown) => {
          console.error('[Explore] Browse & Search failed to load:', err)
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load results.')
          setStatus('error')
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [selectedGenres, sort, searchText, showAdultContent])

  function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    fetchBrowseAnime({ page: nextPage, genres: selectedGenres, sort, search: searchText, showAdultContent })
      .then(({ anime, hasNextPage: next }) => {
        setResults((prev) => {
          const seen = new Set(prev.map((a) => a.id))
          return [...prev, ...anime.filter((a) => !seen.has(a.id))]
        })
        setHasNextPage(next)
        setPage(nextPage)
      })
      .catch((err: unknown) => {
        console.error('[Explore] Browse & Search failed to load more:', err)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load more results.')
        setStatus('error')
      })
      .finally(() => setLoadingMore(false))
  }

  return (
    <section className="tile-accent p-6 sm:p-8 my-10" style={{ background: 'var(--color-lilac)' }}>
      <div
        className="flex items-center gap-3 mb-6 pb-3 border-b"
        style={{ borderColor: 'color-mix(in oklch, var(--color-ink) 15%, transparent)' }}
      >
        <span className="h-6 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-ink)' }} />
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Browse &amp; Search
        </h2>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search titles..."
            aria-label="Search titles"
            className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleGenres.map((genre) => {
            const selected = selectedGenres.includes(genre)
            return (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                aria-pressed={selected}
                className="pill text-sm font-medium transition-colors"
                style={selected ? { background: 'var(--color-mint)', borderColor: 'var(--color-accent)' } : undefined}
              >
                {genre}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort by">
          {SORT_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setSort(label)}
              aria-pressed={sort === label}
              className="pill text-sm font-medium transition-colors"
              style={sort === label ? { background: 'var(--color-butter)', borderColor: 'var(--color-accent)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]">Loading...</p>
      ) : status === 'error' ? (
        <p className="text-xs text-[var(--color-error)]">{errorMessage}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No anime matched your filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 items-start">
            {results.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
          {(hasNextPage || sort === 'Shuffle') && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-outline text-sm px-6 py-2.5 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function Explore() {
  usePageMeta({
    title: 'Explore',
    description: "Browse anime recommendations picked for your taste, or filter, sort, and search AniList's full catalog.",
  })
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
  const [byGenreExpanded, setByGenreExpanded] = useState(false)
  const [showAdultContent, setShowAdultContent] = useState(false)

  useEffect(() => {
    getForYouRecommendations()
      .then((anime) => setByGenre({ status: 'ok', anime }))
      .catch((err: unknown) => {
        // Logged as well as rendered: the message tells the user what to do,
        // the console keeps the stack/status for diagnosing it.
        console.error('[Explore] "For You" failed to load:', err)
        setByGenre({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load this section.',
        })
      })

    getPreferences()
      .catch((err: unknown) => {
        console.error('[Explore] Failed to load preferences, defaulting to adult content hidden:', err)
        return { genres: [], showAdultContent: false }
      })
      .then((prefs) => setShowAdultContent(prefs.showAdultContent))
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Find your next watch
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Explore
        </h1>
        <p className="text-[var(--color-muted)] max-w-xl">
          For You is tuned to your taste. Browse &amp; Search filters, sorts, and searches AniList's full catalog.
          Click on any anime title or its image to toggle more information about it.
        </p>

        <AnimeSection
          title="For You"
          state={byGenre}
          tint="var(--color-peach)"
          expanded={byGenreExpanded}
          onToggleExpanded={() => setByGenreExpanded((prev) => !prev)}
        />

        <BrowseSearch showAdultContent={showAdultContent} />
      </main>

      <Footer />
    </div>
  )
}
