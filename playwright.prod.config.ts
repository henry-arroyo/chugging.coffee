import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Checks against the production build (`npm run test:prod` builds first), served by `vite preview`
 * with the same response headers CloudFront sends: CSP compliance, startup time, bytes, dragging.
 */
const PORT = 4318;
const chromium = base.projects?.find((p) => p.name === 'chromium');

export default defineConfig({
  testDir: 'tests/prod',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/time-machine/`, trace: 'retain-on-failure', launchOptions: chromium?.use?.launchOptions ?? {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions: (base.use?.launchOptions as object) ?? {} } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/time-machine/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
