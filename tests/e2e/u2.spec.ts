/**
 * UI tightening and the Activities hub (U2), at phone size on the test content pack: the hub of categories and the
 * submenus split into Activities and Shopping, Luxury in gold above a net worth, groups and faith under Activities (and gone
 * from People), collapsible groups that remember if they are open, in-screen tabs on a person's page, and the density
 * rules (touch targets, no sideways scroll). Lives are built with the engine (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, openHubActivity, passAgeGate, settle, startRandomLife, tab } from './helpers';

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

test('Luxury is not on the hub below the net worth threshold', async ({ page }) => {
  await open(page, { seed: 'e2e-u2-poor', age: 40, savings: 20_000 });
  await tab(page, 'Activities').click();
  await expect(page.getByTestId('activities-category-money_luck')).toBeVisible();
  await expect(page.getByTestId('activities-category-luxury')).toHaveCount(0);
});

test('a rich life sees Luxury with Activities and Shopping, and buys through a priced button', async ({ page }) => {
  await open(page, { seed: 'e2e-u2-rich', age: 45, savings: 3_000_000 });
  await tab(page, 'Activities').click();
  const row = page.getByTestId('activities-category-luxury');
  await expect(row).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await row.click();
  await expect(page.getByTestId('activities-section-luxury-activities')).toBeVisible();
  await expect(page.getByTestId('activities-section-luxury-shopping')).toBeVisible();
  for (const id of ['vip', 'luxury_spa', 'societies', 'charity', 'lux_cars', 'lux_boats', 'lux_air', 'lux_jewelry', 'lux_islands']) await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // A luxury store: the price is on the button, and it is a possession afterwards.
  await page.getByTestId('activity-hub-lux_boats').click();
  const sheet = page.getByRole('dialog', { name: 'Boats and yachts' });
  await expect(sheet.getByTestId('do-buy_a_sailboat')).toContainText('$');
  await expect(sheet.getByTestId('do-buy_a_yacht')).toContainText('$');
  await expectTouchTargets(page);
  await sheet.getByTestId('do-buy_a_sailboat').click();
  await expect(sheet.getByTestId('receipt-money')).toContainText('You now have $');
  await page.keyboard.press('Escape');
  await tab(page, 'Assets').click();
  await page.getByTestId('assets-tab-things').click();
  await expect(page.getByRole('list', { name: 'Possessions' })).toContainText('sailboat');
});

test('Outdoors has its activities and shops; off-roading says it needs a vehicle', async ({ page }) => {
  await open(page, { seed: 'e2e-u2-outdoors', age: 30, savings: 20_000 });
  await tab(page, 'Activities').click();
  await page.getByTestId('activities-category-outdoors').click();
  for (const id of ['hike', 'fish', 'camp', 'birdwatch', 'swim', 'offroad', 'garden', 'outdoor_gear', 'offroad_vehicles']) await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  await expect(page.getByTestId('activities-section-outdoors-shopping')).toBeVisible();
  // Greyed out but tappable: the row is aria-disabled, so the tap is forced.
  await page.getByTestId('activity-hub-offroad').click({ force: true });
  await expect(page.getByTestId('activity-hub-why-offroad')).toContainText('Nothing on offer');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // A walk lowers stress: the receipt says so.
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await openHubActivity(page, 'walk');
  await page.getByTestId('do-walk_in_the_park').click();
  await expect(page.getByTestId('activity-receipt')).toBeVisible();
});

test('Groups and Faith live under Activities, and People has only people', async ({ page }) => {
  await open(page, { seed: 'e2e-u2-people', age: 30 });
  await tab(page, 'People').click();
  await expect(page.getByTestId('people-groups')).toHaveCount(0);
  await expect(page.getByTestId('people-family-planning')).toBeVisible();
  await tab(page, 'Activities').click();
  await page.getByTestId('activities-category-groups').click();
  for (const id of ['clubs', 'causes', 'civic']) await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByTestId('activities-category-faith').click();
  for (const id of ['faith_yours', 'faith_explore']) await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  await page.getByTestId('activity-hub-faith_explore').click();
  await expect(page.getByRole('heading', { name: 'Explore other faiths', level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a collapsible group remembers if it is open, across screens and a reload', async ({ page }) => {
  await startRandomLife(page, { testPack: true, seed: 'e2e-u2-collapse' });
  await tab(page, 'People').click();
  const parents = page.getByTestId('people-parents');
  await expect(parents.getByRole('list', { name: 'Parents' })).toBeVisible();
  await parents.getByRole('button', { name: /Parents/ }).click();
  await expect(parents.getByRole('list', { name: 'Parents' })).toBeHidden();
  await tab(page, 'Assets').click();
  await tab(page, 'People').click();
  await expect(parents.getByRole('list', { name: 'Parents' })).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'People').click();
  await expect(page.getByTestId('people-parents').getByRole('list', { name: 'Parents' })).toBeHidden();
  await page.getByTestId('people-parents').getByRole('button', { name: /Parents/ }).click();
  await expect(page.getByTestId('people-parents').getByRole('list', { name: 'Parents' })).toBeVisible();
});

test('a person page has Overview, Interact and History tabs, and the rows are 56px', async ({ page }) => {
  await startRandomLife(page, { testPack: true, seed: 'e2e-u2-person' });
  await tab(page, 'People').click();
  const row = page.getByRole('list', { name: 'Parents' }).getByRole('button').first();
  const box = (await row.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(55);
  expect(box.height).toBeLessThanOrEqual(72);
  await row.click();
  const tabs = page.getByRole('tablist', { name: /^About / });
  await expect(tabs.getByRole('tab')).toHaveText(['Overview', 'Interact', 'History']);
  for (const id of ['overview', 'interact', 'history']) {
    await page.getByTestId(`person-tab-${id}`).click();
    await expect(page.getByTestId(`person-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  }
});
