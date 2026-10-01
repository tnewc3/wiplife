/**
 * Careers, played on the test content pack (tests/e2e/content), whose
 * careers balance makes work predictable: every job is hiring, every
 * application is accepted, nobody is fired or laid off, and a promotion
 * comes after a year at a level. Job search with filters, applying (an
 * interview event), the job card, a promotion, asking for a raise,
 * quitting, and the career in Life history, at phone size.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, ageUpTimes, createCustomLife, eventSheet, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, type CustomLifeData } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

const WORKER: CustomLifeData = {
  first: 'Sam',
  last: 'Ortiz',
  category: 'Man',
  pronouns: 'he/him',
  attractedTo: ['Women'],
  parents: 'Two parents',
  siblings: 'None',
  wealth: 'Working class',
  city: 'Chicago',
};

/** Plays out the event sheet a work action opened. */
async function finishResult(page: Page): Promise<void> {
  const sheet = eventSheet(page);
  await expect(sheet).toBeVisible();
  while (await sheet.isVisible()) {
    const next = sheet.getByRole('button', { name: 'Continue' });
    await next.click();
    await settle(page);
  }
}

test('job search, an interview, a promotion, a raise and quitting', async ({ page }) => {
  test.setTimeout(180_000);
  await passAgeGate(page, { testPack: true, seed: 'e2e-careers' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, WORKER);

  // High school done at 18: no longer in school, so work is open.
  await ageUpTimes(page, 18);
  await tab(page, 'Work/School').click();
  const work = page.getByRole('region', { name: 'Work' });
  await expect(work.getByTestId('job-status')).toContainText('You don’t have a job.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Job search lists only openings you qualify for, with filters.
  await work.getByRole('button', { name: 'Look for work' }).click();
  const search = page.getByRole('dialog', { name: 'Job search' });
  const openings = search.getByRole('list', { name: 'Openings' });
  await expect(openings.getByRole('button', { name: /^Office work/ })).toBeVisible();
  // Needs a degree or a license, so it isn't listed.
  await expect(openings.getByRole('button', { name: /^Software engineering/ })).toHaveCount(0);
  await expect(openings.getByRole('button', { name: /^Electrical work/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await search.getByRole('radio', { name: 'Service jobs' }).click();
  await expect(openings.getByRole('button', { name: /^Office work/ })).toHaveCount(0);
  await expect(openings.getByRole('button', { name: /^Retail/ })).toBeVisible();
  await search.getByRole('radio', { name: 'All' }).click();
  await openings.getByRole('button', { name: /^Office work/ }).click();

  // Apply: the interview is an event.
  const confirm = page.getByRole('dialog', { name: 'Apply: Receptionist' });
  await expect(confirm).toContainText('Starting pay');
  await confirm.getByRole('button', { name: 'Apply' }).click();
  await finishResult(page);

  // The job card.
  const job = page.getByRole('region', { name: 'Receptionist' });
  await expect(job.getByTestId('job-status')).toContainText('Office work');
  await expect(job.getByTestId('job-status')).toContainText('Level 1 of 4');
  await expect(job.getByRole('meter', { name: 'Performance' })).toBeVisible();
  await expect(job.getByTestId('job-salary')).toHaveText(/^\$[\d,]+ a year$/);
  await expect(job.getByRole('button', { name: 'Ask for a raise' })).toBeDisabled();
  await expect(page.getByTestId('gig-status')).toHaveText('You have a full-time job, so there’s no time for gig work.');
  await tab(page, 'Life').click();
  await expect(page.getByTestId('job-line')).toHaveText(/^Receptionist at /);

  // A year of work, then the yearly review promotes you.
  await ageUpTimes(page, 2);
  await tab(page, 'Work/School').click();
  const promoted = page.getByRole('region', { name: 'Office assistant' });
  await expect(promoted.getByTestId('job-status')).toContainText('Level 2 of 4');
  const before = await promoted.getByTestId('job-salary').textContent();

  // Ask for a raise: the answer is an event.
  await promoted.getByRole('button', { name: 'Ask for a raise' }).click();
  await finishResult(page);
  await expect(promoted.getByTestId('job-salary')).not.toHaveText(before ?? '');
  await expect(promoted.getByRole('button', { name: 'You asked for a raise this year' })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Quit, after confirming.
  await promoted.getByRole('button', { name: 'Quit' }).click();
  const quit = page.getByRole('dialog', { name: /^Quit your job at / });
  await quit.getByRole('button', { name: 'Quit' }).click();
  await expect(page.getByRole('region', { name: 'Work' }).getByTestId('job-status')).toContainText('You don’t have a job.');

  // The career, in Life history; and it all survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await ageUp(page);
  await tab(page, 'Life').click();
  await page.getByRole('button', { name: 'See your whole life' }).click();
  const career = page.getByRole('list', { name: 'Career history' });
  await expect(career).toContainText('Office assistant');
  await expect(career).toContainText('You quit');
  await expectNoHorizontalScroll(page);
});
