import { mkdir } from 'node:fs/promises';
import { test as setup, expect } from '@playwright/test';
import {
  OWNER_PASSWORD,
  OWNER_USERNAME,
  SETUP_TOKEN,
  STORAGE_STATE,
} from './constants';

setup('create the owner account', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel('Setup token').fill(SETUP_TOKEN);
  await page.getByLabel('Username', { exact: true }).fill(OWNER_USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel('Confirm new password').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Create owner' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible();

  await mkdir('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
