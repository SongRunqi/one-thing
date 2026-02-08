import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: './e2e/test-results/artifacts',
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: [['list'], ['html', { outputFolder: './e2e/test-results/html', open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
})
