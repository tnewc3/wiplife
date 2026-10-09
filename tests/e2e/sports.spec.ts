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
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { sportsLife, type SportsLife } from './sportsFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: SportsLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, sportsLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

const openScreen = async (page: Page) => {
  await tab(page, 'Work/School').click();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('sports-screen')).toBeVisible();
};

test('the Work tab shows your sport, team and the next milestone in words, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-1' });
  await tab(page, 'Work/School').click();
  const card = page.getByTestId('sports-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('sports-rung')).toHaveText(/School team player/);
  await expect(page.getByTestId('sports-team')).not.toBeEmpty();
  await expect(page.getByTestId('sports-fame')).toHaveText(/Unknown|Local|Rising|Famous|Legendary/);
  await expect(page.getByTestId('sports-mood')).toHaveText(/Turned on you|Restless|Devoted/);
  await expect(page.getByTestId('sports-next')).toContainText('Next: college player');
  await expect(card).not.toContainText(/\b\d{2,3}\/100\b/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('the Sports screen shows the ladder, team, position, season report and fame bars', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-2' });
  await openScreen(page);
  const ladder = page.getByRole('list', { name: 'Basketball ladder' });
  await expect(ladder.getByRole('listitem')).toHaveCount(8);
  await expect(ladder.locator('[aria-current="step"]')).toContainText('School team player');
  await expect(page.getByTestId('team-line')).toContainText('school team');
  await expect(page.getByTestId('position-line')).toContainText(/fit/);
  await expect(page.getByTestId('contract-line')).toContainText('Amateur play pays nothing');
  await expect(page.getByTestId('season-report')).toBeVisible();
  await expect(page.getByTestId('season-record')).toContainText('12-6');
  await expect(page.getByTestId('season-stats').getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Fame' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Public image' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Fan mood' })).toBeVisible();
  await expect(page.getByTestId('sports-screen')).not.toContainText(/\b\d{2,3}\/100\b/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a pro has a deal with a salary, an agent, a team in the league, and can ask for a trade', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-3', pro: true });
  await openScreen(page);
  await expect(page.getByTestId('contract-line')).toContainText(/a rookie deal|a standard deal/i);
  await expect(page.getByTestId('contract-line')).toContainText(/\$[\d,]+ a year/);
  await expect(page.getByTestId('team-line')).toContainText('Continental Hoops League');
  await expect(page.getByTestId('agent-line')).toContainText('Quill & Marlow');
  await page.getByTestId('ask-trade').click();
  await expect(page.getByTestId('ask-line')).toContainText('trade');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('position, training focus and commitment change with one tap', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-4' });
  await openScreen(page);
  await expect(page.getByTestId('focus-skills')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('focus-conditioning').click();
  await expect(page.getByTestId('focus-conditioning')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('commitment-steady')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('commitment-back').click();
  await expect(page.getByTestId('commitment-back')).toHaveAttribute('aria-checked', 'true');
  const positions = page.getByRole('radiogroup', { name: 'Position' }).getByRole('radio');
  await expect(positions).toHaveCount(5);
  const other = positions.and(page.locator('[aria-checked="false"]')).first();
  const label = (await other.innerText()).split('\n')[0]!.split('·')[0]!.trim();
  await other.click();
  await expect(page.getByTestId('position-line')).toContainText(label);
});

test('with no career the Sports screen shows the ways in, and starting one puts you on the ladder', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-5', none: true, age: 11 });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('sports-prompt')).toBeVisible();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('entry')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Hockey routes' }).getByRole('listitem')).toHaveCount(3);
  await page.getByTestId('enter-hockey-youth_league').click();
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

test('after leaving the game, the Sports card looks back on the seasons', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-7', pro: true, retired: true });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('sports-retired')).toBeVisible();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('after-line')).toContainText('normal life');
  await expectNoHorizontalScroll(page);
});

test('leaving the game asks first and keeps your seasons', async ({ page }) => {
  await open(page, { seed: 'e2e-sports-8', pro: true });
  await openScreen(page);
  await page.getByTestId('exit-normal').click();
  await expect(page.getByRole('dialog', { name: 'Start a normal life?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a normal life' }).last().click();
  await expect(page.getByTestId('after-line')).toContainText('normal life');
});
