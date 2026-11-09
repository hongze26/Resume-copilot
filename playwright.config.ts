import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173/gp-like/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
