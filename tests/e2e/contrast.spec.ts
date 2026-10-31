import { expect, test, type Locator } from '@playwright/test';
import { signOn } from './helpers';

// Visitors with a dark-mode system must still get black text on the simulation's white surfaces.
test.use({ colorScheme: 'dark' });

async function textColor(l: Locator) {
  return l.evaluate((el) => getComputedStyle(el).color);
}

test('text on white is black even when the visitor uses dark mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await signOn(page, 'Night Owl');

  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'Accessories', 'Notepad']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  const notepad = desk.locator('.w95-window[data-app="notepad"] textarea');
  await notepad.fill('Remember: buy coffee filters.');
  expect(await textColor(notepad)).toBe('rgb(0, 0, 0)');

  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'America Online', 'America Online']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  const aol = desk.locator('.w95-window[data-app="aol"]');
  expect(await textColor(aol.getByRole('combobox', { name: 'Screen Name' }))).toBe('rgb(0, 0, 0)');
  expect(await textColor(aol.getByLabel('Enter Password:'))).toBe('rgb(0, 0, 0)');
  expect(await textColor(aol.locator('.aol-copyright'))).toBe('rgb(0, 0, 0)');

  // Sign on and open the windows with the most text, then scan everything visible.
  await aol.getByRole('button', { name: 'Setup', exact: true }).click();
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Connection sounds').uncheck();
  await aol.getByRole('region', { name: 'Setup' }).getByLabel('Fast connection (shorter waits)').check();
  await aol.getByRole('region', { name: 'Setup' }).getByRole('button', { name: 'OK' }).click();
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Read New Mail', exact: true }).click();
  await aol.getByText('our menu is on the Web!!').click();
  await expect(aol.locator('.aol-letter-body')).toBeVisible();
  expect(await textColor(aol.locator('.aol-letter-body'))).toBe('rgb(0, 0, 0)');
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'People Connection', exact: true }).click();
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Internet Connection', exact: true }).click();
  await aol.getByRole('button', { name: 'World Wide Web', exact: true }).click();
  await expect(desk.locator('.w95-window[data-app="netscape"] .ns-status-text')).toHaveText('Document: Done.', { timeout: 10_000 });

  const faint = await desk.evaluate((root) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const backgroundOf = (el: Element | null): number[] => {
      for (; el; el = el.parentElement) {
        const [r, g, b, a = 1] = rgb(getComputedStyle(el).backgroundColor);
        if (a > 0.5) return [r!, g!, b!];
      }
      return [255, 255, 255];
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim() || el.closest('[disabled], [aria-disabled="true"]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const [r, g, b] = rgb(getComputedStyle(el).color);
      const bg = backgroundOf(el);
      const white = bg.every((v) => v >= 240);
      if (white && r! > 150 && g! > 150 && b! > 150) out.push(`${el.tagName}.${el.className}: "${n.textContent.trim().slice(0, 30)}"`);
    }
    for (const field of root.querySelectorAll('input, textarea, select')) {
      const [r, g, b] = rgb(getComputedStyle(field).color);
      if (r! > 150 && g! > 150 && b! > 150) out.push(`${field.tagName}.${field.className}`);
    }
    return out;
  });
  expect(faint).toEqual([]);
});
