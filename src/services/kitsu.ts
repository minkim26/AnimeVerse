const KITSU_BASE_URL = 'https://kitsu.io/api/edge'

export interface KitsuAnime {
  id: string
  attributes: {
    titles: { en?: string; en_jp?: string }
    posterImage: { small?: string; medium?: string } | null
    synopsis: string
  }
}

interface KitsuListResponse {
  data: KitsuAnime[]
}

export function animeTitle(anime: KitsuAnime): string {
  return anime.attributes.titles.en || anime.attributes.titles.en_jp || 'Untitled'
}

export async function fetchAnimeByGenres(genres: string[]): Promise<KitsuAnime[]> {
  const genreFilter = genres.map((genre) => `filter[genres]=${encodeURIComponent(genre)}`).join('&')
  const response = await fetch(`${KITSU_BASE_URL}/anime?${genreFilter}&page[limit]=12`)
  const data: KitsuListResponse = await response.json()
  return data.data
}

export async function fetchTrendingNow(): Promise<KitsuAnime[]> {
  const response = await fetch(`${KITSU_BASE_URL}/trending/anime?limit=12`)
  const data: KitsuListResponse = await response.json()
  return data.data
}

export async function fetchNewReleases(): Promise<KitsuAnime[]> {
  const response = await fetch(`${KITSU_BASE_URL}/anime?filter[status]=current&sort=-startDate&page[limit]=12`)
  const data: KitsuListResponse = await response.json()
  return data.data
}

const RANDOM_POOL_SIZE = 100
const RANDOM_PAGE_SIZE = 20
const RANDOM_SELECTION_SIZE = 12

export async function fetchRandomRecommendations(): Promise<KitsuAnime[]> {
  let allAnime: KitsuAnime[] = []
  let page = 0

  while (allAnime.length < RANDOM_POOL_SIZE) {
    page++
    const response = await fetch(
      `${KITSU_BASE_URL}/anime?sort=-userCount&page[limit]=${RANDOM_PAGE_SIZE}&page[offset]=${
        RANDOM_PAGE_SIZE * (page - 1)
      }`,
    )
    const data: KitsuListResponse = await response.json()
    allAnime = allAnime.concat(data.data)
  }

  allAnime = allAnime.slice(0, RANDOM_POOL_SIZE)
  const shuffled = [...allAnime].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, RANDOM_SELECTION_SIZE)
}

export async function fetchRandomAnime(): Promise<{ title: string; imageUrl: string; description: string }> {
  const response = await fetch(`${KITSU_BASE_URL}/anime?page[limit]=20&page[offset]=${Math.floor(Math.random() * 500)}`)
  const data: KitsuListResponse = await response.json()
  const pool = data.data.length > 0 ? data.data : (await fetchTrendingNow())
  const anime = pool[Math.floor(Math.random() * pool.length)]!
  return {
    title: animeTitle(anime),
    imageUrl: anime.attributes.posterImage?.medium ?? '',
    description: anime.attributes.synopsis,
  }
}
