import { expect, test, type Page } from '@playwright/test';
import { signOn } from './helpers';

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
  const desk = page.locator('.w95[data-phase]');
  await expect(desk.getByRole('dialog', { name: 'Welcome to Windows' })).toBeVisible({ timeout: 10_000 });
  if (!(await desk.getByLabel('User name:').inputValue())) {
    await desk.getByLabel('User name:').fill('Reviewer');
    await page.screenshot({ path: `${OUT}/00-logon.png` });
  }
  await signOn(page);
  return desk;
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

  desk = await open(page);
  await page.addStyleTag({ content: '.w95-tray time { visibility: hidden; }' });
  const start = async (...path: string[]) => {
    await desk.locator('.w95-start-button').click();
    for (const name of path) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  };
  await start('Programs', 'Windows Explorer');
  await desk.locator('.w95-window[data-app="explorer"] [data-item="My Documents"]').dblclick();
  await desk.screenshot({ path: `${OUT}/10-explorer.png` });
  await start('Programs', 'Accessories', 'Notepad');
  await page.keyboard.type('Remember: buy coffee filters.');
  await desk.locator('.w95-window[data-app="notepad"]').getByRole('menubar').getByRole('menuitem', { name: 'File' }).click();
  await desk.getByRole('menu').last().getByRole('menuitem', { name: 'Save As...' }).click();
  await desk.screenshot({ path: `${OUT}/11-notepad-save-as.png` });
  await page.keyboard.press('Escape');
  await start('Settings', 'Control Panel');
  await desk.locator('.w95-window[data-app="control-panel"] [data-item="Display"]').dblclick();
  await desk.screenshot({ path: `${OUT}/12-control-panel-display.png` });
  await page.keyboard.press('Escape');
  await start('Programs', 'Accessories', 'Games', 'Solitaire');
  await desk.locator('.w95-window[data-app="solitaire"]').getByRole('button', { name: 'Maximize' }).click();
  await desk.screenshot({ path: `${OUT}/13-solitaire.png` });
  await start('Programs', 'Accessories', 'Games', 'Minesweeper');
  await page.keyboard.press('Space');
  await desk.screenshot({ path: `${OUT}/14-minesweeper.png` });

  desk = await open(page, 640, 480);
  await page.addStyleTag({ content: '.w95-tray time { visibility: hidden; }' });
  await desk.locator('.w95-start-button').click();
  await desk.getByRole('menuitem', { name: 'Help', exact: true }).click();
  await desk.locator('.w95-window[data-app="help"]').getByRole('button', { name: 'Maximize' }).click();
  await desk.screenshot({ path: `${OUT}/09-maximized-640x480.png` });
});
