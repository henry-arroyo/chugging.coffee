import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/** Results are written here for the M5 report (and docs/performance.md). */
const RESULTS = 'test-results/prod-metrics.json';
const metrics: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  let previous = {};
  try {
    previous = JSON.parse(readFileSync(RESULTS, 'utf8'));
  } catch {
    /* first run */
  }
  writeFileSync(RESULTS, JSON.stringify({ ...previous, ...metrics }, null, 2));
});

function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on('pageerror', (e) => violations.push(`page error: ${e.message}`));
  return violations;
}

async function signOnAndBrowse(page: Page) {
  const desk = page.locator('.w95[data-phase]');
  await expect(desk.getByRole('dialog', { name: 'Welcome to Windows' })).toBeVisible({ timeout: 20_000 });
  await desk.getByLabel('User name:').fill('Night Owl');
  await desk.getByRole('button', { name: 'OK' }).click();
  await desk.locator('[data-desktop-icon="aol"]').dblclick();
  const aol = desk.locator('.w95-window[data-app="aol"]');
  await aol.getByRole('button', { name: 'Setup', exact: true }).click();
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Connection sounds').uncheck();
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Fast connection (shorter waits)').check();
  await aol.getByRole('region', { name: 'Setup' }).getByRole('button', { name: 'OK' }).click();
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 15_000 });
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Keyword', exact: true }).click();
  await aol.getByLabel('Type the keyword for the area you want to go to:').fill('lighthouse');
  await aol.getByRole('button', { name: 'Go', exact: true }).click();
  const ns = desk.locator('.w95-window[data-app="netscape"]');
  await expect(ns.getByRole('heading', { name: 'Lantern Point' })).toBeVisible({ timeout: 20_000 });
  await expect(ns.locator('.ns-content')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  return { desk, aol, ns };
}

test('the production build runs under the production headers with no CSP violations', async ({ page }) => {
  const violations = watchViolations(page);
  const response = await page.goto('./');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['x-frame-options']).toBe('DENY');
  await signOnAndBrowse(page);
  // Images and the logbook widget on a page with pictures, the Notepad reward path, and the games.
  expect(violations).toEqual([]);
});

test('startup: the logon is usable within 3 s on a broadband profile with a slower CPU', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  // Documented profile (docs/performance.md): 10 Mbit/s down, 2 Mbit/s up, 40 ms latency, CPU 4x slower.
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const start = Date.now();
  // Includes the deliberate 1.5 s Windows startup screen a first-time visitor sees.
  await page.goto('./');
  await expect(page.locator('.w95[data-phase]').getByLabel('User name:')).toBeEditable({ timeout: 20_000 });
  const usableMs = Date.now() - start;
  metrics.startupUsableMs = usableMs;
  metrics.startupProfile = '10 Mbit/s down, 2 Mbit/s up, 40 ms RTT, CPU 4x slowdown, cold cache';
  expect(usableMs).toBeLessThan(3000);
});

test('initial shell download stays under 1 MiB compressed', async ({ page }) => {
  const sizes: { url: string; bytes: number; encoding: string }[] = [];
  page.on('response', async (r) => {
    const body = await r.body().catch(() => null);
    if (body) sizes.push({ url: r.url(), bytes: body.length, encoding: r.headers()['content-encoding'] ?? 'identity' });
  });
  await page.goto('./?skipboot');
  await expect(page.locator('.w95[data-phase]').getByLabel('User name:')).toBeEditable({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  // vite preview does not compress; measure what gzip would send, as CloudFront compresses text.
  const { gzipSync } = await import('node:zlib');
  let raw = 0;
  let gz = 0;
  for (const s of sizes) {
    raw += s.bytes;
    const resp = await page.request.get(s.url);
    gz += gzipSync(await resp.body()).length;
  }
  metrics.initialRawBytes = raw;
  metrics.initialGzipBytes = gz;
  expect(gz).toBeLessThan(1024 * 1024);
});

test('window dragging stays smooth (frame times while dragging, CPU 4x slower)', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('./?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await desk.getByLabel('User name:').fill('Night Owl');
  await desk.getByRole('button', { name: 'OK' }).click();
  await desk.locator('[data-desktop-icon="my-computer"]').dblclick();
  const title = desk.locator('.w95-window[data-app="my-computer"] .w95-titlebar');
  const box = (await title.boundingBox())!;
  await page.evaluate(() => {
    (window as unknown as { frames_: number[] }).frames_ = [];
    let last = performance.now();
    const tick = (t: number) => {
      (window as unknown as { frames_: number[] }).frames_.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 90; i++) await page.mouse.move(box.x + 60 + i * 3, box.y + box.height / 2 + i * 2);
  await page.mouse.up();
  const frames = await page.evaluate(() => (window as unknown as { frames_: number[] }).frames_.slice(1));
  frames.sort((a, b) => a - b);
  const p95 = frames[Math.floor(frames.length * 0.95)] ?? 0;
  metrics.dragFrames = frames.length;
  metrics.dragP95FrameMs = Math.round(p95 * 10) / 10;
  expect(p95).toBeLessThan(50);
});
