export interface AniListAnime {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { medium: string | null; large: string | null }
  description: string | null
  genres: string[]
  tags: { name: string; rank: number }[]
}

export function animeTitle(anime: AniListAnime): string {
  return anime.title.english ?? anime.title.romaji ?? 'Untitled'
}

export function animeSynopsis(anime: AniListAnime): string {
  if (!anime.description) return ''
  return anime.description
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
