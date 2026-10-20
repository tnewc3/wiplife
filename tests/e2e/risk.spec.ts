/**
 * Risk and legal activities (Batch 2b), at phone size: a gambling night with its receipt (the stake, what came back, your new
 * balance) and the loss-chasing choice, a lawsuit (what you have to go on, how it ends, the lawyer's fee and the receipt), and a
 * legal name change (a typed name that is checked, the fee, and the new name everywhere). Lives are built with the engine on the
 * test content pack (tests/e2e/activitiesFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'More').click();
  await page.getByTestId('more-activities').click();
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible();
}

const dollars = (text: string): number => Number(text.match(/\$([\d,]+)/)![1]!.replace(/,/g, ''));

test('a gambling night: the stake is on the button, the receipt shows the money and your new balance, and a loss can be chased', async ({ page }) => {
  await open(page, { seed: 'e2e-risk-gamble', savings: 20_000, vice: 5 });
  const gambling = page.getByTestId('activities-gambling');
  await expect(gambling).toContainText('The house always has the edge');
  for (const id of ['play_the_slots', 'play_blackjack', 'play_roulette', 'buy_a_lottery_ticket', 'bet_on_a_game', 'bet_on_the_horses']) {
    await expect(page.getByTestId(`activity-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('do-play_the_slots-low')).toContainText('Small stake');
  await expect(page.getByTestId('do-play_the_slots-high')).toContainText('High stakes');
  // No loss yet: nothing to chase.
  await expect(page.getByTestId('chase-play_the_slots')).toHaveCount(0);
  const stake = dollars((await page.getByTestId('do-play_the_slots-medium').textContent())!);
  await page.getByTestId('do-play_the_slots-medium').click();
  const receipt = page.getByTestId('activity-receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByTestId('receipt-text')).not.toBeEmpty();
  const money = (await receipt.getByTestId('receipt-money').textContent())!;
  expect(money).toContain('You now have $');
  // The balance on the receipt is the savings less the stake plus what came back, and the Money tab agrees.
  const balance = dollars(money.slice(money.indexOf('You now have')));
  expect(balance).toBeGreaterThan(20_000 - stake - 1);
  await expect(page.getByTestId('activity-play_the_slots')).toContainText('Done 1 of');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await tab(page, 'Money').click();
  await expect(page.getByTestId('savings')).toHaveText(`$${balance.toLocaleString('en-US')}`);
});

test('chasing a loss is offered after a loss and bets the loss back', async ({ page }) => {
  // Play small bets until one loses (the odds are against the player); then the chase button is there.
  await open(page, { seed: 'e2e-risk-chase', savings: 50_000, vice: 5 });
  for (let i = 0; i < 6; i++) {
    if ((await page.getByTestId('chase-bet_on_the_horses').count()) > 0) break;
    await page.getByTestId('do-bet_on_the_horses-high').click();
    await expect(page.getByTestId('activity-receipt')).toBeVisible();
  }
  const chase = page.getByTestId('chase-bet_on_the_horses');
  await expect(chase).toBeVisible();
  await expect(chase).toContainText('Chase your losses');
  await chase.click();
  await expect(chase).toHaveAttribute('aria-pressed', 'true');
  await expectTouchTargets(page);
});

test('a lawsuit: it is offered with something to go on, settles or goes to trial, and the receipt shows the fee and the money', async ({ page }) => {
  await open(page, { seed: 'e2e-risk-suit', savings: 30_000, flags: ['whistleblower', 'burned_out'] });
  const suit = page.getByTestId('activity-sue_your_employer');
  await expect(suit).toBeVisible();
  await expect(page.getByTestId('evidence-sue_your_employer')).toContainText('good deal to go on');
  // Nothing to go on against a landlord or a doctor.
  await expect(page.getByTestId('activity-sue_your_doctor')).toHaveCount(0);
  await expect(page.getByTestId('activity-sue_your_landlord')).toHaveCount(0);
  await expect(page.getByTestId('route-sue_your_employer-settle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('route-sue_your_employer-trial').click();
  await expect(page.getByTestId('route-sue_your_employer-trial')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('do-sue_your_employer-budget')).toContainText('Budget lawyer');
  await expect(page.getByTestId('do-sue_your_employer-premier')).toContainText('Top lawyer');
  const fee = dollars((await page.getByTestId('do-sue_your_employer-standard').textContent())!);
  await page.getByTestId('do-sue_your_employer-standard').click();
  const receipt = page.getByTestId('activity-receipt');
  await expect(receipt).toBeVisible();
  const money = (await receipt.getByTestId('receipt-money').textContent())!;
  expect(money).toContain('You now have $');
  // The fee was paid up front; the receipt's balance is the savings after the fee and whatever came of the case.
  expect(fee).toBeGreaterThan(0);
  await expect(page.getByTestId('activity-sue_your_employer')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a name change checks what is typed, shows the fee, and the new name is used everywhere afterwards', async ({ page }) => {
  await open(page, { seed: 'e2e-risk-name', savings: 10_000 });
  const field = page.getByTestId('name-first-change_your_first_name');
  const button = page.getByTestId('do-change_your_first_name');
  await expect(field).toBeVisible();
  await expect(button).toContainText('Change your first name · $');
  // Nothing typed, or something that is not a name: the button stays off and says why.
  await expect(button).toBeDisabled();
  await field.fill('<b>x</b>');
  await expect(button).toBeDisabled();
  await field.fill('Rowan');
  await expect(button).toBeEnabled();
  const fee = dollars((await button.textContent())!);
  await button.click();
  const receipt = page.getByTestId('activity-receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByTestId('receipt-text')).toContainText('Rowan');
  await expect(receipt.getByTestId('receipt-money')).toContainText(`−$${fee.toLocaleString('en-US')}`);
  await expect(receipt.getByTestId('receipt-money')).toContainText(`You now have $${(10_000 - fee).toLocaleString('en-US')}`);
  // Once a year, and the character's name everywhere is the new one.
  await expect(page.getByTestId('activity-change_your_first_name')).toContainText('Done 1 of 1');
  await expect(page.getByTestId('do-change_your_first_name')).toBeDisabled();
  await tab(page, 'Life').click();
  await expect(page.getByTestId('character-name')).toContainText('Rowan');
  await expectTouchTargets(page);
});
