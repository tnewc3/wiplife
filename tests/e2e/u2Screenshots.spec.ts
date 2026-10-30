/**
 * Screenshots of the main screens of U2 at 390x844, dark and light, into docs/screenshots/u2. Not part of the suite:
 * it runs only with SCREENSHOTS=1 (`SCREENSHOTS=1 npx playwright test u2Screenshots`).
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife, type ActivitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import { openHubActivity, passAgeGate, settle, startRandomLife, tab } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'screenshots are taken on request');

const DIR = 'docs/screenshots/u2';

async function theme(page: Page, which: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, which);
}

async function shoot(page: Page, name: string): Promise<void> {
  for (const which of ['dark', 'light'] as const) {
    await theme(page, which);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${DIR}/${name}-${which}.png` });
  }
  await theme(page, 'dark');
}

async function open(page: Page, options: ActivitiesLife): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife(options));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

test('the hub, its submenus and Luxury', async ({ page }) => {
  await open(page, { seed: 'shots-hub', age: 45, savings: 3_000_000 });
  await tab(page, 'Activities').click();
  await shoot(page, 'activities-hub');
  await page.getByTestId('activities-category-money_luck').click();
  await shoot(page, 'category-money-luck');
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByTestId('activities-category-outdoors').click();
  await shoot(page, 'category-outdoors');
  await page.getByRole('button', { name: 'Back to Activities' }).click();
  await page.getByTestId('activities-category-luxury').click();
  await shoot(page, 'category-luxury');
  await page.getByTestId('activity-hub-lux_boats').click();
  await shoot(page, 'luxury-boats-sheet');
  await page.keyboard.press('Escape');
  await openHubActivity(page, 'gym');
  await shoot(page, 'gym-sheet');
  await page.keyboard.press('Escape');
  await openHubActivity(page, 'clubs');
  await shoot(page, 'groups');
  await openHubActivity(page, 'faith_yours');
  await shoot(page, 'faith');
  await tab(page, 'Assets').click();
  await shoot(page, 'assets-money');
  await page.getByTestId('assets-tab-things').click();
  await shoot(page, 'assets-things');
  await tab(page, 'Job').click();
  await shoot(page, 'job');
});

test('People and a person', async ({ page }) => {
  await startRandomLife(page, { testPack: true, seed: 'shots-people' });
  await tab(page, 'People').click();
  await shoot(page, 'people');
  await page.getByRole('list', { name: 'Parents' }).getByRole('button').first().click();
  await shoot(page, 'person');
  await page.getByTestId('person-tab-overview').click();
  await expect(page.getByTestId('person-name')).toBeVisible();
  await shoot(page, 'person-overview');
});
