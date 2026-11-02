/**
 * Screenshots of the Career hub (C2) at 390x844, dark and light, into docs/screenshots/c2: the Career tab, the Schedule, the
 * Sports screen (four tabs), the band screen (four tabs) and the training card. Not part of the suite: it runs only with
 * SCREENSHOTS=1 (`SCREENSHOTS=1 npx playwright test c2Screenshots`).
 */
import { test, type Page } from '@playwright/test';
import { careerLife } from './c2Fixtures';
import { loadSavedLife } from './heirFixtures';
import { expandGroups, goTab, passAgeGate, settle } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'screenshots are taken on request');

const DIR = 'docs/screenshots/c2';

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

test('the Career tab, Sports and band screens', async ({ page }) => {
  test.setTimeout(120_000);
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, careerLife('shots-c2', true));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Job');
  await page.getByTestId('game-main').evaluate((el) => (el.scrollTop = 0));
  await shoot(page, 'career');
  await page.getByTestId('role-schedule').click();
  await shoot(page, 'schedule');
  await page.keyboard.press('Escape');

  await page.getByTestId('sports-open').click();
  await shoot(page, 'sports-overview');
  await expandGroups(page);
  await page.getByTestId('sports-tab-season').click();
  await shoot(page, 'sports-season');
  await page.getByTestId('sports-tab-league').click();
  await shoot(page, 'sports-league');
  await page.getByTestId('sports-tab-history').click();
  await shoot(page, 'sports-history');
  await page.keyboard.press('Escape');

  await page.getByTestId('role-band').click();
  await shoot(page, 'band-overview');
  await page.getByTestId('rehearse').click();
  await page.waitForTimeout(2200);
  await shoot(page, 'training-card');
  await page.getByTestId('training-popup').click({ timeout: 1000 }).catch(() => undefined);
  await page.getByTestId('band-tab-members').click();
  await shoot(page, 'band-members');
  await page.getByTestId('band-tab-releases').click();
  await shoot(page, 'band-releases');
  await page.getByTestId('band-tab-shows').click();
  await shoot(page, 'band-shows');
});
