import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { defineConfig, devices, webkit } from '@playwright/test';

const PORT = 4317;

// Machines without root access can unpack Chromium's system libraries here instead of
// running `playwright install-deps` (see docs/testing.md).
const localLibs = join(homedir(), '.cache/ctm-test-libs/root/usr/lib/x86_64-linux-gnu');
const launchOptions = existsSync(localLibs)
  ? { env: { ...process.env, LD_LIBRARY_PATH: [localLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } as Record<string, string> }
  : {};

// Firefox and WebKit need more libraries; without root they can be unpacked into
// ~/.cache/ctm-test-libs/extra (see docs/testing.md). Kept apart from the Chromium set so their
// newer versions do not clash.
const extra = join(homedir(), '.cache/ctm-test-libs/extra/root');
const extraLibs = [join(extra, 'usr/lib/x86_64-linux-gnu'), join(extra, 'lib/x86_64-linux-gnu')];
// Playwright's pre-launch library check only looks at system paths, so it is skipped when the
// local set exists; a missing library still fails the launch itself.
if (existsSync(extra)) process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS ??= '1';
const otherLaunch = existsSync(extra)
  ? {
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [...extraLibs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
        GST_PLUGIN_SYSTEM_PATH: join(extra, 'usr/lib/x86_64-linux-gnu/gstreamer-1.0'),
        GST_REGISTRY: join(homedir(), '.cache/ctm-test-libs/gst-registry.bin'),
      } as Record<string, string>,
    }
  : {};

// WebKit's bundled launcher replaces LD_LIBRARY_PATH, so with the local libraries a small
// launcher in scripts/test starts it instead.
const webkitDir = (() => {
  try {
    return join(dirname(webkit.executablePath()), 'minibrowser-wpe');
  } catch {
    return '';
  }
})();
const webkitLaunch =
  existsSync(extra) && webkitDir
    ? { executablePath: join(import.meta.dirname, 'scripts/test/webkit-local.sh'), env: { ...otherLaunch.env, CTM_WEBKIT_DIR: webkitDir, CTM_EXTRA_LIBS: extraLibs.join(':'), CTM_EXTRA_ROOT: extra } as Record<string, string> }
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
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 }, launchOptions: otherLaunch } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 }, launchOptions: webkitLaunch } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/time-machine/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
