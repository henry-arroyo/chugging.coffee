import { expect, test, type Locator, type Page } from '@playwright/test';
import { signOn } from './helpers';

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await signOn(page, 'Night Owl');
  return desk;
}

const win = (desk: Locator, appId: string) => desk.locator(`.w95-window[data-app="${appId}"]`);

async function answer(desk: Locator, button: 'Yes' | 'No' | 'OK' | 'Cancel', text?: RegExp) {
  const box = win(desk, 'msgbox').last();
  await expect(box).toBeVisible();
  if (text) await expect(box).toContainText(text);
  await box.getByRole('button', { name: button }).click();
}

/** Brings a window to the front with its taskbar button (windows may cover each other's title bars). */
async function front(w: Locator) {
  const id = await w.getAttribute('data-window-id');
  await w.page().locator(`[data-task-for="${id}"]`).click();
  await expect(w).toHaveAttribute('data-active', 'true');
}

async function menu(w: Locator, top: string, name: string) {
  await w.getByRole('menubar').getByRole('menuitem', { name: top }).click();
  await w.page().locator('.w95').getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
}

/** Sets the connection options in AOL's Setup window. */
async function setup(aol: Locator, { sound, fast }: { sound: boolean; fast?: boolean }) {
  await aol.getByRole('button', { name: 'Setup', exact: true }).click();
  const box = aol.getByRole('region', { name: 'Setup' });
  await box.getByLabel('Connection sounds').setChecked(sound);
  if (fast !== undefined) await box.getByLabel('Fast connection (shorter waits)').setChecked(fast);
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(box).toHaveCount(0);
}

const flashbar = (aol: Locator, name: string) => aol.locator('.aol-flashbar').getByRole('button', { name, exact: true });

/** Opens AOL from the desktop, turns on fast mode (sound off) and signs on. */
async function aolOnline(desk: Locator) {
  const aol = win(desk, 'aol');
  if ((await aol.count()) === 0) await desk.locator('[data-desktop-icon="aol"]').dblclick();
  await expect(aol.getByRole('combobox', { name: 'Screen Name' })).toHaveValue('Night Owl');
  await expect(aol.getByLabel('Enter Password:')).toHaveValue('************');
  await expect(flashbar(aol, 'Read New Mail')).toBeDisabled();
  await setup(aol, { sound: false, fast: true });
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByText('Step 1')).toBeVisible();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
  await expect(aol.getByRole('heading', { name: 'Welcome, Night Owl!' })).toBeAttached();
  await expect(desk.locator('[data-connection]')).toHaveAttribute('data-connection', 'online');
  return aol;
}

test('AOL signs on, a keyword opens Netscape, pages load progressively and links navigate', async ({ page }) => {
  const desk = await boot(page);
  await expect(desk.locator('[data-connection]')).toHaveAttribute('data-connection', 'offline');
  const aol = await aolOnline(desk);
  await expect(aol.getByRole('button', { name: 'You have mail!' })).toBeVisible();
  await expect(aol.getByText('Chugging Coffee House puts its menu on the World Wide Web')).toBeVisible();

  await flashbar(aol, 'Keyword').click();
  await aol.getByLabel('Type the keyword for the area you want to go to:').fill('Coffee');
  await aol.getByRole('button', { name: 'Go', exact: true }).click();
  const ns = win(desk, 'netscape');
  await expect(ns.getByRole('heading', { name: 'Chugging Coffee House' })).toBeVisible({ timeout: 10_000 });
  await expect(ns.locator('.w95-title')).toHaveText('Netscape - [Chugging Coffee House]');
  await expect(ns.getByLabel('Location:')).toHaveValue('http://chugging.test/');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 10_000 });
  await expect(ns.locator('img[alt="A steaming mug of coffee"]')).toBeVisible();

  // Widgets work inside the page.
  await ns.getByLabel('Cups:').fill('2');
  await expect(ns.locator('output')).toContainText('20 g');

  await ns.getByRole('link', { name: 'Our menu' }).click();
  await expect(ns.getByLabel('Location:')).toHaveValue('http://chugging.test/menu.html', { timeout: 10_000 });
  await ns.getByRole('button', { name: 'Back' }).click();
  await expect(ns.getByLabel('Location:')).toHaveValue('http://chugging.test/', { timeout: 10_000 });
  await expect(ns.getByRole('link', { name: 'Our menu' })).toHaveClass('page-visited');

  // The old .htm address redirects.
  await ns.getByLabel('Location:').fill('chugging.test/menu.htm');
  await ns.getByLabel('Go to:').press('Enter');
  await expect(ns.getByLabel('Location:')).toHaveValue('http://chugging.test/menu.html', { timeout: 10_000 });

  // Bookmarks persist in the profile.
  await menu(ns, 'Bookmarks', 'Add Bookmark');
  await ns.getByRole('menubar').getByRole('menuitem', { name: 'Bookmarks' }).click();
  await expect(page.locator('.w95').getByRole('menu').last().getByRole('menuitem', { name: 'Remove Bookmark' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Netscape reports fictional errors and never reaches the real Internet', async ({ page }) => {
  const desk = await boot(page);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await aolOnline(desk);
  await desk.locator('.w95-start-button').click();
  for (const name of ['Programs', 'Netscape', 'Netscape Navigator']) await desk.getByRole('menu').last().getByRole('menuitem', { name, exact: true }).click();
  const ns = win(desk, 'netscape');
  await expect(ns.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });

  await ns.getByLabel('Location:').fill('http://nowhere.test/');
  await ns.getByLabel('Go to:').press('Enter');
  await answer(desk, 'OK', /unable to locate the server: nowhere\.test/);

  await ns.getByLabel('Location:').fill('http://example.com/');
  await ns.getByLabel('Go to:').press('Enter');
  await answer(desk, 'OK', /only visit the 1995 Web/);

  await ns.getByLabel('Location:').fill('http://chugging.test/secret.html');
  await ns.getByLabel('Go to:').press('Enter');
  await expect(ns.getByRole('heading', { name: 'Not Found' })).toBeVisible({ timeout: 10_000 });

  expect(requests.filter((u) => !u.startsWith('http://localhost:'))).toEqual([]);
});

test('signing off keeps the page on screen, and Netscape needs a connection to load', async ({ page }) => {
  const desk = await boot(page);
  const aol = await aolOnline(desk);
  await flashbar(aol, 'Internet Connection').click();
  await aol.getByRole('button', { name: 'World Wide Web', exact: true }).click();
  const ns = win(desk, 'netscape');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 10_000 });
  const title = await ns.locator('.w95-title').textContent();

  // Signing off asks first.
  await front(aol);
  await menu(aol, 'Go To', 'Sign Off');
  await answer(desk, 'No', /sign off/);
  await expect(desk.locator('[data-connection]')).toHaveAttribute('data-connection', 'online');
  await menu(aol, 'Go To', 'Sign Off');
  await answer(desk, 'Yes');
  await expect(aol.getByText('Goodbye from America Online!')).toBeVisible({ timeout: 5_000 });
  await expect(desk.locator('[data-connection]')).toHaveAttribute('data-connection', 'offline');

  await expect(ns.locator('.w95-title')).toHaveText(title!);
  await front(ns);
  await ns.getByRole('button', { name: 'Reload' }).click();
  await answer(desk, 'OK', /not connected/);
});

test('mail, the scripted chat room and cancelling a sign-on', async ({ page }) => {
  const desk = await boot(page);
  await desk.locator('[data-desktop-icon="aol"]').dblclick();
  const aol = win(desk, 'aol');
  await setup(aol, { sound: false });
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByText('Step 1')).toBeVisible();
  await aol.getByRole('button', { name: 'Cancel' }).click();
  await expect(aol.getByRole('button', { name: 'Sign On', exact: true })).toBeVisible();
  await expect(desk.locator('[data-connection]')).toHaveAttribute('data-connection', 'offline');

  await aolOnline(desk);
  await flashbar(aol, 'Read New Mail').click();
  await aol.getByText('our menu is on the Web!!').click();
  await expect(aol.locator('.aol-letter-body')).toContainText('Hi Night Owl!');
  await flashbar(aol, 'People Connection').click();
  await expect(aol.getByText('Scripted room: the other members are fictional')).toBeVisible();
  const room = aol.getByRole('region', { name: 'Lobby' });
  await expect(room.getByRole('listbox', { name: 'People here' }).getByRole('option', { name: 'Night Owl' })).toBeVisible();
  await room.getByRole('button', { name: 'Bold' }).click();
  await room.getByLabel('Text color').selectOption('green');
  await room.getByLabel('Message').fill('hello lobby');
  await room.getByRole('button', { name: 'Send' }).click();
  await expect(room.getByRole('log')).toContainText('Night Owl: hello lobby');
  await expect(room.getByRole('log').getByText('hello lobby')).toHaveClass(/aol-b/);
  await room.getByRole('option', { name: 'ModemMike' }).dblclick();
  await answer(desk, 'OK', /486DX2/);

  // Closing AOL while online asks, then signs off.
  await aol.locator('[aria-label="Close"]').first().click();
  await answer(desk, 'Yes', /sign off/);
  await expect(aol).toHaveCount(0);
  await expect(desk.locator('[data-connection]')).not.toHaveAttribute('data-connection', 'online');
});

test('the synthesized modem sound plays during sign-on without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    (window as unknown as { ctmAudioContexts: number }).ctmAudioContexts = 0;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        (window as unknown as { ctmAudioContexts: number }).ctmAudioContexts++;
      }
    };
  });
  const desk = await boot(page);
  await desk.locator('[data-desktop-icon="aol"]').dblclick();
  const aol = win(desk, 'aol');
  await setup(aol, { sound: true, fast: true });
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (window as unknown as { ctmAudioContexts: number }).ctmAudioContexts)).toBe(1);
  expect(errors).toEqual([]);
});

test('the Main Menu departments open AOL areas, Netscape and department windows', async ({ page }) => {
  const desk = await boot(page);
  const aol = await aolOnline(desk);
  const mainMenu = aol.getByRole('region', { name: 'Main Menu' });
  await expect(mainMenu.locator('.aol-department')).toHaveCount(14);
  await mainMenu.getByRole('button', { name: "Today's News" }).click();
  await expect(aol.getByRole('region', { name: "Today's News" })).toContainText('Switchboard directory passes 1,000 listings');
  await mainMenu.getByRole('button', { name: 'Sports' }).click();
  await expect(aol.getByRole('region', { name: 'Sports' })).toContainText('Scores and standings');
  await mainMenu.getByRole('button', { name: 'Reference Desk' }).click();
  await expect(win(desk, 'netscape').locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 10_000 });
});
