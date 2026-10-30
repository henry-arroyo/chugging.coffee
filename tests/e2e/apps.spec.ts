import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signOn } from './helpers';

async function boot(page: Page, { signIn = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await expect(desk.locator('.w95-taskbar')).toBeVisible({ timeout: 10_000 });
  if (signIn) await signOn(page);
  return desk;
}

const win = (desk: Locator, appId: string) => desk.locator(`.w95-window[data-app="${appId}"]`);
const item = (w: Locator, name: string) => w.locator(`[data-item="${name}"]`);

async function menu(w: Locator, top: string, ...path: string[]) {
  await w.getByRole('menubar').getByRole('menuitem', { name: top }).click();
  for (const name of path) await w.page().locator('.w95').getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
}

async function start(desk: Locator, ...path: string[]) {
  await desk.locator('.w95-start-button').click();
  for (const name of path) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
}

async function answer(desk: Locator, button: 'Yes' | 'No' | 'OK' | 'Cancel') {
  const box = win(desk, 'msgbox').last();
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: button }).click();
}

test('sign-on validates the name, and a reload keeps the profile but starts a fresh desktop', async ({ page }) => {
  const desk = await boot(page, { signIn: false });
  const logon = desk.getByRole('dialog', { name: 'Welcome to the Time Machine' });
  await logon.getByRole('textbox').fill('<b>');
  await logon.getByRole('button', { name: 'OK' }).click();
  await expect(logon.getByRole('alert')).toHaveText('Use only letters (A-Z), numbers and spaces.');
  await logon.getByRole('textbox').fill('  Night   Owl ');
  await logon.getByRole('button', { name: 'OK' }).click();
  await expect(logon).toHaveCount(0);
  await start(desk, 'Programs', 'Accessories', 'Clock');
  await page.reload();
  await expect(desk.locator('.w95-taskbar')).toBeVisible();
  await expect(logon).toHaveCount(0);
  await expect(desk.locator('.w95-window')).toHaveCount(0);
  await start(desk, 'Settings', 'Control Panel');
  await item(win(desk, 'control-panel'), 'Users').dblclick();
  await expect(win(desk, 'user-properties').getByRole('textbox')).toHaveValue('Night Owl');
});

test('Notepad saves to My Documents, shows it in Documents, asks before discarding, and survives reload', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Accessories', 'Notepad');
  const pad = win(desk, 'notepad');
  await pad.getByRole('textbox').fill('Packing list:\ncoffee');
  await menu(pad, 'File', 'Save As...');
  const dialog = win(desk, 'filedialog');
  await dialog.getByRole('textbox').fill('trip');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(pad.locator('.w95-title')).toHaveText('trip.txt - Notepad');

  await pad.getByRole('textbox').fill('changed');
  await pad.getByRole('button', { name: 'Close' }).click();
  await expect(win(desk, 'msgbox')).toContainText('The text in the trip.txt file has changed.');
  await answer(desk, 'Cancel');
  await expect(pad).toBeVisible();
  await pad.getByRole('button', { name: 'Close' }).click();
  await answer(desk, 'No');
  await expect(pad).toHaveCount(0);

  await page.reload();
  await expect(desk.locator('.w95-taskbar')).toBeVisible();
  await start(desk, 'Documents', 'trip.txt');
  await expect(win(desk, 'notepad').getByRole('textbox')).toHaveValue('Packing list:\ncoffee');
});

test('Notepad will not overwrite a protected system file', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Run...');
  await page.keyboard.type('C:\\My Documents\\Welcome.txt');
  await page.keyboard.press('Enter');
  const pad = win(desk, 'notepad');
  await expect(pad.getByRole('textbox')).toHaveValue(/Welcome to the Time Machine/);
  await pad.getByRole('textbox').press('End');
  await pad.getByRole('textbox').type(' edited');
  await pad.getByRole('textbox').press('Control+s');
  await expect(win(desk, 'msgbox')).toContainText('protected system file');
  await answer(desk, 'OK');
  await expect(win(desk, 'filedialog')).toBeVisible();
  await win(desk, 'filedialog').getByRole('textbox').fill('My Welcome');
  await win(desk, 'filedialog').getByRole('button', { name: 'Save' }).click();
  await expect(pad.locator('.w95-title')).toHaveText('My Welcome.txt - Notepad');
});

test('Explorer creates, renames, copies, deletes and the Recycle Bin restores', async ({ page }) => {
  const desk = await boot(page);
  await desk.getByRole('option', { name: 'My Computer' }).dblclick();
  const mc = win(desk, 'my-computer');
  await item(mc, '(C:)').dblclick();
  await item(mc, 'My Documents').dblclick();
  await expect(mc.locator('.w95-title')).toHaveText('My Documents');

  // New folder, renamed inline.
  await menu(mc, 'File', 'New', 'Folder');
  const rename = mc.getByRole('textbox', { name: /New name for/ });
  await rename.fill('Trips');
  await rename.press('Enter');
  await expect(item(mc, 'Trips')).toBeVisible();

  // Copy Welcome.txt and paste it into the same folder.
  await item(mc, 'Welcome.txt').click();
  await mc.getByRole('listbox').press('Control+c');
  await item(mc, 'Welcome.txt').press('Control+v');
  await expect(item(mc, 'Copy of Welcome.txt')).toBeVisible();

  // A protected file cannot be deleted.
  await item(mc, 'Welcome.txt').click();
  await item(mc, 'Welcome.txt').press('Delete');
  await expect(win(desk, 'msgbox')).toContainText('protected');
  await answer(desk, 'OK');

  // Delete the copy (confirm), then restore it from the Recycle Bin.
  await item(mc, 'Copy of Welcome.txt').click();
  await item(mc, 'Copy of Welcome.txt').press('Delete');
  await expect(win(desk, 'msgbox')).toContainText('send');
  await answer(desk, 'Yes');
  await expect(item(mc, 'Copy of Welcome.txt')).toHaveCount(0);
  await expect(desk.getByRole('option', { name: 'Recycle Bin' })).toHaveAttribute('data-state', 'full');

  // The folder window covers the desktop icons, so open the Recycle Bin from the keyboard.
  await desk.getByRole('option', { name: 'Recycle Bin' }).focus();
  await page.keyboard.press('Enter');
  const bin = win(desk, 'recycle-bin');
  await item(bin, 'Copy of Welcome.txt').click();
  await menu(bin, 'File', 'Restore');
  await expect(bin).toContainText('The Recycle Bin is empty.');

  // Bring My Documents forward (the bin window covers it), delete again, then empty the bin.
  await desk.locator('.w95-task-button', { hasText: 'My Documents' }).click();
  await expect(item(mc, 'Copy of Welcome.txt')).toBeVisible();
  await item(mc, 'Copy of Welcome.txt').click();
  await item(mc, 'Copy of Welcome.txt').press('Delete');
  await answer(desk, 'Yes');
  await desk.locator('.w95-task-button', { hasText: 'Recycle Bin' }).click();
  await menu(bin, 'File', 'Empty Recycle Bin');
  await expect(win(desk, 'msgbox')).toContainText('cannot be recovered');
  await answer(desk, 'Yes');
  await expect(bin).toContainText('The Recycle Bin is empty.');
  await expect(desk.getByRole('option', { name: 'Recycle Bin' })).toHaveAttribute('data-state', 'empty');
});

test('Explorer shows a folder tree and opens images', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Windows Explorer');
  const ex = win(desk, 'explorer');
  await expect(ex.getByRole('tree')).toContainText('My Documents');
  await item(ex, 'Windows').dblclick();
  await item(ex, 'Wallpapers').dblclick();
  await item(ex, 'Night Sky.bmp').dblclick();
  await expect(win(desk, 'imageview').locator('.w95-title')).toHaveText('Night Sky.bmp - Image Viewer');
  await expect(win(desk, 'imageview').getByRole('img', { name: 'Night Sky.bmp' })).toBeVisible();
});

test('Find searches drive C: by name and contents', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Find', 'Files or Folders...');
  const find = win(desk, 'find');
  await find.getByLabel('Named:').fill('*.txt');
  await find.getByRole('button', { name: 'Find Now' }).click();
  await expect(find.getByRole('status')).toHaveText('2 file(s) found');
  await find.getByLabel('Named:').fill('');
  await find.getByLabel('Containing text:').fill('PROMPT');
  await find.getByRole('button', { name: 'Find Now' }).click();
  await expect(item(find, 'Autoexec.bat')).toBeVisible();
  await item(find, 'Autoexec.bat').dblclick();
  await expect(win(desk, 'notepad').getByRole('textbox')).toHaveValue(/PROMPT \$p\$g/);
});

test('Control Panel: Apply changes the desktop, Cancel keeps what was applied, settings persist', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Settings', 'Control Panel');
  await item(win(desk, 'control-panel'), 'Display').dblclick();
  const display = win(desk, 'display-properties');
  await display.getByRole('tab', { name: 'Appearance' }).click();
  await display.getByLabel('Scheme').selectOption('brick');
  await expect(desk).not.toHaveClass(/w95-scheme-brick/);
  await display.getByRole('button', { name: 'Apply' }).click();
  await expect(desk).toHaveClass(/w95-scheme-brick/);
  await display.getByLabel('Scheme').selectOption('spruce');
  await display.getByRole('button', { name: 'Cancel' }).click();
  await expect(desk).toHaveClass(/w95-scheme-brick/);

  await item(win(desk, 'control-panel'), 'Date/Time').dblclick();
  await win(desk, 'datetime-properties').getByRole('radio', { name: /24-hour/ }).check();
  await win(desk, 'datetime-properties').getByRole('button', { name: 'OK' }).click();
  await expect(desk.locator('.w95-tray time')).toHaveText(/^\d{2}:\d{2}$/);

  await page.reload();
  await expect(desk).toHaveClass(/w95-scheme-brick/);
  await expect(desk.locator('.w95-tray time')).toHaveText(/^\d{2}:\d{2}$/);
});

test('export, reset and import restore everything', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Accessories', 'Notepad');
  await win(desk, 'notepad').getByRole('textbox').fill('keep me');
  await menu(win(desk, 'notepad'), 'File', 'Save As...');
  await win(desk, 'filedialog').getByRole('textbox').fill('keeper');
  await win(desk, 'filedialog').getByRole('button', { name: 'Save' }).click();
  await win(desk, 'notepad').getByRole('button', { name: 'Close' }).click();

  await start(desk, 'Settings', 'Control Panel');
  await item(win(desk, 'control-panel'), 'Time Machine').dblclick();
  const tm = win(desk, 'storage-properties');
  await expect(tm).toContainText('Saved in this browser');
  const downloadPromise = page.waitForEvent('download');
  await tm.getByRole('button', { name: 'Export...' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const save = JSON.parse(readFileSync(file, 'utf8'));
  expect(save.format).toBe('chugging-time-machine-save');
  expect(JSON.stringify(save)).toContain('keep me');

  await tm.getByRole('button', { name: 'Reset...' }).click();
  await answer(desk, 'Yes');
  await answer(desk, 'Yes');
  await signOn(page, 'Someone Else');

  await start(desk, 'Settings', 'Control Panel');
  await item(win(desk, 'control-panel'), 'Time Machine').dblclick();
  await win(desk, 'storage-properties').locator('input[type=file]').setInputFiles(file);
  await answer(desk, 'Yes');
  await expect(win(desk, 'storage-properties').getByRole('status')).toHaveText('Your progress was imported.');
  await start(desk, 'Documents', 'keeper.txt');
  await expect(win(desk, 'notepad').getByRole('textbox')).toHaveValue('keep me');
});

test('Minesweeper: keyboard play, marks, level sizes and resume', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Accessories', 'Games', 'Minesweeper');
  const ms = win(desk, 'minesweeper');
  const cells = ms.getByRole('gridcell');
  await expect(cells).toHaveCount(81);
  const small = (await ms.boundingBox())!.width;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(cells.nth(10)).not.toHaveAttribute('aria-label', /covered/);
  await expect(ms.getByRole('timer')).toBeVisible();
  // Mark a covered cell from the keyboard.
  const covered = ms.getByRole('gridcell', { name: /covered/ }).first();
  await covered.focus();
  await page.keyboard.press('f');
  await expect(ms.getByRole('gridcell', { name: /flagged/ })).toHaveCount(1);
  await expect(ms.getByRole('status')).toHaveAccessibleName('9 mines left');

  await menu(ms, 'Game', 'Expert');
  await expect(cells).toHaveCount(480);
  expect((await ms.boundingBox())!.width).toBeGreaterThan(small * 2);

  // Resume after reload.
  await cells.nth(240).click();
  const revealedBefore = await ms.getByRole('gridcell', { name: /: (empty|\d)$/ }).count();
  await page.reload();
  await start(desk, 'Programs', 'Accessories', 'Games', 'Minesweeper');
  await expect(ms.getByRole('gridcell')).toHaveCount(480);
  if (revealedBefore > 0) await expect(ms.getByRole('gridcell', { name: /: (empty|\d)$/ })).toHaveCount(revealedBefore);
});

test('Solitaire: draw, keyboard pick-up, undo, and resume', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Accessories', 'Games', 'Solitaire');
  const sol = win(desk, 'solitaire');
  const stock = sol.getByRole('button', { name: /Stock/ });
  await expect(stock).toHaveAccessibleName('Stock, 24 cards');
  await stock.click();
  await expect(stock).toHaveAccessibleName('Stock, 21 cards');
  const board = sol.getByRole('application');
  await board.focus();
  await page.keyboard.press('Enter'); // cursor starts on the stock: draw again
  await expect(stock).toHaveAccessibleName('Stock, 18 cards');
  await page.keyboard.press('Control+z');
  await expect(stock).toHaveAccessibleName('Stock, 21 cards');
  await page.reload();
  await start(desk, 'Programs', 'Accessories', 'Games', 'Solitaire');
  await expect(win(desk, 'solitaire').getByRole('button', { name: /Stock/ })).toHaveAccessibleName('Stock, 21 cards');
});

test('window positions are remembered per program', async ({ page }) => {
  const desk = await boot(page);
  await start(desk, 'Programs', 'Accessories', 'Clock');
  const clock = win(desk, 'clock');
  const title = (await clock.locator('.w95-titlebar').boundingBox())!;
  await page.mouse.move(title.x + 40, title.y + 8);
  await page.mouse.down();
  await page.mouse.move(title.x + 240, title.y + 158, { steps: 4 });
  await page.mouse.up();
  const moved = await clock.evaluate((el) => (el as HTMLElement).style.cssText);
  await clock.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await start(desk, 'Programs', 'Accessories', 'Clock');
  await expect.poll(() => win(desk, 'clock').evaluate((el) => (el as HTMLElement).style.cssText)).toBe(moved);
});

test('a second tab is read-only until you choose to use it', async ({ page, context }) => {
  const desk = await boot(page);
  const second = await context.newPage();
  await second.goto('?skipboot');
  await expect(second.getByText('Read-only tab.')).toBeVisible({ timeout: 10_000 });
  await second.getByRole('button', { name: 'Use this tab' }).click();
  await expect(second.getByText('Read-only tab.')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('Read-only tab.')).toBeVisible({ timeout: 10_000 });
  await expect(desk).toBeVisible();
});

test('without browser storage the session says it is temporary', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }));
  const desk = await boot(page, { signIn: false });
  await expect(page.getByText('Temporary session.')).toBeVisible();
  await signOn(page);
  await expect(desk.getByRole('option', { name: 'My Computer' })).toBeVisible();
});
