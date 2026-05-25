import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const webServer = process.env.E2E_BASE_URL
  ? undefined
  : {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: {
        DATABASE_PATH: './data/e2e-test.db',
        PDF_GENERATOR: 'stub',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'development',
      },
    };

export default defineConfig({
  globalSetup: resolve(import.meta.dirname, './global-setup.ts'),
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,

  reporter: [['html'], process.env.CI ? ['github'] : ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],

  ...(webServer ? { webServer } : {}),
});
