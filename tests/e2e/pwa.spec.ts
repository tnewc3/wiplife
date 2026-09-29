import { expect, test } from '@playwright/test';
import { passAgeGate } from './helpers';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

test('is installable: manifest with icons and a service worker', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(`/${href!.replace(/^\//, '')}`)).json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: ManifestIcon[];
  };
  expect(manifest.name).toBe('WIPlife');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok()).toBe(true);
  }

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});

test('works offline after the first load, keeping saved settings', async ({ page, context }) => {
  await passAgeGate(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the installed worker controls the page.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New Life' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  await context.setOffline(false);
});

test.describe('without a service worker', () => {
  test.use({ serviceWorkers: 'block' });

  // Control case: proves the offline test above passes because of the worker.
  test('an offline reload fails', async ({ page, context }) => {
    await passAgeGate(page);
    await context.setOffline(true);
    await expect(page.reload()).rejects.toThrow();
    await context.setOffline(false);
  });
});
