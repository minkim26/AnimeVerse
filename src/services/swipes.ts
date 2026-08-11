import { apiRequest } from './api.ts'
import { animeTitle, animeSynopsis, type AniListAnime } from './anilist.ts'

export type SwipeAction = 'SKIP' | 'LIKE' | 'LOVE'

export interface MySwipe {
  animeId: number
  action: SwipeAction
}

export async function postSwipe(anime: AniListAnime, action: SwipeAction): Promise<void> {
  await apiRequest('/swipes', {
    method: 'POST',
    auth: true,
    body: {
      animeId: anime.id,
      action,
      anime: {
        title: animeTitle(anime),
        posterUrl: anime.coverImage.large ?? anime.coverImage.medium ?? null,
        synopsis: animeSynopsis(anime),
        tags: anime.tags,
        // Broadened past AniList's own flag to also cover the Ecchi genre tag — see
        // adultContentFilter's comment in anilist.ts for why both are needed.
        isAdult: (anime.isAdult ?? false) || anime.genres.includes('Ecchi'),
      },
    },
  })
}

export async function getMySwipes(): Promise<MySwipe[]> {
  const { swipes } = await apiRequest<{ swipes: MySwipe[] }>('/swipes/me', { auth: true })
  return swipes
}
