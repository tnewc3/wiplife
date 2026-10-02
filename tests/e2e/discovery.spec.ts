/**
 * Self-discovery and the Profile sheet, played on the test content pack
 * (tests/e2e/content): from 26 a latent trait surfaces at once, and one
 * pushed down comes back the next year. With this seed the character has a
 * latent attraction to men, women and nonbinary people.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, ageUpButton, ageUpTimes, eventSheet, expectNoHorizontalScroll, expectTouchTargets, playThroughEvents, settle, startRandomLife } from './helpers';

const DISCOVERY = { testPack: true, seed: 'e2e-discovery-87' };

const profile = (page: Page) => page.getByRole('dialog', { name: /^(Profile|Who you are)$/ });
const identityValue = (page: Page, label: string) =>
  profile(page).getByTestId('profile-identity').locator('div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');

async function openProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(profile(page)).toBeVisible();
}

async function closeProfile(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(profile(page)).toHaveCount(0);
}

async function reachDiscovery(page: Page): Promise<void> {
  await startRandomLife(page, DISCOVERY);
  await ageUpTimes(page, 25);
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'Something comes to light' })).toBeVisible();
}

test('a discovery accepted changes who you are, and the Profile shows it', async ({ page }) => {
  test.setTimeout(240_000);
  await reachDiscovery(page);
  await eventSheet(page).getByRole('button', { name: 'Accept it' }).click();
  await settle(page);
  await playThroughEvents(page);
  await openProfile(page);
  await expect(identityValue(page, 'Attracted to')).toHaveText('Men, Women, Nonbinary people');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await closeProfile(page);
  // Nothing held back: it doesn't come back.
  await ageUp(page);
  await expect(eventSheet(page)).toHaveCount(0);
});

test('a discovery pushed down comes back the next year', async ({ page }) => {
  test.setTimeout(240_000);
  await reachDiscovery(page);
  await eventSheet(page).getByRole('button', { name: 'Push it down' }).click();
  await settle(page);
  await playThroughEvents(page);
  await openProfile(page);
  await expect(identityValue(page, 'Attracted to')).not.toHaveText('Men, Women, Nonbinary people');
  await closeProfile(page);
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'It comes back' })).toBeVisible();
  await playThroughEvents(page);
});

test('editing pronouns in the Profile works at any age and offers coming out only when asked', async ({ page }) => {
  test.setTimeout(120_000);
  await startRandomLife(page, { testPack: true, seed: 'e2e-profile' });
  await ageUp(page);

  await openProfile(page);
  await expectTouchTargets(page);
  await profile(page).getByRole('button', { name: 'Edit pronouns, gender and expression' }).click();
  await profile(page).getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'xe/xem', exact: true }).click();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(identityValue(page, 'Pronouns')).toHaveText('xe/xem/xyrs');
  await closeProfile(page);
  // At once: the Home header uses the new pronouns.
  await expect(page.getByText(/· xe\/xem$/)).toBeVisible();

  // Not asked: no coming-out event next year (2 is a quiet year in the pack).
  await ageUp(page);
  await expect(eventSheet(page)).toHaveCount(0);

  // Asked: next year brings it, and it can still be declined.
  await openProfile(page);
  await profile(page).getByRole('button', { name: 'Edit pronouns, gender and expression' }).click();
  await profile(page).getByRole('textbox', { name: 'Gender expression' }).fill('fluid');
  await profile(page).getByRole('checkbox', { name: /Tell the people close to you next year/ }).check();
  await profile(page).getByRole('button', { name: 'Save' }).click();
  await expect(identityValue(page, 'Gender expression')).toHaveText('fluid');
  await closeProfile(page);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  while (!(await sheet.getByRole('heading', { name: 'Telling people' }).isVisible())) {
    await sheet.getByRole('button').first().click();
    await settle(page);
    const next = sheet.getByRole('button', { name: 'Continue' });
    if (await next.isVisible()) {
      await next.click();
      await settle(page);
    }
  }
  await expect(sheet.getByRole('button', { name: 'Not yet' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Tell them' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toContainText('xe, xem, xyr');
  await playThroughEvents(page);
});
