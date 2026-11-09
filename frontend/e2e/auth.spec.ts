import { test, expect } from '@playwright/test';
import { OWNER_PASSWORD, OWNER_USERNAME } from './constants';

test.use({ storageState: { cookies: [], origins: [] } });

test('signs out, signs back in, and shows the notification prompt', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => 'default',
    });
    Object.defineProperty(Notification, 'requestPermission', {
      configurable: true,
      value: async () => 'default',
    });
  });

  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();

  const prompt = page.getByRole('region', { name: 'Turn on browser notifications' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Close' }).click();
  await expect(prompt).toBeHidden();

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();
  await expect(prompt).toBeHidden();

  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Username', { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();
  await expect(prompt).toBeVisible();
});
