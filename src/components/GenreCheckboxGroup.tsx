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
      {GENRES.map((genre) => (
        <label
          key={genre}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-surface)] border border-transparent has-checked:border-[var(--color-primary)] cursor-pointer capitalize text-sm"
        >
          <input
            type="checkbox"
            checked={selected.includes(genre)}
            onChange={() => toggle(genre)}
            className="accent-[var(--color-primary)]"
          />
          {genre}
        </label>
      ))}
    </div>
  )
}
