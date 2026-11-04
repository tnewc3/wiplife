/**
 * Organized crime (O1), at phone size: Career → Crime opens the Organization screen with tabs Overview, Members, Territory
 * and Rivals; a leader gives a member a job, sets a cut, orders an attack on a neighborhood and offers a truce from row
 * action sheets; the year's results come back in the Overview and the life log; someone who does not run the organization
 * sees everything but cannot decide; nobody under 18 has the screen. Lives are built with the engine on the test content pack
 * (tests/e2e/o1Fixtures.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { ageUp, expectNoHorizontalScroll, expectTouchTargets, goTab, openRow, passAgeGate, settle } from './helpers';
import { orgLife, type OrgLife } from './o1Fixtures';
import { teenLife } from './teenFixtures';

async function open(page: Page, options: OrgLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, orgLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

async function openOrg(page: Page): Promise<void> {
  await goTab(page, 'Job');
  await openRow(page, 'special-crime');
  await expect(page.getByTestId('org-screen')).toBeVisible();
}

test('the Organization screen has four tabs and fits a phone', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-tabs' });
  await openOrg(page);
  await expect(page.getByTestId('org-overview')).toBeVisible();
  await expect(page.getByTestId('org-row-rank')).not.toBeEmpty();
  await expect(page.getByTestId('org-row-standing')).toHaveText(/Disrespected|Unproven|Solid|Trusted|Revered/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  for (const tab of ['members', 'territory', 'rivals'] as const) {
    await page.getByTestId(`org-tab-${tab}`).click();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  }
  await page.getByTestId('org-tab-members').click();
  await expect(page.locator('[data-testid^="org-member-"]').first()).toBeVisible();
  await page.getByTestId('org-tab-territory').click();
  await expect(page.locator('[data-testid^="org-hood-"]').first()).toBeVisible();
  await page.getByTestId('org-tab-rivals').click();
  await expect(page.locator('[data-testid^="org-rival-"]').first()).toBeVisible();
});

test('a leader gives a member a job from the row’s action sheet, and the year brings results back', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-jobs', kind: 'cartel' });
  await openOrg(page);
  await page.getByTestId('org-tab-members').click();
  await page.locator('[data-testid^="org-member-more-"]').first().click();
  await page.getByTestId('org-act-job').click();
  await page.getByTestId('org-job-move_the_product').click();
  await expect(page.locator('[data-testid^="org-member-"]').first()).toContainText('Move the product');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await ageUp(page);
  await settle(page);
  await openOrg(page);
  await page.getByTestId('org-tab-overview').click();
  await expect(page.getByTestId('org-recap')).toBeVisible();
  await page.getByTestId('org-recap').getByRole('button').click();
  await expect(page.getByTestId('org-recap-list')).toContainText(/paid you|supplied|Did well|Went badly|Arrested|Hurt|Out of action|Killed/);
});

test('your cut changes from a sheet, and an attack on a neighborhood is ordered at a cost', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-cut', kind: 'street_gang' });
  await openOrg(page);
  await page.getByTestId('org-cut-more').click();
  await page.getByTestId('org-cut-high').click();
  await expect(page.getByTestId('org-row-cut')).toContainText('High');
  await page.getByTestId('org-tab-territory').click();
  const take = page.locator('[data-testid^="org-hood-more-"]').first();
  await take.click();
  await page.getByTestId('org-act-take').click();
  await page.getByTestId('org-tab-overview').click();
  await expect(page.getByTestId('org-row-dirty')).toBeVisible();
});

test('a rival can be offered a truce or an alliance from its row', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-rivals', kind: 'motorcycle_club' });
  await openOrg(page);
  await page.getByTestId('org-tab-rivals').click();
  await page.locator('[data-testid^="org-rival-more-"]').first().click();
  await expect(page.getByTestId('org-act-alliance')).toBeVisible();
  await page.getByTestId('org-act-alliance').click();
  await expectNoHorizontalScroll(page);
});

test('someone who does not run the organization sees it but cannot decide', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-member', kind: 'mafia', rank: 1 });
  await openOrg(page);
  await expect(page.getByText(/Only the one who runs it makes these decisions/)).toBeVisible();
  await expect(page.getByTestId('org-row-cut')).toHaveCount(0);
  await page.getByTestId('org-tab-members').click();
  await page.locator('[data-testid^="org-member-more-"]').first().click();
  await expect(page.getByTestId('org-act-promote')).toBeDisabled();
});

test('a teen in a youth crew has the screen with no decisions to make (a kid has no business to run)', async ({ page }) => {
  await open(page, { seed: 'e2e-o1-youth', age: 16, youth: true });
  await openOrg(page);
  await expect(page.getByText(/A kids’ crew has no business to run|Only the one who runs it makes these decisions/)).toBeVisible();
  await expect(page.getByTestId('org-row-dirty')).toContainText('$0');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('org-tab-members').click();
  await page.locator('[data-testid^="org-member-more-"]').first().click();
  await expect(page.getByTestId('org-act-promote')).toBeDisabled();
});

test('a teen who is in no crew has a closed Crime row: nobody is asked in before 14, and the screen is for members', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, teenLife({ seed: 'e2e-o1-teen', age: 16 }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Job');
  await page.getByTestId('special-crime').click({ force: true });
  await expect(page.getByTestId('closed-reason')).toBeVisible();
  await expect(page.getByTestId('org-screen')).toHaveCount(0);
});
