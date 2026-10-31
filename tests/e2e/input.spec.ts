import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

/** Presses Tab (or Shift+Tab) until the focused element's accessible name matches, like a keyboard user would. */
async function tabTo(page: Page, name: string | RegExp, { back = false, max = 60 } = {}) {
  for (let i = 0; i < max; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.matches('button, a, input, select, textarea, [role="option"], [role="menuitem"]')) return '';
      const labelled = (el as HTMLInputElement).labels?.[0]?.textContent;
      return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '').trim();
    });
    if (typeof name === 'string' ? label === name : name.test(label)) return;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Could not reach "${name}" with the keyboard`);
}

test('keyboard only: log on, sign on to AOL, use a keyword, browse, switch windows and sign off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  const logon = desk.getByRole('dialog', { name: 'Welcome to Windows' });
  await expect(logon.getByLabel('User name:')).toBeFocused({ timeout: 10_000 });
  await page.keyboard.type('Night Owl');
  await page.keyboard.press('Enter');
  await expect(logon).toHaveCount(0);

  // Start > Run... > aol
  await page.keyboard.press('Control+Escape');
  await expect(desk.getByRole('menu', { name: 'Start menu' })).toBeVisible();
  await page.keyboard.press('r');
  await expect(desk.locator('.w95-window[data-app="run"]')).toBeVisible();
  await page.keyboard.type('aol');
  await page.keyboard.press('Enter');
  const aol = desk.locator('.w95-window[data-app="aol"]');
  await expect(aol.getByRole('button', { name: 'Sign On', exact: true })).toBeVisible();

  await tabTo(page, 'Setup');
  await page.keyboard.press('Enter');
  const setup = aol.getByRole('region', { name: 'Setup' });
  await tabTo(page, /Connection sounds/);
  await page.keyboard.press('Space');
  await expect(setup.getByLabel('Connection sounds')).not.toBeChecked();
  await tabTo(page, /Fast connection/);
  await page.keyboard.press('Space');
  await tabTo(page, 'OK');
  await page.keyboard.press('Enter');
  await expect(setup).toHaveCount(0);

  await tabTo(page, 'Sign On');
  await page.keyboard.press('Enter');
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('Control+k');
  await expect(aol.getByLabel('Type the keyword for the area you want to go to:')).toBeFocused();
  await page.keyboard.type('coffee');
  await page.keyboard.press('Enter');
  const ns = desk.locator('.w95-window[data-app="netscape"]');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 15_000 });

  // Follow a link with Tab and Enter, then go Back with Alt+Left.
  await page.keyboard.press('Control+l');
  await expect(ns.locator('.ns-location-field')).toBeFocused();
  await tabTo(page, 'Our menu');
  await page.keyboard.press('Enter');
  await expect(ns.locator('.ns-location-field')).toHaveValue('http://chugging.test/menu.html', { timeout: 15_000 });
  // The followed link is gone; focus moves to the new document so the keyboard stays in Netscape.
  await expect(ns.locator('.ns-content')).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(ns.locator('.ns-location-field')).toHaveValue('http://chugging.test/', { timeout: 15_000 });

  // Ctrl+F6 cycles to AOL; Alt+O opens Go To; Sign Off; answer Yes.
  for (let i = 0; i < 4 && (await aol.getAttribute('data-active')) !== 'true'; i++) await page.keyboard.press('Control+F6');
  await expect(aol).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Alt+o');
  await expect(page.locator('.w95').getByRole('menu').last()).toBeVisible();
  await page.keyboard.press('s');
  const box = desk.locator('.w95-window[data-app="msgbox"]');
  await expect(box).toContainText('sign off');
  await tabTo(page, 'Yes');
  await page.keyboard.press('Enter');
  await expect(aol.getByText('Goodbye from America Online!')).toBeVisible({ timeout: 5_000 });
});

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });

  test('taps only: log on, start AOL from the program list, sign on, keyword, follow a link', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Playwright cannot emulate a mobile device in Firefox');
    await page.goto('?skipboot');
    const desk = page.locator('.w95[data-phase]');
    const logon = desk.getByRole('dialog', { name: 'Welcome to Windows' });
    await logon.getByLabel('User name:').tap();
    await page.keyboard.type('Thumbs');
    await logon.getByRole('button', { name: 'OK' }).tap();
    await expect(logon).toHaveCount(0);

    // Desktop icons and folder items open with a double tap (exactly once).
    await desk.locator('[data-desktop-icon="my-computer"]').tap();
    await desk.locator('[data-desktop-icon="my-computer"]').tap();
    const mc = desk.locator('.w95-window[data-app="my-computer"]');
    await expect(mc).toBeVisible();
    await mc.locator('[data-item="(C:)"]').tap();
    await mc.locator('[data-item="(C:)"]').tap();
    await expect(mc.locator('[data-item="My Documents"]')).toBeVisible();

    await page.getByRole('button', { name: 'Programs' }).tap();
    await page.getByRole('navigation', { name: 'Programs' }).getByRole('button', { name: 'America Online' }).tap();
    const aol = desk.locator('.w95-window[data-app="aol"]');
    await aol.getByRole('button', { name: 'Setup', exact: true }).tap();
    const setup = aol.getByRole('region', { name: 'Setup' });
    await setup.getByLabel('Connection sounds').tap();
    await setup.getByLabel('Fast connection (shorter waits)').tap();
    await setup.getByRole('button', { name: 'OK' }).tap();
    await aol.getByRole('button', { name: 'Sign On', exact: true }).tap();
    await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
    await aol.locator('.aol-flashbar').getByRole('button', { name: 'Keyword', exact: true }).tap();
    await aol.getByLabel('Type the keyword for the area you want to go to:').fill('coffee');
    await aol.getByRole('button', { name: 'Go', exact: true }).tap();
    const ns = desk.locator('.w95-window[data-app="netscape"]');
    await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 15_000 });
    await ns.getByRole('link', { name: 'Our menu' }).tap();
    await expect(ns.locator('.ns-location-field')).toHaveValue('http://chugging.test/menu.html', { timeout: 15_000 });
  });
});
