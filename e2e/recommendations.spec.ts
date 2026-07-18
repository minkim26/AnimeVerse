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
