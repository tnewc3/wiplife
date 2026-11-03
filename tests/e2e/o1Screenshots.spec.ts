/**
 * Screenshots of the Organization screen (O1) at 390x844, dark and light, into docs/screenshots/o1: Overview, Members, a
 * member's actions, Territory and Rivals, for a mafia family's boss. Not part of the suite: it runs only with SCREENSHOTS=1
 * (`SCREENSHOTS=1 npx playwright test o1Screenshots`).
 */
import { test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { goTab, openRow, passAgeGate, settle } from './helpers';
import { orgLife } from './o1Fixtures';

test.skip(!process.env.SCREENSHOTS, 'screenshots are taken on request');

const DIR = 'docs/screenshots/o1';

async function shoot(page: Page, name: string): Promise<void> {
  for (const which of ['dark', 'light'] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, which);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${DIR}/${name}-${which}.png` });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
}

test('the Organization screen', async ({ page }) => {
  test.setTimeout(120_000);
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, orgLife({ seed: 'shots-o1', kind: 'mafia' }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Job');
  await openRow(page, 'special-crime');
  await shoot(page, 'overview');
  await page.getByTestId('org-tab-members').click();
  await shoot(page, 'members');
  await page.locator('[data-testid^="org-member-more-"]').first().click();
  await shoot(page, 'member-actions');
  await page.keyboard.press('Escape');
  await page.getByTestId('org-tab-territory').click();
  await shoot(page, 'territory');
  await page.getByTestId('org-tab-rivals').click();
  await shoot(page, 'rivals');
});
