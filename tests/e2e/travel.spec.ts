import { expect, test } from '@playwright/test';
import { produce } from 'immer';
import { familyLife, loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, eventSheet, openPage, passAgeGate, playThroughEvents, settle, openRow, goTab, closeSheets } from './helpers';

test('More trip planner has a destination, budget and companions; costs and skills survive reload', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = produce(familyLife({ seed: 'travel-phone', age: 25, kids: [], savings: 20000 }), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago'; d.housing.cityId = 'chicago';
    d.character.languages = [{ id: 'en', skill: 100, native: true, lastUsed: d.currentYear }];
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
  });
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await openPage(page, 'trip');
  await page.getByLabel('Destination', { exact: true }).selectOption('kyoto');
  await page.getByLabel('Budget', { exact: true }).selectOption('budget');
  await expect(page.getByText('Total: $1,040', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Take this trip' }).click(); await settle(page);
  // Reload during the saved trip, with visitor residence and both cards still pending.
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('$1,040');
  await expect(page.getByTestId('event-money')).toContainText('$18,960');
  await playThroughEvents(page);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByTestId('profile-languages')).toContainText('Japanese');
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await openPage(page, 'trip');
  await expect(page.getByRole('button', { name: 'Take this trip' })).toBeDisabled();
});

test('Work/School exchange moves temporarily, preserves enrollment and automatically returns', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = produce(familyLife({ seed: 'exchange-phone', age: 20, kids: [], savings: 30000 }), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
    d.education.credentials = [{ type: 'hs_diploma', year: d.birthYear + 18, gpa: 3.2 }];
    d.education.current = { program: 'college', tier: 'state', majorId: 'computer_science', year: 2, lengthYears: 4, gpa: 3.2, boost: 0, repeats: 0, scholarship: 0.5, since: d.currentYear - 1 };
  });
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await page.getByLabel('Partner school city').selectOption('montreal');
  await page.getByLabel('Length or route').selectOption('semester');
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Start exchange' }).click(); await playThroughEvents(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toContainText('Montreal');
  await expect(page.getByTestId('work-residence')).toContainText(String(life.currentYear + 1));
  await page.reload(); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toContainText('Montreal');
  await closeSheets(page); await page.getByRole('button', { name: 'Age up', exact: true }).click(); await playThroughEvents(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toHaveCount(0);
  await openPage(page, 'properties');
  await expect(page.getByTestId('housing-line')).toContainText('Chicago');
});

test('temporary work uses a dated residence, charges a receipt, and returns after two host years', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  const life = produce(familyLife({ seed: 'work-abroad-phone', age: 25, kids: [], savings: 50000 }), (d) => {
    d.character.cityId = d.character.birthCityId = 'chicago';
    d.housing = { kind: 'renting', cityId: 'chicago', annualCost: 12000, since: d.currentYear };
    for (const p of Object.values(d.people)) p.cityId = 'chicago';
  });
  await loadSavedLife(page, life); await page.getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await page.getByLabel('Work destination').selectOption('london');
  await page.getByLabel('Length or route').selectOption('working_holiday');
  await expectNoHorizontalScroll(page); await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Start temporary work' }).click(); await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click(); await settle(page);
  await expect(page.getByTestId('event-money')).toContainText('£1,264');
  await expect(page.getByTestId('event-money')).toContainText('£38,236');
  await playThroughEvents(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toContainText('London');
  await closeSheets(page); await page.getByRole('button', { name: 'Age up', exact: true }).click(); await playThroughEvents(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toContainText('London');
  await closeSheets(page); await page.getByRole('button', { name: 'Age up', exact: true }).click(); await playThroughEvents(page);
  await goTab(page, 'Job');
  await openRow(page, 'find-abroad');
  await expect(page.getByTestId('work-residence')).toHaveCount(0);
  await openPage(page, 'properties');
  await expect(page.getByTestId('housing-line')).toContainText('Chicago');
});
