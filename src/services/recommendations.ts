import { apiRequest } from './api.ts'
import type { AniListAnime } from './anilist.ts'

interface CachedAnime {
  id: number
  title: string
  posterUrl: string | null
  synopsis: string
}

// The cached Anime row is flatter (one title string, one posterUrl) than
// AnimeCard's expected nested title.{english,romaji} /
// coverImage.{medium,large,extraLarge} shape. This fills in that shape so
// AnimeCard can render a recommended anime with no changes to itself.
export function toAniListAnime(anime: CachedAnime): AniListAnime {
  return {
    id: anime.id,
    title: { english: anime.title, romaji: null },
    coverImage: { medium: anime.posterUrl, large: anime.posterUrl, extraLarge: anime.posterUrl },
    description: anime.synopsis,
    genres: [],
    tags: [],
  }
}

export async function getForYouRecommendations(): Promise<AniListAnime[]> {
  const { recommendations } = await apiRequest<{ recommendations: CachedAnime[] }>('/recommendations/for-you', {
    auth: true,
  })
  return recommendations.map(toAniListAnime)
}
