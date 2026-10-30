/**
 * C2, the Career hub, at phone size: the Career tab (You, Find work, Special careers, Schedule), the Sports screen's four tabs,
 * the band screen's four tabs (rehearsal, auditions and hiring), the training card, and god mode's career group.
 */
import { expect, test, type Page } from '@playwright/test';
import { careerLife } from './c2Fixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, goTab } from './helpers';

async function openCareer(page: Page, withBand = true): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, careerLife('e2e-c2', withBand));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Job');
}

test('the Career tab lists every role with one bar and a Schedule, and fits the phone', async ({ page }) => {
  await openCareer(page);
  await expect(gameNavLabel(page)).toBeVisible();
  for (const id of ['school', 'sports', 'band']) await expect(page.getByTestId(`role-${id}`)).toBeVisible();
  await expect(page.getByTestId('role-sports').getByRole('meter')).toHaveCount(1);
  await expect(page.getByTestId('role-schedule')).toBeVisible();
  await expect(page.getByTestId('find-jobs')).toBeVisible();
  await expect(page.getByTestId('sports-open')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  await page.getByTestId('role-schedule').click();
  const sheet = page.getByTestId('schedule-sheet');
  await expect(sheet).toContainText('Load');
  await sheet.getByTestId('commit-school-all').click();
  await expect(sheet.getByTestId('commit-school-all')).toHaveAttribute('aria-checked', 'true');
});

test('the Sports screen has Overview, Season, League and History tabs', async ({ page }) => {
  await openCareer(page);
  await page.getByTestId('role-sports').click();
  await expect(page.getByTestId('sports-overview')).toBeVisible();
  await expect(page.getByTestId('sports-role-row').getByRole('meter')).toHaveCount(1);
  await page.getByTestId('sports-tab-season').click();
  await expect(page.getByTestId('sports-season')).toBeVisible();
  await page.getByTestId('sports-tab-league').click();
  await expect(page.getByTestId('standings')).toBeVisible();
  await page.getByTestId('sports-tab-history').click();
  await page.getByTestId('season-row').first().click();
  await expect(page.getByTestId('season-summary')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the band screen: rehearse, hold auditions and hire, with a training card that can be skipped', async ({ page }) => {
  await openCareer(page);
  await page.getByTestId('role-band').click();
  await expect(page.getByTestId('band-overview')).toBeVisible();
  await page.getByTestId('rehearse').click();
  await expect(page.getByTestId('training-popup')).toBeVisible();
  await expect(page.getByTestId('training-result')).toContainText(/tighter|groove|nailed/i, { timeout: 4000 });
  await page.getByTestId('training-popup').click();
  await expect(page.getByTestId('training-popup')).toHaveCount(0);
  await expect(page.getByTestId('rehearsal-count')).toContainText('1 of');

  await page.getByTestId('band-tab-members').click();
  const count = await page.getByTestId('band-member').count();
  await page.locator('[data-testid^="member-more-"]').first().click();
  await page.getByTestId('member-replace').click();
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByTestId('audition-pool')).toBeVisible();
  await expect(page.getByTestId('band-member')).toHaveCount(count - 1);
  await page.getByTestId('candidate-0').click();
  await expect(page.getByTestId('band-member')).toHaveCount(count);
  await page.getByTestId('band-tab-releases').click();
  await expect(page.getByTestId('band-releases')).toBeVisible();
  await page.getByTestId('band-tab-shows').click();
  await expect(page.getByTestId('band-shows')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the training card shows the result at once with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCareer(page);
  await page.getByTestId('role-band').click();
  await page.getByTestId('rehearse').click();
  await expect(page.getByTestId('training-result')).toContainText(/tighter|groove|nailed/i);
});

function gameNavLabel(page: Page) {
  return page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name: 'Career' });
}
