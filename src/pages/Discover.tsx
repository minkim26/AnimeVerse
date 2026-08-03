import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, Heart, ThumbsUp, X } from 'lucide-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'
import { getPreferences } from '../services/preferences.ts'
import { fetchDiscoverPool, animeTitle, animeSynopsis, type AniListAnime } from '../services/anilist.ts'
import { postSwipe, getMySwipes, type SwipeAction } from '../services/swipes.ts'

const DECK_SIZE = 20

type DeckState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cards: AniListAnime[] }

// Persistent (not a toast) so the user always has an unambiguous answer to
// "did my last swipe count" without having to guess from silence.
type SwipeStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'failed'; message: string }

export default function Discover() {
  const [deck, setDeck] = useState<DeckState>({ status: 'loading' })
  const [index, setIndex] = useState(0)
  const [swipeStatus, setSwipeStatus] = useState<SwipeStatus>({ kind: 'idle' })

  useEffect(() => {
    async function load() {
      try {
        const prefs = await getPreferences().catch(() => ({ genres: [], showAdultContent: false }))
        const [pool, mySwipes] = await Promise.all([
          fetchDiscoverPool(prefs.showAdultContent),
          getMySwipes().catch(() => []),
        ])
        const swipedIds = new Set(mySwipes.map((s) => s.animeId))
        const cards = pool.filter((anime) => !swipedIds.has(anime.id)).slice(0, DECK_SIZE)
        setDeck({ status: 'ready', cards })
      } catch (err) {
        console.error('[Discover] Failed to load the swipe deck:', err)
        setDeck({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load Discover.' })
      }
    }
    load()
  }, [])

  async function handleSwipe(anime: AniListAnime, action: SwipeAction) {
    try {
      await postSwipe(anime, action)
      setSwipeStatus({ kind: 'saved' })
    } catch (err) {
      // A failed write only loses that one card's signal — not worth
      // blocking the deck over, but the user should know it happened.
      console.error('[Discover] Failed to record swipe:', err)
      setSwipeStatus({ kind: 'failed', message: 'That swipe may not have been saved. Keep going, or refresh to try again.' })
    }
    setIndex((i) => i + 1)
  }

  const cards = deck.status === 'ready' ? deck.cards : []
  const current = cards[index]
  const swipedCount = Math.min(index, cards.length)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-xl mx-auto px-4 py-12 w-full flex flex-col items-center">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Discover
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-2">
          Swipe to build your taste profile
        </h1>
        <p className="text-[var(--color-muted)] mb-8 text-center">
          Skip, like, or love each title. This is what your recommendations will be built from.
        </p>

        {deck.status === 'loading' && <p className="text-sm text-[var(--color-muted)]">Loading...</p>}
        {deck.status === 'error' && <p className="text-xs text-[var(--color-error)]">{deck.message}</p>}

        {deck.status === 'ready' && cards.length > 0 && (
          <div className="w-full mb-6">
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-1">
              <span>
                {swipedCount} of {cards.length} swiped
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--color-line)] overflow-hidden">
              <div
                className="h-full w-full origin-left rounded-full bg-[var(--color-accent)] transition-transform duration-300"
                style={{ transform: `scaleX(${swipedCount / cards.length})` }}
              />
            </div>
          </div>
        )}

        <div role="status" aria-live="polite" className="mb-4 min-h-[1.25rem]">
          {swipeStatus.kind === 'saved' && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
              <Check size={14} /> Saved
            </p>
          )}
          {swipeStatus.kind === 'failed' && <p className="text-xs text-[var(--color-error)]">{swipeStatus.message}</p>}
        </div>

        {deck.status === 'ready' && current && (
          <div key={current.id} className="surface-card w-full p-6">
            {current.coverImage.large && (
              <img
                src={current.coverImage.large}
                alt={animeTitle(current)}
                className="w-full rounded-xl object-cover aspect-[2/3] mb-4"
              />
            )}
            <h2 className="font-display text-xl font-semibold mb-2">{animeTitle(current)}</h2>
            <p className="text-sm text-[var(--color-muted)] line-clamp-6 mb-6">{animeSynopsis(current)}</p>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handleSwipe(current, 'SKIP')}
                aria-label="Skip"
                className="btn btn-outline p-4 rounded-full"
              >
                <X size={20} />
              </button>
              <button
                type="button"
                onClick={() => handleSwipe(current, 'LIKE')}
                aria-label="Like"
                className="btn btn-outline p-4 rounded-full"
              >
                <ThumbsUp size={20} />
              </button>
              <button
                type="button"
                onClick={() => handleSwipe(current, 'LOVE')}
                aria-label="Love"
                className="btn btn-accent p-4 rounded-full"
              >
                <Heart size={20} />
              </button>
            </div>
          </div>
        )}

        {deck.status === 'ready' && !current && (
          <div className="surface-card w-full p-8 text-center">
            <p className="text-[var(--color-ink)] font-medium mb-4">That's the deck for now.</p>
            <Link to="/recommendations" className="btn btn-accent px-6 py-3 text-sm no-underline">
              See your recommendations
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
