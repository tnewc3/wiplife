/**
 * Countries (W4a), at phone size: custom creation asks for a country and then a city in it, the life is lived in that
 * country with its currency, and the Money tab says so. A random life can start in any country.
 */
import { expect, test, type Page } from '@playwright/test';
import { createCustomLife, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, type CustomLifeData } from './helpers';

const BASE: CustomLifeData = {
  first: 'Maya',
  last: 'Fraser',
  category: 'Woman',
  pronouns: 'she/her',
  attractedTo: ['Men'],
  parents: 'Two parents',
  siblings: '1',
  wealth: 'Affluent',
  country: 'United Kingdom',
  city: 'Manchester',
};

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

test('custom creation asks for a country, then a city in it', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();
  await page.getByLabel('First name').fill('Maya');
  await page.getByLabel('Last name').fill('Fraser');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radiogroup', { name: 'Which fits best?' }).getByRole('radio', { name: 'Woman', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'she/her', exact: true }).click();
  await page.getByRole('button', { name: 'Men', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radiogroup', { name: 'Parents' }).getByRole('radio', { name: 'Two parents' }).click();
  await page.getByRole('radiogroup', { name: 'Older siblings' }).getByRole('radio', { name: '1', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Family wealth' }).getByRole('radio', { name: 'Affluent' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // The country step: four countries, no city until one is chosen, and it does not scroll sideways.
  await expect(page.getByText('Step 4 of 6')).toBeVisible();
  const countries = page.getByRole('radiogroup', { name: 'Country' });
  for (const name of ['United States', 'Canada', 'United Kingdom', 'Mexico']) await expect(countries.getByRole('radio', { name })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'City' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose a country')).toBeVisible();

  await countries.getByRole('radio', { name: 'Canada' }).click();
  const cities = page.getByRole('radiogroup', { name: 'City' });
  for (const name of ['Toronto', 'Vancouver', 'Montreal']) await expect(cities.getByRole('radio', { name })).toBeVisible();
  await expect(cities.getByRole('radio', { name: 'Manchester' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Changing the country clears the city: another country has other cities.
  await cities.getByRole('radio', { name: 'Toronto' }).click();
  await countries.getByRole('radio', { name: 'Mexico' }).click();
  await expect(page.getByRole('radiogroup', { name: 'City' }).getByRole('radio', { name: 'Mexico City' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose a city')).toBeVisible();
});

test('a life in the United Kingdom is lived in pounds, with its own rules shown on the Money tab', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, BASE);

  await expect(page.getByText(/^Newborn · Manchester/)).toBeVisible();
  await tab(page, 'Money').click();
  const card = page.getByRole('region', { name: 'Money in United Kingdom' });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('country-money')).toContainText('pounds (GBP)');
  await expect(page.getByTestId('savings')).toHaveText('£0');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Saved, and still the same country after reopening.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/^Newborn · Manchester/)).toBeVisible();
});

test('random lives start in more than one country', async ({ page }) => {
  test.setTimeout(120_000);
  const seen = new Set<string>();
  for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) {
    await page.context().clearCookies();
    await page.evaluate(() => indexedDB.databases().then((dbs) => dbs.forEach((db) => db.name && indexedDB.deleteDatabase(db.name)))).catch(() => undefined);
    await passAgeGate(page, { seed });
    await page.getByRole('button', { name: 'New Life' }).click();
    await page.getByRole('button', { name: 'Start a random life' }).click();
    await tab(page, 'Money').click();
    seen.add((await page.getByRole('region', { name: /^Money in / }).getByRole('heading').textContent())?.trim() ?? '');
    if (seen.size >= 2) break;
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
});
