import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    // Onboarding marcado como visto: o wizard nao bloqueia os testes quando
    // o banco esta sem workspaces (ex.: apos um purge).
    storageState: 'tests/e2e/storage-state.json',
    trace: 'on-first-retry',
  },
  expect: {
    timeout: 10_000,
  },
  webServer: {
    command: 'npm run build && PORT=5199 node scripts/orkestrai-server.mjs',
    url: 'http://localhost:5199',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
