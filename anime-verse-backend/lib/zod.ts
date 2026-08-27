import * as z from 'zod'

export const Preferences = z.object({
    genres: z
        .array(z.string().max(50, { error: 'Genre names must be 50 characters or less.' }))
        .max(50, { error: 'You can select up to 50 genres.' })
        .default([]),
    showAdultContent: z.boolean().default(false)
})

export const WatchlistItem = z.object({
    animeId: z.string().min(1).max(100),
    title: z.string().max(500).optional(),
    posterUrl: z.url().max(2000).optional()
})

export const Review = z.object({
    animeId: z.string().min(1).max(100),
    rating: z.int().min(1).max(5),
    reviewText: z.string().min(1).max(5000)
})

export const SwipeActionValue = z.enum(['SKIP', 'LIKE', 'LOVE'])

export const Swipe = z.object({
    animeId: z.int().positive().max(2_147_483_647),
    action: SwipeActionValue,
    anime: z.object({
        title: z.string().min(1).max(500),
        posterUrl: z.url().nullable(),
        synopsis: z.string().max(5000),
        tags: z
            .array(
                z.object({
                    name: z.string().min(1).max(100),
                    rank: z.number().min(0).max(100)
                })
            )
            .max(100),
        isAdult: z.boolean()
    })
})
