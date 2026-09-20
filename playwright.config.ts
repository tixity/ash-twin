import { defineConfig } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }] as const] : []),
  ],
  use: {
    ignoreHTTPSErrors: false,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    channel: 'chrome'
  },
  // Every tenant/env combo we want to test is a Playwright project. Running
  // `npx playwright test` runs them all in one shot with a combined report;
  // `--project=cca-local` narrows to one.
  projects: [
    {
      name: 'cca-local',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/default/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'cca', env: 'local' },
    },
    {
      name: 'cca-staging',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/default/**/*.spec.ts', 'payments/**/cybersource_unified.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'cca', env: 'staging' },
    },
    {
      name: 'theagenda-local',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'theagenda', env: 'local' },
    },
    {
      name: 'theagenda-staging',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'theagenda', env: 'staging' },
    },
    {
      name: 'adrea-local',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'adrea', env: 'local' },
    },
    {
      name: 'adrea-staging',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'adrea', env: 'staging' },
    },
    {
      name: 'blublood-local',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'blublood', env: 'local' },
    },
    {
      name: 'blublood-staging',
      testDir: './specs',
      testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts', 'pentest/**/*.spec.ts'],
      metadata: { tenant: 'blublood', env: 'staging' },
    },
  ],
});
