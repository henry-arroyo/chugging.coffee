import { expect, type Page } from '@playwright/test';

export async function signOn(page: Page, name = 'Tester') {
  const logon = page.locator('.w95[data-phase]').getByRole('dialog', { name: 'Welcome to the Time Machine' });
  await expect(logon).toBeVisible();
  await logon.getByRole('textbox').fill(name);
  await logon.getByRole('button', { name: 'OK' }).click();
  await expect(logon).toHaveCount(0);
}
