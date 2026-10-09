/**
 * Aging, events, death and the archive, played on the test content pack
 * (tests/e2e/content) so these flows don't change when real events do.
 * In the pack: an event with choices at 1, a quiet year at 2, an event
 * without choices at 3, and at 4 a choice to live on or end the life.
 */
import { expect, test } from '@playwright/test';
import {
  ageUpButton,
  ageUpTimes,
  eventSheet,
  expectNoHorizontalScroll,
  expectTouchTargets,
  passAgeGate,
  settle,
  startRandomLife,
} from './helpers';

const PACK = { testPack: true, seed: 'e2e-pack' };

test('Age Up advances a year; quiet years show the recap on Home; life stages change', async ({ page }) => {
  await startRandomLife(page, PACK);
  await expect(ageUpButton(page)).toBeInViewport({ ratio: 1 });
  await ageUpTimes(page, 2);
  // Age 2 is quiet: no event sheet, and the recap is on Home.
  await expect(page.getByText(/^2 years old · /)).toBeVisible();
  await expect(page.getByRole('region', { name: /· 2 years old$/ })).toBeVisible();

  await ageUpTimes(page, 11);
  await expect(page.getByText(/^13 years old · /)).toBeVisible();
  await expect(page.getByText(/Teen years/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your story' })).toContainText(/teenager/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('rapid taps on Age Up advance only one year', async ({ page }) => {
  await startRandomLife(page, PACK);
  // Three clicks in the same moment, before the screen can update.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Age Up')!;
    button.click();
    button.click();
    button.click();
  });
  await settle(page);
  // The year-1 event is showing, and the character is 1.
  await expect(eventSheet(page).getByRole('heading', { name: 'Hello there' })).toBeVisible();
  await expect(page.getByText(/^1 year old · /)).toBeAttached();
});

test('a year with events shows each card and its outcome, then the recap as the last card', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await expect(sheet.getByRole('heading', { name: 'Hello there' })).toBeVisible();
  await expect(sheet.getByTestId('event-card')).toHaveAttribute('data-tone', 'light');
  await expect(sheet.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // A known money change shows on the choice, and the outcome shows it with the new balance (C1).
  await expect(sheet.getByRole('button', { name: 'Wave back' }).getByTestId('choice-money')).toHaveText('Pays $1');
  await expect(sheet.getByRole('button', { name: 'Hide behind the couch' }).getByTestId('choice-money')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Wave back' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toContainText('laughs and waves again');
  await expect(sheet.getByTestId('event-money')).toHaveText(/^\+\$1 · Savings now \$[\d,]+$/);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await settle(page);

  await expect(sheet.getByText('Your year')).toBeVisible();
  await expect(sheet.getByRole('heading', { name: /· 1 year old$/ })).toBeVisible();
  // The recap names the change; the yearly drift toward the baseline (C1) can outweigh the event's +2.
  await expect(sheet).toContainText(/Happiness went (up|down)/);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page)).toHaveCount(0);
  await expect(ageUpButton(page)).toBeEnabled();
});

test('an event without choices takes one tap', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpTimes(page, 2);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await expect(sheet.getByRole('heading', { name: 'A sunny afternoon' })).toBeVisible();
  await expect(sheet.getByRole('button').filter({ hasNotText: 'Report a problem' })).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await expect(sheet.getByText('Your year')).toBeVisible();
});

test('reloading in the middle of a year keeps the same event waiting', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'Hello there' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page).getByRole('heading', { name: 'Hello there' })).toBeVisible();
});

test('the Life history screen shows the whole timeline', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpTimes(page, 6);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Life history' }).click();
  await expect(page.getByRole('heading', { name: 'Life history' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Life history' })).toContainText('Age 5');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
});

test('a life ends in an obituary, goes into the archive, and a new life starts', async ({ page }) => {
  const name = await startRandomLife(page, PACK);
  await ageUpTimes(page, 3);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: 'End this test life' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toContainText('The test life ends here.');
  await sheet.getByRole('button', { name: 'Continue' }).click();

  // The funeral comes first (W1), then the Death and Obituary screen.
  await expect(page.getByText('The funeral', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eulogy')).toBeVisible();
  await expect(page.getByTestId('funeral-absent')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('funeral-continue').click();
  await expect(page.getByText('In memoriam')).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByTestId('obituary')).toContainText(name);
  await expect(page.getByTestId('obituary')).toContainText('natural causes');
  await expect(page.getByText('This life has been saved to your archive.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Archive list and detail.
  await page.getByRole('button', { name: 'Open the archive' }).click();
  const lives = page.getByRole('list', { name: /^Generations of the/ }).getByRole('listitem');
  await expect(lives).toHaveCount(1);
  await expect(lives.first()).toContainText(name);
  await expect(lives.first()).toContainText('Age 4');
  await expect(lives.first()).toContainText('Died of natural causes');
  await lives.first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Past life' })).toBeVisible();
  await expect(page.getByTestId('obituary')).toContainText(name);
  await expect(page.getByRole('group', { name: 'Final stats' }).getByRole('meter')).toHaveCount(6);
  await expect(page.getByRole('list', { name: 'Timeline' })).toContainText(/You died of/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The archive survives a reload; there is nothing to continue.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('list', { name: /^Generations of the/ }).getByRole('listitem')).toHaveCount(1);

  // Start again.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  await expect(page.getByText(/^Newborn · /)).toBeVisible();
});

test('starting over moves the current life into the archive, unfinished', async ({ page }) => {
  const name = await startRandomLife(page, PACK);
  await ageUpTimes(page, 2);

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Start a random life' }).click();
  const confirm = page.getByRole('dialog', { name: 'Start a new life?' });
  await expect(confirm).toContainText(`${name}’s life will move to your archive, marked unfinished.`);
  await confirm.getByRole('button', { name: 'Start a new life' }).click();
  await expect(page.getByText(/^Newborn · /)).toBeVisible();

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const item = page.getByRole('list', { name: /^Generations of the/ }).getByRole('listitem').first();
  await expect(item).toContainText(name);
  await expect(item).toContainText('Unfinished');
  await item.getByRole('button').click();
  await expect(page.getByTestId('obituary')).toContainText(/unfinished/);
});

test('an empty archive says so', async ({ page }) => {
  await passAgeGate(page);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('No past lives yet.')).toBeVisible();
});

test('development builds can report a problem with an event card (C1)', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: 'Wave back' }).click();
  await settle(page);
  await sheet.getByRole('button', { name: 'Report a problem' }).click();
  const report = sheet.getByTestId('problem-report');
  await expect(report).toContainText('event: test_hello');
  await expect(report).toContainText('choice: wave');
  await expect(report).toContainText(/cast parent: \S+ parent, age \d+, household/);
  await expect(report).toContainText('home: with_parents');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
