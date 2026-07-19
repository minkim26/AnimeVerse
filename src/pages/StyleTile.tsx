import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

const SWATCHES: { name: string; varName: string }[] = [
  { name: 'paper', varName: '--color-paper' },
  { name: 'surface', varName: '--color-surface' },
  { name: 'ink', varName: '--color-ink' },
  { name: 'muted', varName: '--color-muted' },
  { name: 'line', varName: '--color-line' },
  { name: 'peach', varName: '--color-peach' },
  { name: 'mint', varName: '--color-mint' },
  { name: 'butter', varName: '--color-butter' },
  { name: 'sky', varName: '--color-sky' },
  { name: 'lilac', varName: '--color-lilac' },
  { name: 'accent', varName: '--color-accent' },
  { name: 'hero', varName: '--color-hero' },
]

export default function StyleTile() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <h1 className="font-display font-black mb-2" style={{ fontSize: 'var(--text-display)' }}>
          Bento Editorial
        </h1>
        <p className="text-[var(--color-muted)] mb-10">
          Design language preview. Display face is Fraunces; body is Inter.
        </p>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Palette</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {SWATCHES.map(({ name, varName }) => (
              <div key={name} className="surface-card p-3">
                <div
                  className="h-16 rounded-[var(--radius-card)] mb-2 border border-[var(--color-line)]"
                  style={{ background: `var(${varName})` }}
                />
                <p className="text-xs font-medium text-[var(--color-ink)]">{name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Type ramp</h2>
          <p className="font-display font-black" style={{ fontSize: 'var(--text-hero)', lineHeight: 1 }}>
            Aa
          </p>
          <p className="font-display font-semibold" style={{ fontSize: 'var(--text-display)' }}>
            Discover your next favorite
          </p>
          <p className="font-display text-2xl">A magazine for anime taste</p>
          <p className="text-base text-[var(--color-ink)]">
            Body copy set in Inter for long-form readability and clean UI labels.
          </p>
          <p className="text-sm text-[var(--color-muted)]">Muted secondary text.</p>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Controls</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-accent px-6 py-3">Get Started</button>
            <button className="btn btn-outline px-6 py-3">Learn more</button>
            <span className="pill text-sm capitalize">action</span>
            <span className="pill text-sm capitalize">adventure</span>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Bento composition</h2>
          <div className="bento-grid">
            <div className="dark-card col-span-6 md:col-span-4 p-8">
              <p className="font-display font-black" style={{ fontSize: 'var(--text-display)', lineHeight: 1 }}>
                Hero moment
              </p>
              <p className="opacity-80 mt-2">High-contrast dark tile for editorial emphasis.</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-peach)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Peach tile</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-mint)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Mint tile</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-butter)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Butter tile</p>
            </div>
            <div className="surface-card col-span-6 md:col-span-2 p-4">
              <div className="rounded-[var(--radius-card)] aspect-[2/3] bg-[var(--color-lilac)]" />
              <p className="font-display text-sm mt-2">Poster tile</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
