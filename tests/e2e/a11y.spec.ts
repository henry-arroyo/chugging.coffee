import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signOn } from './helpers';

test.setTimeout(90_000);

/**
 * WCAG 2.1 A/AA checks with axe-core. Every violation is listed with the elements it hit.
 *
 * In the authentic look two period details are excluded, and nothing else:
 * - the Start menu's "Windows 95" banner, a logotype (WCAG 1.4.3 exempts text in logos);
 * - inactive windows' gray title text. The High contrast pass below checks those with no
 *   exclusions, so guests who need strong contrast get it.
 */
async function scan(page: Page, where: string, { authentic = true } = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.w95-start-banner');
  if (authentic) builder = builder.exclude('[data-active="false"] > .w95-titlebar');
  const result = await builder.analyze();
  const problems = result.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join('\n    ')}`);
  return problems;
}

test('core screens have no WCAG A/AA violations', async ({ page }) => {
  const problems: string[] = [];
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await expect(desk.getByRole('dialog', { name: 'Welcome to Windows' })).toBeVisible({ timeout: 10_000 });
  await desk.getByLabel('User name:').fill('Night Owl');
  problems.push(...(await scan(page, 'logon')));
  await signOn(page);
  problems.push(...(await scan(page, 'desktop')));

  await desk.locator('.w95-start-button').click();
  problems.push(...(await scan(page, 'start menu')));
  await page.keyboard.press('Escape');

  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'Accessories', 'Notepad']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  problems.push(...(await scan(page, 'notepad')));

  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'America Online', 'America Online']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  const aol = desk.locator('.w95-window[data-app="aol"]');
  problems.push(...(await scan(page, 'aol sign-on')));
  await aol.getByRole('button', { name: 'Setup', exact: true }).click();
  problems.push(...(await scan(page, 'aol setup')));
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Connection sounds').uncheck();
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Fast connection (shorter waits)').check();
  await aol.getByRole('region', { name: 'Setup' }).getByRole('button', { name: 'OK' }).click();
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
  problems.push(...(await scan(page, 'aol main menu')));
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'People Connection', exact: true }).click();
  problems.push(...(await scan(page, 'aol chat')));
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Keyword', exact: true }).click();
  await aol.getByLabel('Type the keyword for the area you want to go to:').fill('lighthouse');
  await aol.getByRole('button', { name: 'Go', exact: true }).click();
  const ns = desk.locator('.w95-window[data-app="netscape"]');
  // Wait for the page itself (the status bar may show a link under the resting mouse instead).
  await expect(ns.getByRole('heading', { name: 'Lantern Point' })).toBeVisible({ timeout: 15_000 });
  await expect(ns.locator('.ns-content')).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  problems.push(...(await scan(page, 'netscape page')));

  expect(problems, problems.join('\n')).toEqual([]);
});

test('with High contrast on, even inactive title bars pass', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await signOn(page, 'Night Owl');
  await page.getByRole('group', { name: 'Accessibility' }).getByRole('button', { name: 'High contrast' }).click();
  await expect(page.getByRole('group', { name: 'Accessibility' }).getByRole('button', { name: 'High contrast' })).toHaveAttribute('aria-pressed', 'true');
  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'Accessories', 'Notepad']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'America Online', 'America Online']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  const problems = await scan(page, 'high contrast', { authentic: false });
  expect(problems, problems.join('\n')).toEqual([]);
});
