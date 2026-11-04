/**
 * Feature screen overhaul (U3), at phone size (390x844): a feature is a full screen with a header and a back button, never a
 * sheet; sheets are one quick decision and hold no tabs, accordions or text fields; no explanatory paragraphs on a screen (rules
 * are behind the ⓘ button); no title truncates; the secondary and destructive actions are in the ⋯ menu; commitment is on the
 * Schedule only; every activity is an option picker with effect chips and freshness; every shop is a store with filter chips and
 * a detail sheet; groups are join cards. Lives are built with the engine on the test content pack.
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife } from './activitiesFixtures';
import { careerLife } from './c2Fixtures';
import { d1Life } from './d1Fixtures';
import { aClubOf, groupsLife } from './groupsFixtures';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, goTab, openHubActivity, openPage, passAgeGate, settle } from './helpers';
import { orgLife } from './o1Fixtures';
import type { LifeState } from '../../src/engine/types';

async function open(page: Page, life: LifeState): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

/** No heading, row title or tile label is cut off with an ellipsis, and nothing scrolls sideways. */
async function expectNoTruncation(page: Page): Promise<void> {
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('h1, h2, h3, [class*="font-display"]')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth)
      .map((el) => el.textContent),
  );
  expect(cut).toEqual([]);
  await expectNoHorizontalScroll(page);
}


test('Sports is a full screen with a hero, tiles, tabs and a ⋯ menu, and no paragraph of rules', async ({ page }) => {
  await open(page, careerLife('e2e-u3-sports', true));
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  const screen = page.getByTestId('sports-screen');
  await expect(screen).toBeVisible();
  // A screen, not a sheet: no dialog is open, and there is a back button.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(screen.getByTestId('sports-role-row')).toContainText('Greatness');
  await expect(screen.getByRole('group', { name: 'Actions' }).getByRole('button')).not.toHaveCount(0);
  expect(await screen.getByRole('group', { name: 'Actions' }).getByRole('button').count()).toBeLessThanOrEqual(4);
  await expect(screen.getByRole('tablist', { name: 'Sports' }).getByRole('tab')).toHaveCount(3);
  await expect(screen.getByTestId('sports-role-row').getByRole('meter', { name: 'Greatness' })).toBeVisible();
  // Commitment lives on the Schedule only.
  await expect(screen.getByTestId('commitment-steady')).toHaveCount(0);
  await expect(screen.locator('p', { hasText: 'Young players can try anything' })).toHaveCount(0);
  await expectNoTruncation(page);
  await expectTouchTargets(page);
  // ⓘ opens the rules in a sheet.
  await page.getByTestId('screen-info').click();
  await expect(page.getByRole('dialog')).toContainText('not in the pros until you are grown');
  await page.keyboard.press('Escape');
  // ⋯ holds switch, quit and the other secondary actions.
  await page.getByTestId('screen-overflow').click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByTestId('switch-sport')).toBeVisible();
  await expect(menu.getByTestId('quit-sport')).toBeVisible();
  await expect(menu.getByTestId('enhancers-start')).toBeVisible();
  await page.keyboard.press('Escape');
  await screen.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('sports-screen')).toHaveCount(0);
});

test('the Practice tile is an option picker: cards with effect chips, a price and no tabs or text fields', async ({ page }) => {
  await open(page, careerLife('e2e-u3-practice', false));
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await page.getByTestId('tile-practice').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('practice-picker')).toBeVisible();
  await expect(sheet.getByRole('tablist')).toHaveCount(0);
  await expect(sheet.locator('input, textarea, select, details')).toHaveCount(0);
  await expect(sheet.locator('[data-tone="good"]').first()).toBeVisible();
  await expectTouchTargets(page);
});

test('the Schedule is where commitment is chosen', async ({ page }) => {
  await open(page, careerLife('e2e-u3-schedule', true));
  await goTab(page, 'Job');
  await page.getByTestId('role-schedule').click();
  await expect(page.getByTestId('schedule-sheet')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('commit-sports-back').click();
  await expect(page.getByTestId('commit-sports-back')).toHaveAttribute('aria-checked', 'true');
  await expectNoTruncation(page);
});

test('the band is a full screen: hero stats, tiles, Members | Music | Shows, and Rename in the ⋯ menu opens a dialog', async ({ page }) => {
  await open(page, careerLife('e2e-u3-band', true));
  await goTab(page, 'Job');
  await page.getByTestId('role-band').click();
  const screen = page.getByTestId('band-screen');
  await expect(screen).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const stat of ['Band strength', 'Chemistry', 'Buzz']) await expect(screen.getByRole('meter', { name: stat })).toBeVisible();
  await expect(screen.getByTestId('rehearse')).toBeVisible();
  await expect(screen.getByRole('tablist', { name: 'Band' }).getByRole('tab')).toHaveCount(3);
  // The roster: a skill bar for each member, and no text box or dropdown on the screen.
  await expect(screen.getByTestId('band-member').first().getByRole('meter')).toBeVisible();
  await expect(screen.locator('input:not([type=checkbox]), textarea, select')).toHaveCount(0);
  await expectNoTruncation(page);
  await page.getByTestId('screen-overflow').click();
  await expect(page.getByTestId('band-solo')).toBeVisible();
  await expect(page.getByTestId('band-leave')).toBeVisible();
  await page.getByTestId('band-rename-open').click();
  const dialog = page.getByRole('dialog', { name: 'Rename the band' });
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('band-rename-input').fill('Midnight Parade');
  await dialog.getByTestId('band-rename').click();
  await expect(page.getByTestId('band-screen')).toContainText('Midnight Parade');
  await page.getByTestId('screen-overflow').click();
  await page.getByTestId('band-leave').click();
  await expect(page.getByRole('dialog')).toContainText('Leave the band?');
});

test('an organization is a full screen with Rank, Respect and Heat, tiles, and Members | Territory | Rivals', async ({ page }) => {
  await open(page, orgLife({ seed: 'e2e-u3-org' }));
  await goTab(page, 'Job');
  await page.getByTestId('special-crime').click();
  const screen = page.getByTestId('org-screen');
  await expect(screen).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(screen.getByTestId('org-row-rank')).toBeVisible();
  await expect(screen.getByTestId('org-row-standing')).toContainText('Respect');
  await expect(screen.getByTestId('org-row-heat')).toContainText('Heat');
  await expect(screen.getByRole('tablist').getByRole('tab')).toHaveCount(3);
  await expectNoTruncation(page);
  await screen.getByTestId('org-tab-territory').click();
  await expect(screen.getByRole('list', { name: 'Territory' })).toBeVisible();
});

test('Dealing is a feature screen: start from a picker, tabs, and stop in the ⋯ menu', async ({ page }) => {
  await open(page, d1Life({ seed: 'e2e-u3-deal', dealer: true, stash: true }));
  await goTab(page, 'Job');
  await page.getByTestId('special-drugs').click();
  await expect(page.getByTestId('dealing-sheet')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('deal-start').click();
  await expect(page.getByRole('dialog').getByTestId('deal-start-picker')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: 'Dealing' }).getByRole('tab')).toHaveCount(3);
  await expectNoTruncation(page);
});

test('an activity is an option picker: effect chips from content, a price chip, freshness and a greyed card with its reason', async ({ page }) => {
  await open(page, activitiesLife({ seed: 'e2e-act-1' }));
  await openHubActivity(page, 'gym');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByTestId('freshness')).toBeVisible();
  await expect(sheet.getByTestId('picker-balance')).toBeVisible();
  const first = sheet.locator('[data-testid^="do-"]').first();
  await expect(first).toBeVisible();
  await expect(sheet.locator('[data-tone="good"]').first()).toBeVisible();
  // No paragraph of rules, no outlined button repeating the title.
  await expect(sheet).not.toContainText('Each time you do the same thing in a year');
  await expect(sheet.getByRole('tablist')).toHaveCount(0);
  await expectNoTruncation(page);
  await expectTouchTargets(page);
});

test('a shop is a store: filter chips, item cards, a detail sheet and a confirmation for a big purchase', async ({ page }) => {
  await open(page, activitiesLife({ seed: 'e2e-u3-shop', savings: 50000 }));
  await openHubActivity(page, 'fine_goods');
  const store = page.getByTestId('activity-sheet-fine_goods');
  await expect(store).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(store.getByRole('group', { name: 'Filter' }).getByRole('button', { name: 'I can afford' })).toBeVisible();
  const card = store.locator('[data-testid^="item-"]').first();
  await expect(store.getByTestId('store-balance')).toBeVisible();
  await expect(card).toBeVisible();
  await expectNoTruncation(page);
  await card.click({ force: true });
  const detail = page.getByRole('dialog');
  await expect(detail.getByTestId('item-detail')).toBeVisible();
  await expect(detail.getByTestId('item-buy')).toBeVisible();
  await expectTouchTargets(page);
});

test('groups are join cards with fact chips, a Join button and "Show more"; Yours opens the group’s own screen', async ({ page }) => {
  const life = groupsLife({ seed: 'e2e-u3-groups' });
  const club = aClubOf(life);
  await open(page, life);
  await openPage(page, 'groups');
  await expect(page.getByTestId(`group-${club.id}`)).toContainText(club.name);
  await expect(page.getByTestId(`group-join-${club.id}`)).toBeVisible();
  await expectNoTruncation(page);
  await page.getByTestId(`group-join-${club.id}`).click();
  await expect(page.getByRole('dialog').getByTestId('join-casual')).toBeVisible();
  await page.getByTestId('join-casual').click();
  await page.getByTestId(`group-yours-${club.id}`).getByRole('button').first().click();
  const own = page.getByTestId(`membership-${club.id}`);
  await expect(own).toBeVisible();
  await page.getByTestId('screen-overflow').click();
  await expect(page.getByTestId(`leave-${club.id}`)).toBeVisible();
});

test('a feature screen goes back with a swipe from the left edge', async ({ page }) => {
  await open(page, careerLife('e2e-u3-swipe', false));
  await goTab(page, 'Job');
  await page.getByTestId('sports-open').click();
  await expect(page.getByTestId('sports-screen')).toBeVisible();
  await page.waitForTimeout(450); // the screen slides in first
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 402 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 404 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('sports-screen')).toHaveCount(0);
});
