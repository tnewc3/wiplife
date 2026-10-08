/**
 * Crime careers (E6a), at phone size: the Work tab's crime card (crew, rank,
 * standing and heat as words) and the Money tab's dirty money card (what you
 * hold, laundering it through a business, spending it). Lives are built with
 * the engine on the test content pack (tests/e2e/crimeFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { crimeLife, type CrimeLife } from './crimeFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: CrimeLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, crimeLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

const number = (text: string | null) => Number((text ?? '').replace(/[^0-9]/g, ''));

test('the Work tab shows the crew, your rank, standing and heat as words, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-crime-1' });
  await tab(page, 'Work/School').click();
  const card = page.getByTestId('crime-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('crime-rank')).not.toBeEmpty();
  await expect(page.getByTestId('crime-standing')).toHaveText(/Disrespected|Unproven|Solid|Trusted|Revered/);
  await expect(page.getByTestId('crime-heat')).toHaveText(/Unnoticed|Noticed|Watched|Hot|Burning/);
  await expect(card.getByRole('list', { name: 'People in the crew' }).getByRole('listitem').first()).toBeVisible();
  // Words, not numbers: no bare percentage or score is shown for heat or standing.
  await expect(card).not.toContainText(/\b\d{2,3}\/100\b/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('far from the crew, the card says how long and what the crew thinks, as words', async ({ page }) => {
  await open(page, { seed: 'e2e-crime-away', away: { years: 2, suspicion: 60 } });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('crime-away')).toContainText('2 years');
  await expect(page.getByTestId('crime-suspicion')).toHaveText(/Missed|Wondering|Doubtful|Sure you ran/);
  await expect(page.getByTestId('crime-card')).not.toContainText(/\b\d{2,3}\/100\b/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a life with no crime past has no crime card and no dirty money card', async ({ page }) => {
  await open(page, { seed: 'e2e-crime-2', inCrew: false, dirty: 0, heat: 0 });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('crime-card')).toHaveCount(0);
  await tab(page, 'Money').click();
  await expect(page.getByTestId('dirty-card')).toHaveCount(0);
});

test('dirty money sits apart from savings and can be laundered through a business for a cut', async ({ page }) => {
  await open(page, { seed: 'e2e-crime-3', dirty: 12_000 });
  await tab(page, 'Money').click();
  const card = page.getByTestId('dirty-card');
  await expect(page.getByTestId('dirty-balance')).toHaveText('$12,000');
  await expect(page.getByTestId('savings')).toHaveText('$2,000');
  await expect(card).toContainText('not counted in your net worth');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Nothing can be laundered until an amount is entered.
  const launder = card.getByTestId(/^launder-/).first();
  await expect(launder).toBeDisabled();
  await card.getByTestId('dirty-amount').fill('4000');
  await expect(launder).toBeEnabled();
  await launder.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Launder it' }).click();

  const result = page.getByTestId('dirty-result');
  await expect(result).toBeVisible();
  const balance = number(await page.getByTestId('dirty-balance').textContent());
  const savings = number(await page.getByTestId('savings').textContent());
  const text = (await result.textContent()) ?? '';
  if (/went through/.test(text)) {
    // The cut came off the top: less than the full amount reached savings.
    expect(balance).toBe(8_000);
    expect(savings).toBeGreaterThan(2_000);
    expect(savings).toBeLessThan(2_000 + 4_000);
  } else {
    // Flagged: part of the deposit was lost, and nothing reached savings.
    expect(text).toMatch(/flagged/);
    expect(savings).toBe(2_000);
    expect(balance).toBeLessThan(12_000);
  }
});

test('spending dirty money asks first, and cannot be done for more than you hold', async ({ page }) => {
  await open(page, { seed: 'e2e-crime-4', dirty: 6_000 });
  await tab(page, 'Money').click();
  const card = page.getByTestId('dirty-card');
  const spend = card.getByTestId('spend-dirty');
  await card.getByTestId('dirty-amount').fill('999999');
  await expect(spend).toBeDisabled();
  await card.getByTestId('dirty-amount').fill('2000');
  await expect(spend).toBeEnabled();
  await spend.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('dirty-balance')).toHaveText('$6,000');
  await spend.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Spend it' }).click();
  await expect(page.getByTestId('dirty-balance')).toHaveText('$4,000');
  await expect(page.getByTestId('savings')).toHaveText('$2,000');
  await expect(page.getByTestId('dirty-result')).toContainText('people noticed');
});
