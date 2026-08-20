import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('a new user is redirected to Discover before reaching Recommendations, and swiping unlocks it', async ({ page }) => {
  const email = uniqueEmail()
  const password = 'correct horse battery staple'

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
