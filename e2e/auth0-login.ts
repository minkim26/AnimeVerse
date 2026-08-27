import type { Page } from '@playwright/test'

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be set`)
  }
  return value
}

// Drives Auth0's real hosted Universal Login page. These are Auth0's
// documented New Universal Login field names; if this step fails, inspect
// the actual rendered page (Auth0 occasionally changes markup between
// login-experience versions) and adjust the selectors below.
export async function loginViaAuth0(page: Page, email: string, password: string): Promise<void> {
  // TEMPORARY diagnostic — remove once the post-login session drop is root-caused.
  page.on('console', (msg) => console.log(`[browser console] ${msg.type()}: ${msg.text()}`))
  page.on('pageerror', (err) => console.log(`[browser pageerror] ${err.message}`))
  page.on('response', (res) => {
    if (res.url().includes('/users/sync')) {
      res
        .text()
        .then((body) => console.log(`[sync response] ${res.status()} ${body}`))
        .catch(() => {})
    }
  })

  await page.goto('/login')
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForURL(/\.auth0\.com\/u\/login/)
  await page.locator('input[name="username"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  // Universal Login also renders "Continue with Google"/"Continue with
  // GitHub" buttons that are type="submit" too — target the primary
  // username/password submit button specifically.
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForURL('**/profile')
}

// Gets a logged-in session past the RequireOnboarding gate, regardless of
// whether this identity already has swipes from another spec sharing it
// earlier in the same CI run (E2E_AUTH0_TEST_EMAIL is reused by
// explore.spec.ts and console-errors.spec.ts). Only discover.spec.ts needs
// a guaranteed zero-swipe identity, so it uses its own dedicated user
// instead of this helper.
export async function ensureOnboarded(page: Page): Promise<void> {
  await page.goto('/explore')
  await Promise.race([
    page.waitForURL('**/discover'),
    page.getByRole('heading', { name: 'Explore', exact: true }).waitFor(),
  ])
  if (page.url().includes('/discover')) {
    await page.getByRole('button', { name: 'Like' }).click()
    // Wait for the swipe POST to finish before navigating away — a full
    // navigation aborts an in-flight fetch, which would otherwise manufacture
    // a spurious "[Discover] Failed to record swipe" console error.
    await page.getByText('Saved').waitFor()
    await page.goto('/explore')
  }
}
