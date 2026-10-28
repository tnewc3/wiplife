/**
 * The Activities tab (A1), at phone size: the groups and activities of the A1 table, an adults-only activity greyed out for
 * a teenager (tapping it says why), a workout with the price on its button and its outcome card with the new balance, the
 * salon changing the portrait through a chosen style, "Go shopping" on the Assets tab, and the doctor. Lives are built with
 * the engine on the test content pack (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, tab } from './helpers';

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'Activities').click();
}

test('lists every group and activity of the A1 table and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-tab', age: 30 });
  for (const group of ['Mind & body', 'Social', 'Money & luck', 'Leisure']) await expect(page.getByRole('heading', { name: group, exact: true })).toBeVisible();
  for (const id of ['gym', 'meditate', 'read', 'doctor', 'nightlife', 'dating', 'parties', 'lottery', 'casino', 'shopping', 'vacation', 'salon', 'hobbies']) {
    await expect(page.getByTestId(`activity-hub-${id}`)).toBeVisible();
  }
  // "Do your own thing" waits for a connected model.
  await expect(page.getByTestId('activity-hub-own_thing')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('greys out what a teenager is too young for, and says why when tapped', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-teen', age: 15, savings: 2_000 });
  await expect(page.getByTestId('activity-hub-gym')).not.toHaveAttribute('aria-disabled', 'true');
  for (const id of ['nightlife', 'dating', 'casino', 'lottery']) await expect(page.getByTestId(`activity-hub-${id}`)).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('activity-hub-dating').click();
  await expect(page.getByTestId('activity-hub-why-dating')).toContainText('You have to be 18 or older');
  await expectTouchTargets(page);
});

test('a workout shows its price, then an outcome card with the money and your new balance', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-gym', age: 30, savings: 40_000 });
  await page.getByTestId('activity-hub-gym').click();
  const sheet = page.getByRole('dialog', { name: 'Gym' });
  await expect(sheet.getByTestId('do-go_to_the_gym')).toContainText('$');
  await expect(sheet.getByTestId('do-hit_the_gym_hard')).toContainText('$');
  await expectTouchTargets(page);
  await sheet.getByTestId('do-go_to_the_gym').click();
  await expect(sheet.getByTestId('activity-receipt')).toBeVisible();
  await expect(sheet.getByTestId('receipt-money')).toContainText('You now have $');
  // A second workout the same year counts toward the same activity.
  await expect(sheet.getByText('Done 1 of')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the salon changes the portrait through a chosen style', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-salon', age: 28, savings: 40_000 });
  await page.getByTestId('activity-hub-salon').click();
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
  await tab(page, 'Assets').click();
  await page.getByTestId('assets-go-shopping').click();
  const sheet = page.getByRole('dialog', { name: 'Shopping' });
  await expect(sheet.getByTestId('do-buy_a_hat')).toContainText('$');
  await expect(sheet.getByTestId('activity-buy_a_hat').getByRole('group', { name: 'Choose a hat' })).toBeVisible();
  await expectTouchTargets(page);
});

test('hobbies show your skill, and the doctor is under Activities', async ({ page }) => {
  await open(page, { seed: 'e2e-a1-hobby', age: 24, savings: 40_000 });
  await page.getByTestId('activity-hub-hobbies').click();
  const sheet = page.getByRole('dialog', { name: 'Hobbies' });
  await sheet.getByTestId('do-play_chess').click();
  await expect(sheet.getByTestId('activity-receipt')).toBeVisible();
  await expect(sheet.getByTestId('hobby-play_chess')).toContainText('%');
  await page.keyboard.press('Escape');
  await page.getByTestId('activity-hub-doctor').click();
  await expect(page.getByRole('dialog', { name: 'Doctor' }).getByTestId('do-see-doctor')).toBeVisible();
});
