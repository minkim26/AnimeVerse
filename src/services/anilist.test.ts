import { describe, it, expect } from 'vitest'
import { animeTitle, animeSynopsis, type AniListAnime } from './anilist.ts'

function makeAnime(overrides: Partial<AniListAnime> = {}): AniListAnime {
  return {
    id: 1,
    title: { english: 'Test Anime', romaji: 'Tesuto Anime' },
    coverImage: { medium: null, large: null },
    description: null,
    genres: [],
    tags: [],
    ...overrides,
  }
}

describe('animeTitle', () => {
  it('prefers the English title when present', () => {
    expect(animeTitle(makeAnime())).toBe('Test Anime')
  })

  it('falls back to the romaji title when English is null', () => {
    expect(animeTitle(makeAnime({ title: { english: null, romaji: 'Tesuto Anime' } }))).toBe('Tesuto Anime')
  })

  it('falls back to "Untitled" when both titles are null', () => {
    expect(animeTitle(makeAnime({ title: { english: null, romaji: null } }))).toBe('Untitled')
  })
})

describe('animeSynopsis', () => {
  it('strips AniList HTML tags despite asHtml: false', () => {
    const html =
      'The fourth season of <i>Tensei Shitara Slime Datta Ken</i>.<br><br>\nDemon Lord Rimuru...'
    expect(animeSynopsis(makeAnime({ description: html }))).toBe(
      'The fourth season of Tensei Shitara Slime Datta Ken. Demon Lord Rimuru...',
    )
  })

  it('returns an empty string when description is null', () => {
    expect(animeSynopsis(makeAnime({ description: null }))).toBe('')
  })
})
