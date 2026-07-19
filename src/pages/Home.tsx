import { Link } from 'react-router-dom'
import { ThumbsUp, Star, Clock, Shuffle } from 'lucide-react'
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

const FEATURES = [
  {
    icon: ThumbsUp,
    title: 'Personalized Recommendations',
    description: 'Get tailored anime recommendations based on your preferred genres.',
  },
  {
    icon: Star,
    title: 'Trending Anime',
    description: 'Stay up-to-date with the latest and most popular anime series.',
  },
  {
    icon: Clock,
    title: 'New Releases',
    description: 'Discover the newest anime releases as soon as they become available.',
  },
  {
    icon: Shuffle,
    title: 'Random Exploration',
    description: 'Feeling adventurous? Explore a diverse collection of anime with our random recommendations.',
  },
]

// Decorative hero collage — reuses each feature's icon/color as a poster-shaped
// teaser tile. Purely presentational, not a second source of truth for FEATURES.
const HERO_TILE_COLORS = ['var(--color-peach)', 'var(--color-mint)', 'var(--color-butter)', 'var(--color-sky)']

// Bento sizing/surface per feature card below — deliberate size variation
// instead of four identical cells, alternating tile-accent and surface-card.
const FEATURE_LAYOUTS: { span: string; surface: string; bg?: string }[] = [
  { span: 'col-span-6 md:col-span-4', surface: 'tile-accent', bg: 'var(--color-peach)' },
  { span: 'col-span-6 md:col-span-2', surface: 'surface-card' },
  { span: 'col-span-6 md:col-span-2', surface: 'tile-accent', bg: 'var(--color-sky)' },
  { span: 'col-span-6 md:col-span-4', surface: 'surface-card' },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 w-full">
        <section className="bento-grid items-center pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="col-span-6 md:col-span-4 min-w-0 flex flex-col gap-6">
            <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Personalized anime discovery
            </span>
            <h1
              className="font-display font-black tracking-tight text-[var(--color-ink)]"
              style={{ fontSize: 'var(--text-display)', lineHeight: 1.05 }}
            >
              Welcome to AnimeVerse
            </h1>
            <p className="text-lg text-[var(--color-muted)] max-w-md">
              Tell us what you love and we'll surface the shows worth your next binge — trending hits, fresh
              releases, and a few wildcard picks along the way.
            </p>
            <div>
              <Link to="/signup" className="btn btn-accent px-8 py-3 text-base no-underline w-fit">
                Get Started
              </Link>
            </div>
          </div>

          <div className="col-span-6 md:col-span-2 grid grid-cols-2 gap-4 md:gap-5">
            {FEATURES.map(({ icon: Icon, title }, index) => (
              <div
                key={title}
                className="tile-accent aspect-square flex items-center justify-center p-6 transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-expo)] md:even:rotate-2 md:odd:-rotate-2 md:hover:rotate-0 md:hover:-translate-y-1"
                style={{ background: HERO_TILE_COLORS[index] }}
              >
                <Icon className="text-[var(--color-ink)]" size={36} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">{title}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12 md:py-16">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--color-ink)] mb-3">
            Built to keep you watching
          </h2>
          <p className="text-[var(--color-muted)] mb-8 max-w-lg">
            Four ways AnimeVerse keeps your queue full and your taste sharp.
          </p>

          <div className="bento-grid">
            {FEATURES.map(({ icon: Icon, title, description }, index) => {
              const layout = FEATURE_LAYOUTS[index]
              return (
                <div
                  key={title}
                  className={`${layout.surface} ${layout.span} p-6 md:p-8 flex flex-col gap-4`}
                  style={layout.bg ? { background: layout.bg } : undefined}
                >
                  <Icon className="text-[var(--color-ink)]" size={32} strokeWidth={1.75} />
                  <h3 className="font-display text-xl md:text-2xl font-semibold text-[var(--color-ink)]">{title}</h3>
                  <p className="text-sm md:text-base text-[var(--color-muted)]">{description}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="text-center py-16 md:py-24 max-w-2xl mx-auto">
          <h2
            className="font-display font-black text-[var(--color-ink)] mb-4"
            style={{ fontSize: 'var(--text-display)' }}
          >
            Start your anime journey today
          </h2>
          <p className="text-[var(--color-muted)] mb-8 text-lg">
            Sign up now to unlock personalized recommendations, or sign back in to pick up where you left off.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup" className="btn btn-accent px-8 py-3 text-base no-underline">
              Sign Up
            </Link>
            <Link to="/login" className="btn btn-outline px-8 py-3 text-base no-underline">
              Sign In
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
