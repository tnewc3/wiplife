/**
 * Countries (W4a), at phone size: custom creation asks for a country and then a city in it, the life is lived in that
 * country with its currency, and the Money tab says so. A random life can start in any country.
 */
import { expect, test } from '@playwright/test';
import { createCustomLife, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, tab, type CustomLifeData } from './helpers';

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


test('custom creation asks for a country, then a city in it', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();
  await page.getByLabel('First name').fill('Maya');
  await page.getByLabel('Last name').fill('Fraser');
  await page.getByRole('button', { name: 'Next' }).click();
  // The Look step (P1) is left as it is.
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
  await expect(page.getByText('Step 5 of 7')).toBeVisible();
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

  await expect(page.getByRole('banner')).toContainText('Manchester');
  await tab(page, 'Assets').click();
  const card = page.getByRole('region', { name: 'Money in United Kingdom' });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('country-money')).toContainText('pounds (GBP)');
  await expect(page.getByTestId('savings')).toHaveText('£0');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Saved, and still the same country after reopening.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('banner')).toContainText('Manchester');
});

for (const [country, name] of [['ca', 'Canada'], ['uk', 'United Kingdom'], ['mx', 'Mexico'], [undefined, 'United States']] as const) {
  test(`a random life starts in ${name} when asked for it${country ? '' : ' (a seeded test life is a US life when none is asked for)'}`, async ({ page }) => {
    await passAgeGate(page, { seed: 'c1', ...(country ? { country } : {}) });
    await page.getByRole('button', { name: 'New Life' }).click();
    await page.getByRole('button', { name: 'Start a random life' }).click();
    await tab(page, 'Assets').click();
    await expect(page.getByRole('region', { name: `Money in ${name}` })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}
