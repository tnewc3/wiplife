/**
 * The lives of the people you know (E3), at phone size on the test content
 * pack: news from your people on Home and in the year recap, the fuller
 * person page (job, partner, children, city, troubles), and a request that
 * arrives as an event card. In the pack the people you know are quiet: anyone
 * with a job retires at their first chance, and a death always asks something
 * of you (tests/e2e/content/balance/people.yaml).
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, eventSheet, passAgeGate, settle } from './helpers';
import { peopleLife } from './peopleFixtures';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const OPEN = { testPack: true };

async function openFixture(page: Page): Promise<void> {
  await passAgeGate(page, OPEN);
  await loadSavedLife(page, peopleLife('e2e-people-lives'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
}

test('Home shows the news from your people', async ({ page }) => {
  await openFixture(page);
  const card = page.getByTestId('news-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'News from your people' })).toBeVisible();
  await expect(card).toContainText('Rae Rivera, your sister, got promoted');
  await expect(card).toContainText('A new baby: Sam, born to Marcus');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test("a person's page shows their job, partner, children, city and troubles", async ({ page }) => {
  await openFixture(page);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Marcus/ }).click();
  const life = page.getByTestId('their-life');
  await expect(life.getByRole('heading', { name: "Marcus's life" })).toBeVisible();
  await expect(page.getByTestId('life-work')).toContainText('No job right now');
  await expect(page.getByTestId('life-where')).toContainText('in your city');
  await expect(page.getByTestId('life-partner')).toContainText('Married to Kit Lee · 6 years');
  await expect(page.getByTestId('life-children')).toContainText('Ada (4), Sam (1)');
  const troubles = page.getByTestId('life-troubles');
  await expect(troubles.getByRole('listitem')).toHaveCount(2);
  await expect(troubles).toContainText('being treated');
  await expect(troubles).toContainText('out awaiting trial');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Someone with nothing going on says so.
  await page.getByRole('button', { name: 'Back to People' }).click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button', { name: /Jo/ }).click();
  await expect(page.getByTestId('life-partner')).toHaveCount(0);
  await expect(page.getByTestId('life-children')).toContainText('None');
  await expect(page.getByTestId('life-troubles')).toContainText('None right now');
});

test('a year brings news and a funeral request, counted among the year\'s events', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Age Up' }).click();
  await settle(page);
  // The year may bring other cards first (the test pack has its own); the grandmother's funeral is one of them, with real choices.
  const sheet = eventSheet(page);
  for (let i = 0; i < 4 && !(await sheet.getByRole('heading', { name: 'A funeral' }).isVisible()); i++) {
    const other = sheet.getByRole('button', { name: 'Continue' });
    if (await other.isVisible()) await other.click();
    else await sheet.getByRole('button').first().click();
    await settle(page);
    const outcome = sheet.getByRole('button', { name: 'Continue' });
    if ((await outcome.isVisible()) && (await sheet.getByTestId('event-outcome').isVisible())) {
      await outcome.click();
      await settle(page);
    }
  }
  await expect(sheet.getByRole('heading', { name: 'A funeral' })).toBeVisible();
  await expect(sheet).toContainText('Dolores has died. Your grandmother.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await sheet.getByRole('button', { name: 'Go to the funeral' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toContainText('You stand with the family and say goodbye to Dolores.');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  // The recap is the last card, and it carries the news: the sister with a job retired.
  await expect(sheet.getByTestId('recap-news')).toContainText('News from your people');
  await expect(sheet.getByTestId('recap-news')).toContainText(/Rae[\s\S]*[Rr]etired/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page)).toHaveCount(0);
  // And it is on Home, and on her page.
  await expect(page.getByTestId('news-card')).toContainText(/[Rr]etired/);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Family' }).getByRole('button', { name: /Rae/ }).click();
  await expect(page.getByTestId('life-work')).toContainText('Retired');
});
