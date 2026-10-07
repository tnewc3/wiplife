/**
 * The teen years (T1), at phone size: More → Teen years: this year's focus, the
 * crowds at school, the license, a job, teams and clubs, and the rules at home.
 * Lives are built with the engine on the test content pack
 * (tests/e2e/teenFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';
import { teenLife, type TeenLife } from './teenFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function open(page: Page, options: TeenLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, teenLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'More').click();
  await page.getByTestId('more-teen').click();
  await expect(page.getByRole('heading', { name: 'This year’s focus' })).toBeVisible();
}

const sheet = (page: Page) => page.getByRole('dialog').last();

test('Teen years shows the focus, crowds, driving, job, teams and rules at home, and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-1' });
  await expect(page.getByTestId('teen-focus')).toContainText('School');
  await expect(page.getByTestId('teen-focus')).toContainText('A passion');
  await expect(page.getByTestId('teen-crowds')).toContainText('Your crowd');
  await expect(page.getByTestId(/^teen-crowd-/).first()).toContainText(/Try to join/);
  await expect(page.getByTestId('teen-driving')).toContainText('No permit yet');
  await expect(page.getByTestId('teen-job')).toContainText('A job');
  await expect(page.getByTestId('teen-activities')).toContainText('Teams and clubs');
  await expect(page.getByTestId('teen-rules')).toContainText('Rules at home');
  await expect(page.getByTestId(/^teen-rule-/).first()).toContainText('Set by');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('choosing a focus marks it for the coming year', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-2' });
  await page.getByTestId('teen-focus-passion').click();
  await expect(page.getByTestId('teen-focus-passion')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('teen-focus-passion')).toContainText('Chosen');
  await page.getByTestId('teen-focus-school').click();
  await expect(page.getByTestId('teen-focus-school')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('teen-focus-passion')).toHaveAttribute('aria-pressed', 'false');
});

test('trying to join a crowd ends in a place in it or a turn-away that says why you can’t try again', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-3' });
  const first = page.getByTestId(/^teen-crowd-/).first();
  await first.getByRole('button').click();
  const joined = page.getByTestId('teen-mine');
  const turned = page.getByText('too soon to try again');
  await expect(joined.or(turned).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a member can leave their crowd after a confirmation', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-4', inCrowd: true });
  await expect(page.getByTestId('teen-mine')).toBeVisible();
  await page.getByTestId('teen-leave-crowd').click();
  await expect(sheet(page)).toContainText('The people in it will notice');
  await sheet(page).getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByTestId('teen-mine')).toHaveCount(0);
});

test('the permit, lessons and the test, with fees and the chance in words', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-5', age: 16 });
  await page.getByTestId('teen-permit').click();
  await expect(page.getByTestId('teen-driving')).toContainText('Learner’s permit');
  await page.getByTestId('teen-lesson').click();
  await page.getByTestId('teen-lesson').click();
  await expect(page.getByTestId('teen-driving')).toContainText('2 of');
  await expect(page.getByTestId('teen-test')).toContainText(/Likely|About even|Very likely|Unlikely|A long shot/);
  await expectTouchTargets(page);
  await page.getByTestId('teen-test').click();
  await expect(page.getByTestId('teen-driving')).toContainText(/Licensed driver|You sat the test this year/);
});

test('a teen job is taken and quit after a confirmation', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-6', age: 16 });
  await page.getByTestId('teen-job-dog_walker').click();
  await expect(page.getByTestId('teen-job')).toContainText('dog walker at');
  await expect(page.getByTestId('teen-job')).toContainText('hours a week');
  await page.getByTestId('teen-quit-job').click();
  await expect(sheet(page)).toContainText('You will lose the pay');
  await sheet(page).getByRole('button', { name: 'Quit', exact: true }).click();
  await expect(page.getByTestId('teen-job-dog_walker')).toBeVisible();
});

test('a club takes everyone, and can be left', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-7' });
  await page.getByTestId('teen-activity-art_club').click();
  await expect(page.getByTestId('teen-leave-art_club')).toBeVisible();
  await page.getByTestId('teen-leave-art_club').click();
  await expect(page.getByTestId('teen-activity-art_club')).toBeVisible();
});

test('rules at home: ask one to ease up, or break one after a warning', async ({ page }) => {
  await open(page, { seed: 'e2e-teen-8' });
  const rule = page.getByTestId('teen-rule-curfew');
  await expect(rule).toContainText(/Relaxed|The usual|Strict/);
  const ask = rule.getByRole('button', { name: /ease up/ });
  if (await ask.isEnabled()) {
    await ask.click();
    await expect(rule.getByText('You already asked this year.')).toBeVisible();
  }
  await rule.getByRole('button', { name: 'Break this rule' }).click();
  await expect(sheet(page)).toContainText('a parent may notice');
  await sheet(page).getByRole('button', { name: 'Break it' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
