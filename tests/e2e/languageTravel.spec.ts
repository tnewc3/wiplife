/**
 * Batch 10 on a phone: practice a language with a native speaker, pass a certificate exam, take a honeymoon, and bring a family
 * on a working stay abroad. Run on the test content pack, so how an exam or an outing goes is the engine's, with fixed events.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, eventSheet, passAgeGate, playThroughEvents, settle } from './helpers';
import { chicagoLife, examLife, familyStayLife, newlywedLife, withSpanishFriend } from './languageTravelFixtures';
import type { LifeState } from '../../src/engine/types';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, life: LifeState): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

test('practice a language with a native speaker you know: skill and the tie both grow, and it survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, withSpanishFriend(chicagoLife('practice-phone')));
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button').first().click();
  await expect(page.getByTestId('person-name')).toContainText('Lucía');
  const before = await page.getByTestId('person-line').textContent();
  await page.getByTestId('interact-button').click();
  await expect(page.getByTestId('interaction-practice_language')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('interaction-practice_language').click();
  await expect(page.getByTestId('interaction-card')).toBeVisible();
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await page.getByTestId('interaction-done').click();
  await expect(page.getByTestId('interaction-card')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-languages')).toContainText('Spanish');
  expect(before).toBeTruthy();
});

test('pass a certificate exam: the fee has a receipt, the certificate is kept on the Profile and survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, examLife());
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Language to learn').selectOption('fr');
  const exam = page.getByRole('button', { name: /Sit the conversational exam/ });
  await expect(exam).toContainText('$220');
  await expect(exam).toContainText('chance');
  await expect(page.getByRole('button', { name: /Sit the fluent exam/ })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await exam.click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$220');
  await expect(page.getByTestId('event-money')).toContainText('$19,780');
  await playThroughEvents(page);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-certificates')).toContainText('French certificate');
  await expect(page.getByTestId('profile-certificates')).toContainText('Conversational');
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-certificates')).toContainText('French certificate');
  await page.getByLabel('Language to learn').selectOption('fr');
  await expect(page.getByRole('button', { name: /Sit the conversational exam/ })).toBeDisabled();
});

test('take a honeymoon with the spouse you married: priced, paid with a receipt, and not offered a second time', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, newlywedLife());
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Plan a trip', exact: true }).click();
  await page.getByLabel('Kind of trip').selectOption('honeymoon');
  await page.getByLabel('Destination', { exact: true }).selectOption('sydney');
  await page.getByLabel('Budget', { exact: true }).selectOption('comfortable');
  await expect(page.getByTestId('honeymoon-with')).toContainText('Sam Spouse');
  // Comfortable ($2,000) at Sydney's price level (1.4) and a honeymoon's 1.2, for two.
  await expect(page.getByText('Total: $5,040', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Take the honeymoon' }).click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$5,040');
  await expect(page.getByTestId('event-money')).toContainText('$24,960');
  await playThroughEvents(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Plan a trip', exact: true }).click();
  await page.getByLabel('Kind of trip').selectOption('honeymoon');
  await expect(page.getByRole('button', { name: 'Take the honeymoon' })).toBeDisabled();
});

test('bring a partner and children on a working stay abroad: priced per person, they move with you and come home with you', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, familyStayLife());
  await tab(page, 'Work/School').click();
  await page.getByLabel('Work destination').selectOption('london');
  await page.getByLabel('Length or route').selectOption('working_holiday');
  // Children at home keep a solo stay from starting.
  await expect(page.getByRole('button', { name: 'Start temporary work' })).toBeDisabled();
  await page.getByLabel(/Bring my family/).check();
  await expect(page.getByTestId('family-note')).toBeVisible();
  // $1,600 plus $560 for each of three people.
  await expect(page.getByText(/Up front: \$3,280/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Start temporary work' }).click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('£2,591');
  await playThroughEvents(page);
  await expect(page.getByTestId('work-residence')).toContainText('London');
  await expect(page.getByTestId('work-family')).toContainText('Your family is with you.');
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('work-family')).toBeVisible();
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Age Up', exact: true }).click(); await settle(page); await playThroughEvents(page); }
  await expect(page.getByTestId('work-residence')).toHaveCount(0);
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('housing-line')).toContainText('Chicago');
  await tab(page, 'People').click();
  await expect(page.getByRole('list', { name: 'Love' })).toContainText('Sam Spouse');
});
