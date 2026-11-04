/**
 * Screenshots of the feature screens (U3) at 390x844, dark theme, into docs/screenshots/u3: Sports, the band, an organization, an
 * activity picker, a store, an item detail sheet, the clubs list and an overflow menu. Not part of the suite: it runs only with
 * SCREENSHOTS=1 (`SCREENSHOTS=1 npx playwright test u3Screenshots`).
 */
import { test, type Page } from '@playwright/test';
import { activitiesLife } from './activitiesFixtures';
import { careerLife } from './c2Fixtures';
import { groupsLife } from './groupsFixtures';
import { loadSavedLife } from './heirFixtures';
import { goTab, openHubActivity, openPage, passAgeGate, settle } from './helpers';
import { orgLife } from './o1Fixtures';
import type { LifeState } from '../../src/engine/types';

test.skip(!process.env.SCREENSHOTS, 'screenshots are taken on request');

const DIR = 'docs/screenshots/u3';

async function open(page: Page, life: LifeState): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
}

const shoot = async (page: Page, name: string) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/${name}.png` });
};

test('Sports, the band, an organization and the overflow menu', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, careerLife('shots-u3', true));
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await shoot(page, 'sports');
  await page.getByTestId('screen-overflow').click();
  await shoot(page, 'overflow-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.getByTestId('role-band').click();
  await shoot(page, 'band');
});

test('an organization', async ({ page }) => {
  await open(page, orgLife({ seed: 'shots-u3-org' }));
  await goTab(page, 'Job');
  await page.getByTestId('special-crime').click();
  await shoot(page, 'organization');
});

test('an activity picker, a store and an item detail sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, activitiesLife({ seed: 'e2e-act-1', savings: 400_000 }));
  await openHubActivity(page, 'gym');
  await shoot(page, 'activity-picker');
  await page.keyboard.press('Escape');
  await openHubActivity(page, 'fine_goods');
  await shoot(page, 'store');
  await page.locator('[data-testid^="item-"]').first().click({ force: true });
  await shoot(page, 'item-detail');
});

test('the clubs list', async ({ page }) => {
  await open(page, groupsLife({ seed: 'e2e-groups-1' }));
  await openPage(page, 'groups');
  await shoot(page, 'clubs');
});
