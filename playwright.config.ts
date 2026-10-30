import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

// Machines without root access can unpack Chromium's system libraries here instead of
// running `playwright install-deps` (see docs/testing.md).
const localLibs = join(homedir(), '.cache/ctm-test-libs/root/usr/lib/x86_64-linux-gnu');
const launchOptions = existsSync(localLibs)
  ? { env: { ...process.env, LD_LIBRARY_PATH: [localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } as Record<string, string> }
  : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/time-machine/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/time-machine/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
