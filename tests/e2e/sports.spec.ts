/**
 * Sports (E6c), at phone size: the Work tab's Sports card, the Sports screen
 * (the ladder with your rung and the next milestone, team and position, your
 * deal, the latest season report, bars and words for fame, image and fan mood,
 * commitment, training focus, the ways in and the ways out) and a playoff run in
 * the event sheet. Lives are built with the engine on the test content pack
 * (tests/e2e/sportsFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, goTab } from './helpers';
import { sportsLife, type SportsLife } from './sportsFixtures';


async function open(page: Page, options: SportsLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, sportsLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

const openScreen = async (page: Page) => {
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('sports-screen')).toBeVisible();
};

test('the Career tab shows your sport and team with a Greatness bar, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-1' });
  await goTab(page, 'Job');
  const row = page.getByTestId('role-sports');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Basketball');
  await expect(row.getByRole('meter', { name: 'Greatness' })).toBeVisible();
  await expect(page.getByTestId('sports-open')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('the Sports screen shows the ladder, team, position, season report and, with fame, the fame bars', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-2' });
  await openScreen(page);
  const ladder = page.getByRole('list', { name: 'Basketball ladder' });
  await expect(ladder.getByRole('listitem')).toHaveCount(8);
  await expect(ladder.locator('[aria-current="step"]')).toContainText('School team player');
  await expect(page.getByTestId('team-line')).toContainText('school team');
  await expect(page.getByTestId('position-line')).toContainText(/fit/);
  await expect(page.getByTestId('season-record')).toContainText('12-6');
  await expect(page.getByTestId('sports-screen')).not.toContainText(/\b\d{2,3}\/100\b/);
  await expect(page.getByTestId('contract-line')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a pro has a deal with a salary, an agent, a team in the league, and can ask for a trade', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-3', pro: true });
  await openScreen(page);
  await expect(page.getByTestId('contract-line')).toContainText(/a rookie deal|a standard deal/i);
  await expect(page.getByTestId('contract-line')).toContainText(/\$[\d,]+/);
  await expect(page.getByTestId('tile-deal')).toContainText(/\$[\d,]+/);
  await expect(page.getByTestId('agent-line')).toContainText('Quill & Marlow');
  await page.getByTestId('screen-overflow').click();
  await page.getByTestId('ask-trade').click();
  await expect(page.getByTestId('ask-line')).toContainText('trade');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('position and training focus change with one tap on a card', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-4' });
  await openScreen(page);
  await page.getByTestId('tile-practice').click();
  await page.getByTestId('focus-conditioning').click();
  await page.getByTestId('tile-practice').click();
  await expect(page.getByTestId('focus-conditioning')).toContainText('Now');
  await page.keyboard.press('Escape');
  await page.getByTestId('position-line').click();
  const positions = page.getByTestId('position-picker').locator('[data-testid^="position-"]');
  await expect(positions).toHaveCount(5);
  const other = positions.and(page.locator(':not([aria-disabled])')).first();
  const label = (await other.innerText()).split('\n')[0]!.trim();
  await other.click();
  await expect(page.getByTestId('position-line')).toContainText(label);
});

test('with no career the Sports screen shows the teams you can try out for, and making one puts you on the ladder', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-5', none: true, age: 11 });
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('entry')).toBeVisible();
  await expect(page.locator('[data-testid^="tryout-hockey-youth"]')).toHaveCount(3);
  // The rec league takes everyone who shows up.
  await page.getByTestId('tryout-hockey-youth:rec').click();
  await page.getByRole('button', { name: 'Play your game' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('list', { name: 'Hockey ladder' }).locator('[aria-current="step"]')).toContainText('Youth league player');
  await expectNoHorizontalScroll(page);
});

test('a playoff series is played in the event sheet and the run moves on to the next series', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-6', pro: true, series: true });
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('The first night of the playoffs');
  await expect(card).toContainText('the first round');
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Trust the system you have built' }).click();
  await expect(card).toContainText('the first round');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('event-card')).toContainText('The series that swung');
  await expect(page.getByTestId('event-card')).toContainText('the conference final');
  await expectNoHorizontalScroll(page);
});

test('after leaving the game, the Sports screen looks back on the seasons', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-7', pro: true, retired: true });
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('after-line')).toContainText('normal life');
  await expectNoHorizontalScroll(page);
});

test('leaving the game asks first and keeps your seasons', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-8', pro: true });
  await openScreen(page);
  await page.getByTestId('screen-overflow').click();
  await page.getByTestId('exit-normal').click();
  await expect(page.getByRole('dialog', { name: 'Start a normal life?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a normal life' }).last().click();
  await expect(page.getByTestId('after-line')).toContainText('normal life');
});
