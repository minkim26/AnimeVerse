import type { AnimeCacheInput } from './animeCache.ts'
import type { AniListTag } from './tagVector.ts'

const ANILIST_API_URL = 'https://graphql.anilist.co'

const MEDIA_BY_ID_QUERY = `
    query ($id: Int) {
        Media(id: $id, type: ANIME) {
            id
            title { english romaji }
            coverImage { medium large extraLarge }
            description(asHtml: false)
            genres
            tags { name rank }
            isAdult
        }
    }
`

interface AniListMedia {
    id: number
    title: { english: string | null; romaji: string | null }
    coverImage: { medium: string | null; large: string | null; extraLarge: string | null }
    description: string | null
    genres: string[]
    tags: AniListTag[]
    isAdult: boolean | null
}

function stripSynopsisHtml(description: string | null): string {
    if (!description) return ''
    return description
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/*
 * fetchAnimeById — the first server-side AniList caller in this codebase;
 * everywhere else, src/services/anilist.ts calls AniList from the browser.
 * Deliberately duplicates that file's title/posterUrl/synopsis/isAdult
 * derivation (frontend and backend are separate npm packages, nothing to
 * import across) so a "verified" row matches what a fresh client-side
 * fetch would have produced.
 *
 * Throws on any failure — HTTP error, GraphQL error, or a missing Media
 * (the anime was removed from AniList) — so the caller (consumer.ts's
 * message handler) can nack the message to the DLQ, same convention as
 * processThumbnailMessage.
 */
export async function fetchAnimeById(id: number): Promise<Omit<AnimeCacheInput, 'id'>> {
    const response = await fetch(ANILIST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: MEDIA_BY_ID_QUERY, variables: { id } }),
        signal: AbortSignal.timeout(30_000)
    })

    if (!response.ok) {
        throw new Error(`AniList request failed: HTTP ${response.status}`)
    }

    const json = (await response.json()) as {
        data?: { Media?: AniListMedia | null }
        errors?: { message: string }[]
    }
    if (json.errors?.length) {
        throw new Error(`AniList rejected the query: ${json.errors[0]!.message}`)
    }

    const media = json.data?.Media
    if (!media) {
        throw new Error(`AniList has no Media for id ${id}`)
    }

    return {
        title: media.title.english ?? media.title.romaji ?? 'Untitled',
        posterUrl: media.coverImage.large ?? media.coverImage.medium ?? null,
        synopsis: stripSynopsisHtml(media.description),
        tags: media.tags,
        isAdult: (media.isAdult ?? false) || media.genres.includes('Ecchi')
    }
}
