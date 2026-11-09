import { test, expect } from '@playwright/test';
import { OWNER_PASSWORD, OWNER_USERNAME } from './constants';

test.use({ storageState: { cookies: [], origins: [] } });

test('signs out and signs back in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Username', { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();
});
