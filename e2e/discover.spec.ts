import { test, expect } from '@playwright/test'
import { loginViaAuth0, requiredEnv } from './auth0-login.ts'

// Uses its own dedicated Auth0 identity (E2E_AUTH0_ONBOARDING_TEST_EMAIL/
// PASSWORD) rather than the E2E_AUTH0_TEST_EMAIL one explore.spec.ts and
// console-errors.spec.ts share. Postgres is a fresh per-run service
// container (see ci.yml), so this identity's User row has zero Swipe rows
// at the start of every CI run — but only if no other spec ever swipes for
// it. Keeping it exclusive to this test is what makes the "redirected
// before swiping" assertion below deterministic instead of order-dependent.
test('a new user is redirected to Discover before reaching Recommendations, and swiping unlocks it', async ({
  page,
}) => {
  await loginViaAuth0(
    page,
    requiredEnv('E2E_AUTH0_ONBOARDING_TEST_EMAIL'),
    requiredEnv('E2E_AUTH0_ONBOARDING_TEST_PASSWORD'),
  )
  await page.goto('/explore')
  await expect(page).toHaveURL(/\/discover$/)

  await expect(page.getByRole('heading', { name: 'Swipe to build your taste profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Like' }).click({ timeout: 15000 })

  await page.goto('/explore')
  // Asserting on rendered content rather than the URL: RequireOnboarding
  // shows a brief loading shell while its GET /swipes/me check is in
  // flight, so the URL reads "/explore" for a beat even on a run
  // where the gate is about to redirect. The heading only appears once the
  // gate has actually let the page through.
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
})
