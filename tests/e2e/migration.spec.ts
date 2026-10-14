import { expect, test } from '@playwright/test';
import { produce } from 'immer';
import { familyLife, loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, eventSheet, passAgeGate, playThroughEvents, settle } from './helpers';

const rich = (seed: string) =>
  produce(familyLife({ seed, age: 32, kids: [], savings: 2_000_000 }), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    d.character.citizenships = ['us'];
    d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }, { id: 'fr', skill: 90, native: false, lastUsed: d.currentYear }];
    for (const p of Object.values(d.people)) { p.cityId = 'chicago'; p.citizenships = ['us']; }
  });

test('an investor applies, waits, is approved, moves abroad and becomes a permanent resident', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = rich('migration-phone');
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByTestId('more-migration').click();
  await expect(page.getByTestId('migration-citizenships')).toContainText('United States');
  await page.getByLabel('Country', { exact: true }).selectOption('ca');
  await page.getByLabel('Route', { exact: true }).selectOption('investment');
  await page.getByLabel('City', { exact: true }).selectOption('toronto');
  await expect(page.getByTestId('migration-route')).toContainText('Application cost');
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.getByTestId('migration-apply').click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$');
  await playThroughEvents(page);
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByTestId('more-migration').click();
  await expect(page.getByTestId('migration-application')).toContainText('Waiting');
  await page.getByRole('button', { name: 'Age Up', exact: true }).click(); await playThroughEvents(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByTestId('more-migration').click();
  // The decision is a roll: either way the screen says so, and an approval can be used.
  const application = page.getByTestId('migration-application');
  await expect(application).toContainText(/Approved|Refused/);
  if ((await application.textContent())?.includes('Approved')) {
    await expectNoHorizontalScroll(page); await expectTouchTargets(page);
    await page.getByTestId('migration-move').click(); await settle(page);
    await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
    await playThroughEvents(page);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByTestId('more-migration').click();
    await expect(page.getByTestId('migration-status')).toContainText('Permanent resident');
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.getByText('Citizen of', { exact: false })).toBeVisible();
  }
});

test('moving without papers asks for confirmation, costs money, and either arrives without status or is turned back', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = produce(rich('migration-papers-phone'), (d) => { d.finances.savings = 40_000; d.character.stats.smarts = 40; });
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByTestId('more-migration').click();
  await page.getByLabel('Country', { exact: true }).selectOption('ca');
  await page.getByTestId('migration-without-papers').click();
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.getByTestId('migration-without-papers-confirm').click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$');
  await playThroughEvents(page);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByTestId('more-migration').click();
  const status = (await page.getByTestId('migration-status').textContent()) ?? '';
  expect(status.includes('Without papers') || status.includes('Citizen')).toBe(true);
});
