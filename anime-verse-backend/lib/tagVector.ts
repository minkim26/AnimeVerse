import tagVocabulary from '../data/anilistTags.json' with { type: 'json' }

export interface AniListTag {
  name: string
  rank: number
}

const TAG_INDEX = new Map(tagVocabulary.map((name, index) => [name, index] as const))

export const VECTOR_DIMENSION = tagVocabulary.length

export function tagsToVector(tags: AniListTag[]): number[] {
  const vector = new Array<number>(VECTOR_DIMENSION).fill(0)
  for (const tag of tags) {
    const index = TAG_INDEX.get(tag.name)
    if (index !== undefined) {
      vector[index] = tag.rank / 100
    }
  }
  return vector
}
