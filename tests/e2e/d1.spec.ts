/**
 * D1, drugs, at phone size: Activities → Black market → Drug market (buy through the sources, the stash with use and hiding),
 * Activities → Recovery (your habits, quitting), and the Career tab's Dealing role (customers, price, stock and production).
 * Nobody under 18 can open the market.
 */
import { expect, test, type Page } from '@playwright/test';
import { d1Life, type D1Life } from './d1Fixtures';
import { teenLife } from './teenFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, goTab, openHubActivity, openPage, passAgeGate, settle } from './helpers';

async function open(page: Page, options: D1Life): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, d1Life(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

test('the drug market: prices by drug, buying from the market, and a result with the amount and your new balance', async ({ page }) => {
  await open(page, { seed: 'e2e-d1-market' });
  await openHubActivity(page, 'drug_market');
  await expect(page.getByTestId('drug-market')).toBeVisible();
  await expect(page.getByTestId('drug-row-cannabis')).toBeVisible();
  await expect(page.getByTestId('drug-row-heroin')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('drug-row-cannabis').click();
  const sheet = page.getByTestId('drug-buy-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('drug-source-market')).toBeEnabled();
  await expect(sheet.getByTestId('drug-source-dealer')).toBeDisabled();
  await sheet.getByTestId('drug-buy-3').click();
  const result = page.getByTestId('drug-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText(/balance \$/);
  await expect(result).toContainText(/[−+]\$|balance \$/);
});

test('the stash: use a little, hide it, and everything stays within the screen', async ({ page }) => {
  await open(page, { seed: 'e2e-d1-stash', stash: true, dealer: true });
  await openHubActivity(page, 'drug_market');
  await page.getByTestId('drug-tab-stash').click();
  await expect(page.getByTestId('stash-row-cocaine')).toBeVisible();
  await page.getByTestId('stash-row-cannabis').click();
  await page.getByTestId('drug-hide').click();
  await expect(page.getByTestId('stash-row-cannabis')).toContainText('Hidden');
  await page.getByTestId('stash-row-cannabis').click();
  await page.getByTestId('drug-use-light').click();
  await expect(page.getByTestId('drug-result')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByTestId('drug-tab-buy').click();
  await expect(page.getByTestId('dealer-' + (await page.locator('[data-testid^="dealer-"]').first().getAttribute('data-testid'))?.replace('dealer-', ''))).toBeVisible();
});

test('the stash is among your possessions, and opens on its own tab', async ({ page }) => {
  await open(page, { seed: 'e2e-d1-possessions', stash: true });
  await openPage(page, 'possessions');
  await expect(page.getByTestId('belongings-stash')).toContainText('Cocaine');
  await page.getByTestId('open-stash').click();
  await expect(page.getByTestId('stash-row-cocaine')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('recovery: your habits, and quitting a drug you depend on', async ({ page }) => {
  await open(page, { seed: 'e2e-d1-recovery', addicted: true });
  await openHubActivity(page, 'recovery_program');
  await expect(page.getByTestId('recovery-screen')).toBeVisible();
  await expect(page.getByTestId('habit-painkillers')).toContainText('Addicted');
  await expectNoHorizontalScroll(page);
  await page.getByTestId('quit-painkillers').click();
  await expect(page.getByTestId('recovery-result')).toBeVisible();
  await expect(page.getByTestId('habit-painkillers')).toContainText('Quitting');
});

test('the Career tab: dealing needs stock or a way to get it, shows customers and price, and production is a tab', async ({ page }) => {
  await open(page, { seed: 'e2e-d1-deal', dealer: true, stash: true });
  await goTab(page, 'Job');
  await page.getByTestId('special-drugs').click();
  await expect(page.getByTestId('dealing-sheet')).toBeVisible();
  await page.getByTestId('deal-start').click();
  await page.locator('[data-testid^="deal-pick-"]:not([aria-disabled])').first().click();
  await expect(page.getByTestId('deal-customers')).toBeVisible();
  await page.getByTestId('deal-price-open').click();
  await page.getByTestId('deal-price-high').click();
  await expect(page.getByTestId('deal-price-open')).toContainText('High');
  await expect(page.getByTestId('deal-dirty')).toBeVisible();
  await page.getByTestId('dealing-tab-production').click();
  await page.getByTestId('deal-setup-open').click();
  await expect(page.getByTestId('op-start-backroom_grow-cannabis')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('nobody under 18 can open the drug market', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, teenLife({ seed: 'e2e-d1-teen', age: 16 }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Activities');
  await page.getByTestId('activities-category-black_market').click();
  // The row is greyed out (aria-disabled) and tapping it says why.
  await page.getByTestId('activity-hub-drug_market').click({ force: true });
  await expect(page.getByTestId('activity-hub-why-drug_market')).toBeVisible();
  await expect(page.getByTestId('drug-market')).toHaveCount(0);
});
