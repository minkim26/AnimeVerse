import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Local runs fail fast on a real bug. CI retries twice because these tests
  // hit AniList's live API with no mocking (deliberate — see CLAUDE.md) and
  // an occasional slow or failed AniList response can fail a run even when
  // the app is correct.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  webServer: {
    // Dedicated port + explicit API URL so the E2E always exercises THIS
    // worktree's AniList code against the live backend on :8000 — never the
    // user's separate :5173 dev server (which may serve old pre-migration code).
    command: 'VITE_API_URL=http://localhost:8000 npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:5174',
  },
  // ponytail: chromium-only for now — add firefox/webkit projects once
  // cross-browser coverage is actually prioritized.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
