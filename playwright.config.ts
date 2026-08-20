import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Testes que dependem de PTY/timing externo flapeiam raramente na corrida
  // completa (passam isolados) — 1 retry local nao mascara regressao real.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5199',
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
    env: {
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' '),
    },
    url: 'http://127.0.0.1:5199',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
