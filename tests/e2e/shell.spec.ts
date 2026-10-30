import { expect, test, type Locator, type Page } from '@playwright/test';
import { signOn } from './helpers';

const TASKBAR = 28;

async function open(page: Page, { zoom = 1, width = 800, height = 600 } = {}) {
  await page.addInitScript(
    ([z, w, h]) => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: z, size: { width: w, height: h } })),
    [zoom, width, height] as const,
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('?skipboot');
  const desk = page.locator('.w95');
  await expect(desk.locator('.w95-taskbar')).toBeVisible({ timeout: 10_000 });
  await signOn(page);
  return { desk, errors };
}

/** Window rectangle in virtual-desktop pixels (unscaled). */
async function rectOf(win: Locator) {
  return win.evaluate((el) => {
    const s = (el as HTMLElement).style;
    return { x: parseFloat(s.left), y: parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height) };
  });
}

async function startProgram(desk: Locator, path: string[]) {
  await desk.locator('.w95-start-button').click();
  for (const [i, name] of path.entries()) {
    const item = desk.getByRole('menuitem', { name, exact: true });
    if (i < path.length - 1) await item.click();
    else await item.click();
  }
}

const windowFor = (desk: Locator, appId: string) => desk.locator(`.w95-window[data-app="${appId}"]`);

test('boots to the desktop, showing the startup screen and then the sign-on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('');
  const desk = page.locator('.w95');
  await expect(desk.locator('.w95-boot')).toBeVisible();
  await expect(desk.locator('.w95-boot')).toBeHidden({ timeout: 5000 });
  await signOn(page);
  await expect(desk.getByRole('option', { name: 'My Computer' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Start menu cascades with the mouse and starts a program', async ({ page }) => {
  const { desk, errors } = await open(page);
  await startProgram(desk, ['Programs', 'Accessories', 'Clock']);
  const clock = windowFor(desk, 'clock');
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute('data-active', 'true');
  await expect(desk.locator('.w95-menu')).toHaveCount(0);
  await expect(desk.locator('.w95-task-button', { hasText: 'Clock' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Start menu works from the keyboard alone', async ({ page }) => {
  const { desk } = await open(page);
  await desk.getByRole('option', { name: 'My Computer' }).focus();
  await page.keyboard.press('Control+Escape');
  await expect(desk.getByRole('menu', { name: 'Start menu' })).toBeFocused();
  await page.keyboard.press('ArrowRight'); // Programs
  // Opened from the keyboard, the submenu highlights its first item (Accessories). "Accessories" and
  // "America Online" share the access key A, so A cycles between them instead of opening (as in Windows 95).
  const accessories = desk.getByRole('menuitem', { name: 'Accessories' });
  await expect(accessories).toHaveAttribute('data-highlight', 'true');
  await page.keyboard.press('a');
  await expect(desk.getByRole('menuitem', { name: 'America Online' })).toHaveAttribute('data-highlight', 'true');
  await page.keyboard.press('a');
  await expect(accessories).toHaveAttribute('data-highlight', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('c'); // Clock: unique in Accessories, so it starts immediately
  await expect(windowFor(desk, 'clock')).toHaveAttribute('data-active', 'true');

  // Escape closes the menu and returns focus to Start.
  await page.keyboard.press('Control+Escape');
  await page.keyboard.press('Escape');
  await expect(desk.locator('.w95-start-button')).toBeFocused();
});

test('single-instance programs refocus their window instead of opening another', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Programs', 'Accessories', 'Clock']);
  await startProgram(desk, ['Help']);
  await startProgram(desk, ['Programs', 'Accessories', 'Clock']);
  await expect(windowFor(desk, 'clock')).toHaveCount(1);
  await expect(windowFor(desk, 'clock')).toHaveAttribute('data-active', 'true');
});

test('windows move and resize with an outline, then commit on release', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const before = await rectOf(help);
  const title = help.locator('.w95-titlebar');
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 48, { steps: 4 });
  await expect(desk.locator('.w95-drag-outline')).toBeVisible();
  expect(await rectOf(help)).toEqual(before); // contents stay put while dragging
  await page.mouse.up();
  await expect(desk.locator('.w95-drag-outline')).toHaveCount(0);
  expect(await rectOf(help)).toEqual({ ...before, x: before.x + 60, y: before.y + 40 });

  const corner = (await help.locator('.w95-resize[data-edge="se"]').boundingBox())!;
  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x + 54, corner.y + 34, { steps: 4 });
  await page.mouse.up();
  const resized = await rectOf(help);
  expect(resized.width).toBe(before.width + 50);
  expect(resized.height).toBe(before.height + 30);
});

test('pointer coordinates are converted when the desktop is zoomed', async ({ page }) => {
  const { desk } = await open(page, { zoom: 1.5 });
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const before = await rectOf(help);
  // The zoomed desktop is larger than the viewport: scroll (pan) the title bar into view first.
  await help.locator('.w95-titlebar').scrollIntoViewIfNeeded();
  const box = (await help.locator('.w95-titlebar').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 40, { steps: 3 });
  await page.mouse.up();
  expect(await rectOf(help)).toEqual({ ...before, x: before.x + 20, y: before.y + 20 });
});

test('an interrupted drag is abandoned (Escape) and leaves the window in place', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const before = await rectOf(help);
  const box = (await help.locator('.w95-titlebar').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await rectOf(help)).toEqual(before);
  await expect(desk.locator('.w95-drag-outline')).toHaveCount(0);
});

test('maximize fills the work area above the taskbar and restore returns the old size', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const before = await rectOf(help);
  await help.getByRole('button', { name: 'Maximize' }).click();
  expect(await rectOf(help)).toEqual({ x: 0, y: 0, width: 800, height: 600 - TASKBAR });
  await help.locator('.w95-titlebar').dblclick({ position: { x: 100, y: 8 } });
  expect(await rectOf(help)).toEqual(before);
});

test('taskbar buttons activate, minimize and restore', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  await startProgram(desk, ['Programs', 'Accessories', 'Clock']);
  const help = windowFor(desk, 'help');
  const helpButton = desk.locator('.w95-task-button', { hasText: 'Help Topics' });
  await helpButton.click();
  await expect(help).toHaveAttribute('data-active', 'true');
  await helpButton.click();
  await expect(help).toBeHidden();
  await expect(windowFor(desk, 'clock')).toHaveAttribute('data-active', 'true');
  await helpButton.click();
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('data-active', 'true');
});

test('a modal message box blocks only its owner and gives focus back when closed', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  await startProgram(desk, ['Run...']);
  const run = windowFor(desk, 'run');
  await expect(run.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('not-a-program');
  await page.keyboard.press('Enter');
  const box = windowFor(desk, 'msgbox');
  await expect(box).toHaveAttribute('data-active', 'true');
  await expect(box.getByRole('button', { name: 'OK' })).toBeFocused();

  // Clicking the blocked owner (its title bar edge, clear of the box) keeps the focus on the message box.
  await run.click({ position: { x: 20, y: 6 } });
  await expect(box).toHaveAttribute('data-active', 'true');

  // Other windows are not blocked.
  await windowFor(desk, 'help').locator('.w95-titlebar').click({ position: { x: 60, y: 8 } });
  await expect(windowFor(desk, 'help')).toHaveAttribute('data-active', 'true');

  // Back to the box (via its owner), close it, and the owner's field has the focus again.
  await desk.locator('.w95-task-button', { hasText: 'Run' }).click();
  await expect(box).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Enter');
  await expect(box).toHaveCount(0);
  await expect(run).toHaveAttribute('data-active', 'true');
  await expect(run.getByRole('textbox')).toBeFocused();
});

test('Run starts programs by alias', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Run...']);
  await page.keyboard.type('CLOCK.EXE');
  await page.keyboard.press('Enter');
  await expect(windowFor(desk, 'clock')).toBeVisible();
  await expect(windowFor(desk, 'run')).toHaveCount(0);
});

test('window menu Move works from the keyboard', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const before = await rectOf(help);
  await page.keyboard.press('Alt+-');
  await expect(desk.getByRole('menu', { name: /window menu/ })).toBeFocused();
  await page.keyboard.press('m');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await rectOf(help)).toEqual({ ...before, x: before.x + 16, y: before.y + 8 });
});

test('Ctrl+F6 cycles through windows', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  await startProgram(desk, ['Programs', 'Accessories', 'Clock']);
  await page.keyboard.press('Control+F6');
  await expect(windowFor(desk, 'help')).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Control+F6');
  await expect(windowFor(desk, 'clock')).toHaveAttribute('data-active', 'true');
});

test('desktop icons work with the keyboard', async ({ page }) => {
  const { desk } = await open(page);
  const first = desk.getByRole('option', { name: 'My Computer' });
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(desk.getByRole('option', { name: 'Recycle Bin' })).toBeFocused();
  await expect(desk.getByRole('option', { name: 'Recycle Bin' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(windowFor(desk, 'recycle-bin')).toContainText('The Recycle Bin is empty.');
});

test('Taskbar Properties: Apply, Cancel and OK behave correctly', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Settings', 'Taskbar...']);
  const props = windowFor(desk, 'taskbar-properties');
  const clockBox = props.getByRole('checkbox', { name: 'Show Clock' });
  const apply = props.getByRole('button', { name: 'Apply' });
  await expect(apply).toBeDisabled();
  await clockBox.uncheck();
  await expect(desk.locator('.w95-tray time')).toBeVisible(); // not applied yet
  await apply.click();
  await expect(desk.locator('.w95-tray time')).toHaveCount(0);
  await expect(apply).toBeDisabled();
  await clockBox.check();
  await props.getByRole('button', { name: 'Cancel' }).click();
  await expect(desk.locator('.w95-tray time')).toHaveCount(0); // Cancel keeps what was applied
  await startProgram(desk, ['Settings', 'Taskbar...']);
  await windowFor(desk, 'taskbar-properties').getByRole('checkbox', { name: 'Show Clock' }).check();
  await windowFor(desk, 'taskbar-properties').getByRole('button', { name: 'OK' }).click();
  await expect(desk.locator('.w95-tray time')).toBeVisible();
});

test('at 640x480 the taskbar fits and windows stay reachable', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  const help = windowFor(desk, 'help');
  const box = (await help.locator('.w95-titlebar').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await page.getByLabel('Desktop size').selectOption('640x480');
  await expect(desk).toHaveCSS('width', '640px');
  const r = await rectOf(help);
  expect(r.y + 18).toBeLessThanOrEqual(480 - TASKBAR);
  expect(r.x).toBeLessThanOrEqual(640 - 48);
  expect(r.width).toBeLessThanOrEqual(640);
  await help.getByRole('button', { name: 'Maximize' }).click();
  expect(await rectOf(help)).toEqual({ x: 0, y: 0, width: 640, height: 480 - TASKBAR });
});

test('shut down and start again affect only the simulation', async ({ page }) => {
  const { desk } = await open(page);
  await startProgram(desk, ['Help']);
  await startProgram(desk, ['Shut Down...']);
  const dialog = desk.getByRole('dialog', { name: 'Shut Down' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Shut down/ })).toBeFocused();
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(desk.locator('.w95-off')).toBeVisible({ timeout: 5000 });
  await desk.getByRole('button', { name: 'Start again' }).click();
  await expect(desk.locator('.w95-boot')).toBeHidden({ timeout: 5000 });
  await expect(desk.locator('.w95-window')).toHaveCount(0);
  expect(page.url()).toContain('/time-machine/');
});

test('the host lists programs for quick access', async ({ page }) => {
  const { desk } = await open(page);
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await page.getByRole('navigation', { name: 'Programs' }).getByRole('button', { name: 'Clock' }).click();
  await expect(windowFor(desk, 'clock')).toBeVisible();
});
