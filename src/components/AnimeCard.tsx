import { useState } from 'react'
import { animeTitle, animeSynopsis, type AniListAnime } from '../services/anilist.ts'

interface AnimeCardProps {
  anime: AniListAnime
}

export default function AnimeCard({ anime }: AnimeCardProps) {
  const [showSynopsis, setShowSynopsis] = useState(false)
  const title = animeTitle(anime)
  const poster = anime.coverImage.extraLarge ?? anime.coverImage.large ?? anime.coverImage.medium
  const synopsis = animeSynopsis(anime)

  return (
    <div className="surface-card flex flex-col p-3 hover:-translate-y-1 transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-expo)]">
      <button
        type="button"
        onClick={() => setShowSynopsis((v) => !v)}
        className="block w-full text-left bg-transparent border-none p-0 cursor-pointer"
      >
        {poster && (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            className="w-full rounded-xl object-cover aspect-[2/3]"
          />
        )}
        <h3 className="font-display text-sm font-semibold mt-3 leading-snug text-[var(--color-ink)]">
          {title}
        </h3>
      </button>
      {showSynopsis && synopsis && (
        <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">{synopsis}</p>
      )}
    </div>
  )
}
