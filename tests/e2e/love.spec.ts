/**
 * Romance (B1), on the test content pack (tests/e2e/content): "Find a date"
 * on the People tab, and a flirt between two men who are friends, where one is
 * attracted to the other and one is not.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUpTimes, eventSheet, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, playThroughEvents, settle, startRandomLife, goTab } from './helpers';
import { sameGenderLife } from './loveFixtures';

const card = (page: Page) => page.getByTestId('interaction-card');

test('"Find a date" is for adults: it shows on the People tab at 18, costs show on the buttons, and a try uses up a little of the year', async ({ page }) => {
  test.setTimeout(150_000);
  // With this seed the character is a woman attracted to men (see people.spec.ts).
  await startRandomLife(page, { testPack: true, seed: 'e2e-love' });
  await ageUpTimes(page, 10);
  await goTab(page, 'People');
  await expect(page.getByTestId('find-date')).toHaveCount(0);
  await ageUpTimes(page, 8);
  await goTab(page, 'People');

  const find = page.getByTestId('find-date');
  await expect(find).toBeVisible();
  await expect(find).toContainText('0 of 4 used');
  await expect(page.getByTestId('find-date-app')).toBeEnabled();
  // A night out costs money, and nothing here is afford-able at 18 with nothing saved: the reason is shown.
  await expect(page.getByTestId('find-date-night_out')).toContainText('$');
  await expect(page.getByTestId('find-date-night_out')).toBeDisabled();
  await expect(find).toContainText('You can’t afford that.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await page.getByTestId('find-date-app').click();
  await settle(page);
  await expect(eventSheet(page)).toBeVisible();
  await playThroughEvents(page);
  await expect(eventSheet(page)).toHaveCount(0);

  await goTab(page, 'People');
  await expect(page.getByTestId('find-date')).toContainText('1 of 4 used');
  // The input survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await goTab(page, 'People');
  await expect(page.getByTestId('find-date')).toContainText('1 of 4 used');
  await expectNoHorizontalScroll(page);
});

test('a same-gender flirt with a friend: possible with a man you are attracted to, and a kind, clear no from one who is not attracted to you', async ({ page }) => {
  test.setTimeout(120_000);
  await passAgeGate(page, { testPack: true, seed: 'e2e-love-fixture' });
  await loadSavedLife(page, sameGenderLife('e2e-love-fixture'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'People');
  const friends = page.getByRole('list', { name: 'Friends' });

  // Ben is not attracted to you: the flirt is offered, and answered with a kind, clear no.
  await friends.getByRole('button', { name: /Ben Rivera/ }).click();
  await page.getByTestId('interact-button').click();
  await expect(page.getByTestId('interaction-flirt')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('interaction-flirt').click();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Not interested that way');
  await expect(page.getByTestId('interaction-outcome')).not.toBeEmpty();
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('interaction-done').click();
  await expect(card(page)).toHaveCount(0);
  // Nothing romantic came of it: still a friend.
  await expect(page.getByTestId('person-line')).toContainText(/^Friend · /);

  // Leo is attracted to you: the same flirt is an ordinary moment, not a "no".
  await page.getByRole('button', { name: 'Back to People' }).click();
  await friends.getByRole('button', { name: /Leo Rivera/ }).click();
  await page.getByTestId('interact-button').click();
  await page.getByTestId('interaction-flirt').click();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).not.toContainText('Not interested that way');
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await page.getByTestId('interaction-done').click();
});
