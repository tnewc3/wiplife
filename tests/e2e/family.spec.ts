/**
 * Children and parenting (E2a), on the test content pack (tests/e2e/content):
 * trying for a baby always works there, and every family result (a birth,
 * a loss, an adoption) answers with one predictable event. With this seed
 * the character is a woman attracted to men, and meets a man at 18.
 */
import { expect, test, type Page } from '@playwright/test';
import { ageUpTimes, eventSheet, expectNoHorizontalScroll, expectTouchTargets, passAgeGate, settle, startRandomLife } from './helpers';

const LOVE = { testPack: true, seed: 'e2e-love' };

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Game sections' }).getByRole('button', { name, exact: true });
const actions = (page: Page) => page.getByRole('group', { name: 'Actions' });

/** Takes an action from the person page and plays its result card through. */
async function act(page: Page, action: string, choice = 'Continue'): Promise<string> {
  await actions(page).getByRole('button', { name: action, exact: true }).click();
  await settle(page);
  const sheet = eventSheet(page);
  await sheet.getByRole('button', { name: choice, exact: true }).click();
  await settle(page);
  const outcome = (await sheet.getByTestId('event-outcome').textContent()) ?? '';
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(eventSheet(page)).toHaveCount(0);
  return outcome;
}

test('try for a baby, pregnancy on Home, a birth, the child’s page, parenting and what children cost', async ({ page }) => {
  test.setTimeout(240_000);
  await startRandomLife(page, LOVE);
  await ageUpTimes(page, 18);

  // The person you met at 18: ask out, then try for a baby.
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Friends' }).getByRole('button').first().click();
  expect(await act(page, 'Ask out', 'Ask')).toContain('says yes');

  // One action a person a year: age up, then try for a baby.
  await ageUpTimes(page, 1);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Love' }).getByRole('button').first().click();
  await expect(actions(page).getByRole('button', { name: 'Try for a baby', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  expect(await act(page, 'Try for a baby', 'Try')).toContain('A positive test');

  // Pregnancy shows on Home while it lasts.
  await tab(page, 'Life').click();
  await expect(page.getByTestId('pregnancy-line')).toContainText('You’re expecting');
  await expectNoHorizontalScroll(page);

  // The year after, the baby is born.
  await ageUpTimes(page, 1);
  await expect(page.getByTestId('pregnancy-line')).toHaveCount(0);
  await tab(page, 'People').click();
  const children = page.getByRole('list', { name: 'Children' });
  await expect(children.getByRole('listitem')).toHaveCount(1);
  await expect(children.getByRole('button').first()).toContainText(/Daughter|Son|Child/);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // Two more years, and there is a toddler to read to.
  await ageUpTimes(page, 2);
  await tab(page, 'People').click();
  await page.getByRole('list', { name: 'Children' }).getByRole('button').first().click();
  await expect(page.getByTestId('child-origin')).toContainText('Your child');
  await expect(page.getByTestId('parenting-style')).toContainText(/You’ve been/);
  await page.getByTestId('interact-button').click();
  const sheet = page.getByTestId('interact-sheet');
  await expect(sheet.getByRole('heading', { name: 'Parenting' })).toBeVisible();
  await expect(page.getByTestId('interaction-read_together')).toBeVisible();
  // Nothing romantic is ever offered with a child.
  await expect(sheet.getByRole('heading', { name: 'Romance' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByTestId('interaction-read_together').click();
  await expect(page.getByTestId('interaction-card')).toBeVisible();
  await expect(page.getByTestId('interaction-outcome')).not.toContainText(/[{}]/);
  await page.getByTestId('interaction-done').click();

  // Children cost money through the ledger. This young parent lives with their family, who cover
  // the child's costs, so the cost shows as covered (a parent on their own sees "Your children").
  await ageUpTimes(page, 1);
  await tab(page, 'Money').click();
  await expect(page.getByRole('region', { name: /Last year/ })).toContainText('Your family covered');
  await expectNoHorizontalScroll(page);
});

test('More → Family shows adoption, IVF and surrogacy with costs, odds and why not, and the pregnancy once there is one', async ({ page }) => {
  await startRandomLife(page, LOVE);
  await ageUpTimes(page, 19);
  await tab(page, 'More').click();
  await page.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your family' })).toBeVisible();
  await expect(page.getByText('Nothing under way right now.')).toBeVisible();
  for (const kind of ['adoption', 'ivf', 'surrogacy']) {
    await expect(page.getByTestId(`family-${kind}-facts`)).toContainText(/Costs about \$[\d,]+ in all · takes /);
    // Nineteen with next to no savings: you can't start any of them yet, and the card says why.
    await expect(page.getByTestId(`family-${kind}-start`)).toBeDisabled();
  }
  await expect(page.getByTestId('family-ivf-facts')).toContainText(/odds/);
  await expect(page.getByTestId('family-surrogacy-facts')).toContainText(/odds/);
  await expect(page.getByRole('list', { name: 'Why not Adopt a child' })).toContainText('You don’t have enough saved.');
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await page.getByRole('button', { name: 'Back to More' }).click();
  await expect(page.getByRole('button', { name: 'Family', exact: true })).toBeVisible();
});

test('custom creation asks a nonbinary character whether they can carry a pregnancy, and no one else', async ({ page }) => {
  await passAgeGate(page, { testPack: true, seed: 'e2e-family-creation' });
  await page.getByRole('button', { name: 'New Life' }).click();
  await page.getByRole('button', { name: 'Create a custom life' }).click();
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill('Okafor');
  await page.getByRole('button', { name: 'Next' }).click();

  const identity = page.getByRole('radiogroup', { name: 'Which fits best?' });
  await identity.getByRole('radio', { name: 'Woman', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Can you carry a pregnancy?' })).toHaveCount(0);
  await identity.getByRole('radio', { name: 'Nonbinary', exact: true }).click();
  const carry = page.getByRole('radiogroup', { name: 'Can you carry a pregnancy?' });
  await expect(carry).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);

  // The choice is required.
  await page.getByRole('radiogroup', { name: 'Pronouns' }).getByRole('radio', { name: 'they/them', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose whether you can carry a pregnancy')).toBeVisible();
  await carry.getByRole('radio', { name: 'Yes', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Step 3 of 6')).toBeVisible();
});
