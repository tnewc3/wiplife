/**
 * Money, work and home, played on the test content pack (tests/e2e/content),
 * so events stay predictable: gig work from 16 on the Work tab, the Money
 * tab's ledger and lifestyle, the money line in the year recap, and moving
 * out and relocating from More → Home.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, ageUpTimes, expectNoHorizontalScroll, expectTouchTargets, startRandomLife } from './helpers';

const PACK = { testPack: true, seed: 'e2e-money' };

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

test('gig work from 16, the Money tab and the recap money line', async ({ page }) => {
  test.setTimeout(120_000);
  await startRandomLife(page, PACK);

  // Too young to work.
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('gig-status')).toHaveText('You can start gig work at 16.');
  await expect(page.getByRole('button', { name: 'Start gig work' })).toHaveCount(0);

  // A child has no debt and no lifestyle choice.
  await tab(page, 'Money').click();
  await expect(page.getByTestId('savings')).toHaveText('$0');
  await expect(page.getByText('Your family decides how you live for now.')).toBeVisible();
  await expect(page.getByText('You don’t owe anyone anything.')).toBeVisible();

  await ageUpTimes(page, 16);
  await tab(page, 'Work/School').click();
  await page.getByRole('button', { name: 'Start gig work' }).click();
  await expect(page.getByTestId('gig-status')).toContainText('You’re doing gig work.');
  await expect(page.getByRole('button', { name: 'Stop gig work' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The year's money shows in the recap and on the Money tab.
  await ageUp(page);
  await tab(page, 'Life').click();
  await expect(page.getByTestId('recap-money')).toContainText(/^Money: \+\$[\d,]+ this year · savings \$[\d,]+/);
  await tab(page, 'Money').click();
  const ledger = page.getByRole('region', { name: 'Last year (2043)' });
  await expect(ledger).toBeVisible();
  await expect(ledger.getByText('Income')).toBeVisible();
  await expect(page.getByTestId('savings')).not.toHaveText('$0');

  // From 18 the lifestyle is yours to choose.
  await ageUp(page);
  await tab(page, 'Money').click();
  const lifestyle = page.getByRole('radiogroup', { name: 'Lifestyle' });
  await expect(lifestyle.getByRole('radio', { name: /^Comfortable/ })).toHaveAttribute('aria-checked', 'true');
  await lifestyle.getByRole('radio', { name: /^Frugal/ }).click();
  await expect(lifestyle.getByRole('radio', { name: /^Frugal/ })).toHaveAttribute('aria-checked', 'true');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // It is saved.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'Money').click();
  await expect(page.getByRole('radiogroup', { name: 'Lifestyle' }).getByRole('radio', { name: /^Frugal/ })).toHaveAttribute('aria-checked', 'true');
});

test('moving out and relocating from More → Home', async ({ page }) => {
  test.setTimeout(150_000);
  await startRandomLife(page, PACK);
  const city = ((await page.getByText(/ · (Chicago|Houston|Los Angeles|New York|Small Town) · /).textContent()) ?? '').split(' · ')[1]!;

  // A child can't choose where to live.
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('housing-line')).toHaveText(`Living with family in ${city}`);
  await expect(page.getByText('You live with your family until you’re old enough to decide for yourself.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Home actions' })).toHaveCount(0);

  // Save up from gig work while living at home.
  await ageUpTimes(page, 16);
  await tab(page, 'Work/School').click();
  await page.getByRole('button', { name: 'Start gig work' }).click();
  await ageUpTimes(page, 4);

  // Move out in the same city.
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: /^Move out · \$[\d,]+ up front$/ }).click();
  const confirm = page.getByRole('dialog', { name: `Rent a place in ${city}?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Rent a place' }).click();
  await expect(page.getByTestId('housing-line')).toHaveText(`Renting in ${city}`);
  await expect(page.getByRole('button', { name: 'Find a roommate' })).toBeVisible();

  // Relocate to another city.
  const target = page.getByRole('list', { name: 'Cities' }).getByRole('button').first();
  const newCity = ((await target.locator('span').first().textContent()) ?? '').trim();
  await target.click();
  const move = page.getByRole('dialog', { name: `Move to ${newCity}?` });
  await expect(move).toContainText('your costs change from next year');
  await move.getByRole('button', { name: `Move to ${newCity}` }).click();
  await expect(page.getByTestId('housing-line')).toHaveText(`Renting in ${newCity}`);

  // The Life tab and the story show the move, and it all survives a reload.
  await tab(page, 'Life').click();
  await expect(page.getByText(new RegExp(` · ${newCity} · `))).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your story' })).toContainText(`to ${newCity}`);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('housing-line')).toHaveText(`Renting in ${newCity}`);
  await page.getByRole('button', { name: 'Back to More' }).click();
  await expect(page.getByRole('button', { name: 'Life history' })).toBeVisible();
});
