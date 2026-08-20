import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-console-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('no console or page errors during the primary signup-to-profile flow', async ({ page }) => {
  const errors: string[] = []
  let filteredCount = 0
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Discover.tsx and Explore.tsx deliberately console.error() and
    // fall back to a safe UI state when a fetch fails, instead of throwing
    // (see the comments next to those catch blocks) — e.g. if AniList is
    // slow or rate-limited during a run. The test waits for each async step
    // (swipe save, section load) to settle before navigating away specifically
    // so this filter stays a rare-noise safety net rather than something that
    // fires on every run; don't remove those waits to "simplify" this test.
    if (text.startsWith('[Discover]') || text.startsWith('[Explore]')) {
      filteredCount++
      return
    }
    errors.push(`console.error: ${text}`)
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
  await page.goto('/explore')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()
  // Wait for the swipe POST to actually finish (Discover.tsx's role="status"
  // region) before navigating away — page.goto() is a full navigation that
  // tears down the SPA and aborts whatever fetch is still in flight, which
  // would otherwise manufacture a spurious "[Discover] Failed to record
  // swipe" error on every run instead of only under real network failure.
  await page.getByText('Saved').waitFor()

  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  // Same reasoning: let the four sections' AniList/preferences fetches
  // settle (success or error) before navigating on, instead of racing them.
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })

  await page.goto('/preferences')
  await expect(page.getByRole('heading', { name: 'Update Your Preferences' })).toBeVisible()

  await page.goto('/profile')
  // exact: true — Profile also renders a "Profile Picture" h2 once the async
  // GET /users/me resolves (see AvatarUpload, gated on `user &&`). Playwright's
  // getByRole name match is substring by default, so an inexact match here is
  // ambiguous exactly when that fetch has already resolved by the time this
  // assertion polls — a pre-existing, timing-dependent locator collision, not
  // a page bug.
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  // Profile has always rendered its own Logout button alongside the
  // persistent one in Navbar (pre-existing, intentional duplicate
  // affordance since the SPA rewrite) — scope to <main> so the locator
  // isn't ambiguous between the two.
  await page.getByRole('main').getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('**/login')

  // Surfaced (not asserted on) so a CI log or local run shows at a glance
  // whether the filter above is still a rare safety net or is quietly
  // eating something on every run.
  console.log(`[console-errors.spec] filtered ${filteredCount} known Discover/Recommendations message(s)`)
  expect(errors, errors.join('\n')).toEqual([])
})
