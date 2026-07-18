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
    <div className="flex flex-col bg-[var(--color-surface)] rounded-2xl p-4 shadow-sm hover:-translate-y-1 transition-transform">
      <button
        type="button"
        onClick={() => setShowSynopsis((v) => !v)}
        className="block w-full text-left bg-transparent border-none p-0 cursor-pointer"
      >
        <h3 className="font-display text-sm font-semibold mb-2">{title}</h3>
        {poster && (
          <img
            src={poster}
            alt={title}
            loading="lazy"
            className="w-full rounded-xl object-cover aspect-[2/3]"
          />
        )}
      </button>
      {showSynopsis && synopsis && (
        <p className="text-xs text-[var(--color-muted)] mt-2">{synopsis}</p>
      )}
    </div>
  )
}
