/**
 * Activities (Batch 2a), at phone size: More → Activities grouped by category with the price on each button and only
 * what is on offer to you now, a paid activity with its receipt (the money change and your new balance), and a night
 * out. Lives are built with the engine on the test content pack (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function openActivities(page: Page): Promise<void> {
  await tab(page, 'More').click();
  await page.getByTestId('more-activities').click();
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();
}

test('Activities lists what is on offer by category with the price on each button, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-act-1' });
  await openActivities(page);
  for (const heading of ['Mind & body', 'Salon & spa', 'Plastic surgery', 'Shopping', 'Movie theater', 'Nightlife', 'Outdoor', 'Luxury', 'Love']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  // The price is on the button; a free activity says so.
  await expect(page.getByTestId('do-haircut')).toContainText('Get a haircut · $');
  await expect(page.getByTestId('do-walk_in_the_park')).toContainText('Free');
  // Surgery asks for a price tier first.
  await expect(page.getByTestId('do-rhinoplasty-budget')).toContainText('$');
  await expect(page.getByTestId('do-rhinoplasty-premier')).toContainText('Top surgeon');
  // Only what is on offer: a date night needs a partner, and a single person isn't shown it.
  await expect(page.getByTestId('activity-date_night')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('hides what the drinking age keeps from you, and shows the rest of the night', async ({ page }) => {
  // 19 is an adult but under the US drinking age (21): bars, clubs and house parties are not on offer, comedy and live shows are.
  await open(page, { seed: 'e2e-act-2', age: 19, savings: 20_000 });
  await openActivities(page);
  for (const hidden of ['go_to_a_bar', 'go_clubbing', 'go_to_a_house_party']) {
    await expect(page.getByTestId(`activity-${hidden}`)).toHaveCount(0);
  }
  for (const shown of ['go_to_a_comedy_night', 'see_a_live_show', 'go_to_karaoke', 'rhinoplasty', 'go_speed_dating']) {
    await expect(page.getByTestId(`activity-${shown}`)).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
});

test('a paid activity shows its receipt: the money change and your new balance, and the Money tab agrees', async ({ page }) => {
  await open(page, { seed: 'e2e-act-3', savings: 40_000 });
  await openActivities(page);
  const label = (await page.getByTestId('do-haircut').textContent())!;
  const price = Number(label.match(/\$([\d,]+)/)![1]!.replace(/,/g, ''));
  await page.getByTestId('do-haircut').click();
  const receipt = page.getByTestId('activity-receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByTestId('receipt-text')).not.toBeEmpty();
  await expect(receipt.getByTestId('receipt-money')).toContainText(`−$${price.toLocaleString('en-US')}`);
  await expect(receipt.getByTestId('receipt-money')).toContainText(`You now have $${(40_000 - price).toLocaleString('en-US')}`);
  // Doing it again costs the full price again but gives less; the screen counts it.
  await expect(page.getByTestId('activity-haircut')).toContainText('Done 1 of');
  await tab(page, 'Money').click();
  await expect(page.getByTestId('savings')).toHaveText(`$${(40_000 - price).toLocaleString('en-US')}`);
});

test('a night out at the bar: the receipt shows the tab and the new balance, and it counts toward the yearly limit', async ({ page }) => {
  await open(page, { seed: 'e2e-act-4', savings: 5_000, vice: 5 });
  await openActivities(page);
  const nightlife = page.getByTestId('activities-nightlife');
  await expect(nightlife).toContainText('Go to a bar');
  await nightlife.getByTestId('do-go_to_a_bar').click();
  await expect(page.getByTestId('activity-receipt')).toContainText('You now have $');
  await expect(page.getByTestId('activity-receipt').getByTestId('receipt-money')).toContainText('−$');
  await expect(page.getByTestId('activity-go_to_a_bar')).toContainText('Done 1 of');
  await expectTouchTargets(page);
});
