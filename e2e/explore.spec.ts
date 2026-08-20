import { test, expect } from '@playwright/test'

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`
}

test('signup then Explore page renders For You and Browse & Search', async ({ page }) => {
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
  await page.waitForURL('**/discover')
  await page.getByRole('button', { name: 'Like' }).click()

  await page.goto('/explore')

  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'For You' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browse & Search' })).toBeVisible()
  await expect(page.locator('img').first()).toBeVisible({ timeout: 15000 })
  // Gate on the section actually leaving its loading state — otherwise a slow
  // request could still be "loading" when the assertion below runs, passing
  // even if the section is broken. Same pattern as console-errors.spec.ts.
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  const forYouSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'For You' }) })
  await expect(forYouSection.locator('p[class*="color-error"]')).toHaveCount(0)

  const browseSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Browse & Search' }) })

  // A genre chip, then a sort change, each re-issue the debounced search
  // without erroring or leaving the section stuck loading.
  await browseSection.getByRole('button', { name: 'Action', exact: true }).click()
  await browseSection.getByRole('button', { name: 'Newest', exact: true }).click()
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)

  // Load More appends results without a duplicate React key — a duplicate
  // would surface as a console error, asserted separately in
  // console-errors.spec.ts. Runs before the search below: Action + Newest
  // still has a deep results pool, so hasNextPage is true and the button is
  // actually there to click. A search narrow enough to match Load More's
  // rationale ("depends on the last-applied filter state") could easily
  // leave zero results and skip this whole block.
  const loadMoreButton = browseSection.getByRole('button', { name: 'Load More' })
  if (await loadMoreButton.isVisible()) {
    const countBefore = await browseSection.locator('img').count()
    await loadMoreButton.click()
    await expect(browseSection.getByRole('button', { name: 'Loading...' })).toHaveCount(0, { timeout: 15000 })
    const countAfter = await browseSection.locator('img').count()
    expect(countAfter).toBeGreaterThan(countBefore)
  }

  // Text search re-issues the debounced request too.
  await browseSection.getByLabel('Search titles').fill('Frieren')
  await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  await expect(browseSection.locator('p[class*="color-error"]')).toHaveCount(0)
})
