/**
 * Pets, vehicles and homes (E5), at phone size: More → Belongings, buying and
 * selling, a vet visit, a pet's page in the People tab with the Interact menu,
 * renovating, and the Money tab's upkeep and insurance lines. Lives are built
 * with the engine on the test content pack (tests/e2e/possessionsFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUp, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { belongingsLife, type BelongingsLife } from './possessionsFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: BelongingsLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, belongingsLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function openBelongings(page: Page): Promise<void> {
  await tab(page, 'More').click();
  await page.getByTestId('more-belongings').click();
  await expect(page.getByRole('heading', { name: 'What you own' })).toBeVisible();
}

const sheet = (page: Page) => page.getByRole('dialog').last();

test('Belongings lists what you own with value and condition in words, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-own-1', owns: true, ownsHome: true });
  await openBelongings(page);
  await expect(page.getByTestId('belongings-summary')).toContainText('Upkeep each year');
  const pet = page.getByTestId('belongings-pets');
  await expect(pet).toContainText('Pepper the cat');
  await expect(pet).toContainText('Anxious');
  await expect(pet).toContainText(/Getting used to you|Fond of you/);
  const cars = page.getByTestId('belongings-vehicles');
  await expect(cars).toContainText('sedan');
  await expect(cars).toContainText('Rough');
  await expect(cars).toContainText('insured');
  await expect(page.getByTestId('main-home')).toContainText('$300,000');
  // No bare numbers for condition or bond.
  await expect(cars).not.toContainText(/condition \d/i);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('buys a used car with cash: the price comes out of savings and the car is listed', async ({ page }) => {
  await open(page, { seed: 'e2e-own-2' });
  await openBelongings(page);
  await expect(page.getByTestId('belongings-vehicles')).toContainText('You don’t own a vehicle');
  await page.getByTestId('buy-vehicle').click();
  await sheet(page).getByTestId('vehicle-used-hatchback').click();
  await expect(sheet(page).getByTestId('buy-cash')).toContainText('$');
  await expectTouchTargets(page);
  await sheet(page).getByTestId('buy-cash').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('belongings-vehicles')).toContainText('hatchback');
  await expect(page.getByTestId('belongings-vehicles')).toContainText('insured');
  await tab(page, 'Money').click();
  await expect(page.getByTestId('savings')).not.toHaveText('$600,000');
});

test('buys a car on a loan: a car loan appears among the debts', async ({ page }) => {
  await open(page, { seed: 'e2e-own-3' });
  await openBelongings(page);
  await page.getByTestId('buy-vehicle').click();
  await sheet(page).getByTestId('vehicle-new-sedan').click();
  await sheet(page).getByTestId('buy-loan').click();
  await tab(page, 'Money').click();
  await expect(page.getByRole('list', { name: 'Debts' })).toContainText('Car loan');
});

test('sells the car after a confirmation that says what it brings in', async ({ page }) => {
  await open(page, { seed: 'e2e-own-4', owns: true });
  await openBelongings(page);
  await page.getByRole('button', { name: 'Sell', exact: true }).click();
  await expect(sheet(page)).toContainText('goes to your savings');
  await expect(sheet(page)).toContainText('You now have');
  await sheet(page).getByRole('button', { name: 'Sell it' }).click();
  await expect(page.getByTestId('belongings-vehicles')).toContainText('You don’t own a vehicle');
});

test('adopts a pet by name from a shelter, and sees it in the People tab', async ({ page }) => {
  await open(page, { seed: 'e2e-own-5' });
  await openBelongings(page);
  await page.getByTestId('adopt-pet').click();
  await sheet(page).getByTestId('species-dog').click();
  await expect(sheet(page).getByTestId('adopt-shelter')).toBeDisabled();
  await sheet(page).getByTestId('pet-name').fill('Waffles');
  await expectTouchTargets(page);
  await sheet(page).getByTestId('adopt-shelter').click();
  await expect(page.getByTestId('belongings-pets')).toContainText('Waffles the dog');
  await tab(page, 'People').click();
  const pets = page.getByTestId('people-pets');
  await expect(pets).toContainText('Waffles the dog');
  await expect(pets.getByRole('heading', { name: 'Pets' })).toBeVisible();
});

test('a pet’s page offers the interaction menu, an outcome card, and costs money for a treat', async ({ page }) => {
  await open(page, { seed: 'e2e-own-6', owns: true });
  await tab(page, 'People').click();
  await page.getByTestId(/^pet-row-/).first().click();
  await expect(page.getByTestId('pet-name')).toHaveText('Pepper');
  await expect(page.getByTestId('pet-line')).toContainText('cat');
  await expect(page.getByTestId('pet-state')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('interact-button').click();
  await expect(page.getByTestId('interact-sheet').getByRole('listitem')).toHaveCount(4);
  await page.getByTestId('interaction-treat').click();
  const card = page.getByTestId('interaction-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Give a treat · Pepper');
  await expect(page.getByTestId('interaction-money')).toContainText('$');
  await page.getByTestId('interaction-done').click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to People' }).click();
  await expect(page.getByTestId('people-pets')).toBeVisible();
});

test('takes a pet to the vet from Belongings after a confirmation with the cost', async ({ page }) => {
  await open(page, { seed: 'e2e-own-7', owns: true });
  await openBelongings(page);
  await page.getByTestId(/^vet-/).first().click();
  await expect(sheet(page)).toContainText('The visit costs $');
  await sheet(page).getByRole('button', { name: 'Go to the vet' }).click();
  await expect(page.getByTestId(/^vet-/).first()).toContainText('Seen this year');
});

test('renovates the home you own: paid from savings, and the value goes up', async ({ page }) => {
  await open(page, { seed: 'e2e-own-8', ownsHome: true });
  await openBelongings(page);
  await page.getByTestId('renovate').click();
  await sheet(page).getByTestId('renovate-kitchen-main').click();
  await expect(sheet(page)).toContainText('adds about $');
  await sheet(page).getByRole('button', { name: 'Do it' }).click();
  await expect(page.getByTestId('main-home')).not.toContainText('$300,000');
  await expect(page.getByTestId('main-home')).toContainText('Kitchen remodel');
  // The same renovation can't be done again so soon.
  await page.getByTestId('renovate').click();
  await expect(sheet(page).getByTestId('renovate-kitchen-main')).toBeDisabled();
});

test('buys a vacation home: the down payment comes from savings and it appears among the homes', async ({ page }) => {
  await open(page, { seed: 'e2e-own-9' });
  await openBelongings(page);
  await page.getByTestId('buy-vacation').click();
  await sheet(page).getByTestId('vacation-city-small_town').click();
  await expect(sheet(page)).toContainText('from savings of');
  await sheet(page).getByRole('button', { name: 'Buy it' }).click();
  await expect(page.getByTestId('belongings-homes')).toContainText('Vacation home in');
});

test('after a year, the Money tab shows what upkeep and insurance cost', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { seed: 'e2e-own-10', owns: true });
  await ageUp(page);
  await tab(page, 'Money').click();
  const ledger = page.getByRole('list', { name: /Last year/ }).or(page.getByLabel('Last year’s money'));
  await expect(ledger).toContainText('Upkeep');
  await expect(ledger).toContainText('Insurance');
  await expectNoHorizontalScroll(page);
});
