/**
 * School, played on the test content pack (tests/e2e/content) so no school
 * event gets in the way: kindergarten, high school grades as a letter, the
 * application sheet and major picker, from high school to a community
 * college degree paid with a student loan, changing major, and the loan on
 * the Money tab.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUp, ageUpTimes, createCustomLife, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, type CustomLifeData } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });

const STUDENT: CustomLifeData = {
  first: 'Dana',
  last: 'Reyes',
  category: 'Woman',
  pronouns: 'she/her',
  attractedTo: ['Men'],
  parents: 'Two parents',
  siblings: 'None',
  wealth: 'Poor',
  city: 'Chicago',
};

test('from high school to a college degree, paid with a student loan', async ({ page }) => {
  test.setTimeout(180_000);
  await passAgeGate(page, { testPack: true, seed: 'e2e-school' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await createCustomLife(page, STUDENT);

  // Too young for school.
  await tab(page, 'Work/School').click();
  await expect(page.getByTestId('school-status')).toHaveText('You start school at 5.');

  // Kindergarten starts on its own.
  await ageUpTimes(page, 5);
  await expect(page.getByTestId('school-status')).toContainText('Kindergarten');
  await tab(page, 'Life').click();
  await expect(page.getByTestId('school-line')).toHaveText('In kindergarten');

  // The last year of high school: grades as a letter, and applications open.
  await ageUpTimes(page, 12);
  await tab(page, 'Work/School').click();
  const school = page.getByRole('region', { name: 'High school' });
  await expect(school.getByTestId('school-status')).toContainText('12th grade · Lakeview High School');
  await expect(school.getByTestId('school-grades')).toHaveText(/^Grades: (A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F)$/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The application sheet: pick a college, then a major, then apply.
  await page.getByRole('button', { name: 'Apply to college or trade school' }).click();
  const sheet = page.getByRole('dialog', { name: 'Apply to school' });
  await expect(sheet.getByRole('list', { name: 'College' }).getByRole('button')).toHaveCount(3);
  await expect(sheet.getByRole('list', { name: 'Trade school' }).getByRole('button').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await sheet.getByRole('button', { name: /^Lakeshore Community College/ }).click();

  const majors = page.getByRole('dialog', { name: 'Choose a major' });
  await expect(majors.getByRole('button', { name: 'Next' })).toBeDisabled();
  await majors.getByRole('radio', { name: /^Nursing/ }).click();
  await expectTouchTargets(page);
  await majors.getByRole('button', { name: 'Next' }).click();

  const confirm = page.getByRole('dialog', { name: 'Apply to Lakeshore Community College?' });
  await expect(confirm.getByRole('definition').first()).toHaveText('Nursing');
  await confirm.getByRole('button', { name: 'Apply · $75' }).click();
  const result = page.getByRole('dialog', { name: 'You got in!' });
  await expect(result.getByTestId('application-result')).toHaveText('Lakeshore Community College accepted you. You start next year.');
  await result.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('admission-line')).toHaveText('You start at Lakeshore Community College next year, studying Nursing.');

  // High school ends, college begins, and a loan pays what aid doesn't.
  await ageUp(page);
  await tab(page, 'Work/School').click();
  const college = page.getByRole('region', { name: 'Lakeshore Community College' });
  await expect(college.getByTestId('school-status')).toContainText('Community college · Year 1 of 2');
  await expect(college.getByTestId('school-status')).toContainText('Studying Nursing');
  const bill = college.getByLabel('This year’s tuition');
  await expect(bill.getByRole('definition').first()).toHaveText('$4,000');
  await expect(bill).toContainText('Student loan');
  await expect(college.getByRole('list', { name: 'Diplomas and degrees' })).toContainText('High school diploma');

  // The student loan waits on the Money tab.
  await tab(page, 'Money').click();
  await expect(page.getByRole('list', { name: 'Debts' })).toContainText('Student loan');
  await expect(page.getByTestId('debt-status-student')).toHaveText('Payments paused while you’re in school');

  // Change major with the major picker.
  await tab(page, 'Work/School').click();
  await page.getByRole('button', { name: 'Change major' }).click();
  const change = page.getByRole('dialog', { name: 'Change your major' });
  await expect(change.getByRole('radio', { name: /^Nursing/ })).toBeDisabled();
  await change.getByRole('radio', { name: /^Psychology/ }).click();
  await change.getByRole('button', { name: 'Switch major' }).click();
  await expect(college.getByTestId('school-status')).toContainText('Studying Psychology');
  await expect(page.getByRole('button', { name: 'Change major' })).toHaveCount(0);

  // Two years later: an associate degree, and the loan comes due.
  await ageUpTimes(page, 2);
  await tab(page, 'Work/School').click();
  await expect(page.getByRole('list', { name: 'Diplomas and degrees' })).toContainText('Associate degree in psychology');
  await expect(page.getByTestId('school-status')).toHaveText('You’re not in school.');
  await tab(page, 'Money').click();
  await expect(page.getByTestId('debt-status-student')).not.toHaveText('Payments paused while you’re in school');

  // It all survives a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await tab(page, 'Work/School').click();
  await expect(page.getByRole('list', { name: 'Diplomas and degrees' })).toContainText('Associate degree in psychology');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
});
