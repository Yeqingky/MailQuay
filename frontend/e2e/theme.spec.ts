import { test, expect } from '@playwright/test';

test('toggles the theme and keeps it after reload', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await saved;
  await expect(html).toHaveClass(/dark/);

  await page.reload();
  await expect(html).toHaveClass(/dark/);

  const restored = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await restored;
  await expect(html).not.toHaveClass(/dark/);
});
