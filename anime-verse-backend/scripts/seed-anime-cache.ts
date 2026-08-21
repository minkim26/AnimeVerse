import { upsertAnime } from '../lib/animeCache.ts'
import prisma from '../lib/prisma.ts'

interface AniListMedia {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { large: string | null; medium: string | null }
  description: string | null
  genres: string[]
  tags: { name: string; rank: number }[]
  isAdult: boolean
}

const QUERY = `
  query ($page: Int) {
    Page(page: $page, perPage: 50) {
      media(sort: POPULARITY_DESC, type: ANIME) {
        id
        title { english romaji }
        coverImage { large medium }
        description(asHtml: false)
        genres
        tags { name rank }
        isAdult
      }
    }
  }
`

// Same shape as src/services/anilist.ts's animeTitle/animeSynopsis on the
// frontend, duplicated here since this is a one-off backend script with no
// shared module between the two.
function title(media: AniListMedia): string {
  return media.title.english ?? media.title.romaji ?? 'Untitled'
}

function synopsis(media: AniListMedia): string {
  if (!media.description) return ''
  return media.description
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(page: number): Promise<AniListMedia[]> {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { page } }),
  })
  const { data } = (await response.json()) as { data: { Page: { media: AniListMedia[] } } }
  return data.Page.media
}

// Seeds the shared Anime cache directly (bypassing the swipe requirement)
// so a fresh/low-traffic deployment has more than a handful of candidates
// for GET /recommendations/for-you. upsertAnime is write-once (ON CONFLICT
// DO NOTHING), so this is safe to rerun. Already-cached rows are skipped,
// not refreshed.
//
// PAGES * 50 is the number of titles fetched. AniList's cap is 30 req/min;
// raise PAGES freely, it would take well over 600 to be worth throttling.
//
// ponytail: no retry/backoff on a fetch failure, just rerun the script.
// upsertAnime's idempotency makes that safe.
const PAGES = 6

async function main() {
  let created = 0
  for (let page = 1; page <= PAGES; page++) {
    const media = await fetchPage(page)
    for (const anime of media) {
      await upsertAnime({
        id: anime.id,
        title: title(anime),
        posterUrl: anime.coverImage.large ?? anime.coverImage.medium,
        synopsis: synopsis(anime),
        tags: anime.tags,
        isAdult: anime.isAdult || anime.genres.includes('Ecchi'),
      })
      created++
    }
    console.log(`Page ${page}/${PAGES}: upserted ${media.length} titles`)
  }
  console.log(`Done. Attempted ${created} titles (already-cached ones were no-ops).`)
  await prisma.$disconnect()
}

main()
