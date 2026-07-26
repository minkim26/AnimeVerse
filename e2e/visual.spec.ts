import { test, expect } from '@playwright/test'

// Known limitation: this baselines only the four public pages below.
// Authed pages (Recommendations/Profile/Preferences) would need a login
// fixture and are not baselined here — they're covered by the manual
// screenshots + the composed-pages human gate (Task 7 brief, Step 7).

const MOBILE = { name: '320', width: 320, height: 800 }
const TABLET = { name: '768', width: 768, height: 1024 }
const LAPTOP = { name: '1024', width: 1024, height: 768 }
const DESKTOP = { name: '1440', width: 1440, height: 900 }

const FULL_MATRIX = [MOBILE, TABLET, LAPTOP, DESKTOP]
const MOBILE_AND_DESKTOP = [MOBILE, DESKTOP]

// Full 4-breakpoint matrix reserved for pages whose layout actually
// reflows across sizes (bento grid). Simple forms/static text only
// need the two extremes — a broken mid-range breakpoint on a page
// that's just a stacked form would also break at 320 or 1440.
const PUBLIC_PAGES = [
  { path: '/', breakpoints: FULL_MATRIX },
  { path: '/login', breakpoints: MOBILE_AND_DESKTOP },
  { path: '/signup', breakpoints: MOBILE_AND_DESKTOP },
  { path: '/privacy-policy', breakpoints: MOBILE_AND_DESKTOP },
]

for (const { path, breakpoints } of PUBLIC_PAGES) {
  for (const bp of breakpoints) {
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
