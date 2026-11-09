import { test, expect } from '@playwright/test';

test('opens settings from the account menu and closes with Escape', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile and password' })).toBeVisible();

  await page.getByRole('link', { name: 'Mailbox accounts', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/accounts$/);
  await expect(page.getByRole('heading', { name: 'Mailbox accounts' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
});

test('deep links to a settings group and filters the navigation', async ({ page }) => {
  await page.goto('/settings/preferences');
  await expect(
    page.getByRole('heading', { name: 'Appearance, language, and time zone' }),
  ).toBeVisible();

  const filter = page.getByLabel('Filter settings');
  await expect(filter).toBeFocused();
  await filter.fill('oauth');

  await page.getByRole('link', { name: 'OAuth applications', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/oauth$/);
  await expect(page.getByRole('heading', { name: 'OAuth applications' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
});
