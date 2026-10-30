import { expect, test, type Page } from '@playwright/test';

/**
 * Captures screens for HUMAN review into tests/visual/pending/. Nothing is compared or approved
 * automatically. Run with: npm run visual:capture
 */
test.skip(!process.env.CAPTURE, 'visual capture runs only with npm run visual:capture');
test.use({ viewport: { width: 800, height: 642 } });

const OUT = 'tests/visual/pending';

async function open(page: Page, width = 800, height = 600) {
  await page.addInitScript(([w, h]) => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: w, height: h } })), [width, height] as const);
  await page.goto('?skipboot');
  return page.locator('.w95');
}

test('capture shell screens', async ({ page }) => {
  let desk = await open(page);
  // Freeze the tray clock text so captures don't differ by the minute.
  await page.addStyleTag({ content: '.w95-tray time { visibility: hidden; }' });
  await desk.screenshot({ path: `${OUT}/01-desktop-800x600.png` });

  await desk.getByRole('option', { name: 'My Computer' }).focus();
  await page.keyboard.press('ArrowDown');
  await desk.screenshot({ path: `${OUT}/02-desktop-icon-keyboard-focus.png` });

  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Programs' }).click();
  await desk.getByRole('menuitem', { name: 'Accessories' }).click();
  await desk.getByRole('menuitem', { name: 'Games' }).click();
  await desk.screenshot({ path: `${OUT}/03-start-menu-cascade.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Programs' }).click();
  await desk.getByRole('menuitem', { name: 'Accessories' }).click();
  await desk.getByRole('menuitem', { name: 'Clock' }).click();
  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Run...' }).click();
  await page.keyboard.type('cmd');
  await page.keyboard.press('Enter');
  await expect(desk.locator('.w95-window[data-app="msgbox"]')).toBeVisible();
  await desk.screenshot({ path: `${OUT}/04-windows-modal-message-box.png` });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Alt+-');
  await desk.screenshot({ path: `${OUT}/05-window-menu.png` });
  await page.keyboard.press('Escape');

  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menu', { name: 'Start menu' }).getByRole('menuitem', { name: 'Settings' }).click();
  await desk.getByRole('menuitem', { name: 'Taskbar...' }).click();
  await desk.screenshot({ path: `${OUT}/06-taskbar-properties.png` });
  await page.keyboard.press('Escape');

  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Shut Down...' }).click();
  await desk.screenshot({ path: `${OUT}/07-shut-down-dialog.png` });
  await desk.getByRole('button', { name: 'Yes' }).click();
  await expect(desk.locator('.w95-off')).toBeVisible({ timeout: 5000 });
  await desk.screenshot({ path: `${OUT}/08-safe-to-turn-off.png` });

  desk = await open(page, 640, 480);
  await page.addStyleTag({ content: '.w95-tray time { visibility: hidden; }' });
  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await desk.locator('.w95-window[data-app="help"]').getByRole('button', { name: 'Maximize' }).click();
  await desk.screenshot({ path: `${OUT}/09-maximized-640x480.png` });
});
