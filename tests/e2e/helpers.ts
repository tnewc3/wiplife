import { expect, type Page } from '@playwright/test';

export async function passAgeGate(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Content notice' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m 18 or older' }).click();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
}

export async function htmlTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset.theme ?? null);
}
