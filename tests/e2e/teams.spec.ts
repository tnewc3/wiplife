/**
 * Batch 6, at phone size: Settings → Teams (rename a team and see it in a new life), a team in a city the game does not model yet,
 * a soccer loan and a transfer, and a signing in Spain from the UK. Lives are built with the engine on the test content pack
 * (tests/e2e/sportsFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUpTimes, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, tab } from './helpers';
import { sportsLife, type SportsLife } from './sportsFixtures';


async function open(page: Page, options: SportsLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, sportsLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

const openScreen = async (page: Page) => {
  await tab(page, 'Job').click();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('sports-screen')).toBeVisible();
};

test('a team renamed in Settings is the new name in a new life, which keeps its own copy of the settings', async ({ page }) => {
  await passAgeGate(page, { seed: 'e2e-teams-1', testPack: true });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('settings-teams').click();
  await expect(page.getByTestId('teams-editor')).toBeVisible();
  await page.getByLabel('Sport', { exact: true }).selectOption({ label: 'Soccer' });
  await page.getByLabel('Find a team').fill('Lakefront');
  await page.getByTestId('team-edit-chicago_lakefront_fc').click();
  // Input is checked: a one-letter name is refused, with the reason.
  await page.getByTestId('team-name-input').fill('X');
  await page.getByTestId('team-save').click();
  await expect(page.getByTestId('team-issue')).toContainText('at least 2');
  await page.getByTestId('team-name-input').fill('Chicago Lakeshore Rovers');
  await page.getByTestId('team-city-input').selectOption('houston');
  await page.getByTestId('team-save').click();
  await page.getByLabel('Find a team').fill('Lakeshore');
  await expect(page.getByTestId('team-name-chicago_lakefront_fc')).toHaveText('Chicago Lakeshore Rovers');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // The settings are stored: they survive a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('settings-teams').click();
  await page.getByLabel('Sport', { exact: true }).selectOption({ label: 'Soccer' });
  await page.getByLabel('Find a team').fill('Lakeshore');
  await expect(page.getByTestId('team-name-chicago_lakefront_fc')).toHaveText('Chicago Lakeshore Rovers');
  await page.getByRole('button', { name: 'Back to settings' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  // A new life: at eight, the Sports screen lists the teams of the league by name, and the renamed one is there.
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await ageUpTimes(page, 8);
  await tab(page, 'Job').click();
  await page.getByTestId('sports-open').click();
  await page.getByTestId('league-soccer').locator('summary').click();
  await expect(page.getByTestId('league-team-chicago_lakefront_fc')).toContainText('Chicago Lakeshore Rovers');
  await expect(page.getByTestId('league-team-chicago_lakefront_fc')).toContainText('Houston');
  await expectNoHorizontalScroll(page);
});

test('a player can add a team of their own, which is checked, listed and can be removed', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('settings-teams').click();
  await page.getByLabel('Sport', { exact: true }).selectOption({ label: 'Hockey' });
  await page.getByTestId('teams-add').click();
  await page.getByTestId('team-name-input').fill('Garden City Icemen');
  await page.getByTestId('team-nickname-input').fill('Icemen');
  await page.getByTestId('team-city-input').selectOption('toronto');
  await page.getByTestId('team-strength-input').selectOption('5');
  await page.getByTestId('team-save').click();
  await page.getByLabel('Find a team').fill('Garden City');
  await expect(page.getByTestId('teams-list')).toContainText('Garden City Icemen');
  await expect(page.getByTestId('teams-list')).toContainText('yours');
  // A second one with the same name is refused.
  await page.getByTestId('teams-add').click();
  await page.getByTestId('team-name-input').fill('garden city icemen');
  await page.getByTestId('team-save').click();
  await expect(page.getByTestId('team-issue')).toContainText('already called');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('team-edit-custom_1').click();
  await page.getByRole('button', { name: 'Remove this team' }).click();
  await expect(page.getByTestId('teams-list')).not.toContainText('Garden City Icemen');
  await expectNoHorizontalScroll(page);
});

test('signing with a team in a city the game does not have yet keeps you in the nearest city and says where the team plays', async ({ page }) => {
  await open(page, { seed: 'e2e-teams-2', pro: true, teamId: 'boston_harbor_lanterns' });
  await tab(page, 'Job').click();
  await expect(page.getByTestId('sports-team')).toContainText('Boston Harbor Lanterns');
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('team-line')).toContainText('Boston');
  await expect(page.getByTestId('away-line')).toContainText('home games in Boston');
  await expect(page.getByTestId('away-line')).toContainText('You live in New York');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a soccer club offers a loan, and while on loan a transfer waits', async ({ page }) => {
  await open(page, { seed: 'e2e-teams-3', pro: true, sport: 'soccer', teamId: 'chicago_lakefront_fc', loanOffer: 'chicago_union_yard_sc', offer: 'chicago_ashgrove_united' });
  await openScreen(page);
  await expect(page.getByTestId('loan-offer')).toContainText('Chicago Lakefront FC wants to send you on loan to Chicago Union Yard SC');
  await expect(page.getByTestId('transfer-window')).toBeVisible();
  await page.getByTestId('take-loan').click();
  await expect(page.getByTestId('loan-line')).toContainText('On loan at Chicago Union Yard SC');
  await expect(page.getByTestId('loan-line')).toContainText('Chicago Lakefront FC still holds your deal');
  await expect(page.getByTestId('team-line')).toContainText('Chicago Union Yard SC');
  await expect(page.getByTestId('contract-line')).toContainText('Chicago Lakefront FC');
  await expect(page.getByText('Not while you are on loan.')).toBeVisible();
  await expect(page.getByTestId('world-totals')).toContainText('1 loan');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a transfer: the offer on the table is taken, and the new club, the deal and the window change', async ({ page }) => {
  await open(page, { seed: 'e2e-teams-4', pro: true, sport: 'soccer', teamId: 'chicago_lakefront_fc', offer: 'chicago_ashgrove_united' });
  await openScreen(page);
  const offer = page.getByTestId('offer-' + (await page.locator('[data-testid^="accept-"]').first().getAttribute('data-testid'))!.replace('accept-', ''));
  await expect(offer).toContainText('Chicago Ashgrove United');
  await expect(offer).toContainText('$700,000 a year for 3 years');
  await expect(offer).toContainText('fee of $3,000,000');
  await page.locator('[data-testid^="accept-"]').first().click();
  await expect(page.getByTestId('team-line')).toContainText('Chicago Ashgrove United');
  await expect(page.getByTestId('contract-line')).toContainText('Chicago Ashgrove United');
  await expect(page.getByTestId('contract-line')).toContainText('$700,000 a year');
  await expect(page.getByTestId('transfer-window')).toHaveCount(0);
  await expect(page.getByTestId('world-totals')).toContainText('1 transfer');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a player in the UK signs with a club in Spain, lives in a UK city and commutes', async ({ page }) => {
  await open(page, { seed: 'e2e-teams-5', pro: true, sport: 'soccer', country: 'uk', teamId: 'london_riverside_fc', offer: 'madrid_retiro_deportivo' });
  await openScreen(page);
  const accept = page.locator('[data-testid^="accept-"]').first();
  const offer = page.getByTestId('offer-' + (await accept.getAttribute('data-testid'))!.replace('accept-', ''));
  await expect(offer).toContainText('Madrid Retiro Deportivo');
  await expect(offer).toContainText('Spain');
  await accept.click();
  await expect(page.getByTestId('team-line')).toContainText('Madrid Retiro Deportivo');
  await expect(page.getByTestId('away-line')).toContainText('Your club is in Madrid, Spain');
  await expect(page.getByTestId('away-line')).toContainText('You live in London and commute');
  await expect(page.getByTestId('contract-line')).toContainText('Madrid Retiro Deportivo');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
