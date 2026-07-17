export const GENRES = ['action', 'comedy', 'fantasy', 'horror', 'mystery', 'romance', 'thriller'] as const

export type Genre = (typeof GENRES)[number]
