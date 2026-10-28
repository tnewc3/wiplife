/**
 * Businesses (W3), at phone size on the test content pack: the Work tab's Business card opens the Business
 * screen; you can start a business (kind, style, city, name, who runs it, funding), see its yearly report in
 * words and numbers after a year, set the decisions, hire and let go, look at what is for sale and buy it,
 * and see business money on the Money tab. Lives are built with the engine (tests/e2e/businessFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUp, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, tab } from './helpers';
import { businessLife, type BusinessLife } from './businessFixtures';


async function open(page: Page, options: BusinessLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, businessLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'Job').click();
}

test('the Work tab offers a business, and starting a café with savings works', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-1' });
  await expect(page.getByTestId('business-card')).toContainText('Business');
  await expect(page.getByTestId('business-prompt')).toBeVisible();
  await page.getByTestId('business-open').click();
  await expect(page.getByTestId('business-screen')).toContainText('You don’t own a business yet.');
  await page.getByTestId('start-open').click();
  await expect(page.getByTestId('start-business')).toBeVisible();
  await expect(page.getByTestId('start-confirm')).toBeDisabled();
  await page.getByTestId('kind-cafe').click();
  await page.getByTestId('style-budget').click();
  await page.getByTestId('biz-name').fill('The Grey Heron');
  await expect(page.getByTestId('start-need')).toContainText('in all');
  await expect(page.getByTestId('funding-picker')).toBeVisible();
  await expect(page.getByTestId('funding-summary')).toContainText('You pay');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('start-confirm').click();
  await expect(page.getByTestId('business-screen')).toContainText('The Grey Heron');
  await expect(page.getByTestId('business-screen')).toContainText('Café');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('every funding choice is offered, and a loan shows the bank’s terms', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-2' });
  await page.getByTestId('business-open').click();
  await page.getByTestId('start-open').click();
  await page.getByTestId('kind-bakery').click();
  await page.getByTestId('style-standard').click();
  await page.getByTestId('biz-name').fill('Sunday Rye');
  for (const source of ['savings', 'loan', 'investors', 'cofounder']) await expect(page.getByTestId(`funding-${source}`)).toBeVisible();
  await page.getByTestId('funding-loan').click();
  await expect(page.getByTestId('loan-offer')).toContainText('The bank would lend up to');
  await expect(page.getByTestId('funding-summary')).toContainText('borrow');
  await page.getByTestId('funding-investors').click();
  await expect(page.getByTestId('investor-list')).toBeVisible();
  await page.getByTestId('funding-cofounder').click();
  await expect(page.getByTestId('cofounder-list')).toBeVisible();
  await expectTouchTargets(page);
});

test('a year of trading shows the report in words and numbers, and the Money tab shows business money', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, { seed: 'e2e-biz-3', started: true });
  await expect(page.getByTestId('business-summary')).toContainText('The Grey Heron');
  await ageUp(page);
  await tab(page, 'Job').click();
  await page.getByTestId('business-open').click();
  const panel = page.locator('[data-testid^="business-b"]').first();
  await expect(panel).toContainText('The Grey Heron');
  await expect(panel.locator('[data-testid^="report-words-"]')).toBeVisible();
  await expect(panel.locator('[data-testid^="profit-"]')).toContainText('$');
  await expect(panel).toContainText('Customers');
  await expect(panel).toContainText('Sales');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.keyboard.press('Escape');
  await tab(page, 'Assets').click();
  await expect(page.getByTestId('business-money')).toContainText('The Grey Heron');
  await expect(page.getByTestId('business-money')).toContainText('Your share is worth');
});

test('decisions, who runs it, hiring and letting go', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-4', started: true });
  await page.getByTestId('business-open').click();
  const id = (await page.locator('[data-testid^="business-b"]').first().getAttribute('data-testid'))!.replace('business-', '');
  await page.getByTestId(`decision-${id}-prices-high`).click();
  await expect(page.getByTestId(`decision-${id}-prices-high`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`decision-${id}-marketing-light`).click();
  await expect(page.getByTestId(`decision-${id}-marketing-light`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`role-${id}-manager`).click();
  await expect(page.getByTestId(`role-${id}-manager`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`tab-${id}-team`).click();
  await page.getByTestId(`hire-open-${id}`).click();
  await expect(page.getByTestId('hire-sheet')).toBeVisible();
  await page.getByTestId('hire-new').click();
  await expect(page.getByTestId(`staff-${id}`)).toContainText('barista');
  const fire = page.locator('[data-testid^="fire-"]').first();
  await fire.click();
  await page.getByRole('button', { name: 'Let go' }).last().click();
  await expect(page.locator('[data-testid^="fire-"]')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('what is for sale: browse a city and buy a business', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-5', savings: 3_000_000 });
  await page.getByTestId('business-open').click();
  await page.getByTestId('market-open').click();
  await expect(page.getByTestId('market')).toBeVisible();
  const first = page.locator('[data-testid^="listing-open-"]').first();
  await expect(first).toBeVisible();
  await expectTouchTargets(page);
  await first.click();
  await expect(page.getByTestId('buy-sheet')).toBeVisible();
  await expect(page.getByTestId('buy-price')).toContainText('$');
  await expect(page.getByTestId('funding-picker')).toBeVisible();
  await page.getByTestId('buy-confirm').click();
  await expect(page.getByTestId('business-screen')).toContainText('Worth about');
  await expect(page.locator('[data-testid^="business-b"]')).toHaveCount(1);
});

test('selling a business asks first and then it is gone', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-6', started: true });
  await page.getByTestId('business-open').click();
  const id = (await page.locator('[data-testid^="business-b"]').first().getAttribute('data-testid'))!.replace('business-', '');
  await page.getByTestId(`sell-${id}`).click();
  await expect(page.getByRole('dialog').last()).toContainText('Sell The Grey Heron?');
  await page.getByRole('button', { name: 'Sell it', exact: true }).last().click();
  await expect(page.getByTestId('business-screen')).toContainText('You don’t own a business yet.');
  await expect(page.getByTestId('business-past')).toContainText('The Grey Heron');
});

const firstId = async (page: Page): Promise<string> => (await page.locator('[data-testid^="business-b"]').first().getAttribute('data-testid'))!.replace('business-', '');

test('the products tab sets a line’s price and order level, and next year shows the line’s own result', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, { seed: 'e2e-biz-7', started: true });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-products`).click();
  await expect(page.getByTestId(`products-${id}`)).toContainText('Coffee');
  await page.getByTestId(`line-price-${id}-coffee-high`).click();
  await expect(page.getByTestId(`line-price-${id}-coffee-high`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`line-order-${id}-coffee-heavy`).click();
  await expect(page.getByTestId(`line-order-${id}-coffee-heavy`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId(`line-margin-${id}-coffee`)).toContainText('%');
  await expect(page.getByTestId(`line-supplier-${id}-coffee`)).toContainText('Coffee beans');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.keyboard.press('Escape');
  await ageUp(page);
  await tab(page, 'Job').click();
  await page.getByTestId('business-open').click();
  await page.getByTestId(`tab-${id}-products`).click();
  await expect(page.getByTestId(`line-last-${id}-coffee`)).toContainText('Last year');
  await expect(page.getByTestId(`line-price-${id}-coffee-high`)).toHaveAttribute('aria-checked', 'true');
});

test('the screen reads the economy as a word and each supplier as getting dearer, cheaper or steady', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-8', started: true });
  await page.getByTestId('business-open').click();
  await expect(page.getByTestId('economy-strip')).toBeVisible();
  await expect(page.getByTestId('economy-phase')).toContainText('Economy:');
  await expect(page.getByTestId('supplier-moods')).toContainText(/getting dearer|getting cheaper|steady/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('hiring goes to the place and the role chosen: a hire to the second location is there', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-9', started: true, places: 2, people: 3, savings: 3_000_000 });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-team`).click();
  await expect(page.getByTestId('team-loc-l2')).toBeVisible();
  await expect(page.getByTestId('hc-row-l2-shift_lead')).toContainText('0 named');
  await page.getByTestId(`hire-open-${id}`).click();
  await page.getByTestId('hire-location').selectOption('l2');
  await page.getByTestId('hire-role').selectOption('shift_lead');
  await expectTouchTargets(page);
  await page.getByTestId('hire-new').click();
  await expect(page.getByTestId('hc-row-l2-shift_lead')).toContainText('1 named');
  await expect(page.getByTestId('hc-row-l1-shift_lead')).toContainText('0 named');
});

test('the steppers change a role’s headcount at a place, within its range', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-10', started: true });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-team`).click();
  const count = page.getByTestId('hc-count-l1-barista');
  const before = Number(await count.textContent());
  await page.getByTestId('hc-plus-l1-barista').click();
  await expect(count).toHaveText(String(before + 1));
  await page.getByTestId('hc-minus-l1-barista').click();
  await expect(count).toHaveText(String(before));
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a named person is moved to the other place and made its manager', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-11', started: true, places: 2, named: 1, savings: 3_000_000 });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-team`).click();
  await expect(page.getByTestId('hc-row-l1-barista')).toContainText('1 named');
  await page.locator('[data-testid^="move-open-"]').first().click();
  await expect(page.getByTestId('move-sheet')).toBeVisible();
  await expectTouchTargets(page);
  await page.locator('[data-testid^="move-p"]').first().click();
  await expect(page.getByTestId('hc-row-l2-barista')).toContainText('1 named');
  await page.locator('[data-testid^="appoint-"]').first().click();
  await expect(page.getByTestId('team-manager-l2')).toContainText('Manager:');
  await expectNoHorizontalScroll(page);
});

test('a business that has earned it sells a franchise and lists the franchisee', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-12', started: true, places: 3, franchiseReady: true, savings: 4_000_000 });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-franchise`).click();
  await expect(page.getByTestId(`franchise-conditions-${id}`)).toContainText('✓');
  await page.getByTestId(`franchise-open-${id}`).click();
  await expect(page.getByTestId('franchise-sheet')).toBeVisible();
  await page.getByTestId('franchise-city').selectOption({ index: 3 });
  await page.getByTestId('franchise-royalty-6').click();
  await expect(page.getByTestId('franchise-fee')).toContainText('$');
  await expectTouchTargets(page);
  await page.getByTestId('franchise-confirm').click();
  await expect(page.locator('[data-testid^="franchise-row-"]')).toHaveCount(1);
  await expect(page.getByTestId(`franchise-${id}`)).toContainText('royalty');
  await expectNoHorizontalScroll(page);
});

test('places lists each location with its people and stock, and opens and closes them', async ({ page }) => {
  await open(page, { seed: 'e2e-biz-13', started: true, places: 2, savings: 3_000_000 });
  await page.getByTestId('business-open').click();
  const id = await firstId(page);
  await page.getByTestId(`tab-${id}-places`).click();
  await expect(page.getByTestId('place-l2')).toBeVisible();
  await expect(page.getByTestId('place-people-l1')).toContainText('people');
  await page.getByTestId('close-location-l2').click();
  await expect(page.locator('[data-testid^="place-l"]').filter({ hasText: 'Open since' })).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
