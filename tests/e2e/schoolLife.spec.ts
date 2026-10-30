/**
 * School and work life (Batch 3), at phone size, on the test content pack: the School card with a report card, this
 * year's actions, a class and its teachers (each opening the interaction menu), the UK's choice at 16, and the
 * Work tab with the boss and coworkers, the work actions and the interaction menu.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadSavedLife } from './heirFixtures';
import { expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, openRow, goTab } from './helpers';
import { studentLife, workerLife, type SchoolLifeOptions } from './schoolLifeFixtures';


async function open(page: Page, life: ReturnType<typeof studentLife>, row = 'find-education'): Promise<void> {
  await passAgeGate(page, { testPack: true });
  await loadSavedLife(page, life);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);
  await goTab(page, 'Job');
  await openRow(page, row);
}

const student = (options: SchoolLifeOptions) => studentLife(options);

test('the School card shows a report card, a class and teachers, and talking to a teacher gives an outcome', async ({ page }) => {
  await open(page, student({ seed: 'e2e-school-life-1' }));
  const card = page.getByRole('region', { name: 'High school' });
  await expect(card.getByTestId('school-status')).toContainText('Sophomore year');
  // The report card: 4 to 6 subjects, in words.
  const report = card.getByTestId('report-card');
  await expect(report).toContainText('Report card');
  await expect(report.getByTestId(/^report-/)).not.toHaveCount(0);
  expect(await report.getByTestId(/^report-/).count()).toBeGreaterThanOrEqual(4);
  expect(await report.getByTestId(/^report-/).count()).toBeLessThanOrEqual(6);
  await expect(report).toContainText(/Excellent|Very good|Good|Fair|Struggling|Failing/);
  // This school year's actions.
  await expect(card.getByTestId('school-year')).toContainText('Study harder');
  await card.getByTestId('school-study').click();
  await expect(card.getByTestId('school-year-status')).toContainText('studying harder');
  await expect(card.getByTestId('school-slack')).toBeDisabled();
  // A class and its teachers.
  const klass = card.getByTestId('school-class');
  await expect(klass.getByTestId(/^teacher-/).first()).toBeVisible();
  await expect(klass.getByTestId(/^classmate-/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Talk to a teacher: the interaction menu opens with what a teacher can be asked.
  await klass.getByTestId(/^talk-/).first().click();
  const sheet = page.getByTestId('interact-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('interaction-ask_teacher_help')).toBeVisible();
  await expect(sheet.getByTestId('interaction-suck_up')).toBeVisible();
  await expect(sheet.getByTestId('interaction-argue_with_teacher')).toBeVisible();
  await expect(sheet.getByTestId('interaction-report_problem')).toBeVisible();
  // ...and never romance.
  await expect(sheet.getByTestId('interaction-flirt')).toHaveCount(0);
  await expect(sheet.getByTestId('interaction-go_on_date')).toHaveCount(0);
  await sheet.getByTestId('interaction-ask_teacher_help').click();
  await expect(page.getByTestId('interaction-card')).toBeVisible();
  await expect(page.getByTestId('interaction-outcome')).not.toBeEmpty();
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});

test('a classmate opens the interaction menu', async ({ page }) => {
  await open(page, student({ seed: 'e2e-school-life-2' }));
  const klass = page.getByRole('region', { name: 'High school' }).getByTestId('school-class');
  await klass.getByTestId(/^classmate-/).first().getByRole('button', { name: /Talk to/ }).click();
  const sheet = page.getByTestId('interact-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('interaction-chat')).toBeVisible();
  // A minor's classmate has no romance menu.
  await expect(sheet.getByRole('heading', { name: 'Romance' })).toHaveCount(0);
});

test('a tutor shows its price and, once taken, what it cost', async ({ page }) => {
  await open(page, student({ seed: 'e2e-school-life-3' }));
  const card = page.getByRole('region', { name: 'High school' });
  await expect(card.getByTestId('school-tutor')).toContainText('Get a tutor');
  await card.getByTestId('school-tutor').click();
  await expect(card.getByTestId('school-year-status')).toContainText('A tutor cost');
  await expect(card.getByTestId('school-tutor')).toBeDisabled();
});

test('the UK offers a choice at 16 (stay on, college, an apprenticeship or work) before the results', async ({ page }) => {
  await open(page, student({ seed: 'e2e-school-life-uk', country: 'uk', age: 15 }));
  const choice = page.getByTestId('school-choice');
  await expect(choice).toBeVisible();
  await expect(choice).toContainText('the GCSEs');
  for (const path of ['stay', 'college', 'apprenticeship', 'work']) await expect(choice.getByTestId(`choice-${path}`)).toBeVisible();
  await expect(choice).toContainText('Sixth form');
  await expect(choice).toContainText('Further education college');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await choice.getByTestId('choice-college').click();
  await expect(choice.getByTestId('choice-college')).toHaveAttribute('aria-pressed', 'true');
  await choice.getByTestId('choice-stay').click();
  await expect(choice.getByTestId('choice-stay')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice.getByTestId('choice-college')).toHaveAttribute('aria-pressed', 'false');
  // Apprenticeship: a trade is picked first.
  await choice.getByTestId('choice-trade').selectOption({ index: 1 });
  await choice.getByTestId('choice-apprenticeship').click();
  await expect(choice.getByTestId('choice-apprenticeship')).toHaveAttribute('aria-pressed', 'true');
  // The UK's words: form tutor, Year 11.
  await expect(page.getByRole('region', { name: /secondary school/i })).toContainText('Year 11');
});

test('the Work tab lists the boss and coworkers, each opening the interaction menu, and work actions move performance', async ({ page }) => {
  await open(page, workerLife({ seed: 'e2e-work-life-1' }), 'find-jobs');
  const people = page.getByTestId('work-people');
  await expect(people).toBeVisible();
  await expect(people).toContainText('Boss');
  await expect(people.getByTestId(/^work-person-/)).not.toHaveCount(0);
  expect(await people.getByTestId(/^work-person-/).count()).toBeGreaterThanOrEqual(2);
  await expect(people).toContainText('Coworker');
  await expect(people).toContainText(/A workplace like yours has up to \d+ coworkers/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Work harder: performance goes up and the card says so.
  const performance = page.getByTestId('job-performance');
  await page.getByTestId('work-hard').click();
  await expect(page.getByTestId('work-year-status')).toContainText('extra effort');
  await expect(page.getByTestId('work-slack')).toBeDisabled();
  await expect(performance).not.toBeEmpty();
  // The party and time with coworkers.
  await page.getByTestId('work-socialize').click();
  await expect(page.getByTestId('work-year-status')).toContainText('spent time with coworkers');
  await page.getByTestId('work-party').click();
  await expect(page.getByTestId('work-year-status')).toContainText('office party');

  // A coworker opens the interaction menu.
  await people.getByTestId(/^talk-/).nth(1).click();
  const sheet = page.getByTestId('interact-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('interaction-chat')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
