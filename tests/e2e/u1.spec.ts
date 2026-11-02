/**
 * The U1 interface (docs/portraits-and-ui.md) at phone size, on the test content pack (tests/e2e/content): Home (header, life
 * log, Age button between four tabs, stat panel), the menu and profile, the event card (banner, person header or icon,
 * choices, "Surprise me", outcome with the balance), Assets, People (late relationships, "Spend time with everyone") and
 * the Activities tab.
 */
import { expect, test, type Page } from '@playwright/test';
import { activitiesLife } from './activitiesFixtures';
import { loadSavedLife } from './heirFixtures';
import {
  ageUpButton,
  eventSheet,
  expectAge,
  expectNoHorizontalScroll,
  expectTouchTargets,
  gameNav,
  goHome,
  openPage,
  passAgeGate,
  settle,
  startRandomLife,
  tab, goTab } from './helpers';
import { centuryLife, lateRelationshipsLife } from './u1Fixtures';

const PACK = { testPack: true, seed: 'e2e-pack' };

async function openFixture(page: Page, life: ReturnType<typeof lateRelationshipsLife>): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

/** The last input the saved life holds. */
async function lastInput(page: Page): Promise<{ kind: string; payload: Record<string, unknown> }> {
  return page.evaluate(
    () =>
      new Promise<{ kind: string; payload: Record<string, unknown> }>((resolve, reject) => {
        const open = indexedDB.open('wiplife');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('lives').objectStore('lives').get('active');
          get.onsuccess = () => {
            const log = (get.result as { envelope: { data: { inputLog: { kind: string; payload: Record<string, unknown> }[] } } }).envelope.data.inputLog;
            open.result.close();
            resolve(log[log.length - 1]!);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

test('Home: the header, the log by age with money lines, the Age button between four tabs, and the stat panel', async ({ page }) => {
  const name = await startRandomLife(page, PACK);
  // Header: the name, what you do and where, and the balance; the menu is a button and the profile is behind the portrait.
  await expect(page.getByTestId('character-name')).toHaveText(name);
  await expect(page.getByTestId('balance')).toHaveText('$0');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  await expectAge(page, 0);

  // Year 1 in the pack: wave back, and a coin goes in the piggy bank.
  await ageUpButton(page).click();
  await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Wave back' }).click();
  await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await eventSheet(page).getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page)).toHaveCount(0);

  await expectAge(page, 1);
  await expect(page.getByTestId('balance')).toHaveText('$1');
  const gain = page.getByTestId('life-log').locator('[data-sign="gain"]').first();
  await expect(gain).toHaveText('+$1 · Savings now $1');
  // The log is scrolled to the newest line.
  await expect(page.getByTestId('life-log').getByRole('heading', { name: /^Age 1\b/ })).toBeInViewport();

  // The Age button sits between the four tabs.
  await expect(gameNav(page).getByRole('button')).toHaveText(['Career', 'Assets', 'AGE', 'People', 'Activities']);
  const age = await ageUpButton(page).boundingBox();
  const assets = await tab(page, 'Assets').boundingBox();
  const people = await tab(page, 'People').boundingBox();
  expect(assets!.x + assets!.width).toBeLessThanOrEqual(age!.x + 1);
  expect(people!.x).toBeGreaterThanOrEqual(age!.x + age!.width - 1);

  // The stat panel: bars with percentages, colored by value.
  const panel = page.getByTestId('stat-panel');
  for (const stat of ['Happiness', 'Health', 'Smarts', 'Looks']) {
    const meter = panel.getByRole('meter', { name: stat });
    await expect(meter).toBeVisible();
    const value = await meter.getAttribute('aria-valuenow');
    await expect(panel).toContainText(`${stat}${value}%`);
    await expect(meter.locator('div').first()).toHaveAttribute('style', /var\(--wl-(positive|warning|negative)\)/);
  }
  await expect(panel.getByRole('meter')).toHaveCount(4);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('the menu holds new life, life history, the archive, settings and back to title; the profile shows every stat', async ({ page }) => {
  await startRandomLife(page, PACK);
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('button')).toHaveText(['New life', 'Life history', 'Archive', 'Settings', 'Back to title']);
  await expectTouchTargets(page);
  await menu.getByRole('button', { name: 'Life history' }).click();
  await expect(page.getByRole('heading', { name: 'Life history', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Profile' });
  await expect(profile.getByTestId('profile-stats').getByRole('meter')).toHaveCount(6);
  for (const stat of ['Happiness', 'Health', 'Smarts', 'Looks', 'Fitness', 'Stress']) await expect(profile.getByRole('meter', { name: stat })).toBeVisible();
  await expect(profile.getByTestId('profile-identity')).toContainText('Occupation');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await profile.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible();
});

test('an event card has a banner and border in its category color, a person header, stacked choices, and Surprise me is logged', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  const card = sheet.getByTestId('event-card');
  await expect(card).toHaveAttribute('data-banner', 'family');
  await expect(sheet.getByTestId('event-banner')).toHaveText('Family');
  await expect(card).toHaveAttribute('style', /border-color: var\(--wl-cat-family/);
  // The event is about a parent: their portrait and name instead of an icon.
  await expect(sheet.getByTestId('event-portraits')).toBeVisible();
  await expect(sheet.getByTestId('event-people')).not.toBeEmpty();
  await expect(sheet.getByText('What will you do?')).toBeVisible();
  // Stacked, full-width choices.
  const wave = await sheet.getByRole('button', { name: 'Wave back' }).boundingBox();
  const hide = await sheet.getByRole('button', { name: 'Hide behind the couch' }).boundingBox();
  expect(hide!.y).toBeGreaterThan(wave!.y + wave!.height - 1);
  expect(Math.abs(hide!.width - wave!.width)).toBeLessThan(2);
  await expect(sheet.getByRole('button', { name: 'Wave back' }).getByTestId('choice-money')).toHaveText('Pays $1');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // "Surprise me" picks for you and the input log says so.
  await sheet.getByTestId('surprise-me').click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toBeVisible();
  expect(await lastInput(page)).toEqual({ year: expect.any(Number), kind: 'choice', payload: { instanceId: expect.any(String), choiceId: 'surprise' } });
  await expect(sheet.getByTestId('surprise-me')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('an event card with an icon and a meter shows both, and the outcome shows money as an amount and the new balance', async ({ page }) => {
  await startRandomLife(page, PACK);
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: 'Wave back' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-money')).toHaveText(/^\+\$1 · Savings now \$1$/);
  await expect(sheet.getByTestId('event-money').locator('span').first()).toHaveClass(/text-positive/);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  // The recap card has the calendar icon and no banner color of a category.
  await expect(sheet.getByTestId('event-banner')).toHaveText('Your year');
  await expect(sheet.locator('img[src$="icons/calendar.svg"]')).toBeVisible();
});

test('Assets has in-screen tabs for money, home and things', async ({ page }) => {
  await startRandomLife(page, PACK);
  await goTab(page, 'Assets');
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Assets' })).toBeVisible();
  await expect(page.getByTestId('savings')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('assets-tab-home').click();
  await expect(page.getByTestId('assets-housing-line')).toBeVisible();
  await page.getByTestId('assets-properties').click();
  await expect(page.getByRole('heading', { name: 'Properties', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Assets' }).click();
  await page.getByTestId('assets-tab-things').click();
  await page.getByTestId('assets-possessions').click();
  await expect(page.getByRole('heading', { name: 'Possessions', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Assets' }).click();

});

test('Activities is a hub of categories, and Plan a trip is in Leisure → Vacation', async ({ page }) => {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, activitiesLife({ seed: 'e2e-u1-hub', age: 30 }));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Activities');
  for (const id of ['health', 'mind_body', 'outdoors', 'social_love', 'groups', 'faith', 'leisure', 'money_luck']) await expect(page.getByTestId(`activities-category-${id}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  // Plan a trip is in Leisure → Vacation.
  await page.getByTestId('activities-category-leisure').click();
  await page.getByTestId('activity-hub-vacation').click();
  await page.getByTestId('activity-plan-trip').click();
  await expect(page.getByRole('heading', { name: 'Plan a trip', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Leisure' }).click();
  await expect(page.getByTestId('activity-hub-vacation')).toBeVisible();
});

test('People: groups, late relationships with a memorial mark, and Spend time with everyone as a group interaction', async ({ page }) => {
  await openFixture(page, lateRelationshipsLife('e2e-u1-people'));
  await goTab(page, 'People');
  // Sister, friends: living groups. The grandmother who died three years ago is under Late relationships, not Other family.
  await expect(page.getByRole('list', { name: 'Siblings' })).toContainText('Rae');
  await expect(page.getByRole('list', { name: 'Friends' })).toContainText('Marcus');
  await expect(page.getByRole('list', { name: 'Other family' })).toHaveCount(0);
  const late = page.getByTestId('people-late');
  // Late relationships is a collapsible group that starts closed (U2); open it.
  await late.getByRole('button', { name: /Late relationships/ }).click();
  await expect(late).toContainText('Dolores');
  await expect(late).toContainText('Died 3 years ago');
  await expect(late.getByTestId('memorial-icon')).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The group interaction: one result row per living person who can be seen, and a repeat returns less (the engine test checks the numbers).
  const button = page.getByTestId('spend-time-everyone');
  await expect(button).toBeEnabled();
  await button.click();
  const results = page.getByRole('dialog', { name: 'You spent time with everyone' });
  await expect(results).toBeVisible();
  expect(await results.getByRole('listitem').count()).toBeGreaterThanOrEqual(3);
  await expect(results).toContainText('Rae Rivera');
  await expect(results).not.toContainText('Dolores');
  await expectTouchTargets(page);
  await results.getByRole('button', { name: 'Done' }).click();
  await expect(results).toHaveCount(0);
});

test('a full life of 99 years scrolls: every age is in the log, newest at the bottom, money lines green or red', async ({ page }) => {
  await openFixture(page, centuryLife('e2e-u1-century'));
  const log = page.getByTestId('life-log');
  await expect(log.getByRole('heading')).toHaveCount(100);
  await expectAge(page, 99);
  const main = page.getByTestId('game-main');
  const atEnd = () => main.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  await expect.poll(atEnd, { timeout: 10_000 }).toBe(true);
  expect(await main.evaluate((el) => el.scrollHeight / el.clientHeight)).toBeGreaterThan(10);
  // Sweep the whole log from the top to the end: a century of lines stays quick.
  const started = Date.now();
  await main.evaluate(async (el) => {
    for (let i = 0; i <= 40; i++) {
      el.scrollTop = (el.scrollHeight * i) / 40;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  });
  expect(Date.now() - started).toBeLessThan(4000);
  await expect(log.locator('[data-sign="gain"]').first()).toHaveClass(/text-positive/);
  await expect(log.locator('[data-sign="loss"]').first()).toHaveClass(/text-negative/);
  await expect(log.locator('p.font-extrabold').first()).toBeVisible();
  await goHome(page);
  await openPage(page, 'lifeHistory');
  await expect(page.getByRole('list', { name: 'Life history' })).toContainText('Age 99');
});
