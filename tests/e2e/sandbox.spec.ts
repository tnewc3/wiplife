/**
 * The event sandbox (Stage 10): a development-only screen, built into test
 * builds and opened with ?sandbox. It previews real events with any pronoun
 * set and character state.
 */
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectTouchTargets } from './helpers';

test('the event sandbox previews an event with chosen pronouns and shows an outcome', async ({ page }) => {
  await page.goto('/?sandbox');
  await expect(page.getByRole('heading', { name: 'Event sandbox', level: 1 })).toBeVisible();

  await page.getByLabel('Event').selectOption('stranger_on_the_bench');
  await page.getByLabel('Cast pronouns').selectOption('xe_xem');
  await page.getByLabel('Age', { exact: true }).fill('45');
  await expect(page.getByTestId('sandbox-text')).toContainText('Xe introduces xemself');
  await expect(page.getByRole('list', { name: 'Cast' })).toContainText('stranger:');

  await page.getByLabel('Cast pronouns').selectOption('they_them');
  await expect(page.getByTestId('sandbox-text')).toContainText('They introduce themself');

  await page.getByRole('button', { name: 'Listen' }).click();
  await expect(page.getByTestId('sandbox-outcome')).toContainText('the bench is empty');

  // A choice this state hides is shown, but can't be picked.
  await page.getByLabel('Event').selectOption('treehouse');
  await page.getByLabel('Age', { exact: true }).fill('9');
  await expect(page.getByRole('button', { name: /after last time.*hidden in this state/ })).toBeDisabled();

  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
