/**
 * The grind and the road to the pros (Batch 5), at phone size: trying out for a chosen school team, training without a team,
 * accepting an athletic scholarship, and going undrafted and signing from a camp. Lives are built with the engine on the test
 * content pack (tests/e2e/sportsGrindFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { easiestCamp, grindLife, type GrindLife } from './sportsGrindFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: GrindLife): Promise<ReturnType<typeof grindLife>> {
  const life = grindLife(options);
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  return life;
}

const openSports = async (page: Page) => {
  await tab(page, 'Work/School').click();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('sports-screen')).toBeVisible();
};

test('you choose a school team to try out for, play the scrimmage as an event and make the team', async ({ page }) => {
  await open(page, { seed: 'e2e-grind-1', kind: 'prospect' });
  await openSports(page);
  // The teams of every level your age allows are on the list, each with how hard it is to make.
  await expect(page.getByTestId('entry')).toBeVisible();
  const varsity = page.getByTestId('team-basketball-school:varsity');
  await expect(varsity).toContainText('Varsity');
  await expect(page.getByTestId('odds-basketball-school:varsity')).toContainText(/to make it/);
  await expect(page.getByTestId('team-basketball-school:jv')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('tryout-basketball-school:varsity').click();
  // The tryout is an event with choices: how you play the scrimmage.
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('The list on the door');
  await expect(card.getByRole('button')).toHaveCount(4);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Dive on everything' }).click();
  await expect(card).toContainText(/You made /);
  await page.getByRole('button', { name: 'Continue' }).click();
  // The sports career starts on the school team: one record with your teams and clubs.
  await expect(page.getByTestId('team-line')).toContainText(/school team/i);
  await expect(page.getByTestId('tryout-history')).toContainText(/made /);
  await expect(page.getByTestId('teams')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('you can train without a team at a gym, and the session budget and the cost are in front of you', async ({ page }) => {
  await open(page, { seed: 'e2e-grind-2', kind: 'teamless' });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('sports-teamless')).toBeVisible();
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('training')).toBeVisible();
  await expect(page.getByTestId('session-budget')).toContainText('8 of 8 sessions left');
  // No team: training with it is not an option, the gym is.
  await expect(page.getByTestId('train-mode-team')).toBeDisabled();
  await expect(page.getByTestId('train-mode-gym')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('train-mode-gym')).toContainText(/membership/);
  const train = page.getByTestId('train-shooting');
  await expect(train).toContainText(/\$\d/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await train.click();
  await expect(page.getByTestId('session-budget')).toContainText('7 of 8 sessions left');
  // The membership is paid once: the next session at the gym is free.
  await expect(page.getByTestId('train-handling')).not.toContainText(/\$\d/);
  await page.getByTestId('train-handling').click();
  await expect(page.getByTestId('session-budget')).toContainText('6 of 8 sessions left');
  // Training never hurts you: nothing about your body changed.
  await expect(page.getByTestId('injury')).toHaveCount(0);
});

test('a program’s athletic scholarship is accepted from the Sports screen, with its share of tuition', async ({ page }) => {
  await open(page, { seed: 'e2e-grind-3', kind: 'senior' });
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('sports-offers')).toContainText('offers');
  await page.getByTestId('sports-open').click();
  const section = page.getByTestId('scholarships');
  await expect(section).toContainText('athletic scholarship');
  await expect(page.getByTestId('offer-elite')).toContainText('85%');
  await expect(page.getByTestId('offer-state')).toContainText('60%');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('accept-elite').click();
  await expect(page.getByTestId('scholarship-line')).toContainText('covers 85% of tuition');
  await expect(page.getByTestId('offer-state')).toHaveCount(0);
  // It is a place at a college through the school system: the Work/School tab says where you are going.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sports-screen')).toHaveCount(0);
});

test('when the draft passes you by you can go to a camp and sign, with a draft card that says so', async ({ page }) => {
  const life = await open(page, { seed: 'e2e-grind-4', kind: 'undrafted' });
  const camp = easiestCamp(life);
  await openSports(page);
  await expect(page.getByTestId('draft-card')).toContainText('passed you by');
  await expect(page.getByTestId('draft-projection')).not.toBeEmpty();
  await expect(page.getByTestId('draft-range')).not.toContainText(/\d/);
  await expect(page.getByTestId(`team-basketball-${camp}`)).toContainText('Pro camp');
  await page.getByTestId(`tryout-basketball-${camp}`).click();
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('Camp opens on Monday');
  await page.getByRole('button', { name: 'Make the plays that are there' }).click();
  await expect(card).toContainText(/signed you out of camp/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('contract-line')).toContainText(/minimum deal|standard deal/i);
  await expect(page.getByTestId('contract-line')).toContainText(/\$[\d,]+ a year/);
  await expect(page.getByTestId('team-line')).toContainText('Continental Hoops League');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
