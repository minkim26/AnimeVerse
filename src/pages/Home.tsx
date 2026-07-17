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

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 w-full">
        <section className="text-center py-20">
          <h1 className="font-display text-5xl md:text-6xl font-bold text-[var(--color-primary)] mb-4">
            Welcome to AnimeVerse
          </h1>
          <p className="text-xl text-[var(--color-muted)] mb-8">
            Discover new anime based on your preferences!
          </p>
          <Link
            to="/signup"
            className="inline-block px-8 py-3 rounded-full text-white bg-[var(--color-primary)] no-underline font-medium transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 py-12">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="text-center">
              <Icon className="mx-auto mb-4 text-[var(--color-secondary)]" size={40} />
              <h3 className="font-display text-lg font-semibold mb-2">{title}</h3>
              <p className="text-sm text-[var(--color-muted)]">{description}</p>
            </div>
          ))}
        </section>

        <section className="text-center py-16">
          <h2 className="font-display text-3xl font-bold mb-4">Start Your Anime Journey Today!</h2>
          <p className="text-[var(--color-muted)] mb-8">Sign up now to unlock a world of exciting anime content.</p>
          <Link
            to="/signup"
            className="inline-block px-8 py-3 rounded-full text-white bg-[var(--color-primary)] no-underline font-medium transition-opacity hover:opacity-90"
          >
            Sign Up
          </Link>
          <p className="text-sm text-[var(--color-muted)] mt-8">Already have an account?</p>
          <Link
            to="/login"
            className="inline-block mt-2 px-8 py-3 rounded-full text-[var(--color-primary)] no-underline font-medium border border-[var(--color-primary)] transition-opacity hover:opacity-90"
          >
            Sign In
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  )
}
