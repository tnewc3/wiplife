import { expect, test, type Page } from '@playwright/test';
import { passAgeGate } from './helpers';

const sizes = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent?.trim(), h: r.height, w: r.width };
      })
      .filter((b) => b.h < 44 || b.w < 44),
  );
  expect(small).toEqual([]);
}

test('opts into safe-area insets', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

for (const size of sizes) {
  test(`layout holds at ${size.name} (${size.width}×${size.height})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    // The age gate's confirm button is pinned and always reachable.
    await expect(page.getByRole('button', { name: 'I’m 18 or older' })).toBeInViewport({ ratio: 1 });

    await passAgeGate(page);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    await page.getByRole('button', { name: 'New Life' }).click();
    await page.getByRole('button', { name: 'Preview the game layout' }).click();
    const nav = page.getByRole('navigation', { name: 'Game sections' });
    await expect(nav).toBeInViewport({ ratio: 1 });
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBe(size.height);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    // On wide screens the game is a centered column.
    const column = await page.locator('main').boundingBox();
    expect(column!.width).toBeLessThanOrEqual(512);
    if (size.width > 512) {
      expect(Math.abs(column!.x + column!.width / 2 - size.width / 2)).toBeLessThanOrEqual(2);
    }

    await nav.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  });
}
