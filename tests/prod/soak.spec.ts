import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * The 45-minute exploration session for resource leaks (handoff section 11). Runs only when
 * SOAK_MINUTES is set: `SOAK_MINUTES=45 npx playwright test -c playwright.prod.config.ts soak`.
 * Every minute it forces garbage collection and records JS heap, DOM nodes and listeners.
 */
const MINUTES = Number(process.env.SOAK_MINUTES ?? 0);
test.skip(!MINUTES, 'set SOAK_MINUTES to run the leak session');
test.setTimeout((MINUTES + 10) * 60_000);

interface Sample {
  minute: number;
  heapMB: number;
  nodes: number;
  listeners: number;
  windows: number;
  actions: number;
}

async function start(page: Page, name: string) {
  const desk = page.locator('.w95[data-phase]');
  await desk.locator('.w95-start-button').click();
  for (const n of ['Programs', ...name.split('>')]) await desk.getByRole('menu').last().getByRole('menuitem', { name: n, exact: true }).click();
}

test('45-minute exploration session stays within memory bounds', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('./?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await desk.getByLabel('User name:').fill('Soak Tester');
  await desk.getByRole('button', { name: 'OK' }).click();

  const samples: Sample[] = [];
  let actions = 0;
  const measure = async (minute: number) => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = (name: string) => metrics.find((x) => x.name === name)?.value ?? 0;
    samples.push({ minute, heapMB: Math.round((m('JSHeapUsedSize') / 1048576) * 10) / 10, nodes: m('Nodes'), listeners: m('JSEventListeners'), windows: await desk.locator('.w95-window').count(), actions });
  };

  const aol = desk.locator('.w95-window[data-app="aol"]');
  const ns = desk.locator('.w95-window[data-app="netscape"]');
  const pages = ['http://switchboard.test/', 'http://lantern.test/gallery.html', 'http://northstar.test/club/', 'http://bytemarket.test/modem-calc.html', 'http://nightowl.test/archive.html', 'http://chugging.test/menu.html'];

  const signOn = async () => {
    if ((await aol.count()) === 0) await desk.locator('[data-desktop-icon="aol"]').dblclick();
    await aol.getByRole('button', { name: 'Setup', exact: true }).click();
    const setup = aol.getByRole('region', { name: 'Setup' });
    await setup.getByLabel('Connection sounds').setChecked(false);
    await setup.getByLabel('Fast connection (shorter waits)').setChecked(true);
    await setup.getByRole('button', { name: 'OK' }).click();
    await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
    await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 15_000 });
  };

  const end = Date.now() + MINUTES * 60_000;
  let minute = 0;
  let nextSample = Date.now();
  let round = 0;
  while (Date.now() < end) {
    if (Date.now() >= nextSample) {
      await measure(minute++);
      nextSample += 60_000;
    }
    round++;
    // A cycle of ordinary use: sign on, browse, chat, play, write, sign off, close everything.
    await signOn();
    await aol.locator('.aol-flashbar').getByRole('button', { name: 'Internet Connection', exact: true }).click();
    await aol.getByRole('button', { name: 'World Wide Web', exact: true }).click();
    for (const address of pages) {
      await expect(ns.locator('.ns-content')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
      const field = ns.locator('.ns-location-field');
      await field.fill(address);
      await field.press('Enter');
      await expect(ns.locator('.ns-content')).toHaveAttribute('aria-busy', 'true', { timeout: 5_000 }).catch(() => undefined);
      actions++;
    }
    await expect(ns.locator('.ns-content')).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
    await desk.locator(`[data-task-for="${await aol.getAttribute('data-window-id')}"]`).click();
    await aol.locator('.aol-flashbar').getByRole('button', { name: 'People Connection', exact: true }).click();
    await page.waitForTimeout(3000);
    await start(page, 'Accessories>Games>Minesweeper');
    const ms = desk.locator('.w95-window[data-app="minesweeper"]');
    await ms.locator('[role="gridcell"]').nth((round * 7) % 81).click().catch(() => undefined);
    await start(page, 'Accessories>Notepad');
    await desk.locator('.w95-window[data-app="notepad"] textarea').fill(`Round ${round}: still here.`);
    actions += 3;
    // Close everything (Notepad asks to save: answer No; AOL asks to sign off: answer Yes).
    for (let i = 0; i < 12 && (await desk.locator('.w95-window[data-app]:not([data-app="msgbox"])').count()) > 0; i++) {
      const box = desk.locator('.w95-window[data-app="msgbox"]');
      if ((await box.count()) > 0) {
        const no = box.getByRole('button', { name: 'No' });
        const text = (await box.textContent()) ?? '';
        await (/sign off/i.test(text) ? box.getByRole('button', { name: 'Yes' }) : no).click();
        continue;
      }
      await desk.locator('.w95-window[data-app]').last().locator('[aria-label="Close"]').first().click();
      await page.waitForTimeout(150);
    }
    await expect(aol).toHaveCount(0, { timeout: 10_000 });
  }
  await measure(minute);

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/soak-metrics.json', JSON.stringify({ minutes: MINUTES, rounds: round, samples, errors }, null, 2));
  expect(errors).toEqual([]);
  // After warm-up (minute 3), memory and DOM must not keep growing.
  const warm = samples.find((s) => s.minute === 3) ?? samples[1] ?? samples[0]!;
  const last = samples.at(-1)!;
  expect(last.heapMB).toBeLessThan(warm.heapMB * 1.5 + 5);
  expect(last.nodes).toBeLessThan(warm.nodes * 1.5 + 500);
  expect(last.listeners).toBeLessThan(warm.listeners * 1.5 + 200);
});
