/**
 * More → Health, played on the test content pack (tests/e2e/content), where
 * no condition starts on its own and a doctor's visit answers with one
 * predictable card.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, eventSheet, expectNoHorizontalScroll, expectTouchTargets, playThroughEvents, settle, startRandomLife } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

test('More → Health shows your health and lets you see a doctor once a year', async ({ page }) => {
  await startRandomLife(page, { testPack: true, seed: 'e2e-health' });
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible();
  const health = page.getByRole('region', { name: 'Your health' });
  await expect(health.getByRole('meter', { name: 'Health' })).toBeVisible();
  await expect(page.getByTestId('no-conditions')).toBeVisible();
  await expect(page.getByText('Your family takes you and pays the bill.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Seeing a doctor asks first, then answers with an event card.
  await page.getByRole('region', { name: 'See a doctor' }).getByRole('button', { name: 'See a doctor' }).click();
  const confirm = page.getByRole('dialog', { name: 'See a doctor' });
  await expect(confirm).toBeVisible();
  await expectTouchTargets(page);
  await confirm.getByRole('button', { name: 'Go' }).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'The doctor’s office'.replace('’', "'") })).toBeVisible();
  await playThroughEvents(page);

  // Once a year.
  await expect(page.getByTestId('doctor-status')).toHaveText('You saw a doctor this year. You can go again next year.');
  await page.getByRole('button', { name: 'Back to More' }).click();
  await expect(page.getByRole('button', { name: 'Health', exact: true })).toBeVisible();
});

test('More → Health → Mind and mood names nothing until diagnosed, and lets you see a therapist once a year', async ({ page }) => {
  await startRandomLife(page, { testPack: true, seed: 'e2e-mind' });
  // A therapist is for people from age 10: age up until then.
  for (let i = 0; i < 10; i++) {
    await ageUp(page);
  }
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  const mind = page.getByRole('region', { name: 'Mind and mood' });
  await expect(mind).toBeVisible();
  await expect(page.getByTestId('no-mental')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await page.getByRole('region', { name: 'See a therapist' }).getByRole('button', { name: 'See a therapist' }).click();
  const confirm = page.getByRole('dialog', { name: 'See a therapist' });
  await expect(confirm).toBeVisible();
  await expectTouchTargets(page);
  await confirm.getByRole('button', { name: 'Go' }).click();
  await settle(page);
  await playThroughEvents(page);
  await expect(page.getByTestId('therapist-status')).toHaveText('You saw a therapist this year. You can go again next year.');
});
