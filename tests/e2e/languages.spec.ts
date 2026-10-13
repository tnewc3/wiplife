import { produce } from 'immer';
import { expect, test } from '@playwright/test';
import { familyLife, loadSavedLife } from './heirFixtures';
import { createCustomLife, expectNoHorizontalScroll, expectTouchTargets, eventSheet, passAgeGate, playThroughEvents, settle } from './helpers';

test('Montreal native languages appear on the phone-sized Profile sheet and persist', async ({ page }) => {
  await passAgeGate(page, { seed: 'languages-montreal' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, { first: 'Camille', last: 'Tremblay', category: 'Woman', pronouns: 'she/her', attractedTo: ['Men'], parents: 'Two parents', siblings: 'None', wealth: 'Middle class', country: 'Canada', city: 'Montreal' });
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const languages = page.getByTestId('profile-languages');
  await expect(languages).toContainText('French');
  await expect(languages).toContainText('Fluent · Native');
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-languages')).toContainText('French');
});

test('adult classes show their cost, grow skills, save, and cannot be repeated in the year', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = produce(familyLife({ seed: 'languages-class', age: 25, kids: [], savings: 5_000 }), (d) => {
    d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }];
  });
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Language to learn').selectOption('fr');
  const button = page.getByRole('button', { name: /Take language classes/ });
  await expect(button).toContainText('$600');
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await button.click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$600');
  await expect(page.getByTestId('event-money')).toContainText('$4,400');
  await playThroughEvents(page);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-languages')).toContainText('French');
  await expect(page.getByTestId('profile-languages')).toContainText('Basic');
  await page.getByLabel('Language to learn').selectOption('es');
  await expect(page.getByRole('button', { name: /Take language classes/ })).toBeDisabled();
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-languages')).toContainText('French');
  await page.getByLabel('Language to learn').selectOption('es');
  await expect(page.getByRole('button', { name: /Take language classes/ })).toBeDisabled();
});
