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
    genres: z.array(z.string()).default([])
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
