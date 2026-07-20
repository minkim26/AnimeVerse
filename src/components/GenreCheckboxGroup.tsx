import { GENRES } from '../data/genres.ts'

interface GenreCheckboxGroupProps {
  selected: string[]
  onChange: (genres: string[]) => void
}

export default function GenreCheckboxGroup({ selected, onChange }: GenreCheckboxGroupProps) {
  function toggle(genre: string) {
    if (selected.includes(genre)) {
      onChange(selected.filter((g) => g !== genre))
    } else {
      onChange([...selected, genre])
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {GENRES.map((genre) => {
        const checked = selected.includes(genre)
        // Dynamic per-state values (checked fill, tap-target padding) kept inline;
        // .pill lives in @layer components, so a plain Tailwind utility would
        // compose fine here too — this is just a style choice, not a workaround.
        const style = {
          padding: '0.5rem 1rem',
          ...(checked ? { background: 'var(--color-mint)', borderColor: 'var(--color-accent)' } : {}),
        }
        return (
          <label
            key={genre}
            className="pill gap-2 cursor-pointer capitalize text-sm font-medium transition-colors has-checked:ring-2 has-checked:ring-[var(--color-accent)]"
            style={style}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(genre)}
              className="accent-[var(--color-accent)]"
            />
            {genre}
          </label>
        )
      })}
    </div>
  )
}
