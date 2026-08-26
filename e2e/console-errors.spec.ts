import { test, expect } from '@playwright/test'
import { loginViaAuth0, ensureOnboarded, requiredEnv } from './auth0-login.ts'

test('no console or page errors during the primary login-to-profile flow', async ({ page }) => {
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

  await page.goto('/')
  await loginViaAuth0(page, requiredEnv('E2E_AUTH0_TEST_EMAIL'), requiredEnv('E2E_AUTH0_TEST_PASSWORD'))
  await ensureOnboarded(page)
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
  // Auth0's logout() redirects to window.location.origin (the app root),
  // not /login — unlike the deleted direct-login flow this test used to drive.
  await page.waitForURL((url) => url.pathname === '/')

  // Surfaced (not asserted on) so a CI log or local run shows at a glance
  // whether the filter above is still a rare safety net or is quietly
  // eating something on every run.
  console.log(`[console-errors.spec] filtered ${filteredCount} known Discover/Recommendations message(s)`)
  expect(errors, errors.join('\n')).toEqual([])
})
