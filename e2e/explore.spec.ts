import { test, expect } from '@playwright/test'
import { loginViaAuth0, ensureOnboarded, requiredEnv } from './auth0-login.ts'

test('login then Explore page renders For You and Browse & Search', async ({ page }) => {
  await loginViaAuth0(page, requiredEnv('E2E_AUTH0_TEST_EMAIL'), requiredEnv('E2E_AUTH0_TEST_PASSWORD'))
  await ensureOnboarded(page)

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
