# Bento Editorial Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AnimeVerse's default-Tailwind pastel look with a distinctive **Bento Editorial** visual identity across every existing page, without changing any behavior, route, or backend.

**Architecture:** A single design-token layer (`src/styles/tokens.css`) redefines the *values* of the CSS custom properties that every component already reads through `var(--color-*)` and the `font-display` utility — so swapping token values plus the display font cascades the new look app-wide with near-zero component churn. Each page is then recomposed into editorial bento layouts on top of that foundation. No React state, data flow, service, route, or backend is touched.

**Tech Stack:** React 19 + Vite 7 + TypeScript, Tailwind CSS v4 (`@import "tailwindcss"` + `@theme`), `@fontsource-variable/*` self-hosted fonts, Playwright visual regression.

## Scope (rescope from spec Feature Breakdown)

This plan is **Plan #8 of the roadmap, rescoped to a pure visual restyle**. The spec's structural changes — removing the `Preference` model/page, the swipe deck, Explore/Discover/My List/Taste Map pages, nav overhaul — are **out of scope** here and belong to roadmap Plans #2–#7. Reason: `Recommendations.tsx:45` and `Profile.tsx` (`PreferencesSummary`) both call `getPreferences()`; removing `Preference` now would break shipping pages. This plan restyles **only the eight pages that exist today** and leaves every route, selector, handler, and data hook intact.

**Pages in scope (all get restyled, none removed):** Home, Login, Signup, Preferences, Recommendations, Profile, PrivacyPolicy, NotFound.
**Components in scope:** Navbar, Footer, AnimeCard, GenreCheckboxGroup.
**Nav links stay exactly as today:** logged-in = Preferences / Recommendations / Profile / Logout; logged-out = Sign In / Sign Up. No links to pages that don't exist yet.

---

## Global Constraints

Every task's requirements implicitly include this section. Copy the relevant lines into each reviewer dispatch.

- **The approved StyleTile is the visual source of truth.** The design language (palette, type, cards, buttons, bento feel) is approved by the human via a rendered StyleTile before page work begins. Page tasks implement *to match that approved look*; the plan text specifies structure, tokens, and the preservation contract — not pixel-exact JSX.
- **Preserve all behavior and selectors — this is non-negotiable.** No change to any `onClick`/`onChange`/`onSubmit` handler, `useState`/`useEffect`, service call, route, or prop.
- **E2E-critical selectors that MUST survive verbatim** (`e2e/recommendations.spec.ts`):
  - Recommendations page `<h1>` text exactly `Your Top Recommendations`.
  - Section `<h2>` texts exactly `Trending Now`, `New Releases`, `Random Recommendations` (and `For You`).
  - Login/Signup: an `<input>` associated with a label reading `Email` and one reading `Password` (keep `<label htmlFor>` + matching input `id`, or wrap — `getByLabel('Email')`/`getByLabel('Password')` must resolve).
  - Submit buttons with accessible names exactly `Sign Up` (Signup) and `Sign In` (Login).
  - Auth flow unchanged: signup → navigate `/login`; login → navigate `/profile`.
  - At least one `<img>` renders on Recommendations.
- **Profile behaviors that MUST survive:** avatar upload flow including the `Generating thumbnail...` text shown when `avatarUrl` is set but `avatarThumbnailUrl` is not; `PasswordForm`, `TitleGenerator`, `QuoteGenerator`, `RandomAnimeGenerator` (click-to-toggle details), `PreferencesSummary` (reads `getPreferences`, links `/preferences`), Logout.
- **AnimeCard behaviors that MUST survive:** poster fallback `extraLarge ?? large ?? medium`; `animeSynopsis(anime)` (never raw `description`); `animeTitle(anime)`; click toggles synopsis; `loading="lazy"`; grid stays `items-start` so cards keep independent heights.
- **No backend changes. No new routes. No new npm dependency except the two self-hosted font packages** (`@fontsource-variable/fraunces`, `@fontsource-variable/inter`).
- **Exactly two font families:** Fraunces (display/headings, editorial serif) + Inter (body). Self-hosted via `@fontsource-variable/*`, never external Google Fonts. `font-display: swap` (fontsource default).
- **Design tokens defined once** in `src/styles/tokens.css`, consumed everywhere. No hardcoded palette/type/radius/shadow values in components.
- **Motion is compositor-friendly only** (`transform`, `opacity`); never animate layout properties. A global `prefers-reduced-motion: reduce` CSS guard neutralizes motion (no JS hook needed).
- **Accessibility:** semantic HTML, visible `:focus-visible` states, WCAG AA contrast (≥4.5:1 normal text) — verified in the final task.
- **No emojis anywhere in code, comments, or markdown.** Plain, direct commit messages, no conventional-commit prefixes.
- **Keep the legacy token names** (`--color-bg`, `--color-surface`, `--color-primary`, `--color-secondary`, `--color-text`, `--color-muted`, `--color-error`, `--color-success`) defined as aliases of the new palette, so existing `var(--color-*)` references keep resolving during the incremental restyle.

---

## Human Review Gates

Automated review (correctness, no-regression) and pixel visual-regression **cannot judge whether a page looks good**. Two explicit human aesthetic gates cover that, without pausing between every task (per subagent-driven-development's continuous-execution rule):

1. **Design-language gate (after Task 1):** the orchestrator presents the rendered StyleTile screenshots (real Fraunces, real Tailwind-processed tokens) and pauses for the human to approve the palette/type/card language before any page is composed.
2. **Composed-pages gate (end, in Task 7 before finishing the branch):** the orchestrator assembles the Task 2-6 page screenshots into an Artifact gallery and pauses for a final aesthetic sign-off on the actual composed pages before merge.

Between those two gates, tasks execute continuously.

---

## File Structure

**Created:**
- `src/styles/tokens.css` — the entire design system (palette, type scale, radii, shadows, motion, component classes, reduced-motion guard). Single source of truth.
- `src/pages/StyleTile.tsx` — temporary showcase page for the human design gate. **Removed in Task 7.**

**Modified:**
- `src/index.css` — import tokens.css; keep the base `body` rule.
- `src/main.tsx` — swap font imports (remove Poppins static + Inter static; add Fraunces variable + Inter variable).
- `package.json` — add the two font packages; remove `@fontsource/poppins` and `@fontsource/inter`.
- `src/App.tsx` — add temporary `/styletile` route in Task 1; remove it in Task 7.
- `src/components/Navbar.tsx`, `src/components/Footer.tsx` — Task 2.
- `src/pages/Home.tsx` — Task 3.
- `src/pages/Login.tsx`, `src/pages/Signup.tsx` — Task 4.
- `src/pages/Recommendations.tsx`, `src/components/AnimeCard.tsx`, `src/components/GenreCheckboxGroup.tsx`, `src/pages/Preferences.tsx` — Task 5.
- `src/pages/Profile.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/NotFound.tsx` — Task 6.

**Created (tests):**
- `e2e/visual.spec.ts` — Playwright visual-regression baselines at 320/768/1024/1440 — Task 7.

---

## Design Language (reference for all tasks)

Warm editorial: cream paper, high-contrast serif display type (Fraunces), saturated pastel bento tiles (peach/mint/butter/sky/lilac), occasional dark "espresso" hero cards, one confident coral action color. Soft layered shadows, generous asymmetric rhythm, hairline borders.

This is fully specified as code in **Task 1's `tokens.css`**. Later tasks reference these tokens and classes:
- Colors: `--color-paper --color-surface --color-ink --color-muted --color-line --color-peach --color-mint --color-butter --color-sky --color-lilac --color-accent --color-accent-hover --color-hero`, plus Tailwind utilities `bg-peach text-ink bg-paper` etc.
- Type: `--font-display` (Fraunces), `--font-body` (Inter); big editorial steps `text-display`, `text-hero`.
- Shape/depth: `--radius-tile --radius-card --radius-pill --shadow-sm --shadow-md --shadow-lg`.
- Motion: `--ease-out-expo --duration-fast --duration-normal`.
- Component classes: `.surface-card`, `.dark-card`, `.bento-grid`, `.btn`, `.btn-accent`, `.btn-outline`, `.pill`, `.tile-accent`.

---

## Task 1: Design foundation + StyleTile human gate

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/pages/StyleTile.tsx`
- Modify: `src/index.css`, `src/main.tsx`, `src/App.tsx`, `package.json` (via `npm install`)

**Interfaces:**
- Produces: the full token set and component classes listed in Design Language above; a temporary route `/styletile` rendering `<StyleTile />`.
- Consumes: nothing.

- [ ] **Step 1: Install the two variable-font packages**

```bash
npm install @fontsource-variable/fraunces @fontsource-variable/inter
npm uninstall @fontsource/poppins @fontsource/inter
```

- [ ] **Step 2: Swap font imports in `src/main.tsx`**

Replace lines 3-7 (the five `@fontsource/*` static imports) with the two variable imports. Final import block:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Create `src/styles/tokens.css`** with the complete design system

```css
/* AnimeVerse design tokens — Bento Editorial. Single source of truth. */

@theme {
  /* Type families */
  --font-display: 'Fraunces Variable', 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;

  /* Editorial type steps (added alongside Tailwind defaults, not replacing them) */
  --text-display: clamp(2.5rem, 1.6rem + 4vw, 4.5rem);
  --text-hero: clamp(3rem, 1.3rem + 7vw, 7rem);

  /* Core neutrals */
  --color-paper: oklch(97.5% 0.012 85);
  --color-surface: oklch(99.2% 0.006 85);
  --color-ink: oklch(24% 0.03 55);
  --color-muted: oklch(50% 0.02 60);
  --color-line: oklch(90% 0.012 75);

  /* Pastel bento accents (decorative tile backgrounds; ink text on top) */
  --color-peach: oklch(84% 0.10 45);
  --color-mint: oklch(87% 0.08 165);
  --color-butter: oklch(91% 0.10 95);
  --color-sky: oklch(86% 0.07 235);
  --color-lilac: oklch(85% 0.07 305);

  /* Action + hero */
  --color-accent: oklch(55% 0.21 28);
  --color-accent-hover: oklch(50% 0.21 28);
  --color-hero: oklch(26% 0.04 45);
}

:root {
  /* Legacy aliases — kept in :root (not @theme) because every component reads
     them as arbitrary values (bg-[var(--color-primary)]), never as bare
     utilities. Keeping them out of @theme avoids emitting phantom utilities
     and sidesteps the @theme-plus-var() question. */
  --color-bg: var(--color-paper);
  --color-primary: var(--color-accent);
  --color-secondary: oklch(52% 0.13 250);
  --color-text: var(--color-ink);
  --color-error: oklch(55% 0.20 25);
  --color-success: oklch(58% 0.13 155);

  /* Radii */
  --radius-tile: 1.75rem;
  --radius-card: 1.25rem;
  --radius-pill: 999px;

  /* Soft layered shadows (warm-tinted) */
  --shadow-sm: 0 1px 2px oklch(24% 0.03 55 / 0.06), 0 2px 8px oklch(24% 0.03 55 / 0.05);
  --shadow-md: 0 4px 12px oklch(24% 0.03 55 / 0.08), 0 12px 32px oklch(24% 0.03 55 / 0.07);
  --shadow-lg: 0 10px 30px oklch(24% 0.03 55 / 0.12), 0 30px 60px oklch(24% 0.03 55 / 0.10);

  /* Motion */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
}

/* Note: Tailwind v4 auto-generates the `font-display` utility from the
   --font-display theme key, so components keep using className="font-display"
   for the family. Optical sizing is set once on <body> (it inherits); tight
   editorial tracking is applied per-heading in JSX via `tracking-tight`.
   Do NOT redefine a `.font-display` class here — it would shadow the utility. */

/* Component classes — composed with Tailwind utilities in JSX */
.surface-card {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-sm);
}

.dark-card {
  background: var(--color-hero);
  color: var(--color-paper);
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-md);
}

.tile-accent {
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-sm);
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: clamp(0.75rem, 0.5rem + 1vw, 1.25rem);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-pill);
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform var(--duration-fast) var(--ease-out-expo),
    opacity var(--duration-fast) var(--ease-out-expo),
    background-color var(--duration-fast) var(--ease-out-expo);
}
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }

.btn-accent {
  background: var(--color-accent);
  color: var(--color-paper);
}
.btn-accent:hover { background: var(--color-accent-hover); }

.btn-outline {
  background: transparent;
  color: var(--color-ink);
  border-color: var(--color-line);
}
.btn-outline:hover { background: var(--color-surface); }

.pill {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  padding: 0.35rem 0.85rem;
}

/* Global focus-visible ring */
:where(a, button, input, label, [tabindex]):focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-card);
}

/* Reduced-motion guard */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Wire tokens into `src/index.css`**

```css
@import "tailwindcss";
@import "./styles/tokens.css";

body {
  font-family: var(--font-body);
  background-color: var(--color-bg);
  color: var(--color-text);
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 5: Create `src/pages/StyleTile.tsx`** — a showcase rendering the whole design language for the human gate

This page is temporary (removed in Task 7). It must visibly exercise: all core + pastel + accent colors as labeled swatches; the type ramp (`text-hero`, `text-display`, `text-2xl`, body, muted) in Fraunces/Inter; `.btn-accent` / `.btn-outline` / `.pill`; `.surface-card`, `.dark-card`; and a representative `.bento-grid` mixing pastel tiles, a dark hero tile, and a poster-shaped tile. Use only tokens/classes from Step 3.

```tsx
import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

const SWATCHES: { name: string; varName: string }[] = [
  { name: 'paper', varName: '--color-paper' },
  { name: 'surface', varName: '--color-surface' },
  { name: 'ink', varName: '--color-ink' },
  { name: 'muted', varName: '--color-muted' },
  { name: 'line', varName: '--color-line' },
  { name: 'peach', varName: '--color-peach' },
  { name: 'mint', varName: '--color-mint' },
  { name: 'butter', varName: '--color-butter' },
  { name: 'sky', varName: '--color-sky' },
  { name: 'lilac', varName: '--color-lilac' },
  { name: 'accent', varName: '--color-accent' },
  { name: 'hero', varName: '--color-hero' },
]

export default function StyleTile() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <h1 className="font-display font-black mb-2" style={{ fontSize: 'var(--text-display)' }}>
          Bento Editorial
        </h1>
        <p className="text-[var(--color-muted)] mb-10">
          Design language preview. Display face is Fraunces; body is Inter.
        </p>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Palette</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {SWATCHES.map(({ name, varName }) => (
              <div key={name} className="surface-card p-3">
                <div
                  className="h-16 rounded-[var(--radius-card)] mb-2 border border-[var(--color-line)]"
                  style={{ background: `var(${varName})` }}
                />
                <p className="text-xs font-medium text-[var(--color-ink)]">{name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Type ramp</h2>
          <p className="font-display font-black" style={{ fontSize: 'var(--text-hero)', lineHeight: 1 }}>
            Aa
          </p>
          <p className="font-display font-semibold" style={{ fontSize: 'var(--text-display)' }}>
            Discover your next favorite
          </p>
          <p className="font-display text-2xl">A magazine for anime taste</p>
          <p className="text-base text-[var(--color-ink)]">
            Body copy set in Inter for long-form readability and clean UI labels.
          </p>
          <p className="text-sm text-[var(--color-muted)]">Muted secondary text.</p>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Controls</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-accent px-6 py-3">Get Started</button>
            <button className="btn btn-outline px-6 py-3">Learn more</button>
            <span className="pill text-sm capitalize">action</span>
            <span className="pill text-sm capitalize">adventure</span>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-2xl font-semibold mb-4">Bento composition</h2>
          <div className="bento-grid">
            <div className="dark-card col-span-6 md:col-span-4 p-8">
              <p className="font-display font-black" style={{ fontSize: 'var(--text-display)', lineHeight: 1 }}>
                Hero moment
              </p>
              <p className="opacity-80 mt-2">High-contrast dark tile for editorial emphasis.</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-peach)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Peach tile</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-mint)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Mint tile</p>
            </div>
            <div className="tile-accent col-span-3 md:col-span-2 p-6" style={{ background: 'var(--color-butter)' }}>
              <p className="font-display text-xl text-[var(--color-ink)]">Butter tile</p>
            </div>
            <div className="surface-card col-span-6 md:col-span-2 p-4">
              <div className="rounded-[var(--radius-card)] aspect-[2/3] bg-[var(--color-lilac)]" />
              <p className="font-display text-sm mt-2">Poster tile</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 6: Add the temporary `/styletile` route in `src/App.tsx`**

Add the import and a public route (place the import with the other page imports and the route above the `*` catch-all):

```tsx
import StyleTile from './pages/StyleTile.tsx'
```
```tsx
<Route path="/styletile" element={<StyleTile />} />
```

- [ ] **Step 7: Verify the build and that Tailwind emits utilities from the imported token file**

```bash
npm run build
```
Expected: build succeeds. Then confirm `@theme` in the imported file produced real CSS (utilities + custom properties):
```bash
grep -rl "color-paper" dist/assets/*.css && grep -l "Fraunces" dist/assets/*.css
```
Expected: at least one built CSS file contains `--color-paper` and references the Fraunces family.

**Fallback if `@theme` in the imported file does NOT emit** (grep finds nothing): move the entire `@theme { ... }` block out of `tokens.css` and into `src/index.css` directly after `@import "tailwindcss";`, keep the `:root {}` block, component classes, and media query in `tokens.css`, and re-run Step 7. Record which arrangement was used in the task report.

- [ ] **Step 8: Run the dev server and screenshot the StyleTile for the human gate**

```bash
npm run dev
```
Capture `/styletile` at widths 320, 768, 1024, 1440 (Playwright or manual). Save PNGs under `docs/superpowers/screenshots/task1/`.

- [ ] **Step 9: Commit**

```bash
git add src/styles/tokens.css src/pages/StyleTile.tsx src/index.css src/main.tsx src/App.tsx package.json package-lock.json
git commit -m "Add Bento Editorial design tokens, fonts, and StyleTile showcase"
```

**HUMAN DESIGN GATE (orchestrator action, not the implementer's):** After Task 1 review passes, the orchestrator presents the StyleTile screenshots to the human (assembled into an Artifact gallery or shared as files) and **pauses for aesthetic approval** before dispatching Task 2. Task correctness review (build passes, tokens emit, behavior intact) is separate from and does not substitute for this aesthetic approval.

---

## Task 2: Navbar + Footer

**Files:**
- Modify: `src/components/Navbar.tsx`, `src/components/Footer.tsx`

**Interfaces:**
- Consumes: tokens + `.btn`, `.btn-accent`, `.pill` from Task 1.
- Produces: restyled shared chrome shown on every page.

**Preservation contract (verbatim):** All routes and link texts unchanged (Preferences / Recommendations / Profile / Logout when `loggedIn`; Sign In / Sign Up otherwise). `useLocation` active-link highlighting, `menuOpen` mobile toggle, `aria-label="Toggle menu"`, `handleLogout` → `signOut()` + navigate `/login`. Do not change `isAuthenticated`/`signOut` usage.

- [ ] **Step 1: Restyle Navbar** — editorial serif wordmark, refined link treatment, accent CTA using `.btn.btn-accent`. Keep the exact JSX structure (same `<Link>`/`<button>` elements, same conditionals, same handlers); change only className/markup-wrapping and the wordmark. Suggested treatment: sticky translucent bar (`backdrop-blur`, `bg-[var(--color-paper)]/80`, hairline bottom border `border-b border-[var(--color-line)]`), wordmark in `font-display` at `text-xl`/`text-2xl` with the `Sparkles` icon kept, active link marked with an accent underline or weight rather than color-only (accessibility). Replace the raw pink pill buttons with `className="btn btn-accent px-5 py-2 text-sm"`.

- [ ] **Step 2: Restyle Footer** — keep both `<p>` lines and the `/privacy-policy` `<Link>`; move to a hairline-topped editorial footer (`border-t border-[var(--color-line)]`), muted text, readable link color `var(--color-secondary)`.

- [ ] **Step 3: Verify behavior + build**

```bash
npm run build
```
Manually verify in `npm run dev`: mobile menu opens/closes, active link reflects route, Logout navigates to `/login`. Screenshot Navbar (logged-out and logged-in) + Footer at 320 and 1440 to `docs/superpowers/screenshots/task2/`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Navbar.tsx src/components/Footer.tsx
git commit -m "Restyle Navbar and Footer with editorial chrome"
```

---

## Task 3: Home (editorial bento hero)

**Files:**
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: tokens, `.bento-grid`, `.dark-card`, `.surface-card`, `.tile-accent`, `.btn`.
- Produces: the flagship public landing composition.

**Preservation contract:** Keep the `FEATURES` array (4 items, lucide icons `ThumbsUp/Star/Clock/Shuffle`) and both CTA `<Link>`s to `/signup` and the `/login` link. Headline text may stay `Welcome to AnimeVerse` or become a stronger editorial headline (content choice is fine; it is not E2E-asserted) — keep an `<h1>`.

- [ ] **Step 1: Recompose the hero** into an asymmetric editorial split — oversized Fraunces headline (`font-display font-black` at `var(--text-hero)` / `var(--text-display)`), a lead paragraph, and the primary CTA as `.btn.btn-accent`. Layer a dark `.dark-card` hero tile or a poster-collage bento beside the headline (transform/opacity hover only). No centered-single-column stock hero.

- [ ] **Step 2: Recompose the feature section** as a `.bento-grid` of mixed-size tiles (alternating pastel `.tile-accent` backgrounds and `.surface-card`), each with its lucide icon, `font-display` title, and description — deliberate size variation, not four identical cells.

- [ ] **Step 3: Recompose the closing CTA** on paper with the `Sign Up` / `Sign In` links restyled as `.btn.btn-accent` / `.btn.btn-outline`. Keep both links and their targets.

- [ ] **Step 4: Verify + screenshot**

```bash
npm run build
```
Screenshot `/` at 320/768/1024/1440 to `docs/superpowers/screenshots/task3/`. Confirm no horizontal overflow at 320.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "Recompose Home into an editorial bento landing"
```

---

## Task 4: Auth (Login + Signup)

**Files:**
- Modify: `src/pages/Login.tsx`, `src/pages/Signup.tsx`

**Interfaces:**
- Consumes: tokens, `.surface-card`, `.dark-card`, `.btn`.
- Produces: restyled auth surfaces.

**Preservation contract (E2E-critical):** Keep `<label htmlFor="email">Email` + `<input id="email">` and `<label htmlFor="password">Password` + `<input id="password">` associations so `getByLabel('Email')`/`getByLabel('Password')` resolve. Keep submit button accessible names exactly `Sign Up` (Signup) and `Sign In` (Login). Keep `handleSubmit`, `signIn`/`signUp`, error state, navigation (`/profile` after login, `/login` after signup), the `/signup`↔`/login` cross-links, Signup's `minLength={8}` and the `/privacy-policy` link.

- [ ] **Step 1: Recompose into an editorial split layout** — a two-panel card on `md+` (left: dark `.dark-card` panel with an editorial headline / brand statement; right: the form on `.surface-card`), collapsing to a single centered card on small screens. Replace pink accents with `.btn.btn-accent` submit, tokenized inputs (`bg-[var(--color-surface)] border border-[var(--color-line)] focus:border-[var(--color-accent)]`), and `font-display` heading. Keep the exact form fields, labels, ids, and button names.

- [ ] **Step 2: Apply the same layout to both** Login and Signup (Signup keeps its extra intro paragraph and privacy link).

- [ ] **Step 3: Verify + run the E2E flow**

```bash
npm run build
npx playwright test e2e/recommendations.spec.ts
```
Expected: build passes; the E2E spec still passes (proves labels, button names, and auth flow survived). If Playwright needs the stack running and it is unavailable in the environment, record that the spec was not run and rely on manual `getByLabel` verification in dev; note this in the report. Screenshot both pages at 320 and 1024 to `docs/superpowers/screenshots/task4/`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Login.tsx src/pages/Signup.tsx
git commit -m "Restyle Login and Signup with editorial split layout"
```

---

## Task 5: Recommendations + AnimeCard + GenreCheckboxGroup + Preferences

**Files:**
- Modify: `src/pages/Recommendations.tsx`, `src/components/AnimeCard.tsx`, `src/components/GenreCheckboxGroup.tsx`, `src/pages/Preferences.tsx`

**Interfaces:**
- Consumes: tokens, `.surface-card`, `.pill`, `.btn`.
- Produces: restyled anime-browsing + preferences surfaces.

**Preservation contract (E2E-critical):**
- Recommendations `<h1>` text exactly `Your Top Recommendations`; the four section `<h2>` texts exactly `For You`, `Trending Now`, `New Releases`, `Random Recommendations`; the four data hooks (`fetchAnimeByGenres` via `getPreferences`, `fetchTrendingNow`, `fetchNewReleases`, `fetchRandomRecommendations`) and their `useEffect` unchanged; the grid keeps `items-start`.
- AnimeCard: poster fallback `extraLarge ?? large ?? medium`, `animeSynopsis`, `animeTitle`, click-to-toggle synopsis, `loading="lazy"`, `aspect-[2/3]` poster.
- Preferences: `GenreCheckboxGroup` usage, `getPreferences`/`savePreferences`, the `window.confirm(...)` guard, navigate `/recommendations`, `saving` disabled state, button texts `Update Preferences`/`Saving...`.
- GenreCheckboxGroup: `GENRES` map, `toggle` logic, checkbox `checked`/`onChange`, `has-checked` styling behavior.

- [ ] **Step 1: Restyle Recommendations layout** — editorial section headers (`font-display` `text-2xl`/`text-display` with a hairline or accent rule), keep the exact h1/h2 strings, keep the grid classes including `items-start`. Optionally give the `For You` section a distinct editorial framing (e.g. a dark band) but do not remove or rename the other three sections.

- [ ] **Step 2: Restyle AnimeCard** — `.surface-card` treatment, refined hover (keep `hover:-translate-y-1` transform-only), `font-display` title, tokenized synopsis text. Keep every behavior in the preservation contract.

- [ ] **Step 3: Restyle GenreCheckboxGroup** — genre chips as `.pill` toggles with a clear checked state using `--color-accent`/pastel fill; keep the checkbox input, `checked`, `onChange`, and `capitalize`.

- [ ] **Step 4: Restyle Preferences page** — editorial heading + intro, chips grid, `.btn.btn-accent` submit. Keep the confirm dialog, save flow, and button texts.

- [ ] **Step 5: Verify + screenshot**

```bash
npm run build
```
Confirm the four heading strings are present unchanged (grep the source):
```bash
grep -n "Your Top Recommendations\|For You\|Trending Now\|New Releases\|Random Recommendations" src/pages/Recommendations.tsx
```
Screenshot `/recommendations` and `/preferences` at 320/768/1024/1440 to `docs/superpowers/screenshots/task5/`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Recommendations.tsx src/components/AnimeCard.tsx src/components/GenreCheckboxGroup.tsx src/pages/Preferences.tsx
git commit -m "Restyle Recommendations, AnimeCard, genre chips, and Preferences"
```

---

## Task 6: Profile + PrivacyPolicy + NotFound

**Files:**
- Modify: `src/pages/Profile.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/NotFound.tsx`

**Interfaces:**
- Consumes: tokens, `.surface-card`, `.dark-card`, `.btn`, `.pill`.
- Produces: restyled remaining pages.

**Preservation contract:**
- Profile: every subcomponent and handler intact — `AvatarUpload` (including the `Generating thumbnail...` conditional and `displayImage = avatarThumbnailUrl ?? avatarUrl`), `PasswordForm` (match/validation/messages), `TitleGenerator`, `QuoteGenerator`, `RandomAnimeGenerator` (click-to-toggle), `PreferencesSummary` (`getPreferences`, `/preferences` link), `handleLogout`, the signed-in email display, `getCurrentUser` effect with its catch→`signOut`+`/login`.
- PrivacyPolicy: keep all headings and body copy (content unchanged); restyle only.
- NotFound: keep the `404` `<h1>`, the message, and the `Back to Home` `/` link.

- [ ] **Step 1: Restyle Profile** as an editorial dashboard — a profile header card (avatar + email), then the sections (`Profile Picture`, `Update Your Password`, generators, `Current Preferences`) arranged as `.surface-card` panels / a light bento rather than a flat stack. Restyle buttons to `.btn` variants. Preserve all subcomponent internals and handlers exactly; change only presentation/wrappers.

- [ ] **Step 2: Restyle PrivacyPolicy** — editorial article layout (`font-display` headings, comfortable measure `max-w-3xl`, tokenized text). Content strings unchanged.

- [ ] **Step 3: Restyle NotFound** — oversized Fraunces `404`, `.btn.btn-accent` Back to Home. Keep the link target `/`.

- [ ] **Step 4: Verify + screenshot**

```bash
npm run build
```
Manually verify in dev: avatar upload still shows `Uploading...` then the `Generating thumbnail...` gap state; password form validation messages; each generator button toggles. Screenshot `/profile`, `/privacy-policy`, and a 404 route at 320/768/1024/1440 to `docs/superpowers/screenshots/task6/`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.tsx src/pages/PrivacyPolicy.tsx src/pages/NotFound.tsx
git commit -m "Restyle Profile, Privacy Policy, and NotFound"
```

---

## Task 7: Visual-regression baseline + accessibility pass + cleanup

**Files:**
- Create: `e2e/visual.spec.ts`
- Modify: `src/App.tsx` (remove `/styletile` route + import), delete `src/pages/StyleTile.tsx`

**Interfaces:**
- Consumes: all restyled pages.
- Produces: screenshot baselines + a11y verification; removes the temporary StyleTile.

- [ ] **Step 1: Remove the temporary StyleTile** — delete `src/pages/StyleTile.tsx`, remove its import and `<Route path="/styletile" ...>` from `src/App.tsx`.

```bash
git rm src/pages/StyleTile.tsx
```

- [ ] **Step 2: Write `e2e/visual.spec.ts`** — visual-regression baselines for the public pages at the four breakpoints. Public pages need no auth; keep it deterministic (disable animations via reduced-motion is already global). Use `toHaveScreenshot` with `maxDiffPixelRatio` tolerance for font AA. **Known limitation (document, do not expand scope):** this baselines only the four public pages (`/`, `/login`, `/signup`, `/privacy-policy`); the authed pages (Recommendations/Profile/Preferences) would need a login fixture and are not baselined here — they are covered by the manual screenshots + the composed-pages human gate below.

```ts
import { test, expect } from '@playwright/test'

const BREAKPOINTS = [
  { name: '320', width: 320, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
]
const PUBLIC_PAGES = ['/', '/login', '/signup', '/privacy-policy']

for (const path of PUBLIC_PAGES) {
  for (const bp of BREAKPOINTS) {
    test(`visual ${path} @ ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height })
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(page).toHaveScreenshot(`${path.replace(/\//g, '_') || '_home'}-${bp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      })
    })
  }
}
```

- [ ] **Step 3: Generate baselines and run**

```bash
npm run build
npx playwright test e2e/visual.spec.ts --update-snapshots
npx playwright test e2e/recommendations.spec.ts
```
Expected: baselines written; the recommendations E2E still passes. If the environment cannot run Playwright (no browser/stack), record that baselines were not generated and leave the spec in place for CI; note in the report.

- [ ] **Step 4: Accessibility verification** — for each restyled page confirm: WCAG AA contrast for body text, muted text, and button label-on-accent (use a contrast checker on the token pairs `ink/paper`, `muted/paper`, `paper/accent`, `secondary/paper`; if any pair is below 4.5:1 for normal text, darken the token's lightness in `tokens.css` and note the change); visible `:focus-visible` ring on links/buttons/inputs (tab through Home and Login); `prefers-reduced-motion` neutralizes hover transforms (toggle OS setting or emulate in devtools). Record results in the report.

- [ ] **Step 5: Consistency sweep** — grep for stragglers: any remaining hardcoded hex colors or the old palette values in components should be gone.

```bash
grep -rn "#ff5c8a\|#4d7cfe\|#fff8fa\|#1a1a2e\|Poppins" src/ || echo "clean"
```
Expected: `clean` (no old hex/Poppins references remain). Fix any hits.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add visual-regression baselines, accessibility pass, and remove StyleTile"
```

- [ ] **Step 7: Composed-pages human aesthetic gate (orchestrator action, not the implementer's)**

Before finishing the branch, the orchestrator assembles the composed-page screenshots from Tasks 2-6 (Home, auth, Recommendations, Profile, Preferences, Privacy, 404) at representative breakpoints into an Artifact gallery and presents it to the human for a final aesthetic sign-off on the actual composed pages. Only after that approval proceed to superpowers:finishing-a-development-branch. This gate is about whether the pages *look good* — distinct from the correctness/regression review, which does not judge aesthetics.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Restyle of every surviving page + tokens-in-`src/styles/tokens.css` + serif editorial display + pastel bento accents + dark hero cards = spec Visual Direction. Structural spec items (Preference removal, new pages, nav overhaul) are explicitly deferred to Plans #2-#7 with a stated reason. Covered.
- **Placeholder scan:** `tokens.css` and StyleTile are fully specified; page tasks intentionally specify structure + preservation contract + token usage rather than pixel-exact JSX, because the human-approved StyleTile is the visual source of truth (stated in Global Constraints). No "TBD"/"handle edge cases"/"similar to Task N".
- **Type/name consistency:** Token names, component-class names (`.surface-card`/`.dark-card`/`.bento-grid`/`.btn`/`.btn-accent`/`.btn-outline`/`.pill`/`.tile-accent`), and font-family strings (`'Fraunces Variable'`, `'Inter Variable'`) are used identically across Task 1's definitions and every later reference. Legacy alias names match the exact strings existing components read.
- **E2E safety:** Every load-bearing selector (h1/h2 strings, `getByLabel` associations, button accessible names, auth navigation, first `<img>`) is listed in Global Constraints and re-stated in the owning task's preservation contract; Tasks 4 and 7 re-run `e2e/recommendations.spec.ts`.
