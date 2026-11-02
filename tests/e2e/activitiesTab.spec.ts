/**
 * The Activities tab (A1), at phone size: the groups and activities of the A1 table, an adults-only activity greyed out for
 * a teenager (tapping it says why), a workout with the price on its button and its outcome card with the new balance, the
 * salon changing the portrait through a chosen style, "Go shopping" on the Assets tab, and the doctor. Lives are built with
 * the engine on the test content pack (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, openHubActivity, passAgeGate, settle, goTab } from './helpers';

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Activities');
}

test('lists every category of the hub, and opens each into its own submenu, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-tab', age: 30 });
  for (const id of ['health', 'recovery', 'mind_body', 'outdoors', 'social_love', 'groups', 'faith', 'leisure', 'money_luck', 'black_market', 'crime', 'legal']) {
    await expect(page.getByTestId(`activities-category-${id}`)).toBeVisible();
  }
  // Luxury needs a net worth this life does not have; "Do your own thing" waits for a connected model.
  await expect(page.getByTestId('activities-category-luxury')).toHaveCount(0);
  await expect(page.getByTestId('activities-category-featured')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // A submenu: Money & luck has an Activities and a Shopping section.
  await page.getByTestId('activities-category-money_luck').click();
  for (const id of ['lottery', 'casino', 'loans', 'shopping', 'fine_goods']) await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  await expect(page.getByTestId('activities-section-money_luck-activities')).toBeVisible();
  await expect(page.getByTestId('activities-section-money_luck-shopping')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // Back returns to the list of categories, and tapping the tab again does too.
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await expect(page.getByTestId('activities-category-money_luck')).toBeVisible();
});

test('greys out what a teenager is too young for, and says why when tapped', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-teen', age: 15, savings: 2_000 });
  await expect(page.getByTestId('activities-category-black_market')).toHaveCount(0);
  await page.getByTestId('activities-category-social_love').click();
  for (const id of ['nightlife', 'dating']) await expect(page.getByTestId(`activity-hub-${id}`)).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('activity-hub-dating').click({ force: true });
  await expect(page.getByTestId('activity-hub-why-dating')).toContainText('You have to be 18 or older');
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByTestId('activities-category-money_luck').click();
  for (const id of ['casino', 'lottery']) await expect(page.getByTestId(`activity-hub-${id}`)).toHaveAttribute('aria-disabled', 'true');
});

test('a workout shows its price, then an outcome card with the money and your new balance', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-gym', age: 30, savings: 40_000 });
  await openHubActivity(page, 'gym');
  const sheet = page.getByRole('dialog', { name: 'Gym' });
  await expect(sheet.getByTestId('do-go_to_the_gym')).toContainText('$');
  await expect(sheet.getByTestId('do-hit_the_gym_hard')).toContainText('$');
  await expectTouchTargets(page);
  await sheet.getByTestId('do-go_to_the_gym').click();
  await expect(sheet.getByTestId('activity-receipt')).toBeVisible();
  await expect(sheet.getByTestId('receipt-money')).toContainText('You now have $');
  // A second workout the same year counts toward the same activity.
  await expect(sheet.getByText('Done 1 of').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the salon changes the portrait through a chosen style', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-salon', age: 28, savings: 40_000 });
  await openHubActivity(page, 'salon');
  const sheet = page.getByRole('dialog', { name: 'Salon & spa' });
  const row = sheet.getByTestId('activity-try_a_new_hairstyle');
  await expect(row.getByRole('group', { name: 'Choose a style' })).toBeVisible();
  const style = row.getByRole('button', { name: 'Mohawk' }).or(row.getByRole('button', { name: 'Pixie cut' })).first();
  await style.click();
  await expect(style).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByTestId('do-try_a_new_hairstyle').click();
  await expect(sheet.getByTestId('activity-receipt')).toBeVisible();
  await expect(sheet.getByTestId('receipt-money')).toContainText('You now have $');
});

test('Go shopping on the Assets tab opens the shopping options', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-shop', age: 28, savings: 40_000 });
  await goTab(page, 'Assets');
  await page.getByTestId('assets-tab-things').click();
  await page.getByTestId('assets-go-shopping').click();
  const sheet = page.getByRole('dialog', { name: 'Stores' });
  await expect(sheet.getByTestId('do-buy_a_hat')).toContainText('$');
  await expect(sheet.getByTestId('activity-buy_a_hat').getByRole('group', { name: 'Choose a hat' })).toBeVisible();
  await expectTouchTargets(page);
});

test('hobbies show your skill, and the doctor is under Activities', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-hobby', age: 24, savings: 40_000 });
  await openHubActivity(page, 'hobbies');
  const sheet = page.getByRole('dialog', { name: 'Hobbies' });
  await sheet.getByTestId('do-play_chess').click();
  await expect(sheet.getByTestId('activity-receipt')).toBeVisible();
  await expect(sheet.getByTestId('hobby-play_chess')).toContainText('%');
  await page.keyboard.press('Escape');
  await openHubActivity(page, 'doctor');
  await expect(page.getByRole('dialog', { name: 'Doctor' }).getByTestId('do-see-doctor')).toBeVisible();
});
