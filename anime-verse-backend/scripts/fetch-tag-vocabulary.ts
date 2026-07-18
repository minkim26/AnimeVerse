import { writeFileSync } from 'node:fs'

interface AniListTagEntry {
  name: string
  category: string
  isAdult: boolean
}

// ponytail: excluding whole categories (rather than a hand-picked tag list)
// keeps this regenerable — rerun this script if AniList's taxonomy changes.
const EXCLUDED_CATEGORIES = new Set(['Technical', 'Sexual Content'])

async function main() {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ MediaTagCollection { name category isAdult } }' }),
  })
  const { data } = (await response.json()) as { data: { MediaTagCollection: AniListTagEntry[] } }

  const vocabulary = data.MediaTagCollection
    .filter((tag) => !EXCLUDED_CATEGORIES.has(tag.category) && !tag.isAdult)
    .map((tag) => tag.name)
    .sort()

  writeFileSync(new URL('../data/anilistTags.json', import.meta.url), JSON.stringify(vocabulary, null, 2) + '\n')
  console.log(`Wrote ${vocabulary.length} tags to data/anilistTags.json`)
}

main()
