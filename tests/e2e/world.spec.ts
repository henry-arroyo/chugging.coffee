import { expect, test, type Locator, type Page } from '@playwright/test';
import { signOn } from './helpers';

test.setTimeout(90_000);

const win = (desk: Locator, appId: string) => desk.locator(`.w95-window[data-app="${appId}"]`);

async function online(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ctm.host.v1', JSON.stringify({ zoom: 1, size: { width: 800, height: 600 } })));
  await page.goto('?skipboot');
  const desk = page.locator('.w95[data-phase]');
  await signOn(page, 'Night Owl');
  await desk.locator('[data-desktop-icon="aol"]').dblclick();
  const aol = win(desk, 'aol');
  await aol.getByRole('button', { name: 'Setup', exact: true }).click();
  const setup = aol.getByRole('region', { name: 'Setup' });
  await setup.getByLabel('Connection sounds').uncheck();
  await setup.getByLabel('Fast connection (shorter waits)').check();
  await setup.getByRole('button', { name: 'OK' }).click();
  await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
  await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
  return { desk, aol };
}

async function go(ns: Locator, address: string) {
  const field = ns.locator('.ns-location-field');
  await field.fill(address);
  await field.press('Enter');
  await expect(ns.locator('.ns-status-text')).toContainText('Document: Done.', { timeout: 15_000 });
}

test('the Lantern Keeper clue chain: hints, four pieces, the reward document and starting over', async ({ page }) => {
  const { desk, aol } = await online(page);
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Keyword', exact: true }).click();
  await aol.getByLabel('Type the keyword for the area you want to go to:').fill('lighthouse');
  await aol.getByRole('button', { name: 'Go', exact: true }).click();
  const ns = win(desk, 'netscape');
  await expect(ns.getByRole('heading', { name: 'Lantern Point' })).toBeVisible({ timeout: 15_000 });
  await ns.getByRole('button', { name: 'Maximize' }).click();

  await ns.getByRole('link', { name: "Grandpa's logbook" }).click();
  const logbook = ns.locator('.page-logbook');
  await expect(logbook).toContainText('0 of 4 pieces found', { timeout: 15_000 });
  await logbook.getByRole('button', { name: 'Need a hint?' }).click();
  await expect(logbook).toContainText('where people watch the sky');
  await logbook.getByRole('button', { name: 'Another hint' }).click();
  await expect(logbook).toContainText('Northstar Astronomy Club');

  await go(ns, 'http://northstar.test/club/');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done. You found a piece of "The Lantern Keeper\'s Logbook"!');
  await go(ns, 'http://nightowl.test/archive.html');
  await go(ns, 'http://bytemarket.test/classifieds.html');
  await go(ns, 'http://chugging.test/notices.html');
  // Visiting a clue page twice does not count twice.
  await go(ns, 'http://chugging.test/notices.html');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.');

  await go(ns, 'http://lantern.test/logbook.html');
  await expect(logbook).toContainText('4 of 4 pieces found');
  await logbook.getByRole('button', { name: 'Save to My Documents' }).click();
  await expect(logbook).toContainText('Saved to C:\\My Documents\\Keepers Log.txt');
  await logbook.getByRole('button', { name: 'Open it' }).click();
  const notepad = win(desk, 'notepad');
  await expect(notepad.locator('textarea')).toHaveValue(/THE KEEPER'S LOG/);
  await expect(notepad.locator('.w95-title')).toHaveText('Keepers Log.txt - Notepad');

  // Start over forgets the pieces but keeps the saved document.
  await desk.locator(`[data-task-for="${await ns.getAttribute('data-window-id')}"]`).click();
  await logbook.getByRole('button', { name: 'Start over' }).click();
  await logbook.getByRole('button', { name: 'Yes' }).click();
  await expect(logbook).toContainText('0 of 4 pieces found');

  // Progress survives a reload (stored in this browser).
  await go(ns, 'http://northstar.test/club/');
  await page.reload();
  await signOn(page);
  const again = await (async () => {
    await desk.locator('[data-desktop-icon="aol"]').dblclick();
    await aol.getByRole('button', { name: 'Setup', exact: true }).click();
    await aol.getByRole('region', { name: 'Setup' }).getByRole('button', { name: 'OK' }).click();
    await aol.getByRole('button', { name: 'Sign On', exact: true }).click();
    await expect(aol.getByRole('region', { name: 'Main Menu' })).toBeVisible({ timeout: 10_000 });
    await aol.locator('.aol-flashbar').getByRole('button', { name: 'Keyword', exact: true }).click();
    await aol.getByLabel('Type the keyword for the area you want to go to:').fill('lantern');
    await aol.getByRole('button', { name: 'Go', exact: true }).click();
    return win(desk, 'netscape');
  })();
  await go(again, 'http://lantern.test/logbook.html');
  await expect(again.locator('.page-logbook')).toContainText('1 of 4 pieces found');
});

test('Switchboard reaches every site, and the directory search finds them', async ({ page }) => {
  const { desk, aol } = await online(page);
  await aol.locator('.aol-flashbar').getByRole('button', { name: 'Internet Connection', exact: true }).click();
  await aol.getByRole('button', { name: 'World Wide Web', exact: true }).click();
  const ns = win(desk, 'netscape');
  await expect(ns.locator('.ns-status-text')).toHaveText('Document: Done.', { timeout: 15_000 });
  for (const site of ['Chugging Coffee House', 'The Daily Packet', 'Northstar Campus', 'Byte Market', 'Night Owl Bulletin', 'Lantern Point']) {
    await expect(ns.getByRole('link', { name: site, exact: true })).toBeVisible();
  }
  await ns.getByRole('link', { name: 'Search the directory' }).click();
  await expect(ns.getByRole('heading', { name: 'Directory Search' })).toBeVisible({ timeout: 15_000 });
  await ns.getByLabel('Search for:').fill('northstar');
  await ns.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(ns.locator('.page-form li')).toHaveText(/Northstar Campus/);
  // The old /astronomy/ address redirects.
  await go(ns, 'http://northstar.test/astronomy/');
  await expect(ns.getByLabel('Location:')).toHaveValue('http://northstar.test/astro/');
});

test('a new edition of the Web offers a restart without changing the open tab', async ({ page }) => {
  const { desk, aol } = await online(page);
  await expect(aol.getByText('A mystery light at Lantern Point').first()).toBeAttached({ timeout: 10_000 });
  await page.route('**/world/current.json', (route) => route.fulfill({ contentType: 'application/json', body: '{"releaseId":"rel-0003"}' }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const box = win(desk, 'msgbox');
  await expect(box).toContainText('A new edition of the 1995 Web is available.');
  await box.getByRole('button', { name: 'No' }).click();
  // Still on the pinned edition, and not asked again.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(box).toHaveCount(0);
  await expect(aol.getByText('A mystery light at Lantern Point').first()).toBeAttached();
});
