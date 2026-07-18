import { describe, it, expect } from 'vitest'
import { tagsToVector, VECTOR_DIMENSION } from './tagVector.ts'
import tagVocabulary from '../data/anilistTags.json' with { type: 'json' }

describe('tagsToVector', () => {
  it('returns an all-zero vector for no tags', () => {
    const vector = tagsToVector([])
    expect(vector).toHaveLength(VECTOR_DIMENSION)
    expect(vector.every((value) => value === 0)).toBe(true)
  })

  it('sets the vocabulary index to rank/100 for a known tag', () => {
    const afterlifeIndex = tagVocabulary.indexOf('Afterlife')
    const vector = tagsToVector([{ name: 'Afterlife', rank: 80 }])
    expect(vector[afterlifeIndex]).toBe(0.8)
  })

  it('sets multiple known tags independently', () => {
    const isekaiIndex = tagVocabulary.indexOf('Isekai')
    const tragedyIndex = tagVocabulary.indexOf('Tragedy')
    const vector = tagsToVector([
      { name: 'Isekai', rank: 92 },
      { name: 'Tragedy', rank: 60 },
    ])
    expect(vector[isekaiIndex]).toBe(0.92)
    expect(vector[tragedyIndex]).toBe(0.6)
  })

  it('ignores tags not in the vocabulary', () => {
    const vector = tagsToVector([{ name: 'Not A Real AniList Tag', rank: 100 }])
    expect(vector.every((value) => value === 0)).toBe(true)
  })
})
