# AniList Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Kitsu with AniList as AnimeVerse's sole anime data source (frontend browsing + a new backend tag-weighting module), with zero visible behavior change, so later plans can build the taste-vector recommendation engine on top of AniList's weighted tags.

**Architecture:** A frontend GraphQL client (`src/services/anilist.ts`) mirrors the shape of the `src/services/kitsu.ts` module it replaces, so the three existing consumers (`AnimeCard.tsx`, `Recommendations.tsx`, `Profile.tsx`) swap over with minimal churn and no UI change. A new backend-only pure module (`lib/tagVector.ts`) converts AniList's `{name, rank}` tag lists into a fixed-length weighted vector over a real, live-fetched AniList tag vocabulary — this is inert in this plan (nothing calls it yet) but is the exact building block the next plan (pgvector + Anime cache + Swipe model + Discover UI) consumes.

**Tech Stack:** AniList GraphQL v2 API (`https://graphql.anilist.co`, public, no auth/API key), Vitest (new, frontend + backend), Playwright (new, E2E).

## Roadmap (this plan is #1 of several)

1. **This plan** — AniList migration (frontend data source swap) + tag-vector math foundation
2. pgvector + `Anime` cache table + `Swipe` model/endpoint + Discover swipe-deck UI (mandatory onboarding + persistent tab)
3. Recommendation engine (`/recommendations/for-you`) + Explore page "For You" row
4. Explore page "Browse & Search" row (genre/sort/search against AniList directly)
5. Watchlist/Reviews frontend ("My List") — `WatchStatus` field, FK migration to `Anime`
6. Taste Map (hand-rolled PCA) page
7. Live activity feed + presence (WebSocket)
8. Remove `Preference` model/page, nav update, Bento Editorial restyle of surviving pages (Home/Login/Signup/Profile/PrivacyPolicy/NotFound)

## Global Constraints

- AniList's public API is rate-limited to **30 requests/minute** (confirmed live via response headers at plan-writing time) — every new fetch function must use a single request per page load, never a multi-page loop (the old `kitsu.ts` `fetchRandomRecommendations` looped 5 requests; its AniList replacement must not).
- AniList's `description(asHtml: false)` field **still returns embedded HTML** (`<i>`, `<br>`) despite the flag — confirmed live against a real title. Anywhere a synopsis is displayed, it must go through an HTML-stripping helper; never use `dangerouslySetInnerHTML`.
- No behavior/UI change in this plan — `Recommendations.tsx` keeps its exact four sections (For You / Trending Now / New Releases / Random Recommendations); only the data source changes. The rename to `Explore` and any layout change happens in plan #3/#4.
- No new API keys or secrets — AniList's read API is public.
- The real, filtered AniList tag vocabulary is **335 tags** (confirmed live: 425 total tags minus 21 `Technical`-category and 68 `Sexual Content`-category/`isAdult` tags) — this updates the design spec's provisional estimate of ~150.

---

### Task 1: Frontend Vitest setup + AniList client core types and helpers

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json` (add `vitest` devDependency + `test` script)
- Create: `src/services/anilist.ts`
- Create: `src/services/anilist.test.ts`

**Interfaces:**
- Produces: `interface AniListAnime { id: number; title: { english: string | null; romaji: string | null }; coverImage: { medium: string | null; large: string | null }; description: string | null; genres: string[]; tags: { name: string; rank: number }[] }`, `function animeTitle(anime: AniListAnime): string`, `function animeSynopsis(anime: AniListAnime): string`

- [ ] **Step 1: Add Vitest to the frontend**

```bash
npm install -D vitest
```

- [ ] **Step 2: Wire Vitest into the existing Vite config**

Replace the contents of `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing test for `animeTitle` and `animeSynopsis`**

Create `src/services/anilist.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: FAIL — `src/services/anilist.ts` does not exist yet.

- [ ] **Step 6: Create `src/services/anilist.ts` with the types and helpers**

```ts
export interface AniListAnime {
  id: number
  title: { english: string | null; romaji: string | null }
  coverImage: { medium: string | null; large: string | null }
  description: string | null
  genres: string[]
  tags: { name: string; rank: number }[]
}

export function animeTitle(anime: AniListAnime): string {
  return anime.title.english ?? anime.title.romaji ?? 'Untitled'
}

export function animeSynopsis(anime: AniListAnime): string {
  if (!anime.description) return ''
  return anime.description
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts package.json package-lock.json src/services/anilist.ts src/services/anilist.test.ts
git commit -m "Add Vitest and the AniList client's core types and title/synopsis helpers"
```

---

### Task 2: AniList data-fetching functions

**Files:**
- Modify: `src/services/anilist.ts`
- Modify: `src/services/anilist.test.ts`

**Interfaces:**
- Consumes: `AniListAnime` from Task 1
- Produces: `function fetchAnimeByGenres(genres: string[]): Promise<AniListAnime[]>`, `function fetchTrendingNow(): Promise<AniListAnime[]>`, `function fetchNewReleases(): Promise<AniListAnime[]>`, `function fetchRandomRecommendations(): Promise<AniListAnime[]>`, `function fetchRandomAnime(): Promise<{ title: string; imageUrl: string; description: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/anilist.test.ts`:

```ts
import { vi, afterEach } from 'vitest'
import {
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  fetchRandomAnime,
} from './anilist.ts'

function mockAniListResponse(media: unknown[]): Response {
  return {
    ok: true,
    json: async () => ({ data: { Page: { media } } }),
  } as Response
}

function lastRequestVariables(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, options] = fetchMock.mock.calls[0] as [string, { body: string }]
  return JSON.parse(options.body).variables
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchAnimeByGenres', () => {
  it('sends the requested genres and returns the media list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([{ id: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAnimeByGenres(['Action', 'Comedy'])

    expect(result).toEqual([{ id: 1 }])
    expect(lastRequestVariables(fetchMock).genre_in).toEqual(['Action', 'Comedy'])
  })
})

describe('fetchTrendingNow', () => {
  it('sorts by TRENDING_DESC', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTrendingNow()

    expect(lastRequestVariables(fetchMock).sort).toEqual(['TRENDING_DESC'])
  })
})

describe('fetchNewReleases', () => {
  it('filters to currently releasing anime sorted by newest start date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchNewReleases()

    const variables = lastRequestVariables(fetchMock)
    expect(variables.status).toBe('RELEASING')
    expect(variables.sort).toEqual(['START_DATE_DESC'])
  })
})

describe('fetchRandomRecommendations', () => {
  it('makes exactly one request and returns 12 results', async () => {
    const pool = Array.from({ length: 40 }, (_, i) => ({ id: i }))
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRandomRecommendations()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(12)
  })
})

describe('fetchRandomAnime', () => {
  it('makes exactly one request and returns a single formatted anime', async () => {
    const pool = [
      {
        id: 1,
        title: { english: 'Test Anime', romaji: null },
        coverImage: { medium: 'med.jpg', large: 'large.jpg' },
        description: 'A <b>test</b> synopsis.',
        genres: [],
        tags: [],
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(mockAniListResponse(pool))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRandomAnime()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      title: 'Test Anime',
      imageUrl: 'large.jpg',
      description: 'A test synopsis.',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: FAIL — the five new functions don't exist yet.

- [ ] **Step 3: Implement the fetch functions**

Append to `src/services/anilist.ts`:

```ts
const ANILIST_API_URL = 'https://graphql.anilist.co'

const MEDIA_LIST_QUERY = `
  query ($page: Int, $perPage: Int, $genre_in: [String], $sort: [MediaSort], $status: MediaStatus) {
    Page(page: $page, perPage: $perPage) {
      media(genre_in: $genre_in, sort: $sort, status: $status, type: ANIME) {
        id
        title { english romaji }
        coverImage { medium large }
        description(asHtml: false)
        genres
        tags { name rank }
      }
    }
  }
`

interface MediaListVariables {
  page: number
  perPage: number
  genre_in?: string[]
  sort?: string[]
  status?: string
}

async function fetchMediaList(variables: MediaListVariables): Promise<AniListAnime[]> {
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: MEDIA_LIST_QUERY, variables }),
  })
  const json = (await response.json()) as { data: { Page: { media: AniListAnime[] } } }
  return json.data.Page.media
}

// ponytail: perPage: 40, page: random(1-20) covers a pool of ~800 popular
// titles in a single request, keeping us well under AniList's 30 req/min
// limit. Raise the page range if the pool ever feels repetitive.
function randomPage(): number {
  return Math.floor(Math.random() * 20) + 1
}

export async function fetchAnimeByGenres(genres: string[]): Promise<AniListAnime[]> {
  return fetchMediaList({ page: 1, perPage: 12, genre_in: genres, sort: ['POPULARITY_DESC'] })
}

export async function fetchTrendingNow(): Promise<AniListAnime[]> {
  return fetchMediaList({ page: 1, perPage: 12, sort: ['TRENDING_DESC'] })
}

export async function fetchNewReleases(): Promise<AniListAnime[]> {
  return fetchMediaList({ page: 1, perPage: 12, status: 'RELEASING', sort: ['START_DATE_DESC'] })
}

export async function fetchRandomRecommendations(): Promise<AniListAnime[]> {
  const pool = await fetchMediaList({ page: randomPage(), perPage: 40, sort: ['POPULARITY_DESC'] })
  const shuffled = [...pool].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, 12)
}

export async function fetchRandomAnime(): Promise<{ title: string; imageUrl: string; description: string }> {
  const pool = await fetchMediaList({ page: randomPage(), perPage: 40, sort: ['POPULARITY_DESC'] })
  const anime = pool[Math.floor(Math.random() * pool.length)]!
  return {
    title: animeTitle(anime),
    imageUrl: anime.coverImage.large ?? anime.coverImage.medium ?? '',
    description: animeSynopsis(anime),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/anilist.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/anilist.ts src/services/anilist.test.ts
git commit -m "Add AniList data-fetching functions matching the Kitsu client's shape"
```

---

### Task 3: Swap consumers to AniList and delete the Kitsu client

**Files:**
- Modify: `src/components/AnimeCard.tsx`
- Modify: `src/pages/Recommendations.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `CLAUDE.md`
- Delete: `src/services/kitsu.ts`

**Interfaces:**
- Consumes: `AniListAnime`, `animeTitle`, `animeSynopsis`, `fetchAnimeByGenres`, `fetchTrendingNow`, `fetchNewReleases`, `fetchRandomRecommendations`, `fetchRandomAnime` from Tasks 1-2

- [ ] **Step 1: Update `AnimeCard.tsx`**

Replace the full contents of `src/components/AnimeCard.tsx`:

```tsx
import { useState } from 'react'
import { animeTitle, animeSynopsis, type AniListAnime } from '../services/anilist.ts'

interface AnimeCardProps {
  anime: AniListAnime
}

export default function AnimeCard({ anime }: AnimeCardProps) {
  const [showSynopsis, setShowSynopsis] = useState(false)
  const title = animeTitle(anime)
  const poster = anime.coverImage.medium

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl p-4 shadow-sm hover:-translate-y-1 transition-transform">
      <button
        type="button"
        onClick={() => setShowSynopsis((v) => !v)}
        className="block w-full text-left bg-transparent border-none p-0 cursor-pointer"
      >
        <h3 className="font-display text-sm font-semibold mb-2">{title}</h3>
        {poster && <img src={poster} alt={title} className="w-full rounded-xl object-cover" />}
      </button>
      {showSynopsis && (
        <p className="text-xs text-[var(--color-muted)] mt-2 line-clamp-6">{animeSynopsis(anime)}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `Recommendations.tsx`'s import**

In `src/pages/Recommendations.tsx`, replace:

```ts
import {
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  type KitsuAnime,
} from '../services/kitsu.ts'
```

with:

```ts
import {
  fetchAnimeByGenres,
  fetchTrendingNow,
  fetchNewReleases,
  fetchRandomRecommendations,
  type AniListAnime,
} from '../services/anilist.ts'
```

Then replace every remaining use of `KitsuAnime` in the same file with `AniListAnime` (the `AnimeSectionProps` interface's `anime: KitsuAnime[] | null` field, and the four `useState<KitsuAnime[] | null>` calls).

- [ ] **Step 3: Update `Profile.tsx`'s import**

In `src/pages/Profile.tsx`, replace:

```ts
import { fetchRandomAnime } from '../services/kitsu.ts'
```

with:

```ts
import { fetchRandomAnime } from '../services/anilist.ts'
```

No other changes needed in `Profile.tsx` — `fetchRandomAnime`'s return shape (`{ title, imageUrl, description }`) is unchanged.

- [ ] **Step 4: Delete the Kitsu client**

```bash
rm src/services/kitsu.ts
```

- [ ] **Step 5: Update `CLAUDE.md`'s stale Kitsu reference**

In `CLAUDE.md`, find the "Known quirks" bullet that starts with "Kitsu calls happen entirely client-side" and replace it with:

```markdown
- AniList calls happen entirely client-side (`src/services/anilist.ts`) — the Express API has no route that proxies or caches AniList data for browsing (that changes once the recommendation-engine plan adds a server-side `Anime` cache). Don't look for a backend endpoint for trending/new-releases/random; there isn't one yet.
- AniList's `description(asHtml: false)` field still contains embedded HTML tags in practice — always render synopses through `animeSynopsis()`, never the raw `description` field.
```

- [ ] **Step 6: Verify the whole frontend still typechecks, lints, and builds**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (confirms no other file still imports `kitsu.ts`)

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/AnimeCard.tsx src/pages/Recommendations.tsx src/pages/Profile.tsx CLAUDE.md
git rm src/services/kitsu.ts
git commit -m "Switch AnimeCard, Recommendations, and Profile from Kitsu to AniList"
```

---

### Task 4: Playwright E2E setup + first real test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/recommendations.spec.ts`
- Modify: `package.json` (add `@playwright/test` devDependency + `test:e2e` script)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the running app's `/signup`, `/login`, `/recommendations` routes (no code-level interface — this is a black-box browser test)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Add the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
  // ponytail: chromium-only for now — add firefox/webkit projects once
  // cross-browser coverage is actually prioritized.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: Add the `test:e2e` script**

In `package.json`, add to `"scripts"`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Ignore Playwright's output directories**

In `.gitignore`, add:

```gitignore
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 5: Write the E2E test**

Create `e2e/recommendations.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('signup then Recommendations page renders AniList-backed sections', async ({ page }) => {
  const email = uniqueEmail()
  const password = 'correct horse battery staple'

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign Up' }).click()

  await page.waitForURL('**/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL('**/profile')
  await page.goto('/recommendations')

  await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trending Now' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'New Releases' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Random Recommendations' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
})
```

- [ ] **Step 6: Run the E2E test**

Precondition: the backend stack must be running — in `anime-verse-backend/`, run `docker compose up` (or the local-dev equivalent from `CLAUDE.md`) so `POST /users` and `POST /users/login` are reachable on port 8000.

Run: `npm run test:e2e`
Expected: PASS (1 test) — confirms signup, login, and all three AniList-backed sections render with real data.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e/recommendations.spec.ts package.json package-lock.json .gitignore
git commit -m "Add Playwright and an E2E test covering signup through the AniList-backed Recommendations page"
```

---

### Task 5: Backend Vitest setup + AniList tag vocabulary + tag-vector math

**Files:**
- Modify: `anime-verse-backend/package.json` (add `vitest` devDependency + `test` script)
- Create: `anime-verse-backend/vitest.config.ts`
- Create: `anime-verse-backend/scripts/fetch-tag-vocabulary.ts`
- Create: `anime-verse-backend/data/anilistTags.json`
- Create: `anime-verse-backend/lib/tagVector.ts`
- Create: `anime-verse-backend/lib/tagVector.test.ts`

**Interfaces:**
- Produces: `interface AniListTag { name: string; rank: number }`, `const VECTOR_DIMENSION: number`, `function tagsToVector(tags: AniListTag[]): number[]` — this is what the next plan's `lib/animeCache.ts` and `lib/tasteVector.ts` will import.

- [ ] **Step 1: Add Vitest to the backend**

```bash
cd anime-verse-backend
npm install -D vitest
```

- [ ] **Step 2: Add the Vitest config and `test` script**

Create `anime-verse-backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

In `anime-verse-backend/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the script that fetches AniList's real tag vocabulary**

Create `anime-verse-backend/scripts/fetch-tag-vocabulary.ts`:

```ts
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
```

- [ ] **Step 4: Run the script to generate the real vocabulary fixture**

Run: `npx tsx scripts/fetch-tag-vocabulary.ts`
Expected output: `Wrote 335 tags to data/anilistTags.json` (confirmed live at plan-writing time; a few tags either way is fine if AniList's taxonomy has shifted slightly — the code adapts to whatever `data/anilistTags.json` actually contains, since `VECTOR_DIMENSION` is derived from its length, not hardcoded)

- [ ] **Step 5: Write the failing tests for `tagsToVector`**

Create `anime-verse-backend/lib/tagVector.test.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run lib/tagVector.test.ts`
Expected: FAIL — `lib/tagVector.ts` does not exist yet.

- [ ] **Step 7: Implement `tagsToVector`**

Create `anime-verse-backend/lib/tagVector.ts`:

```ts
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
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run lib/tagVector.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add anime-verse-backend/package.json anime-verse-backend/package-lock.json anime-verse-backend/vitest.config.ts anime-verse-backend/scripts/fetch-tag-vocabulary.ts anime-verse-backend/data/anilistTags.json anime-verse-backend/lib/tagVector.ts anime-verse-backend/lib/tagVector.test.ts
git commit -m "Add the real AniList tag vocabulary and the tag-to-vector weighting function"
```

---

## Self-Review Notes

- **Spec coverage:** this plan covers the design spec's "Data source migration" section in full (AniList replaces Kitsu end-to-end) and lays the `tagVector.ts` groundwork the spec's `lib/tasteVector.ts` and `Anime.tasteVector` depend on. It deliberately does **not** cover Discover/Explore/TasteMap/MyList/activity-feed/visual-redesign/`Preference` removal — those are plans #2-8 above, kept separate per the writing-plans scope check since each is independently shippable and the spec's own architecture section already separates them by concern.
- **Type consistency:** `AniListAnime`, `animeTitle`, `animeSynopsis`, and all five fetch functions are defined once in Task 1-2 and only ever imported (never redefined) in Tasks 3-4. `AniListTag`, `VECTOR_DIMENSION`, and `tagsToVector` are defined once in Task 5.
- **No placeholders:** the tag vocabulary count (335), rate limit (30/min), and the HTML-in-description quirk were all confirmed against the live AniList API while writing this plan, not assumed from memory.
