import { test, expect } from '@playwright/test'

test('login then Explore page renders For You and Browse & Search', async ({ page }) => {
  const email = process.env.E2E_AUTH0_TEST_EMAIL
  const password = process.env.E2E_AUTH0_TEST_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_AUTH0_TEST_EMAIL and E2E_AUTH0_TEST_PASSWORD must be set')
  }

  await page.goto('/login')
  await page.getByRole('button', { name: 'Log In' }).click()

  // Cross-origin navigation to Auth0's hosted Universal Login page.
  // These are Auth0's documented New Universal Login field names; if this
  // step fails, inspect the actual rendered page (Auth0 occasionally
  // changes markup between login-experience versions) and adjust the
  // selectors below.
  await page.waitForURL(/\.auth0\.com\/u\/login/)
  await page.locator('input[name="username"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/profile')
  await page.goto('/explore')
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/explore')

  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'For You' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse & Search' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  const forYouSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'For You' }) })
  await expect(forYouSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const browseSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Browse & Search' }) })

  await browseSection.getByRole('button', { name: 'Action', exact: true }).click()
  await browseSection.getByRole('button', { name: 'Newest', exact: true }).click()
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const loadMoreButton = browseSection.getByRole('button', { name: 'Load More' })
  if (await loadMoreButton.isVisible()) {
    const countBefore = await browseSection.locator('img').count()
    await loadMoreButton.click()
    await expect(browseSection.getByRole('button', { name: 'Loading...' })).toHaveCount(0, { timeout: 15000 })
    const countAfter = await browseSection.locator('img').count()
    expect(countAfter).toBeGreaterThan(countBefore)
  }

  await browseSection.getByLabel('Search titles').fill('Frieren')
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)
})
