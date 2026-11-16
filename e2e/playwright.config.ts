import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in a real browser against the real app.
 * Requires the local database: `npm run db:local` (the API and web servers
 * are started automatically if they aren't already running).
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    { command: 'npm run dev:api', url: 'http://localhost:4000/api/health/live', reuseExistingServer: true, cwd: '..', timeout: 120_000 },
    { command: 'npm run dev:web', url: 'http://localhost:3000', reuseExistingServer: true, cwd: '..', timeout: 180_000 },
  ],
});
