import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for Personal Private Second Brain.
 *
 * Run:       npx playwright test
 * UI mode:   npx playwright test --ui
 * Debug:     npx playwright test --debug
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'on-first-failure',

    /* Timeout for each individual test */
    timeout: 30_000,
  },

  /* Global timeout for expect assertions */
  expect: {
    timeout: 10_000,
  },

  /* Configure projects — chromium only as specified */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Mobile Chrome viewport for mobile nav tests */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
