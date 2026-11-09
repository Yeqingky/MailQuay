import { test, expect } from '@playwright/test';

test('enables desktop notifications for this browser', async ({ page }) => {
  // Headless Chromium reports notification permission as denied, so stub the
  // permission surface while keeping the rest of the page real.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => 'granted',
    });
    Object.defineProperty(Notification, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    });
  });

  await page.goto('/settings/preferences');

  const toggle = page.getByRole('switch', { name: 'Desktop notifications' });
  const sound = page.getByRole('switch', { name: 'Notification sound' });
  await expect(toggle).not.toBeChecked();
  await expect(sound).toBeDisabled();

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(sound).toBeEnabled();

  await sound.click();
  await expect(sound).toBeChecked();

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Desktop notifications' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notification sound' })).toBeChecked();
});
