import { expect, test } from '@playwright/test';
import { passAgeGate } from './helpers';

test('age gate shows on first launch and is remembered after reload', async ({ page }) => {
  await passAgeGate(page);

  await page.reload();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Content notice' })).toHaveCount(0);
});

test('declining the age gate blocks the game and is not remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I’m under 18' }).click();
  await expect(page.getByRole('heading', { name: 'WIPlife is for adults' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();
});

test('the game layout has four tabs around the Age button, and a menu; no preview button', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await expect(page.getByRole('button', { name: 'Preview the game layout' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Start a random life' }).click();
  const nav = page.getByRole('navigation', { name: 'Game sections' });
  await expect(nav.getByRole('button')).toHaveText(['Career', 'Assets', 'AGE', 'People', 'Activities']);
  await expect(nav.getByRole('button', { name: 'Age up' })).toBeVisible();
  for (const tab of ['Career', 'Assets', 'People', 'Activities']) {
    await nav.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1, name: tab })).toBeVisible();
    await expect(nav.getByRole('button', { name: tab })).toHaveAttribute('aria-current', 'page');
  }
  // The page's back button returns to Home.
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(page.getByTestId('life-log')).toBeVisible();

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByTestId('menu-title').click();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
});
