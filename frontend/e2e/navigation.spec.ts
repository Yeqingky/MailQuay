import { test, expect } from '@playwright/test';

const globalViews = [
  'All mail',
  'Unread',
  'Sent',
  'Drafts',
  'Trash',
  'Local archive',
  'Task center',
];

test('navigates global views and the task center', async ({ page }) => {
  await page.goto('/');

  const navigation = page.getByRole('navigation', { name: 'Navigation' });
  for (const name of globalViews) {
    await expect(navigation.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole('link', { name: 'Marked', exact: true })).toHaveCount(0);
  await expect(page.getByText('No mailbox accounts yet')).toBeVisible();

  await navigation.getByRole('link', { name: 'Task center', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);

  const taskCenter = page.getByRole('dialog', { name: 'Operations' });
  await expect(taskCenter).toBeVisible();
  await expect(taskCenter.getByRole('tab', { name: 'Operations' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('No operations are in progress.')).toBeVisible();

  await page.getByRole('tab', { name: 'Errors' }).click();
  await expect(page.getByText('No errors.')).toBeVisible();

  await page.getByRole('tab', { name: 'Logs' }).click();
  await expect(page.getByRole('button', { name: 'Copy logs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear logs' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expect(taskCenter).toBeHidden();
});

test('toggles the search panel', async ({ page }) => {
  await page.goto('/');

  const searchButton = page.getByRole('button', { name: 'Search mail' });
  await expect(searchButton).toHaveAttribute('aria-expanded', 'false');

  await searchButton.click();
  await expect(searchButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('search', { name: 'Search mail' })).toBeVisible();
  await expect(page.getByLabel('Search text')).toBeVisible();

  await searchButton.click();
  await expect(searchButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('search', { name: 'Search mail' })).toBeHidden();
});
