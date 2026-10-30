import { expect, type Page } from '@playwright/test';

/** Logs on at the Windows-style logon. Without a name, keeps the prefilled one (or uses "Tester"). */
export async function signOn(page: Page, name?: string) {
  const logon = page.locator('.w95[data-phase]').getByRole('dialog', { name: 'Welcome to Windows' });
  await expect(logon).toBeVisible({ timeout: 10_000 });
  const user = logon.getByLabel('User name:');
  if (name !== undefined) await user.fill(name);
  else if ((await user.inputValue()) === '') await user.fill('Tester');
  await logon.getByRole('button', { name: 'OK' }).click();
  await expect(logon).toHaveCount(0);
}
