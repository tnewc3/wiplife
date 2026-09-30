import { expect, test } from '@playwright/test';
import { createCustomLife, expectNoHorizontalScroll, expectTouchTargets, LONG_NAME_LIFE, passAgeGate } from './helpers';

const sizes = [
  { name: 'small phone', width: 360, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

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
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    // Every custom creation step fits, with a very long name and custom pronouns.
    await createCustomLife(page, LONG_NAME_LIFE, async () => {
      await expectNoHorizontalScroll(page);
      await expectTouchTargets(page);
    });
    await expect(page.getByTestId('character-name')).toContainText(LONG_NAME_LIFE.last);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

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

    // The People list and a person's page fit, with the long family name.
    await nav.getByRole('button', { name: 'People', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Family' })).toContainText(LONG_NAME_LIFE.last);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    await page.getByRole('list', { name: 'Family' }).getByRole('button', { name: LONG_NAME_LIFE.last }).first().click();
    await expect(page.getByTestId('person-name')).toContainText(LONG_NAME_LIFE.last);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    await nav.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  });
}
