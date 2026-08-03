import * as z from 'zod'

export const User = z.object({
    email: z.email(),
    password: z.string().min(8)
})

export const UpdatePassword = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(8)
})

export const Preferences = z.object({
    genres: z.array(z.string()).default([]),
    showAdultContent: z.boolean().default(false)
})

export const WatchlistItem = z.object({
    animeId: z.string().min(1),
    title: z.string().optional(),
    posterUrl: z.string().optional()
})

export const Review = z.object({
    animeId: z.string().min(1),
    rating: z.int().min(1).max(5),
    reviewText: z.string().min(1)
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
            .max(100)
    })
})
