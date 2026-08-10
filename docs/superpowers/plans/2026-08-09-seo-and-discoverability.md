# SEO and Discoverability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed SEO/discoverability/metadata gaps in AnimeVerse's frontend (per-route titles, meta description, OG tags, canonical, structured data, favicon, robots.txt, sitemap.xml, llms.txt, one alt-text gap) and investigate real console errors live, per `docs/superpowers/specs/2026-08-09-seo-and-discoverability-design.md`.

**Architecture:** A tiny `usePageMeta` hook (no new runtime dependency) drives per-route `document.title`/meta-description/canonical updates; `index.html` gets static defaults (meta description, OG tags, canonical, favicon link, JSON-LD) that Vite substitutes `%VITE_SITE_URL%` into at build time; new files land in `public/` for crawler-facing discoverability.

**Tech Stack:** React 19 + Vite + TypeScript (frontend), Vitest (`happy-dom` environment for one new test file), Playwright (e2e + one-off asset generation).

## Global Constraints

- No new runtime npm dependency for meta-tag management — use a custom hook, not `react-helmet-async` or similar.
- `happy-dom` is the one allowed new dependency, and it's dev-only (test environment for `usePageMeta.test.ts`).
- No SSR/prerendering, no sitemap-generation tooling — sitemap URLs are hand-written.
- Title format for every route: `` `${pageTitle} | AnimeVerse` ``.
- `src/lib/site.ts`'s `SITE_URL` reads `import.meta.env.VITE_SITE_URL`, falling back to `window.location.origin`. This works for `index.html` (Vite substitutes `%VITE_SITE_URL%` at build time) and for the JS-driven canonical tag.
- **Correction found during planning, not in the original spec:** Vite's `%VITE_VAR%` substitution only applies to HTML files it processes (`index.html`). Files in `public/` (including `robots.txt` and `sitemap.xml`) are copied to `dist/` byte-for-byte with zero templating — confirmed against Vite's own docs, which use `robots.txt` as their example of an unprocessed `public/` asset. `VITE_SITE_URL` cannot reach those two files. They use a hardcoded placeholder domain instead: `https://animeverse.example` (the `.example` TLD is IANA-reserved for documentation, so it's guaranteed never to resolve to anything real). Both files carry a comment noting this needs a manual swap once real hosting exists.
- AI-crawler user-agents to disallow in `robots.txt` (exact list, per the user's decision to block AI crawlers specifically): `GPTBot`, `ChatGPT-User`, `CCBot`, `Google-Extended`, `anthropic-ai`, `ClaudeBot`, `Claude-Web`, `PerplexityBot`, `Bytespider`, `Applebot-Extended`, `Amazonbot`, `Diffbot`, `meta-externalagent`, `cohere-ai`, `Omgilibot`, `Timpibot`, `YouBot`.
- Sitemap routes (public, unauthenticated only): `/`, `/login`, `/signup`, `/privacy-policy`.
- Brand colors to reuse (from `src/styles/tokens.css`, converted to hex for the favicon/asset generation since SVG-as-favicon and a rasterized PNG both need guaranteed-supported color values): `--color-accent` = `#d01e1c`, `--color-paper` = `#faf6ee`, `--color-hero` = `#341e13`.
- Per-page `usePageMeta` title/description copy (used verbatim in Task 4):

  | Page | title | description |
  |------|-------|-------------|
  | Home | Discover Anime Recommendations | AnimeVerse recommends anime tailored to your taste — swipe through a discovery deck, then get personalized picks powered by taste-vector matching. |
  | Login | Log In | Log in to AnimeVerse to pick up your personalized anime recommendations and continue where you left off. |
  | Signup | Sign Up | Create a free AnimeVerse account to start building your taste profile and get anime recommendations made for you. |
  | PrivacyPolicy | Privacy Policy | Read AnimeVerse's privacy policy to learn how your account and usage information is collected, used, and protected. |
  | Preferences | Preferences | Update your favorite genres and content settings to fine-tune the anime recommendations AnimeVerse gives you. |
  | Discover | Discover | Swipe through anime to build your taste profile — every like, love, and skip helps AnimeVerse recommend better picks. |
  | Recommendations | Recommendations | Browse anime recommendations picked for your taste, plus trending titles, new releases, and random discoveries. |
  | Profile | Profile | Manage your AnimeVerse account, avatar, and password, and revisit anime you've swiped on. |
  | NotFound | Page Not Found | The page you're looking for doesn't exist. Head back to AnimeVerse to keep discovering anime. |

---

## Task 1: `site.ts` constants and the `usePageMeta` hook

**Files:**
- Create: `src/lib/site.ts`
- Create: `src/hooks/usePageMeta.ts`
- Create: `src/hooks/usePageMeta.test.ts`
- Modify: `package.json` (adds `happy-dom` devDependency)

**Interfaces:**
- Produces: `SITE_NAME: string`, `SITE_URL: string` from `src/lib/site.ts`.
- Produces: `applyPageMeta(options: { title: string; description: string }): void` (named export) and `usePageMeta(options: { title: string; description: string }): void` (default export) from `src/hooks/usePageMeta.ts`. Later tasks import the default export and call it as `usePageMeta({ title, description })`.

- [ ] **Step 1: Install `happy-dom`**

Run: `npm install --save-dev happy-dom`

- [ ] **Step 2: Write the failing test**

Create `src/hooks/usePageMeta.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { applyPageMeta } from './usePageMeta.ts'

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('applyPageMeta', () => {
  it('sets the document title with the " | AnimeVerse" suffix', () => {
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    expect(document.title).toBe('Login | AnimeVerse')
  })

  it('creates the description meta tag if missing and sets its content', () => {
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    const tag = document.querySelector('meta[name="description"]')
    expect(tag?.getAttribute('content')).toBe('Log in to AnimeVerse.')
  })

  it('updates an existing description meta tag instead of duplicating it', () => {
    applyPageMeta({ title: 'Login', description: 'First.' })
    applyPageMeta({ title: 'Signup', description: 'Second.' })
    const tags = document.querySelectorAll('meta[name="description"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('content')).toBe('Second.')
  })

  it('sets the canonical link href to the site URL plus the current path', () => {
    window.history.pushState({}, '', '/login')
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    const tag = document.querySelector('link[rel="canonical"]')
    expect(tag?.getAttribute('href')).toBe(`${window.location.origin}/login`)
  })

  it('updates an existing canonical link instead of duplicating it', () => {
    window.history.pushState({}, '', '/login')
    applyPageMeta({ title: 'Login', description: 'First.' })
    window.history.pushState({}, '', '/signup')
    applyPageMeta({ title: 'Signup', description: 'Second.' })
    const tags = document.querySelectorAll('link[rel="canonical"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('href')).toBe(`${window.location.origin}/signup`)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/hooks/usePageMeta.test.ts`
Expected: FAIL — `src/hooks/usePageMeta.ts` does not exist yet (module resolution error).

- [ ] **Step 4: Implement `src/lib/site.ts`**

```ts
export const SITE_NAME = 'AnimeVerse'

export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
```

- [ ] **Step 5: Implement `src/hooks/usePageMeta.ts`**

```ts
import { useEffect } from 'react'
import { SITE_NAME, SITE_URL } from '../lib/site.ts'

interface PageMetaOptions {
  title: string
  description: string
}

export function applyPageMeta({ title, description }: PageMetaOptions): void {
  document.title = `${title} | ${SITE_NAME}`

  let descriptionTag = document.querySelector('meta[name="description"]')
  if (!descriptionTag) {
    descriptionTag = document.createElement('meta')
    descriptionTag.setAttribute('name', 'description')
    document.head.appendChild(descriptionTag)
  }
  descriptionTag.setAttribute('content', description)

  let canonicalTag = document.querySelector('link[rel="canonical"]')
  if (!canonicalTag) {
    canonicalTag = document.createElement('link')
    canonicalTag.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalTag)
  }
  canonicalTag.setAttribute('href', `${SITE_URL}${window.location.pathname}`)
}

export default function usePageMeta(options: PageMetaOptions): void {
  useEffect(() => {
    applyPageMeta(options)
  }, [options.title, options.description])
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/hooks/usePageMeta.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Type-check**

Run: `npx tsc -b`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/site.ts src/hooks/usePageMeta.ts src/hooks/usePageMeta.test.ts
git commit -m "Add usePageMeta hook for per-route title, description, and canonical tag"
```

---

## Task 2: `favicon.svg`

**Files:**
- Create: `public/favicon.svg`

**Interfaces:**
- Produces: a static asset at `/favicon.svg`, referenced by Task 4's `index.html` change.

- [ ] **Step 1: Create the favicon**

The mark reuses lucide-react's exact `sparkles` icon path (already used in `Navbar.tsx` via `<Sparkles>`), on a rounded paper-colored tile in the accent color, so the favicon matches the navbar icon exactly instead of introducing new iconography.

Create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6" fill="#faf6ee"/>
  <g fill="none" stroke="#d01e1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
    <path d="M20 2v4"/>
    <path d="M22 4h-4"/>
    <circle cx="4" cy="20" r="2"/>
  </g>
</svg>
```

- [ ] **Step 2: Verify it renders**

Run: `python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('public/favicon.svg')"`
Expected: no output (valid XML, no parse error)

- [ ] **Step 3: Commit**

```bash
git add public/favicon.svg
git commit -m "Add a favicon matching the navbar's sparkle mark"
```

---

## Task 3: `og-image.png`

**Files:**
- Create: `public/og-image.png` (generated asset, binary)

**Interfaces:**
- Produces: a static 1200x630 asset at `/og-image.png`, referenced by Task 4's `index.html` change.

This uses the project's existing `@playwright/test` installation to render a throwaway HTML file and screenshot it — no new dependency, and the HTML source is deleted after generation (it's a one-time asset build step, not app code).

- [ ] **Step 1: Write the throwaway source HTML**

Create a temporary file at the repo root named `og-image-source.html` (this file is deleted in Step 3, never committed):

```html
<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #341e13;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 96px;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: #faf6ee;
    margin-top: 32px;
  }
  p {
    font-family: -apple-system, sans-serif;
    font-size: 32px;
    color: #faf6ee;
    opacity: 0.75;
    margin-top: 20px;
  }
</style>
</head>
<body>
  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#d01e1c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
    <path d="M20 2v4"/>
    <path d="M22 4h-4"/>
    <circle cx="4" cy="20" r="2"/>
  </svg>
  <h1>AnimeVerse</h1>
  <p>Discover anime tailored to your taste</p>
</body>
</html>
```

- [ ] **Step 2: Render it to a PNG**

Run: `npx playwright screenshot --viewport-size="1200,630" "file://$(pwd)/og-image-source.html" public/og-image.png`

If Playwright reports no browser installed, run `npx playwright install chromium` first, then retry.

Expected: `public/og-image.png` exists and is roughly 1200x630. Verify with:

Run: `python3 -c "from PIL import Image; im = Image.open('public/og-image.png'); print(im.size)"` if Pillow is available, otherwise open the file and confirm visually.

- [ ] **Step 3: Delete the throwaway source file**

Run: `rm og-image-source.html`

- [ ] **Step 4: Commit**

```bash
git add public/og-image.png
git commit -m "Add a static og:image asset"
```

---

## Task 4: Static `index.html` metadata and `.env.example`

**Files:**
- Modify: `index.html`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `public/favicon.svg` (Task 2), `public/og-image.png` (Task 3).

- [ ] **Step 1: Add `VITE_SITE_URL` to `.env.example`**

Current content:

```
VITE_API_URL=http://localhost:8000
```

New content:

```
VITE_API_URL=http://localhost:8000
VITE_SITE_URL=https://animeverse.example
```

- [ ] **Step 2: Add the static tags to `index.html`**

In the `<head>`, immediately after the existing `<title>AnimeVerse - Discover Anime Recommendations</title>` line and before the CSP comment block, add:

```html
    <meta
      name="description"
      content="AnimeVerse recommends anime tailored to your taste — swipe through a discovery deck, then get personalized picks powered by taste-vector matching."
    />
    <link rel="canonical" href="%VITE_SITE_URL%/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="AnimeVerse" />
    <meta property="og:title" content="AnimeVerse - Discover Anime Recommendations" />
    <meta
      property="og:description"
      content="AnimeVerse recommends anime tailored to your taste — swipe through a discovery deck, then get personalized picks powered by taste-vector matching."
    />
    <meta property="og:image" content="%VITE_SITE_URL%/og-image.png" />
    <meta property="og:url" content="%VITE_SITE_URL%/" />

    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"WebSite","name":"AnimeVerse","url":"%VITE_SITE_URL%/"}
    </script>
```

Note: `%VITE_SITE_URL%` here is Vite's own HTML env-substitution syntax — this file already uses the same mechanism for `%VITE_API_URL%` in the CSP `connect-src` directive below, so this is consistent with the existing pattern, not a new one.

- [ ] **Step 3: Verify the build substitutes correctly**

Run: `VITE_SITE_URL=https://animeverse.example npm run build && grep -o 'https://animeverse.example[^"]*' dist/index.html`
Expected: prints the canonical, og:image, og:url, and JSON-LD URLs, each resolved to `https://animeverse.example/...` (not the literal `%VITE_SITE_URL%` token).

- [ ] **Step 4: Commit**

```bash
git add index.html .env.example
git commit -m "Add meta description, OG tags, canonical, favicon link, and WebSite JSON-LD to index.html"
```

---

## Task 5: Wire `usePageMeta` into all 9 route components

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/Signup.tsx`
- Modify: `src/pages/PrivacyPolicy.tsx`
- Modify: `src/pages/Preferences.tsx`
- Modify: `src/pages/Discover.tsx`
- Modify: `src/pages/Recommendations.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/NotFound.tsx`

**Interfaces:**
- Consumes: `usePageMeta` default export from `src/hooks/usePageMeta.ts` (Task 1). Copy values come from the Global Constraints table above.

For each file, add the import and call `usePageMeta({ title, description })` as the first line inside the component function body (before any existing hooks/state).

- [ ] **Step 1: `src/pages/Home.tsx`**

Add import after the existing `import { isAuthenticated } from '../services/auth.ts'` line:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Home() {
  const loggedIn = isAuthenticated()
```

To:

```ts
export default function Home() {
  usePageMeta({
    title: 'Discover Anime Recommendations',
    description:
      "AnimeVerse recommends anime tailored to your taste — swipe through a discovery deck, then get personalized picks powered by taste-vector matching.",
  })
  const loggedIn = isAuthenticated()
```

- [ ] **Step 2: `src/pages/Login.tsx`**

Add import after `import { ApiError } from '../services/api.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Login() {
  const [email, setEmail] = useState('')
```

To:

```ts
export default function Login() {
  usePageMeta({
    title: 'Log In',
    description: 'Log in to AnimeVerse to pick up your personalized anime recommendations and continue where you left off.',
  })
  const [email, setEmail] = useState('')
```

- [ ] **Step 3: `src/pages/Signup.tsx`**

Add import after `import { ApiError } from '../services/api.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Signup() {
  const [email, setEmail] = useState('')
```

To:

```ts
export default function Signup() {
  usePageMeta({
    title: 'Sign Up',
    description: 'Create a free AnimeVerse account to start building your taste profile and get anime recommendations made for you.',
  })
  const [email, setEmail] = useState('')
```

- [ ] **Step 4: `src/pages/PrivacyPolicy.tsx`**

Add import after `import Footer from '../components/Footer.tsx'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function PrivacyPolicy() {
  return (
```

To:

```ts
export default function PrivacyPolicy() {
  usePageMeta({
    title: 'Privacy Policy',
    description: "Read AnimeVerse's privacy policy to learn how your account and usage information is collected, used, and protected.",
  })
  return (
```

- [ ] **Step 5: `src/pages/Preferences.tsx`**

Add import after `import { getPreferences, savePreferences } from '../services/preferences.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Preferences() {
  const [genres, setGenres] = useState<string[]>([])
```

To:

```ts
export default function Preferences() {
  usePageMeta({
    title: 'Preferences',
    description: 'Update your favorite genres and content settings to fine-tune the anime recommendations AnimeVerse gives you.',
  })
  const [genres, setGenres] = useState<string[]>([])
```

- [ ] **Step 6: `src/pages/Discover.tsx`**

Add import after `import { postSwipe, getMySwipes, type SwipeAction } from '../services/swipes.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Discover() {
  const [deck, setDeck] = useState<DeckState>({ status: 'loading' })
```

To:

```ts
export default function Discover() {
  usePageMeta({
    title: 'Discover',
    description: 'Swipe through anime to build your taste profile — every like, love, and skip helps AnimeVerse recommend better picks.',
  })
  const [deck, setDeck] = useState<DeckState>({ status: 'loading' })
```

- [ ] **Step 7: `src/pages/Recommendations.tsx`**

Add import after `import { getPreferences } from '../services/preferences.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Recommendations() {
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
```

To:

```ts
export default function Recommendations() {
  usePageMeta({
    title: 'Recommendations',
    description: 'Browse anime recommendations picked for your taste, plus trending titles, new releases, and random discoveries.',
  })
  const [byGenre, setByGenre] = useState<SectionState>({ status: 'loading' })
```

- [ ] **Step 8: `src/pages/Profile.tsx`**

Add import after `import { uploadAvatar, pollForThumbnail } from '../services/avatar.ts'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
```

To:

```ts
export default function Profile() {
  usePageMeta({
    title: 'Profile',
    description: "Manage your AnimeVerse account, avatar, and password, and revisit anime you've swiped on.",
  })
  const [user, setUser] = useState<User | null>(null)
```

- [ ] **Step 9: `src/pages/NotFound.tsx`**

Add import after `import Footer from '../components/Footer.tsx'`:

```ts
import usePageMeta from '../hooks/usePageMeta.ts'
```

Change:

```ts
export default function NotFound() {
  return (
```

To:

```ts
export default function NotFound() {
  usePageMeta({
    title: 'Page Not Found',
    description: "The page you're looking for doesn't exist. Head back to AnimeVerse to keep discovering anime.",
  })
  return (
```

- [ ] **Step 10: Type-check and lint**

Run: `npx tsc -b && npm run lint`
Expected: no errors

- [ ] **Step 11: Run the existing frontend test suite**

Run: `npm test`
Expected: all existing tests still pass (25/25 before this change; this task adds no new test files, `usePageMeta` itself was already covered in Task 1)

- [ ] **Step 12: Manually verify one route in the browser**

Run: `npm run dev`, open `http://localhost:5173/login` in a browser, check the tab title reads "Log In | AnimeVerse", then stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add src/pages/Home.tsx src/pages/Login.tsx src/pages/Signup.tsx src/pages/PrivacyPolicy.tsx src/pages/Preferences.tsx src/pages/Discover.tsx src/pages/Recommendations.tsx src/pages/Profile.tsx src/pages/NotFound.tsx
git commit -m "Give every route a distinct title, description, and canonical tag"
```

---

## Task 6: `robots.txt`, `sitemap.xml`, `llms.txt`

**Files:**
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`
- Create: `public/llms.txt`

**Interfaces:**
- None — these are static files with no code dependents.

- [ ] **Step 1: Create `public/robots.txt`**

```
# The Sitemap URL below uses a placeholder domain (animeverse.example)
# because no production host is configured yet. Update it — and every
# <loc> in sitemap.xml — to the real domain once one exists. Files in
# public/ are copied to dist/ as-is by Vite, so VITE_SITE_URL can't be
# substituted into them the way it is in index.html.

User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Amazonbot
Disallow: /

User-agent: Diffbot
Disallow: /

User-agent: meta-externalagent
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: Omgilibot
Disallow: /

User-agent: Timpibot
Disallow: /

User-agent: YouBot
Disallow: /

Sitemap: https://animeverse.example/sitemap.xml
```

- [ ] **Step 2: Create `public/sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://animeverse.example/</loc>
  </url>
  <url>
    <loc>https://animeverse.example/login</loc>
  </url>
  <url>
    <loc>https://animeverse.example/signup</loc>
  </url>
  <url>
    <loc>https://animeverse.example/privacy-policy</loc>
  </url>
</urlset>
```

- [ ] **Step 3: Create `public/llms.txt`**

```
# AnimeVerse

> AnimeVerse is a personal/portfolio anime recommendation web app. Users swipe through a discovery deck to build a taste profile, then receive anime recommendations generated from taste-vector similarity search, alongside traditional browse/search/filter over AniList's catalog.

This is a demo/resume project, not a commercial product. Public pages are the home page, login, signup, and privacy policy; the discovery deck, recommendations, preferences, and profile pages require creating a free account.

## Notes for automated tools

This site's robots.txt disallows bulk crawling by AI-training crawlers. This llms.txt is provided for a person explicitly pointing an assistant at this URL, not as an invitation to bulk-scrape the site.
```

- [ ] **Step 4: Verify `sitemap.xml` is well-formed XML**

Run: `python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('public/sitemap.xml')"`
Expected: no output (valid XML, no parse error)

- [ ] **Step 5: Commit**

```bash
git add public/robots.txt public/sitemap.xml public/llms.txt
git commit -m "Add robots.txt, sitemap.xml, and llms.txt"
```

---

## Task 7: Fix the empty `alt=""` on the Profile avatar thumbnail

**Files:**
- Modify: `src/pages/Profile.tsx:333`

**Interfaces:**
- None.

- [ ] **Step 1: Make the change**

Current (around line 328-336):

```tsx
        {user ? (
          <div className="dark-card flex items-center gap-5 p-6 sm:p-8 mb-8">
            {(user.avatarThumbnailUrl ?? user.avatarUrl) && (
              <img
                src={user.avatarThumbnailUrl ?? user.avatarUrl ?? undefined}
                alt=""
                className="w-16 h-16 rounded-full object-cover shrink-0"
              />
            )}
```

Change `alt=""` to:

```tsx
                alt="Your avatar"
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "Give the profile avatar thumbnail real alt text"
```

---

## Task 8: Visual-regression check

**Files:**
- None expected to change. If this task finds a diff, stop and investigate before continuing — it means one of Tasks 1-7 unexpectedly affected layout, which the design didn't anticipate.

**Interfaces:**
- None.

`usePageMeta` only touches `document.head` (title, meta description, canonical link) — none of that is rendered layout, so this should produce zero visual diffs. Per the `ui-change-workflow` skill (invoke it directly for the full procedure if anything below is unclear), verify that empirically rather than assuming it.

- [ ] **Step 1: Regenerate local snapshots**

Run: `npm run test:e2e:update`

- [ ] **Step 2: Confirm zero snapshot files changed**

Run: `git status --short e2e/visual.spec.ts-snapshots/`
Expected: no output (empty). If any `-darwin.png` file shows as modified, stop here — do not commit it blindly. Open the diff, determine which of Tasks 1-7 caused it, and decide whether that's an acceptable intentional change or a bug to fix.

- [ ] **Step 3: Run the full e2e suite**

Precondition: backend running (`cd anime-verse-backend && docker compose up`, in a separate terminal, if not already up).

Run: `npm run test:e2e`
Expected: all tests pass, including the functional signup/login/Recommendations flow in `recommendations.spec.ts`.

- [ ] **Step 4: Nothing to commit**

If Step 2 showed no changes, there is nothing new to commit from this task — the existing snapshots already match. Proceed to Task 9.

---

## Task 9: Live console-errors investigation

**Files:**
- Create: `e2e/console-errors.spec.ts`

**Interfaces:**
- None — this is a new, permanent e2e test (not a throwaway script), so it also guards against future regressions instead of being a one-time check.

Precondition: backend running (`cd anime-verse-backend && docker compose up`, if not already up from Task 8).

- [ ] **Step 1: Write the test**

Create `e2e/console-errors.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-console-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('no console or page errors during the primary signup-to-profile flow', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`)
  })

  const email = uniqueEmail()
  const password = 'correct horse battery staple'

  await page.goto('/')
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign Up' }).click()

  await page.waitForURL('**/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()

  await page.waitForURL('**/profile')
  await page.goto('/recommendations')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/recommendations')
  await expect(page.getByRole('heading', { name: 'Your Top Recommendations' })).toBeVisible()

  await page.goto('/preferences')
  await expect(page.getByRole('heading', { name: 'Update Your Preferences' })).toBeVisible()

  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('**/login')

  expect(errors, errors.join('\n')).toEqual([])
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/console-errors.spec.ts`

- [ ] **Step 3: Handle the result**

There are three possible outcomes — follow whichever applies:

**A. It passes.** No real console/page errors during the primary flow. Nothing to fix. Proceed to Step 4.

**B. It fails with a genuine bug** (an uncaught exception, a real error unrelated to the deliberate `console.error()` calls in `Discover.tsx`/`Recommendations.tsx`). Read the failure message (it lists every captured error verbatim). Fix the root cause in the relevant source file, then re-run Step 2 until it passes. Do not touch the test to make a real bug disappear.

**C. It fails on the app's own deliberate `console.error()` logging** (from the caught-failure handlers in `Discover.tsx`/`Recommendations.tsx`, e.g. if AniList is slow/rate-limited during this run). This is expected, documented behavior, not a bug — per the design's decision, these are left alone. If this happens, narrow the test's error filter to exclude exactly those two known, intentional messages (match on their `[Discover]`/`[Recommendations]` prefixes from the source), with a comment explaining why, rather than deleting the assertion or leaving the test permanently flaky.

- [ ] **Step 4: Commit**

```bash
git add e2e/console-errors.spec.ts
git commit -m "Add an e2e check for console and page errors during the primary user flow"
```

If Step 3 required a source fix (outcome B), include that file in this commit too, or as a preceding commit — whichever keeps the fix and its test together.
