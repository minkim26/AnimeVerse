import { test, expect } from '@playwright/test'

// Known limitation: this baselines only the four public pages below.
// Authed pages (Recommendations/Profile/Preferences) would need a login
// fixture and are not baselined here — they're covered by the manual
// screenshots + the composed-pages human gate (Task 7 brief, Step 7).

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
