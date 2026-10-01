/**
 * Arrest to release, played on the test content pack (tests/e2e/content):
 * at 27, a getaway drive means two years in prison (with one prison event
 * each year inside), then release, parole and the record.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUpButton, ageUpTimes, eventSheet, expectNoHorizontalScroll, expectTouchTargets, playThroughEvents, settle, startRandomLife } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

test('arrest, the years inside with only prison events and a few actions, then release and parole', async ({ page }) => {
  test.setTimeout(240_000);
  await startRandomLife(page, { testPack: true, seed: 'e2e-arrest-0' });
  await ageUpTimes(page, 26);
  await expect(page.getByTestId('prison-banner')).toHaveCount(0);

  // 27: the getaway car.
  await ageUpButton(page).click();
  await settle(page);
  const sheet = eventSheet(page);
  await expect(sheet.getByRole('heading', { name: 'The getaway car' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Drive the car' }).click();
  await settle(page);
  await expect(sheet.getByTestId('event-outcome')).toHaveText('You’re caught. You get 2 years in prison.'.replace('’', "'"));
  await playThroughEvents(page);

  const banner = page.getByTestId('prison-banner');
  await expect(banner).toContainText('In prison');
  await expect(banner).toContainText('released in 3 years');
  await expect(page.getByText(/ · In prison$/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Inside: no work, no moves, no doctor of your choosing.
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('job-status')).toHaveText('You can’t work while you’re in prison.');
  await expect(page.getByRole('button', { name: 'Start gig work' })).toHaveCount(0);
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByTestId('doctor-status')).toContainText('the prison doctor');
  await page.getByRole('button', { name: 'Back to More' }).click();
  await tab(page, 'Life').click();

  // Two years inside, each with its prison event; the first begins with intake.
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'Intake' })).toBeVisible();
  await playThroughEvents(page);
  await expect(page.getByTestId('prison-banner')).toContainText('released in 2 years');
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'Another day inside' })).toBeVisible();
  await playThroughEvents(page);
  await expect(page.getByTestId('prison-banner')).toContainText('released next year');

  // Released at 30: a release event, parole, and a record.
  await ageUpButton(page).click();
  await settle(page);
  await expect(eventSheet(page).getByRole('heading', { name: 'Released' })).toBeVisible();
  await playThroughEvents(page);
  await expect(page.getByTestId('prison-banner')).toHaveCount(0);
  await expect(page.getByTestId('probation-banner')).toContainText('On probation');
  await page.getByRole('button', { name: 'Profile' }).click();
  const record = page.getByRole('list', { name: 'Criminal record' });
  await expect(record).toContainText('Theft · Prison, 2 years');
  await expectTouchTargets(page);
});
