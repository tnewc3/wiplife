/**
 * Activities (Batch 2a, in the U2 hub), at phone size: the sheet of each activity, with its options with the price on each button and only
 * what is on offer to you now, a paid activity with its receipt (the money change and your new balance), and a night
 * out. Lives are built with the engine on the test content pack (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, openHubActivity, passAgeGate, settle, tab } from './helpers';


async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

/** The sheet of one activity of the hub (U2: Activities tab, its category, the activity). */
async function openSheet(page: Page, hubId: string): Promise<void> {
  await openHubActivity(page, hubId);
  await expect(page.getByTestId(`activity-sheet-${hubId}`)).toBeVisible();
}

test('the sheets list what is on offer with the price on each button, and fit a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-act-1' });
  // The price is on the button; a free activity says so.
  await openSheet(page, 'salon');
  await expect(page.getByTestId('do-haircut')).toContainText('Get a haircut · $');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.keyboard.press('Escape');
  await tab(page, 'Activities').click();
  await openSheet(page, 'walk');
  await expect(page.getByTestId('do-walk_in_the_park')).toContainText('Free');
  await page.keyboard.press('Escape');
  await tab(page, 'Activities').click();
  // Surgery asks for a price tier first.
  await openSheet(page, 'cosmetic');
  await expect(page.getByTestId('do-rhinoplasty-budget')).toContainText('$');
  await expect(page.getByTestId('do-rhinoplasty-premier')).toContainText('Top surgeon');
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await tab(page, 'Activities').click();
  // Only what is on offer: a date night needs a partner, and a single person isn't shown it.
  await openSheet(page, 'dating');
  await expect(page.getByTestId('activity-date_night')).toHaveCount(0);
  await expect(page.getByTestId('activity-go_speed_dating')).toBeVisible();
});

test('hides what the drinking age keeps from you, and shows the rest of the night', async ({ page }) => {
  // 19 is an adult but under the US drinking age (21): bars, clubs and house parties are not on offer, comedy and live shows are.
  await open(page, { seed: 'e2e-act-2', age: 19, savings: 20_000 });
  await openSheet(page, 'nightlife');
  for (const hidden of ['go_to_a_bar', 'go_clubbing']) await expect(page.getByTestId(`activity-${hidden}`)).toHaveCount(0);
  for (const shown of ['go_to_a_comedy_night', 'see_a_live_show', 'go_to_karaoke']) await expect(page.getByTestId(`activity-${shown}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await tab(page, 'Activities').click();
  await openSheet(page, 'parties');
  await expect(page.getByTestId('activity-go_to_a_house_party')).toHaveCount(0);
});

test('a paid activity shows its receipt: the money change and your new balance, and the Money tab agrees', async ({ page }) => {
  await open(page, { seed: 'e2e-act-3', savings: 40_000 });
  await openSheet(page, 'salon');
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
  await page.keyboard.press('Escape');
  await tab(page, 'Assets').click();
  await expect(page.getByTestId('savings')).toHaveText(`$${(40_000 - price).toLocaleString('en-US')}`);
});

test('a night out at the bar: the receipt shows the tab and the new balance, and it counts toward the yearly limit', async ({ page }) => {
  await open(page, { seed: 'e2e-act-4', savings: 5_000, vice: 5 });
  await openSheet(page, 'nightlife');
  const sheet = page.getByTestId('activity-sheet-nightlife');
  await expect(sheet).toContainText('Go to a bar');
  await sheet.getByTestId('do-go_to_a_bar').click();
  await expect(page.getByTestId('activity-receipt')).toContainText('You now have $');
  await expect(page.getByTestId('activity-receipt').getByTestId('receipt-money')).toContainText('−$');
  await expect(page.getByTestId('activity-go_to_a_bar')).toContainText('Done 1 of');
  await expectTouchTargets(page);
});
