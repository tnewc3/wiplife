/**
 * Batch 4 (music, bands and the grind), at phone size: forming a band from an
 * open-mic start, renaming it and replacing a member; playing a show; lining
 * up and releasing an off-genre single with a typed title; practising. Lives
 * are built with the engine on the test content pack (tests/e2e/fameFixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { fameLife, type FameLife } from './fameFixtures';
import { loadSavedLife } from './heirFixtures';
import { ageUp, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

async function openFame(page: Page, options: FameLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, fameLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await tab(page, 'Work/School').click();
  await page.getByTestId('fame-open').click();
  await expect(page.getByTestId('fame-screen')).toBeVisible();
}

test('form a band from an open-mic start, rename it and replace a member', async ({ page }) => {
  await openFame(page, { seed: 'e2e-band-1', fresh: true });
  const band = page.getByTestId('band');
  await expect(band).toContainText('You perform on your own.');
  await band.getByTestId('band-name-input').fill('  The Night   Shift  ');
  await band.getByTestId('band-form').click();
  await expect(band.getByTestId('band-name')).toHaveText('The Night Shift');
  const members = band.getByTestId('band-member');
  const count = await members.count();
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(band).toContainText('You lead it.');
  await expectTouchTargets(page);

  // A name that can't be a title is refused before it is sent.
  await band.getByTestId('band-rename-input').fill('<b>loud</b>');
  await expect(band.getByTestId('band-rename')).toBeDisabled();
  await band.getByTestId('band-rename-input').fill('Static Bloom');
  await band.getByTestId('band-rename').click();
  await expect(band.getByTestId('band-name')).toHaveText('Static Bloom');

  // Ask someone to leave, then hold auditions for their part.
  const first = (await members.first().locator('span').first().textContent())!.split('·')[0]!.trim();
  await members.first().getByRole('button').click();
  await page.getByRole('button', { name: 'Ask them to leave' }).click();
  await expect(members).toHaveCount(count - 1);
  await expect(band).not.toContainText(first);
  await band.getByTestId('recruit').click();
  await expect(members).toHaveCount(count);
  await expectNoHorizontalScroll(page);
});

test('play a show: the result, the count and the pay through the ledger', async ({ page }) => {
  await openFame(page, { seed: 'e2e-show-1', fresh: true });
  const shows = page.getByTestId('shows');
  await expect(shows.getByTestId('shows-count')).toContainText('0 of 6 shows this year');
  await shows.getByTestId('play-show').click();
  await expect(shows.getByTestId('shows-count')).toContainText('1 of 6 shows this year');
  await expect(shows.getByTestId('show-result')).toContainText(/A (great|good|rough) night at an open mic/);
  await expect(shows.getByTestId('show-result')).toContainText('yearly ledger');
  await expectTouchTargets(page);
  await expectNoHorizontalScroll(page);
});

test('release an off-genre single with a typed title', async ({ page }) => {
  await openFame(page, { seed: 'e2e-offgenre-1', fresh: true });
  await expect(page.getByTestId('sound-genre')).toContainText('You make alt rock.');
  await page.getByTestId('plan-open').click();
  const sheet = page.getByRole('dialog', { name: 'Line up a project' });
  await sheet.getByTestId('project-kind-single').click();
  await sheet.getByTestId('project-title').fill('{bad}');
  await expect(sheet.getByTestId('project-save')).toBeDisabled();
  await sheet.getByTestId('project-title').fill('  Night Bus   Hymn ');
  await sheet.getByTestId('project-genre').selectOption('metal');
  await expect(sheet.getByTestId('project-off-genre')).toContainText('Outside your sound');
  await expectTouchTargets(page);
  await sheet.getByTestId('project-save').click();
  await expect(page.getByTestId('plan-summary')).toContainText('A single called “Night Bus Hymn”: metal');
  await expect(page.getByTestId('plan-summary')).toContainText('outside your usual sound');
  // The year begins and it comes out.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fame-screen')).toBeHidden();
  await ageUp(page);
  await tab(page, 'Work/School').click();
  await page.getByTestId('fame-open').click();
  const row = page.getByTestId('project-row').first();
  await expect(row).toContainText('Night Bus Hymn');
  await expect(row).toContainText('metal (outside your sound)');
  await expectNoHorizontalScroll(page);
});

test('practice: take up an instrument and practise, a session at a time', async ({ page }) => {
  await openFame(page, { seed: 'e2e-practice-1', fresh: true });
  const practice = page.getByTestId('practice');
  await expect(practice.getByTestId('practice-count')).toContainText('0 of 8 practice sessions this year');
  await expect(practice.getByTestId('practise-instrument')).toBeDisabled();
  await practice.getByTestId('instrument-select').selectOption('drums');
  await practice.getByTestId('instrument-set').click();
  await expect(practice.getByTestId('practise-instrument')).toBeEnabled();
  await practice.getByTestId('practise-vocals').click();
  await expect(practice.getByTestId('practice-count')).toContainText('1 of 8 practice sessions this year');
  await practice.getByTestId('practise-instrument').click();
  await expect(practice.getByTestId('practice-count')).toContainText('2 of 8 practice sessions this year');
  await expectTouchTargets(page);
  await expectNoHorizontalScroll(page);
});
