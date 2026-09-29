import { expect, test } from '@playwright/test';
import { htmlTheme, passAgeGate } from './helpers';

test.describe('theme', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system by default, can be changed and persists', async ({ page }) => {
    await passAgeGate(page);
    expect(await htmlTheme(page)).toBe('dark');

    await page.getByRole('button', { name: 'Settings' }).click();
    const picker = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(picker.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    await picker.getByRole('radio', { name: 'Light' }).click();
    await expect.poll(() => htmlTheme(page)).toBe('light');

    await page.reload();
    await expect.poll(() => htmlTheme(page)).toBe('light');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(picker.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');

    await picker.getByRole('radio', { name: 'System' }).click();
    await expect.poll(() => htmlTheme(page)).toBe('dark');
  });

  test('System tracks the OS setting live', async ({ page }) => {
    await passAgeGate(page);
    expect(await htmlTheme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => htmlTheme(page)).toBe('light');
  });
});

test('content notice can be read from Settings', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'View content notice' }).click();

  const sheet = page.getByRole('dialog', { name: 'Content notice' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('only ever involve adults');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
});

test('reset all data returns to the age gate, and cancel keeps data', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();

  await page.getByRole('button', { name: 'Reset all data' }).click();
  await page.getByRole('dialog', { name: 'Reset all data?' }).getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset all data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();
});

test('Settings shows the app and content versions', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('About')).toContainText(/WIPlife \d+\.\d+\.\d+/);
  await expect(page.getByLabel('About')).toContainText(/Content \d+\.\d+\.\d+\+[0-9a-f]{10}/);
});
