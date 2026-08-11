import { describe, it, expect } from 'vitest'
import { toAniListAnime } from './recommendations.ts'

describe('toAniListAnime', () => {
  it('maps a cached anime row into the shape AnimeCard expects', () => {
    const result = toAniListAnime({ id: 1, title: 'Frieren', posterUrl: 'poster.jpg', synopsis: 'A synopsis.' })

    expect(result).toEqual({
      id: 1,
      title: { english: 'Frieren', romaji: null },
      coverImage: { medium: 'poster.jpg', large: 'poster.jpg', extraLarge: 'poster.jpg' },
      description: 'A synopsis.',
      genres: [],
      tags: [],
    })
  })

  it('passes through a null poster', () => {
    const result = toAniListAnime({ id: 2, title: 'No Poster', posterUrl: null, synopsis: '' })
    expect(result.coverImage).toEqual({ medium: null, large: null, extraLarge: null })
  })
})
