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
        return (
          <label
            key={genre}
            // .pill's background/border are unlayered CSS (see tokens.css) and always
            // beat a plain Tailwind utility override, so the checked pastel fill goes
            // through inline style instead of has-checked:bg-*. The has-checked:ring
            // utility still works because .pill sets no box-shadow to compete with.
            className="pill gap-2 px-4 py-2 cursor-pointer capitalize text-sm font-medium transition-colors has-checked:ring-2 has-checked:ring-[var(--color-accent)]"
            style={checked ? { background: 'var(--color-mint)', borderColor: 'var(--color-accent)' } : undefined}
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
